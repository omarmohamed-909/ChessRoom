import mongoose, { type Connection, type InferSchemaType, type Model } from 'mongoose';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Snapshot, Skin } from '../../../packages/shared/src/index.js';

const resultSchema = new mongoose.Schema(
  {
    matchId: { type: String, unique: true, required: true },
    room: String,
    result: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);
const userSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true },
    googleSub: { type: String, unique: true, sparse: true },
    email: String,
    name: String,
    skin: { type: String, default: 'classic' },
    owned: { type: [String], default: ['classic', 'sprout', 'crown', 'headphones', 'ninja'] },
  },
  { timestamps: true },
);
const feedbackSchema = new mongoose.Schema(
  { playerId: String, matchId: String, message: String },
  { timestamps: true },
);
export type StoreOptions = {
  uri?: string;
  dataDir?: string;
  production?: boolean;
  selectionTimeoutMs?: number;
};
type UserRecord = InferSchemaType<typeof userSchema>;
const duplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

export class Store {
  mongo = false;
  private connection?: Connection;
  private results?: Model<InferSchemaType<typeof resultSchema>>;
  private users?: Model<UserRecord>;
  private reports?: Model<InferSchemaType<typeof feedbackSchema>>;
  private seen = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private directory: string;
  constructor(private options: StoreOptions = {}) {
    this.directory = resolve(options.dataDir || process.env.DATA_DIR || '.local-data');
  }
  async init() {
    const uri = this.options.uri ?? process.env.MONGODB_URI;
    if (uri) {
      const connection = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: this.options.selectionTimeoutMs ?? 8000,
        bufferCommands: false,
        maxPoolSize: 10,
      });
      this.connection = connection;
      // Reconnect errors are reflected in readiness; never log a credential-bearing URI.
      connection.on('error', () => {});
      try {
        await connection.asPromise();
        this.results = connection.model('Match', resultSchema);
        this.users = connection.model('User', userSchema);
        this.reports = connection.model('Feedback', feedbackSchema);
        await Promise.all([this.results.init(), this.users.init(), this.reports.init()]);
        this.mongo = true;
      } catch {
        await connection.close().catch(() => {});
        throw new Error('DATABASE_CONNECTION_FAILED');
      }
    } else {
      if (this.options.production ?? process.env.NODE_ENV === 'production')
        throw new Error('MONGODB_URI is required in production');
      await mkdir(this.directory, { recursive: true });
      try {
        const rows = (await readFile(resolve(this.directory, 'matches.ndjson'), 'utf8'))
          .trim()
          .split('\n');
        for (const row of rows) {
          try {
            this.seen.add(JSON.parse(row).matchId);
          } catch {
            /* Ignore interrupted final record. */
          }
        }
      } catch {
        /* First launch. */
      }
    }
  }
  async save(result: Snapshot) {
    if (!result.matchId) return;
    const confirmed = { ...result, saved: this.mongo ? 'saved' : 'local' };
    if (this.mongo) {
      try {
        await this.results!.updateOne(
          { matchId: result.matchId },
          { $setOnInsert: { room: result.code, result: confirmed } },
          { upsert: true },
        );
      } catch (error) {
        if (!duplicateKey(error) || !(await this.results!.exists({ matchId: result.matchId })))
          throw error;
      }
      return;
    }
    const id = result.matchId;
    const write = this.queue
      .catch(() => {})
      .then(async () => {
        if (this.seen.has(id)) return;
        await appendFile(
          resolve(this.directory, 'matches.ndjson'),
          JSON.stringify({ matchId: id, result: confirmed }) + '\n',
          'utf8',
        );
        this.seen.add(id);
      });
    this.queue = write;
    await write;
  }
  async feedback(playerId: string, message: string, matchId?: string) {
    if (this.mongo) await this.reports!.create({ playerId, message, matchId });
    else
      await appendFile(
        resolve(this.directory, 'feedback.ndjson'),
        JSON.stringify({ at: Date.now(), playerId, message, matchId }) + '\n',
      );
  }
  async user(id: string) {
    return this.mongo ? await this.users!.findOne({ id }).lean() : null;
  }
  async link(id: string, googleSub: string, email: string, name: string) {
    if (!this.mongo) throw new Error('ACCOUNT_UNAVAILABLE');
    const guest = await this.users!.findOne({ id });
    if (guest?.googleSub && guest.googleSub !== googleSub)
      throw new Error('ACCOUNT_ALREADY_LINKED');
    const existing = await this.users!.findOne({ googleSub });
    if (existing) {
      if (guest && guest.id !== existing.id && existing.owned.includes(guest.skin)) {
        existing.skin = guest.skin;
        await existing.save();
      }
      return existing;
    }
    try {
      return await this.users!.findOneAndUpdate(
        { id, $or: [{ googleSub: { $exists: false } }, { googleSub }] },
        { $set: { googleSub, email, name }, $setOnInsert: { id } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (duplicateKey(error)) {
        const canonical = await this.users!.findOne({ googleSub });
        if (canonical) return canonical;
      }
      throw error;
    }
  }
  async skin(id: string, skin: Skin) {
    if (!this.mongo) throw new Error('ACCOUNT_UNAVAILABLE');
    const existing = await this.users!.findOne({ id });
    if (existing && !existing.owned.includes(skin)) return null;
    return this.users!.findOneAndUpdate(
      { id },
      { $set: { skin }, $setOnInsert: { id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  healthy() {
    return !this.mongo || this.connection?.readyState === 1;
  }
  async close() {
    await this.queue.catch(() => {});
    await this.connection?.close();
  }
}

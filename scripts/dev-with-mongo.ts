import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

const root = resolve(import.meta.dirname, '..'),
  data = join(root, '.local-data'),
  dbPath = join(data, 'mongo-dev');
await mkdir(dbPath, { recursive: true });
const port = Number(process.env.DEV_MONGO_PORT || 27018);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('DEV_MONGO_PORT must be 1024–65535');
const secretPath = join(data, 'dev-session-secret');
let secret = process.env.SESSION_SECRET;
if (!secret) {
  try {
    secret = (await readFile(secretPath, 'utf8')).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    secret = randomBytes(48).toString('hex');
    await writeFile(secretPath, secret, { mode: 0o600, flag: 'wx' });
  }
}
const uri = `mongodb://127.0.0.1:${port}/chaos_room_dev`;
const db = spawn(
  process.env.MONGODB_BINARY || 'mongod',
  [
    '--dbpath',
    dbPath,
    '--bind_ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--wiredTigerCacheSizeGB',
    '0.25',
    '--logpath',
    join(dbPath, 'mongod.log'),
    '--logappend',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let dbExited = false,
  dbError: Error | undefined,
  apps: ChildProcess | undefined,
  stopping = false;
db.on('error', (error) => {
  dbError = error;
  dbExited = true;
});
db.on('exit', () => {
  dbExited = true;
  if (apps && !stopping) void stop(1);
});
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (apps?.pid && apps.exitCode === null) {
    if (process.platform === 'win32')
      await new Promise<void>((resolve) => {
        const kill = spawn('taskkill', ['/PID', String(apps!.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        kill.once('exit', () => resolve());
        kill.once('error', () => resolve());
      });
    else {
      try {
        process.kill(-apps.pid, 'SIGTERM');
      } catch {}
      await new Promise<void>((resolve) => {
        if (apps!.exitCode !== null) resolve();
        else {
          const timer = setTimeout(resolve, 6000);
          apps!.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        }
      });
    }
  }
  if (!dbExited) {
    const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1000 });
    connection.on('error', () => {});
    try {
      await connection.asPromise();
      await connection.db!.admin().command({ shutdown: 1, force: true });
    } catch {
    } finally {
      await connection.close().catch(() => {});
    }
    const deadline = Date.now() + 5000;
    while (!dbExited && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (!dbExited) db.kill('SIGKILL');
  }
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline && !stopping) {
    if (dbError || dbExited)
      throw new Error(
        'Unable to start mongod. Install MongoDB, set MONGODB_BINARY if necessary, and check .local-data/mongo-dev/mongod.log.',
      );
    const probe = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 500 });
    probe.on('error', () => {});
    try {
      await probe.asPromise();
      await probe.db!.admin().ping();
      await probe.close();
      ready = true;
      break;
    } catch {
      await probe.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!ready) throw new Error('Local MongoDB did not become ready');
  console.log(
    `Local MongoDB ready on 127.0.0.1:${port}. Data and guest sessions persist between runs.`,
  );
  if (!process.env.npm_execpath) throw new Error('Start this helper with npm run dev:db');
  apps = spawn(process.execPath, [process.env.npm_execpath, 'run', 'dev'], {
    cwd: root,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: undefined,
      WEB_ORIGIN: 'http://localhost:3000',
      API_ORIGIN: 'http://localhost:4000',
      NEXT_PUBLIC_SERVER_URL: 'http://localhost:4000',
      MONGODB_URI: uri,
      SESSION_SECRET: secret!,
      SHUTDOWN_GRACE_MS: process.env.SHUTDOWN_GRACE_MS || '5000',
    },
  });
  apps.on('error', () => {
    console.error('Unable to start the game processes.');
    void stop(1);
  });
  apps.on('exit', (code) => {
    if (!stopping) void stop(code ?? 0);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local startup failed');
  await stop(1);
}

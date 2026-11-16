import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { parse, serialize } from 'cookie';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  CONFIG,
  PROTOCOL,
  commandSchema,
  inputSchema,
  makePlayer,
  snapshot,
  type Room,
  type Command,
  type Ack,
  type ClientEvents,
  type ServerEvents,
} from '../../../packages/shared/src/index.js';
import { createRoom, dash, restorePlayer, startMatch, step } from './engine.js';
import { Store, type StoreOptions } from './store.js';
import { configurationIssues } from './config.js';

type Session = { id: string };
type Data = { playerId: string; room?: string };
type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, Data>;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export async function makeServer(options: { store?: StoreOptions } = {}) {
  const production = process.env.NODE_ENV === 'production';
  const issues = configurationIssues(process.env);
  if (issues.length) throw new Error(`Invalid configuration: ${issues.join('; ')}`);
  const origin = new URL(process.env.WEB_ORIGIN || 'http://localhost:3000').origin;
  const apiOrigin = new URL(process.env.API_ORIGIN || 'http://localhost:4000').origin;
  const secret = new TextEncoder().encode(
    process.env.SESSION_SECRET || randomBytes(48).toString('hex'),
  );
  const cookieName = production ? '__Host-chaos_session' : 'chaos_session';
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
  const store = new Store(options.store);
  await store.init();
  const app = express(),
    http = createServer(app);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
  app.use(helmet());
  app.use(express.json({ limit: '8kb' }));
  const limits = new Map<string, { n: number; until: number }>();
  function limited(key: string, max: number, ms: number) {
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || now > entry.until) {
      entry = { n: 0, until: now + ms };
      limits.set(key, entry);
    }
    return ++entry.n > max;
  }
  app.use((req, res, next) => {
    if (req.headers.origin && req.headers.origin !== origin) {
      res.status(403).json({ error: 'ORIGIN_DENIED' });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    if (limited(`http:${req.ip}`, 180, 60000)) {
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }
    next();
  });
  const token = async (id: string) =>
    new SignJWT({})
      .setSubject(id)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .setIssuer('chaos-room')
      .sign(secret);
  async function session(cookies?: string): Promise<Session | null> {
    try {
      const value = parse(cookies || '')[cookieName];
      if (!value) return null;
      const { payload } = await jwtVerify(value, secret, {
        issuer: 'chaos-room',
        algorithms: ['HS256'],
      });
      return payload.sub ? { id: payload.sub } : null;
    } catch {
      return null;
    }
  }
  app.get('/health', (_, res) => res.json({ ok: true, protocol: PROTOCOL }));
  app.get('/ready', (_, res) =>
    res.status(store.healthy() && !draining ? 200 : 503).json({ ok: store.healthy() && !draining }),
  );
  app.post('/api/session', async (req, res) => {
    let s = await session(req.headers.cookie);
    if (!s) {
      s = { id: randomUUID() };
      res.setHeader('Set-Cookie', serialize(cookieName, await token(s.id), cookieOptions));
    }
    const user = await store.user(s.id);
    res.json({
      id: s.id,
      user: user?.googleSub ? { name: user.name, skin: user.skin, owned: user.owned } : null,
      googleEnabled: !!(
        store.mongo &&
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET
      ),
      storage: store.mongo ? 'mongo' : 'local',
    });
  });
  app.post('/api/feedback', async (req, res) => {
    const s = await session(req.headers.cookie);
    if (!s) {
      res.sendStatus(401);
      return;
    }
    if (limited(`feedback:${s.id}`, 3, 60000)) {
      res.sendStatus(429);
      return;
    }
    const v = z
      .object({
        message: z.string().trim().min(5).max(1000),
        matchId: z.string().uuid().optional(),
      })
      .safeParse(req.body);
    if (!v.success) {
      res.sendStatus(400);
      return;
    }
    await store.feedback(s.id, v.data.message, v.data.matchId);
    res.json({ ok: true });
  });
  app.post('/api/skin', async (req, res) => {
    const s = await session(req.headers.cookie),
      v = z.enum(['classic', 'sprout', 'crown', 'headphones', 'ninja']).safeParse(req.body?.skin);
    if (!s) {
      res.sendStatus(401);
      return;
    }
    if (!v.success) {
      res.sendStatus(400);
      return;
    }
    const user = await store.skin(s.id, v.data);
    res.status(user ? 200 : 403).json({ ok: !!user });
  });
  const oauthStates = new Map<
    string,
    { id: string; verifier: string; nonce: string; expires: number }
  >();
  const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  app.get('/auth/google', async (req, res) => {
    if (!store.mongo || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      res.redirect(`${origin}/?auth=unavailable`);
      return;
    }
    const s = await session(req.headers.cookie);
    if (!s) {
      res.redirect(origin);
      return;
    }
    const state = randomBytes(24).toString('hex'),
      verifier = randomBytes(32).toString('base64url'),
      nonce = randomBytes(24).toString('hex');
    oauthStates.set(state, { id: s.id, verifier, nonce, expires: Date.now() + 600000 });
    res.setHeader('Set-Cookie', serialize('chaos_oauth', state, { ...cookieOptions, maxAge: 600 }));
    const redirect = `${apiOrigin}/auth/google/callback`;
    const query = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  });
  app.get('/auth/google/callback', async (req, res) => {
    try {
      const state = String(req.query.state || ''),
        saved = oauthStates.get(state);
      oauthStates.delete(state);
      const current = await session(req.headers.cookie);
      if (
        !saved ||
        saved.expires < Date.now() ||
        parse(req.headers.cookie || '').chaos_oauth !== state ||
        current?.id !== saved.id
      )
        throw new Error('INVALID_STATE');
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(req.query.code || ''),
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${apiOrigin}/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: saved.verifier,
        }),
      });
      const body = (await response.json()) as { id_token?: string };
      if (!response.ok || !body.id_token) throw new Error('GOOGLE_ERROR');
      const { payload } = await jwtVerify(body.id_token, googleKeys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      if (payload.nonce !== saved.nonce || !payload.sub || payload.email_verified !== true)
        throw new Error('INVALID_ID');
      const user = await store.link(
        saved.id,
        payload.sub,
        String(payload.email || ''),
        String(payload.name || 'Player'),
      );
      res.setHeader('Set-Cookie', [
        serialize(cookieName, await token(user.id), cookieOptions),
        serialize('chaos_oauth', '', { ...cookieOptions, maxAge: 0 }),
      ]);
      res.redirect(`${origin}/?auth=linked`);
    } catch {
      res.redirect(`${origin}/?auth=failed`);
    }
  });
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, Data>(http, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 4096,
    connectionStateRecovery: {
      maxDisconnectionDuration: CONFIG.reconnectMs,
      skipMiddlewares: false,
    },
    allowRequest: (req, callback) =>
      callback(null, !req.headers.origin || req.headers.origin === origin),
  });
  const rooms = new Map<string, Room>(),
    members = new Map<string, string>(),
    sockets = new Map<string, GameSocket>(),
    commands = new Map<string, { result: Ack; expires: number }>();
  const metrics = {
    created: 0,
    started: 0,
    completed: 0,
    rematches: 0,
    cancelled: 0,
    persistenceErrors: 0,
  };
  let draining = false;
  let shuttingDown = false;
  io.use(async (socket, next) => {
    const s = await session(socket.request.headers.cookie);
    if (!s) {
      next(new Error('SESSION_REQUIRED'));
      return;
    }
    if (
      limited(
        `connect:${socket.handshake.address}`,
        Number(process.env.MAX_CONNECTIONS_PER_IP || 60),
        60000,
      )
    ) {
      next(new Error('RATE_LIMITED'));
      return;
    }
    socket.data.playerId = s.id;
    next();
  });
  function roomFor(id: string) {
    const code = members.get(id);
    return code ? rooms.get(code) : undefined;
  }
  function publish(room: Room) {
    const now = Date.now();
    // Reuse one encoded packet unless the current game contains viewer-specific hints.
    if (room.game !== 'doors' || room.phase !== 'playing') {
      io.to(room.code).emit('snapshot', snapshot(room, now));
      return;
    }
    for (const player of room.players) {
      if (player.connected && members.get(player.id) === room.code)
        sockets.get(player.id)?.emit('snapshot', snapshot(room, now, player.id));
    }
  }
  function leave(socket: GameSocket, explicit: boolean) {
    const room = roomFor(socket.data.playerId);
    if (!room) return;
    const p = room.players.find((p) => p.id === socket.data.playerId)!;
    p.connected = false;
    p.disconnectedAt = explicit ? Date.now() - CONFIG.reconnectMs : Date.now();
    p.input = { x: 0, y: 0, seq: p.lastSeq };
    p.dashUntil = 0;
    if (explicit && ['lobby', 'finished', 'cancelled'].includes(room.phase))
      room.players = room.players.filter((x) => x.id !== p.id);
    if (explicit) {
      p.eligible = false;
      p.alive = false;
      members.delete(p.id);
      socket.leave(room.code);
      socket.data.room = undefined;
    }
    room.updatedAt = Date.now();
    publish(room);
  }
  function handle(socket: GameSocket, c: Command): Ack {
    const id = socket.data.playerId,
      now = Date.now();
    let room = roomFor(id);
    if (c.type === 'create' || c.type === 'join') {
      if (room && room.code !== (c.type === 'join' ? c.code : ''))
        throw new Error('ALREADY_IN_ROOM');
      if (c.type === 'create') {
        if (draining) throw new Error('MAINTENANCE');
        if (!store.healthy()) throw new Error('SERVICE_UNAVAILABLE');
        if (rooms.size >= Number(process.env.MAX_ROOMS || 10)) throw new Error('SERVER_FULL');
        if (limited(`create:${id}`, 5, 60000)) throw new Error('RATE_LIMITED');
        let code = '';
        do {
          code = Array.from(
            { length: 6 },
            () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomBytes(1)[0] % 32],
          ).join('');
        } while (rooms.has(code));
        room = createRoom(code, id, c.name, c.skin, now, c.training);
        rooms.set(code, room);
        metrics.created++;
      } else {
        room = rooms.get(c.code);
        if (!room) throw new Error('ROOM_NOT_FOUND');
        if (room.training && room.hostId !== id) throw new Error('ROOM_FULL');
        let p = room.players.find((p) => p.id === id);
        if (!p) {
          room.players = room.players.filter(
            (p) =>
              p.connected ||
              p.disconnectedAt === null ||
              now - p.disconnectedAt < CONFIG.reconnectMs ||
              !['lobby', 'finished', 'cancelled'].includes(room!.phase),
          );
          if (room.players.length >= CONFIG.maxPlayers) throw new Error('ROOM_FULL');
          const color = Array.from({ length: 6 }, (_, i) => i).find(
            (n) => !room!.players.some((p) => p.color === n),
          )!;
          p = makePlayer(id, c.name, color, c.skin, now);
          p.playing = false;
          p.eligible = ['lobby', 'finished', 'cancelled'].includes(room.phase);
          room.players.push(p);
        } else {
          restorePlayer(room, p, now);
          p.name = c.name;
          p.skin = c.skin;
        }
      }
      members.set(id, room.code);
      socket.join(room.code);
      socket.data.room = room.code;
      room.updatedAt = now;
      publish(room);
      return { ok: true, code: room.code };
    }
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const p = room.players.find((p) => p.id === id)!;
    if (c.type === 'ready') {
      if (!['lobby', 'finished', 'cancelled'].includes(room.phase)) throw new Error('MATCH_ACTIVE');
      p.ready = c.ready;
    }
    if (c.type === 'appearance') p.skin = c.skin;
    if (c.type === 'start' || c.type === 'rematch') {
      if (room.hostId !== id) throw new Error('HOST_ONLY');
      if (draining) throw new Error('MAINTENANCE');
      if (!store.healthy()) throw new Error('SERVICE_UNAVAILABLE');
      if (c.type === 'rematch') {
        if (!['finished', 'cancelled'].includes(room.phase)) throw new Error('MATCH_ACTIVE');
        for (const x of room.players) x.ready = x.connected;
      }
      startMatch(room, now);
      metrics.started++;
      if (c.type === 'rematch') metrics.rematches++;
    }
    if (c.type === 'dash') {
      if (c.matchId !== room.matchId || c.round !== room.round || c.phase !== room.phase)
        throw new Error('STALE_COMMAND');
      dash(room, p, now);
    }
    if (c.type === 'emoji') {
      if (limited(`emoji:${id}`, 1, 2000)) throw new Error('RATE_LIMITED');
      p.emoji = c.emoji;
      p.emojiUntil = now + 2200;
    }
    if (c.type === 'leave') leave(socket, true);
    if (c.type === 'kick') {
      if (room.hostId !== id) throw new Error('HOST_ONLY');
      if (room.phase !== 'lobby' || c.playerId === id) throw new Error('CANNOT_KICK');
      if (
        !room.players.some((player) => player.id === c.playerId) ||
        members.get(c.playerId) !== room.code
      )
        throw new Error('PLAYER_NOT_FOUND');
      const target = sockets.get(c.playerId);
      if (target) {
        target.emit('notice', { message: 'REMOVED_BY_HOST' });
        leave(target, true);
      } else {
        room.players = room.players.filter((x) => x.id !== c.playerId);
        members.delete(c.playerId);
      }
    }
    room.updatedAt = now;
    publish(room);
    return { ok: true };
  }
  io.on('connection', (socket) => {
    const id = socket.data.playerId,
      previous = sockets.get(id);
    if (previous && previous.id !== socket.id) {
      previous.emit('notice', { message: 'SESSION_MOVED' });
      previous.disconnect(true);
    }
    sockets.set(id, socket);
    const room = roomFor(id);
    for (const code of socket.rooms)
      if (code !== socket.id && code !== room?.code) socket.leave(code);
    if (room) {
      const p = room.players.find((p) => p.id === id)!;
      restorePlayer(room, p, Date.now());
      socket.join(room.code);
      socket.data.room = room.code;
      publish(room);
    }
    socket.on('command', (raw, ack) => {
      if (typeof ack !== 'function') return;
      if (limited(`command:${id}`, 100, 1000)) {
        ack({ ok: false, error: 'RATE_LIMITED' });
        return;
      }
      const parsed = commandSchema.safeParse(raw);
      if (!parsed.success) {
        ack({ ok: false, error: 'INVALID_COMMAND' });
        return;
      }
      const c = parsed.data,
        key = `${id}:${c.id}`,
        cached = commands.get(key);
      if (cached) {
        ack(cached.result);
        return;
      }
      let result: Ack;
      try {
        result = handle(socket, c);
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : 'COMMAND_FAILED' };
      }
      commands.set(key, { result, expires: Date.now() + 120000 });
      ack(result);
    });
    socket.on('input', (raw) => {
      if (limited(`input:${id}`, 90, 1000)) return;
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) return;
      const room = roomFor(id),
        data = parsed.data;
      if (!room || room.matchId !== data.matchId || room.round !== data.round) return;
      const p = room.players.find((p) => p.id === id)!;
      if (data.seq <= p.lastSeq) return;
      p.lastSeq = data.seq;
      p.input = { x: data.x, y: data.y, seq: data.seq };
      p.inputAt = Date.now();
    });
    socket.on('disconnect', () => {
      if (sockets.get(id)?.id !== socket.id) return;
      sockets.delete(id);
      leave(socket, false);
    });
  });
  const pending = new Set<string>(),
    pendingResults = new Map<string, { result: ReturnType<typeof snapshot>; retryAt: number }>();
  const interval = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const before = room.phase;
      step(room, now, 1 / CONFIG.tickRate);
      if (before !== 'finished' && room.phase === 'finished') {
        metrics.completed++;
        pendingResults.set(room.matchId!, { result: snapshot(room, now), retryAt: now });
      }
      if (before !== 'cancelled' && room.phase === 'cancelled') metrics.cancelled++;
      if (!room.players.some((p) => p.connected) && now - room.updatedAt > 600000) {
        rooms.delete(room.code);
        for (const [id, code] of members) if (code === room.code) members.delete(id);
      }
    }
    for (const [matchId, entry] of pendingResults) {
      if (pending.has(matchId) || entry.retryAt > now) continue;
      pending.add(matchId);
      store
        .save(entry.result)
        .then(() => {
          const room = rooms.get(entry.result.code);
          if (room?.matchId === matchId) room.saved = store.mongo ? 'saved' : 'local';
          pendingResults.delete(matchId);
        })
        .catch(() => {
          metrics.persistenceErrors++;
          entry.retryAt = Date.now() + 5000;
        })
        .finally(() => pending.delete(matchId));
    }
  }, 1000 / CONFIG.tickRate);
  const broadcast = setInterval(() => {
    for (const room of rooms.values()) if (room.players.some((p) => p.connected)) publish(room);
  }, 1000 / CONFIG.snapshotRate);
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    for (const [k, v] of commands) if (v.expires < now) commands.delete(k);
    for (const [k, v] of oauthStates) if (v.expires < now) oauthStates.delete(k);
  }, 30000);
  const admin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = process.env.ADMIN_TOKEN,
      value = req.headers.authorization?.replace(/^Bearer /, '');
    if (!key || !value || !timingSafeEqual(Buffer.from(hash(key)), Buffer.from(hash(value)))) {
      res.sendStatus(403);
      return;
    }
    next();
  };
  app.get('/api/admin', admin, (_, res) =>
    res.json({
      draining,
      metrics,
      rooms: [...rooms.values()].map((r) => ({
        code: r.code,
        phase: r.phase,
        players: r.players.length,
        connected: r.players.filter((p) => p.connected).length,
      })),
      healthy: store.healthy(),
      pendingResults: pendingResults.size,
    }),
  );
  app.post('/api/admin/drain', admin, (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') {
      res.sendStatus(400);
      return;
    }
    if (shuttingDown && !req.body.enabled) {
      res.status(409).json({ error: 'SHUTTING_DOWN' });
      return;
    }
    draining = req.body.enabled;
    res.json({ draining });
  });
  app.post('/api/admin/close', admin, (req, res) => {
    const room = rooms.get(req.body?.code);
    if (!room) {
      res.sendStatus(404);
      return;
    }
    room.phase = 'cancelled';
    room.reason = 'CLOSED_BY_ADMIN';
    publish(room);
    res.json({ ok: true });
  });
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Request failed', error instanceof Error ? error.name : 'error');
      res.status(500).json({ error: 'SERVER_ERROR' });
    },
  );
  return {
    app,
    http,
    io,
    rooms,
    store,
    async drain(timeoutMs = 240000) {
      draining = true;
      shuttingDown = true;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const active = [...rooms.values()].some(
          (room) =>
            room.players.some((player) => player.connected) &&
            !['lobby', 'finished', 'cancelled'].includes(room.phase),
        );
        if (!active && pendingResults.size === 0 && pending.size === 0) return true;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))),
        );
      }
      return false;
    },
    async close() {
      clearInterval(interval);
      clearInterval(broadcast);
      clearInterval(cleanup);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await store.close();
    },
  };
}

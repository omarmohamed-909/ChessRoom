import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeServer } from '../apps/server/src/app';
import { CONFIG, type Snapshot } from '../packages/shared/src/index';
let server: Awaited<ReturnType<typeof makeServer>>, url: string;
const clients: Socket[] = [];
async function guest() {
  const response = await fetch(`${url}/api/session`, { method: 'POST' }),
    cookie = response.headers.getSetCookie()[0].split(';')[0],
    identity = (await response.json()) as { id: string };
  const socket = io(url, {
    extraHeaders: { Cookie: cookie },
    transports: ['websocket'],
    autoConnect: false,
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
    socket.connect();
  });
  return { socket, cookie, id: identity.id };
}
async function command(socket: Socket, data: Record<string, unknown>) {
  return (await socket.timeout(3000).emitWithAck('command', { id: randomUUID(), ...data })) as {
    ok: boolean;
    code?: string;
    error?: string;
  };
}
beforeAll(async () => {
  process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'chaos-test-'));
  process.env.ADMIN_TOKEN = 'test-admin-only';
  server = await makeServer({
    store: { uri: '', dataDir: process.env.DATA_DIR, production: false },
  });
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.http.address() as { port: number }).port}`;
});
afterAll(async () => {
  clients.forEach((c) => c.disconnect());
  await server?.close();
});
describe('real Socket.IO sessions', () => {
  it('requires a signed guest cookie', async () => {
    const socket = io(url, { transports: ['websocket'], reconnection: false, autoConnect: false });
    clients.push(socket);
    const error = await new Promise<Error>((resolve) => {
      socket.once('connect_error', resolve);
      socket.connect();
    });
    expect(error.message).toBe('SESSION_REQUIRED');
  });
  it('creates and joins rooms; enforces host and readiness; deduplicates commands; reconnects', async () => {
    const host = await guest(),
      guest2 = await guest();
    const created = await command(host.socket, {
      type: 'create',
      name: 'عمر',
      skin: 'sprout',
      training: false,
    });
    expect(created.ok).toBe(true);
    const code = created.code!;
    expect(
      (await command(guest2.socket, { type: 'join', code, name: 'نور', skin: 'crown' })).ok,
    ).toBe(true);
    expect((await command(guest2.socket, { type: 'start' })).error).toBe('HOST_ONLY');
    expect((await command(host.socket, { type: 'start' })).error).toBe('NOT_READY');
    await command(host.socket, { type: 'ready', ready: true });
    await command(guest2.socket, { type: 'ready', ready: true });
    const start = { type: 'start', id: randomUUID() };
    expect((await command(host.socket, start)).ok).toBe(true);
    const room = server.rooms.get(code)!,
      matchId = room.matchId;
    expect((await command(host.socket, start)).ok).toBe(true);
    expect(room.matchId).toBe(matchId);
    const p = room.players.find((p) => p.id === host.id)!;
    host.socket.emit('input', { x: 1, y: 0, seq: 1, matchId, round: 0 });
    await new Promise((r) => setTimeout(r, 80));
    expect(p.x).toBeGreaterThan(6);
    const first = { type: 'dash', id: randomUUID(), matchId, round: 0, phase: 'vote' };
    expect((await command(host.socket, first)).ok).toBe(true);
    const ready = p.dashReadyAt;
    expect((await command(host.socket, first)).ok).toBe(true);
    expect(p.dashReadyAt).toBe(ready);
    expect(
      (await command(host.socket, { type: 'dash', matchId: randomUUID(), round: 0, phase: 'vote' }))
        .error,
    ).toBe('STALE_COMMAND');
    host.socket.emit('input', { x: 10000, y: 0, seq: 2, matchId, round: 0 });
    await new Promise((r) => setTimeout(r, 50));
    expect(p.input.x).toBe(1);
    expect((await command(host.socket, { type: 'appearance', skin: 'ninja' })).ok).toBe(true);
    expect(p.skin).toBe('ninja');
    guest2.socket.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    expect(room.players.find((p) => p.id === guest2.id)?.connected).toBe(false);
    const restored = new Promise<Snapshot>((resolve) => guest2.socket.once('snapshot', resolve));
    guest2.socket.connect();
    const state = await restored;
    expect(state.code).toBe(code);
    expect(state.matchId).toBe(matchId);
    expect(state.players.find((p) => p.id === guest2.id)?.connected).toBe(true);
    expect(state).not.toHaveProperty('seed');
  });
  it('rejects unauthenticated admin requests', async () => {
    const response = await fetch(`${url}/api/admin`);
    expect(response.status).toBe(403);
    const admin = await fetch(`${url}/api/admin`, {
      headers: { Authorization: 'Bearer test-admin-only' },
    });
    expect(admin.status).toBe(200);
    expect((await admin.json()).metrics.started).toBe(1);
  });
  it('persists a result only once', async () => {
    const room = [...server.rooms.values()][0],
      state = { ...room, protocol: 1, serverTime: Date.now() } as unknown as Snapshot;
    await server.store.save(state);
    await server.store.save(state);
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(join(process.env.DATA_DIR!, 'matches.ndjson'), 'utf8');
    expect(content.trim().split('\n')).toHaveLength(1);
  });
  it('lets a guest leave an active match and create another room', async () => {
    const p = await guest();
    const first = await command(p.socket, {
      type: 'create',
      name: 'Test',
      skin: 'classic',
      training: true,
    });
    expect((await command(p.socket, { type: 'start' })).ok).toBe(true);
    expect((await command(p.socket, { type: 'leave' })).ok).toBe(true);
    const second = await command(p.socket, {
      type: 'create',
      name: 'Test',
      skin: 'sprout',
      training: false,
    });
    expect(second.ok).toBe(true);
    expect(second.code).not.toBe(first.code);
  });
  it('caps rooms at six and makes mid-match newcomers wait for the next match', async () => {
    const room = [...server.rooms.values()][0];
    for (let i = 0; i < 4; i++) {
      const p = await guest();
      expect(
        (
          await command(p.socket, {
            type: 'join',
            code: room.code,
            name: `Guest ${i}`,
            skin: 'classic',
          })
        ).ok,
      ).toBe(true);
      expect(room.players.find((x) => x.id === p.id)?.playing).toBe(false);
    }
    const extra = await guest();
    expect(
      (
        await command(extra.socket, {
          type: 'join',
          code: room.code,
          name: 'Extra',
          skin: 'classic',
        })
      ).error,
    ).toBe('ROOM_FULL');
  });
  it('cannot kick a player from a different room, and an offline kick leaves no stale membership', async () => {
    const host = await guest(),
      outsider = await guest(),
      offline = await guest();
    const a = await command(host.socket, {
      type: 'create',
      name: 'Host',
      skin: 'classic',
      training: false,
    });
    const b = await command(outsider.socket, {
      type: 'create',
      name: 'Outside',
      skin: 'classic',
      training: false,
    });
    expect((await command(host.socket, { type: 'kick', playerId: outsider.id })).error).toBe(
      'PLAYER_NOT_FOUND',
    );
    expect(server.rooms.get(b.code!)!.players[0].connected).toBe(true);
    await command(offline.socket, { type: 'join', code: a.code, name: 'Offline', skin: 'classic' });
    offline.socket.disconnect();
    await expect
      .poll(() => server.rooms.get(a.code!)!.players.find((p) => p.id === offline.id)?.connected)
      .toBe(false);
    expect((await command(host.socket, { type: 'kick', playerId: offline.id })).ok).toBe(true);
    await new Promise<void>((resolve, reject) => {
      offline.socket.once('connect', () => resolve());
      offline.socket.once('connect_error', reject);
      offline.socket.connect();
    });
    expect(
      (
        await command(offline.socket, {
          type: 'create',
          name: 'Back',
          skin: 'sprout',
          training: false,
        })
      ).ok,
    ).toBe(true);
  });
  it('drains active games before shutdown and rejects new admission', async () => {
    const actor = await guest();
    let drained = false;
    const waiting = server.drain(1500).then((value) => {
      drained = value;
      return value;
    });
    expect(
      (
        await command(actor.socket, {
          type: 'create',
          name: 'Wait',
          skin: 'classic',
          training: false,
        })
      ).error,
    ).toBe('MAINTENANCE');
    expect(drained).toBe(false);
    for (const room of server.rooms.values()) room.phase = 'cancelled';
    expect(await waiting).toBe(true);
    expect((await fetch(`${url}/ready`)).status).toBe(503);
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });
});

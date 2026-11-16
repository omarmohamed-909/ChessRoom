import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Store } from '../../apps/server/src/store';
import { makeServer } from '../../apps/server/src/app';
import { createRoom, startMatch } from '../../apps/server/src/engine';
import { snapshot } from '../../packages/shared/src/index';
import { mongoFixture, mongoProxy } from '../helpers/mongo';
import { io } from 'socket.io-client';

let fixture: Awaited<ReturnType<typeof mongoFixture>>, reader: mongoose.Connection;
const stores: Store[] = [];
async function store(uri = fixture.uri) {
  const value = new Store({ uri, selectionTimeoutMs: 500 });
  stores.push(value);
  await value.init();
  return value;
}
beforeAll(async () => {
  fixture = await mongoFixture();
  reader = await mongoose.createConnection(fixture.uri).asPromise();
});
afterAll(async () => {
  await Promise.all(stores.map((s) => s.close()));
  await reader?.close();
  await fixture?.stop();
});
describe('real MongoDB persistence', () => {
  it('restores a linked profile from the same signed cookie after an application restart', async () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'mongo-restart-test-secret-only-not-for-production';
    let server: Awaited<ReturnType<typeof makeServer>> | undefined;
    async function boot() {
      server = await makeServer({ store: { uri: fixture.uri, selectionTimeoutMs: 500 } });
      await new Promise<void>((resolve) => server!.http.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.http.address() as { port: number }).port}`;
    }
    try {
      let url = await boot();
      const response = await fetch(`${url}/api/session`, { method: 'POST' }),
        cookie = response.headers.getSetCookie()[0].split(';')[0],
        guest = (await response.json()) as { id: string };
      await server!.store.skin(guest.id, 'headphones');
      await server!.store.link(
        guest.id,
        randomUUID(),
        'restart@example.invalid',
        'Returning player',
      );
      await server!.close();
      server = undefined;
      url = await boot();
      const restored = await fetch(`${url}/api/session`, {
        method: 'POST',
        headers: { Cookie: cookie },
      });
      expect(await restored.json()).toMatchObject({
        id: guest.id,
        storage: 'mongo',
        user: { name: 'Returning player', skin: 'headphones' },
      });
    } finally {
      await server?.close();
      if (original === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = original;
    }
  });
  it('upserts one immutable, confirmed result across concurrent saves and an app restart', async () => {
    const first = await store();
    const room = createRoom('ABC234', randomUUID(), 'عمر', 'classic', Date.now(), true);
    startMatch(room, Date.now());
    room.phase = 'finished';
    room.saved = 'pending';
    const result = snapshot(room, Date.now());
    await Promise.all(Array.from({ length: 8 }, () => first.save(result)));
    await first.close();
    const restarted = await store();
    await restarted.save({ ...result, players: [] });
    const rows = await reader.db!.collection('matches').find({ matchId: result.matchId }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].result.saved).toBe('saved');
    expect(rows[0].result.players).toHaveLength(1);
  });
  it('persists a guest appearance and links it to a canonical Google account', async () => {
    const db = await store(),
      guest = randomUUID(),
      googleSub = randomUUID();
    await db.skin(guest, 'crown');
    const linked = await db.link(guest, googleSub, 'test@example.invalid', 'Test');
    expect(linked?.id).toBe(guest);
    await db.close();
    const restarted = await store();
    expect((await restarted.user(guest))?.skin).toBe('crown');
    const other = randomUUID();
    await restarted.skin(other, 'ninja');
    const merged = await restarted.link(other, googleSub, 'test@example.invalid', 'Test');
    expect(merged?.id).toBe(guest);
    expect(merged?.skin).toBe('ninja');
    await expect(
      restarted.link(guest, 'another-google-id', 'test2@example.invalid', 'Other'),
    ).rejects.toThrow('ACCOUNT_ALREADY_LINKED');
  });
  it('handles two simultaneous first links without creating duplicate accounts', async () => {
    const db = await store(),
      sub = randomUUID();
    const results = await Promise.all([
      db.link(randomUUID(), sub, 'race@example.invalid', 'A'),
      db.link(randomUUID(), sub, 'race@example.invalid', 'B'),
    ]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect(await reader.db!.collection('users').countDocuments({ googleSub: sub })).toBe(1);
  });
  it('keeps independent stores connected when one store closes', async () => {
    const a = await store(),
      b = await store();
    await a.close();
    expect(a.healthy()).toBe(false);
    expect(b.healthy()).toBe(true);
    const id = randomUUID();
    await b.skin(id, 'sprout');
    expect((await b.user(id))?.skin).toBe('sprout');
  });
  it('fails writes on outage and saves after recovery without inventing success', async () => {
    const proxy = await mongoProxy(fixture.uri);
    const db = await store(proxy.uri);
    const room = createRoom('ABC234', randomUUID(), 'Test', 'classic', Date.now(), true);
    startMatch(room, Date.now());
    const result = snapshot(room, Date.now());
    try {
      await proxy.stop();
      await expect(db.save(result)).rejects.toThrow();
      expect(
        await reader.db!.collection('matches').countDocuments({ matchId: result.matchId }),
      ).toBe(0);
      await proxy.start();
      await expect
        .poll(
          async () => {
            try {
              await db.save(result);
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 15000 },
        )
        .toBe(true);
      expect(
        await reader.db!.collection('matches').countDocuments({ matchId: result.matchId }),
      ).toBe(1);
    } finally {
      await db.close();
      await proxy.stop();
    }
  });
  it('reports database health and rejects new matches while the database is unavailable', async () => {
    const proxy = await mongoProxy(fixture.uri),
      server = await makeServer({ store: { uri: proxy.uri, selectionTimeoutMs: 500 } });
    await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.http.address() as { port: number }).port}`;
    const session = await fetch(`${url}/api/session`, { method: 'POST' }),
      cookie = session.headers.getSetCookie()[0].split(';')[0];
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie },
      autoConnect: false,
    });
    const command = (data: Record<string, unknown>) =>
      socket.timeout(3000).emitWithAck('command', { id: randomUUID(), ...data });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
        socket.connect();
      });
      await command({ type: 'create', name: 'Test', skin: 'classic', training: true });
      expect((await fetch(`${url}/ready`)).status).toBe(200);
      await proxy.stop();
      await expect(server.store.user(randomUUID())).rejects.toThrow();
      await expect.poll(() => server.store.healthy(), { timeout: 15000 }).toBe(false);
      expect((await fetch(`${url}/ready`)).status).toBe(503);
      expect((await fetch(`${url}/health`)).status).toBe(200);
      expect((await command({ type: 'start' })).error).toBe('SERVICE_UNAVAILABLE');
      await command({ type: 'leave' });
      expect(
        (await command({ type: 'create', name: 'Test', skin: 'classic', training: false })).error,
      ).toBe('SERVICE_UNAVAILABLE');
    } finally {
      socket.disconnect();
      await server.close();
      await proxy.stop();
    }
  });
});

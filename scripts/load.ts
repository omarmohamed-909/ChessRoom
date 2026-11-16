import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import type { Snapshot } from '../packages/shared/src/index';
import { makeServer } from '../apps/server/src/app';

const roomCount = Number(process.env.LOAD_ROOMS || 10),
  playerCount = Number(process.env.LOAD_PLAYERS || 6),
  seconds = Number(process.env.LOAD_SECONDS || 60);
if (
  !Number.isInteger(roomCount) ||
  roomCount < 1 ||
  roomCount > 100 ||
  !Number.isInteger(playerCount) ||
  playerCount < 2 ||
  playerCount > 6 ||
  seconds < 5
)
  throw new Error('Invalid load configuration');
let server: Awaited<ReturnType<typeof makeServer>> | undefined,
  url = process.env.LOAD_URL;
const clients: Socket[] = [],
  latencies: number[] = [];
let snapshots = 0,
  errors = 0,
  completed = 0;
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
async function command(socket: Socket, data: Record<string, unknown>) {
  const start = performance.now();
  const result = await socket.timeout(5000).emitWithAck('command', { id: randomUUID(), ...data });
  latencies.push(performance.now() - start);
  if (!result.ok) throw new Error(result.error);
  return result;
}
try {
  if (!url) {
    process.env.MAX_ROOMS = String(roomCount);
    process.env.MAX_CONNECTIONS_PER_IP = String(Math.max(60, roomCount * playerCount * 2));
    process.env.DATA_DIR = await mkdtemp(join(tmpdir(), 'chaos-load-'));
    server = await makeServer({
      store: { uri: '', dataDir: process.env.DATA_DIR, production: false },
    });
    await new Promise<void>((resolve) => server!.http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.http.address() as { port: number }).port}`;
  }
  console.log(`Testing ${roomCount} rooms × ${playerCount} players for ${seconds}s at ${url}`);
  for (let r = 0; r < roomCount; r++) {
    const crew: Socket[] = [];
    let code = '';
    for (let p = 0; p < playerCount; p++) {
      const response = await fetch(`${url}/api/session`, { method: 'POST' });
      if (!response.ok) throw new Error(`Session failed ${response.status}`);
      const cookie = response.headers.getSetCookie()[0].split(';')[0];
      const socket = io(url, {
        extraHeaders: { Cookie: cookie },
        transports: ['websocket'],
        autoConnect: false,
      });
      clients.push(socket);
      crew.push(socket);
      let state: Snapshot | undefined,
        seq = 0;
      socket.on('snapshot', (value: Snapshot) => {
        state = value;
        snapshots++;
      });
      socket.on('connect_error', () => errors++);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
        socket.connect();
      });
      if (p === 0)
        code = (
          await command(socket, {
            type: 'create',
            name: `Host ${r}`,
            skin: 'classic',
            training: false,
          })
        ).code;
      else await command(socket, { type: 'join', code, name: `Player ${p}`, skin: 'sprout' });
      await command(socket, { type: 'ready', ready: true });
      const inputTimer = setInterval(() => {
        if (state && socket.connected)
          socket.volatile.emit('input', {
            x: Math.sin(Date.now() / 1200 + p),
            y: Math.cos(Date.now() / 1400 + r),
            seq: ++seq,
            matchId: state.matchId,
            round: state.round,
          });
      }, 50);
      socket.once('disconnect', () => clearInterval(inputTimer));
      if (p === 0) {
        let rematching = false;
        socket.on('snapshot', async (value: Snapshot) => {
          if (value.phase === 'finished' && !rematching) {
            completed++;
            rematching = true;
            try {
              await command(socket, { type: 'rematch' });
            } catch {
              errors++;
            } finally {
              rematching = false;
            }
          }
        });
      }
    }
    await command(crew[0], { type: 'start' });
  }
  const start = Date.now();
  while (Date.now() - start < seconds * 1000) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(10000, seconds * 1000 - (Date.now() - start))),
    );
    console.log(
      `elapsed ${Math.round((Date.now() - start) / 1000)}s · snapshots ${snapshots} · clients ${clients.filter((c) => c.connected).length}`,
    );
  }
  latencies.sort((a, b) => a - b);
  const summary = {
    rooms: roomCount,
    players: clients.length,
    seconds,
    snapshots,
    completed,
    errors,
    connected: clients.filter((c) => c.connected).length,
    commandAckP95Ms: Math.round(latencies[Math.floor(latencies.length * 0.95)] || 0),
    eventLoopP95Ms: Math.round(lag.percentile(95) / 1e6),
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (errors || summary.connected !== clients.length) process.exitCode = 1;
} finally {
  lag.disable();
  clients.forEach((s) => s.disconnect());
  await server?.close();
}

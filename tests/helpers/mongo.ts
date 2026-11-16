import { spawn } from 'node:child_process';
import { createServer, connect, type Socket } from 'node:net';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
export async function mongoFixture() {
  const database = `chaos_test_${randomUUID().replaceAll('-', '')}`;
  const configured = process.env.MONGO_TEST_ORIGIN;
  if (configured) {
    const origin = new URL(configured);
    if (
      origin.protocol !== 'mongodb:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      !['', '/'].includes(origin.pathname)
    )
      throw new Error(
        'MONGO_TEST_ORIGIN must be a loopback MongoDB origin without a database name',
      );
    origin.pathname = `/${database}`;
    const uri = origin.toString();
    return {
      uri,
      async stop() {
        const conn = await mongoose.createConnection(uri).asPromise();
        try {
          await conn.dropDatabase();
        } finally {
          await conn.close();
        }
      },
    };
  }
  const root = await realpath(tmpdir()),
    directory = await mkdtemp(join(root, 'chaos-mongo-')),
    port = await freePort();
  const uri = `mongodb://127.0.0.1:${port}/${database}`;
  const child = spawn(
    process.env.MONGODB_BINARY || 'mongod',
    [
      '--dbpath',
      directory,
      '--bind_ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--wiredTigerCacheSizeGB',
      '0.25',
      '--logpath',
      join(directory, 'mongod.log'),
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let failure: Error | undefined,
    exited = false;
  child.on('error', (error) => {
    failure = error;
    exited = true;
  });
  child.on('exit', () => {
    exited = true;
  });
  async function stop() {
    if (!exited) {
      const admin = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1000 });
      admin.on('error', () => {});
      try {
        await admin.asPromise();
        await admin.db!.admin().command({ shutdown: 1, force: true });
      } catch {
      } finally {
        await admin.close().catch(() => {});
      }
      const deadline = Date.now() + 5000;
      while (!exited && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      if (!exited) {
        child.kill('SIGKILL');
        await new Promise<void>((resolve) => child.once('exit', () => resolve()));
      }
    }
    // Only this fixture's newly created directory may be recursively removed.
    const target = await realpath(directory);
    if (dirname(target) !== root || !basename(target).startsWith('chaos-mongo-'))
      throw new Error('Unsafe test cleanup path');
    await rm(target, { recursive: true, force: true });
  }
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (failure)
        throw new Error('mongod could not start. Install MongoDB or set MONGODB_BINARY.');
      if (exited) throw new Error('Isolated mongod exited before becoming ready');
      const probe = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 500 });
      probe.on('error', () => {});
      try {
        await probe.asPromise();
        await probe.db!.admin().ping();
        await probe.close();
        return { uri, stop };
      } catch {
        await probe.close().catch(() => {});
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error('Isolated MongoDB did not become ready');
  } catch (error) {
    await stop();
    throw error;
  }
}

/** A loopback-only fault proxy: disconnect clients without touching the database process. */
export async function mongoProxy(uri: string) {
  const target = new URL(uri),
    port = await freePort(),
    sockets = new Set<Socket>();
  let server: ReturnType<typeof createServer> | undefined;
  async function start() {
    server = createServer((client) => {
      const upstream = connect(Number(target.port), target.hostname);
      sockets.add(client);
      sockets.add(upstream);
      const close = () => {
        client.destroy();
        upstream.destroy();
        sockets.delete(client);
        sockets.delete(upstream);
      };
      client.on('error', close);
      upstream.on('error', close);
      client.on('close', close);
      upstream.on('close', close);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(port, '127.0.0.1', resolve);
    });
  }
  async function stop() {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  }
  await start();
  const publicUri = new URL(uri);
  publicUri.hostname = '127.0.0.1';
  publicUri.port = String(port);
  return { uri: publicUri.toString(), start, stop };
}

import { makeServer } from './app.js';
const server = await makeServer();
const port = Number(process.env.PORT || 4000);
server.http.listen(port, '0.0.0.0', () =>
  console.log(`CHAOS ROOM server: http://localhost:${port}`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Draining: waiting for active matches and pending results.');
  const complete = await server.drain(Number(process.env.SHUTDOWN_GRACE_MS || 240000));
  if (!complete) console.warn('Shutdown deadline reached; unfinished matches will be cancelled.');
  await server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

# Deployment and operations

## Prerequisites

Use one long-running Node 22 service for the game server, a Vercel project for the web, and managed MongoDB. The supplied `render.yaml` describes one Frankfurt instance with manual deployments. Verify account access and current plan pricing before provisioning. No service has been created or charged by the local implementation.

Assign **same-site HTTPS custom domains**, for example `play.example.com` and `api.example.com`. A `vercel.app` frontend paired directly with `onrender.com` is cross-site and will not reliably carry the Lax guest cookie; do not release that pairing. For a temporary all-in-one deployment, put both services behind a same-origin reverse proxy.

## Game server

At repository root: `npm ci && npm run build -w @chaos/server`.

Start: `npm run start -w @chaos/server`.

Required production environment:

- `NODE_ENV=production`
- `SESSION_SECRET`: unique random 32+ character secret, stored in host secrets.
- `MONGODB_URI`: restricted database credential, stored in host secrets.
- `WEB_ORIGIN=https://play.example.com`
- `API_ORIGIN=https://api.example.com`
- `ADMIN_TOKEN`: separate random secret for operations.
- `MAX_ROOMS=10`
- `PORT`: assigned by hosting.

Set `TRUST_PROXY` only after confirming the number of trusted proxy hops; incorrect trust lets clients evade IP limits. Allow required database network access using the provider's networking controls. Keep the server and database close together. MongoDB creates unique indexes for match and account IDs; allow initial index creation before admission.

## Web on Vercel

Import the same monorepo. Root directory `apps/web`, framework Next.js, install from the workspace root with `npm ci`, build `npm run build` in the web workspace. Set `NEXT_PUBLIC_SERVER_URL=https://api.example.com` **before building**. Keep the lockfile and shared package in the deployment's accessible workspace. Rebuild when changing the public server URL. The web has no database or OAuth secrets.

## Google linking

Create a web OAuth client in your Google project. Redirect URI: `https://api.example.com/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the game server only. Google login remains visibly unavailable until both keys and MongoDB are configured. Exercise success, declined consent, expired state, incorrect nonce and existing-account linking in staging. All current preview skins are free; paid entitlement merging must be designed before paid sales are enabled.

## Release and rollback

1. Build, typecheck, test, and run staging/browser checks.
2. Pause admission with `/admin` and allow existing matches to finish. Readiness returns 503 while draining. The Render liveness check now uses `/health`, so admission pause or a database outage does not itself trigger a process restart.
3. Deploy during a maintenance window. Version 1 stores live matches in memory, so process replacement cancels any remaining matches; zero-downtime HTTP deployment does not preserve game rooms.
4. Check `/health`, database health and a two-device match. Resume admission.
5. Watch completion rate, persistence errors, connections and event-loop delay. Roll back the exact source revision and compatible lockfile when necessary.

On SIGTERM/SIGINT, the server stops admitting rooms/matches and waits up to `SHUTDOWN_GRACE_MS` (default 240000 ms) for active games and pending saves, then closes sockets and its database connection. The Render Blueprint allows 300 seconds for shutdown. An operator cannot resume admission once process shutdown has started. Planned operator drain is still useful: reconnecting to a replacement process cannot recover an old in-memory room. See [Render shutdown configuration](https://render.com/docs/blueprint-spec).

Live rooms do not migrate between processes. Persistence retries are queued in memory by match ID and survive rematch, but not a hard process crash. Unique MongoDB upsert protects against duplicate final records. A result is marked `saved` only after the database acknowledges it. Do not promise durable recovery for a match not yet confirmed saved.

## Monitoring and recovery

`/admin` accepts the bearer token into tab memory only. It exposes created/started/completed/rematched/cancelled totals, persistence failures and room counts. Never paste the token into a shared screenshot or link.

Enable external uptime checks and database backup/restore on the selected providers. Collect structured process logs without JWTs, cookies or OAuth tokens. In MongoDB outages, monitor pending result saves and stop admission if failures persist. A database failure must never be represented as a successful saved result. Restart after recovery only once the risks to in-memory matches and pending saves are understood.

Room creation and match start are automatically rejected while the database connection is unhealthy; existing gameplay continues. Each Store owns its own Mongoose connection, so closing a test, worker or app instance cannot disconnect another instance. Run `npm run check:deploy` to validate required secrets, HTTPS origins, limits, paired optional Google keys and the web build's API URL without printing secret values.

MongoDB backup schedule, retention, support contact, alert destination and log collection need actual provider/account configuration before public launch. These are documented release tasks, not services silently simulated by the app.

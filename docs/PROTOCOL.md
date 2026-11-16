# Network contract · protocol 1

## Trust and session

`POST /api/session` returns `{ id, user, googleEnabled, storage }` and creates an opaque signed HttpOnly guest cookie if needed. Tokens are HS256, issuer `chaos-room`, 30-day expiry. In production the cookie is Secure, host-only and SameSite=Lax. Web and API **must use HTTPS under the same registrable domain** for reliable Safari/mobile behavior. Never put guest credentials in invitation links or browser storage.

Socket.IO connects with credentials. The handshake verifies the signature and expiry. Each guest has one active socket; a newer connection moves that session out of the older tab. Room membership is kept separately from historical participants so leaving a running game allows entering another room.

## Client events

`command(payload, ack)`: discriminated Zod union. All commands include a UUID `id`. Commands: `create`, `join`, `ready`, `appearance`, `start`, `dash`, `emoji`, `rematch`, `leave`, `kick`. Create/join include a validated nickname and allowed skin. Join includes a six-character room code. Appearance selects a free preview skin without changing collision or room color. No command can write score, rule selection, position or ownership.

Acknowledgment: `{ ok, error?, code? }`. Results are deduplicated by `(playerId, commandId)` for two minutes. Clients retry acknowledgments up to three attempts with the **same** ID. Dash also includes `matchId`, `round` and `phase`; delayed commands from a previous stage are rejected. This is bounded retry/idempotency, not a promise of exactly-once network delivery.

`input({ x, y, seq, matchId, round })`: volatile, 20 Hz client sampling. Direction components must be finite in [-1, 1]. Server rejects wrong match/round and non-increasing sequence. Input expires after 250 ms. Client never buffers movement for replay across a disconnect.

## Server events

`snapshot(Snapshot)`: 15 Hz complete state per viewer, including `protocol`, `serverTime`, `code`, `matchId`, `round`, `phase`, `phaseStartedAt`, `endsAt`, public players, hazards, votes and round history. Does not expose session credentials, random seed or hidden door target fields. Only the viewer's current-stage clue is revealed; it becomes null when that player's three-second visibility window expires.

`notice({ message })`: session moved or host removed the guest. Error codes map to localized messages in the UI. Final results are backed by the server's recorded round events, including share-card minority wins.

Phase changes and vote/round/final outcomes are in every complete snapshot, so a missed transition packet is repaired by the next snapshot. Socket.IO recovery is an optimization; authoritative room lookup and a complete snapshot are the reconnect fallback.

## Simulation and prediction

30 Hz fixed-step authoritative server. Shared movement integration and normalized input. Client predicts its own body, discards acknowledged inputs using `lastSeq`, replays outstanding samples, and interpolates remote bodies. A new phase clears pending movement prediction. Authoritative game outcomes never depend on animation completion or browser countdowns.

## HTTP operations

- `GET /health`: process liveness and protocol.
- `GET /ready`: database health and admission status.
- `POST /api/feedback`: authenticated, bounded report plus optional match UUID.
- `POST /api/skin`: owned-skin update for linked MongoDB accounts.
- `GET /auth/google` / `GET /auth/google/callback`: optional Google OIDC linking.
- `GET /api/admin`: bearer-protected metrics and room summaries.
- `POST /api/admin/drain`: `{ enabled: boolean }` pauses new rooms and matches.
- `POST /api/admin/close`: `{ code }` cancels a room's current match.

Rate limits are in-memory per process, suitable for the single-node release. Do not horizontally scale without replacing the limiter, session coordination, and authoritative room ownership/routing together.

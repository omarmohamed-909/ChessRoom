# Verification record

Initial implementation verified locally on Windows / Node 22.20.0.

Completed checks:

- Production web build with Next.js 16.4.6 / Webpack; server TypeScript compilation.
- Unit tests for vote boundaries, majority/tie/abstention, dash/cooldown, diagonal motion, hazards, scoring, match sequence, host transfer, reconnect grace, batteries and doors.
- Real Socket.IO integration with signed guest cookies, room creation/join, host permission, readiness, command idempotency, reconnect snapshot, admin authorization and local result persistence.
- Playwright: two independent guests using Arabic and English finish three rounds, save the result, download a factual share card, rematch, and leave. Mobile layout, language persistence and settings checked separately.
- Load smoke: **10 rooms / 60 clients / 60 seconds**, 48,686 snapshots observed, **0 connection errors**, all 60 clients still connected. Local command acknowledgment p95 1 ms; event-loop p95 34 ms; total harness process RSS 161 MB. Server and bots ran in the same process/host, so these are not production latency or isolated server memory measurements.
- After reusing shared encoded snapshots outside the doors game: **20 rooms / 120 clients / 30 seconds**, 49,468 snapshots, **0 connection errors**, all 120 clients remained connected; local acknowledgment p95 1 ms, event-loop p95 38 ms, harness RSS 160 MB. This short run does not cover sustained multi-round doors load and does not justify raising the default production admission cap.
- Final unit/integration suite: **23 passing tests**. Full two-browser match and rematch passed again after the gameplay updates. The responsive-only rerun passed; one earlier screenshot capture failed transiently in Chromium and passed on retry.

The load smoke is shorter than the one-hour release gate. Real mobile hardware, cross-network latency, real MongoDB/OAuth credentials, production infrastructure, backups and independent playtest conversion/retention remain unverified. See `RELEASE.md` for the required public-launch checks.

Verified screenshots are kept in `docs/previews/`: Arabic desktop home, mobile home, and a completed two-player match.

## Beta 0.2 — real database and operational checks

- **31 passing core tests**: game logic, real Socket.IO sessions, reconnect expiry before a simulation tick, cross-room kick denial, offline-kick cleanup, drain/admission behavior and production configuration validation.
- **7 passing real MongoDB tests** on an isolated local `mongod`: concurrent idempotent upserts, immutable confirmed results, persisted appearance and canonical account linking, concurrent first-link race, independent connection ownership, signed-cookie/profile continuity after app restart, and outage/recovery through a loopback fault proxy. Tests do not contact Google.
- **2 passing Playwright scenarios** with the live app using the project-owned MongoDB database: full Arabic/English two-guest match through all three rounds, database-confirmed result, share download and rematch; plus responsive settings/language checks. Screenshots include `mongo-match-results.png`.
- Web/server production build passed. Typecheck is run after build, because concurrent Next.js generation can temporarily remove its generated type files.
- `npm run dev:db` starts a local database and both apps without changing the installed MongoDB service. Its database and development signing secret survive restarts; live rooms do not.
- Restart smoke passed: web on port 3000 returned 200, API readiness on port 4000 returned 200, session storage reported `mongo`, and the previously saved result still contained all three rounds. The helper clears inherited `PORT` so Next.js and the API do not compete for one port.
- `npm run check:deploy` correctly reports the six currently missing production settings: session/admin secrets, managed database URI, HTTPS web/API origins, and the web build's server URL. It does not print secret values or verify provider accounts.

Managed MongoDB staging, real Google OAuth consent, public hosting/domains, backups, real-device/network validation and independent playtest gates remain open.

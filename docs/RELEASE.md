# Public release checklist

## Automated checks

- [ ] `npm ci` on a clean checkout, `npm run typecheck`, `npm test`, `npm run build`.
- [ ] Playwright full two-guest match, result persistence, SVG download and rematch.
- [ ] 10 full rooms for an hour on staging; 20 rooms for headroom after configuring safe isolated limits.
- [ ] Reconnection during voting, dash, round end, and results. Host departure and mid-match join.
- [ ] Real MongoDB unique-result save, outage/retry/recovery, and account persistence across server restarts.
- [ ] Google linking success, failure, existing account, and guest appearance migration with actual OAuth credentials.
- [ ] Check signed-cookie behavior on the final same-site production domains.

## Real devices and networks

- [ ] Android Chrome and iOS Safari, current and previous major versions; medium-tier hardware.
- [ ] Desktop Chrome, Firefox and Safari; keyboard focus and text input.
- [ ] Landscape touch joystick and dash with two fingers; portrait rotation prompt.
- [ ] Different Wi-Fi/cellular networks; 150 ms latency, jitter, interruption and return from background.
- [ ] Target 60 FPS, with stable 30 FPS minimum on the agreed baseline. Measure rather than infer from desktop tests.
- [ ] Arabic/English, long nicknames, reduced motion, muted sound/reactions, and no horizontal page overflow.

## Playtests and product gates

20 independent groups, including 2/4/6 players; at least 100 completed matches. Track created rooms, join funnel, started/completed matches and rematches. Initial targets: ≥95% completion, ≥80% start without spoken explanation, ≥40% groups rematch. Record device/network and reason for abandoning. These are validation targets, not measured claims in the current implementation.

## Launch operations

- [ ] Configure HTTPS domains, MongoDB backup + test restore, monitoring/alerts, and staging/production separation.
- [ ] Set a genuine public support contact and finalize data retention, privacy, terms and account-removal procedures for the intended launch regions/audience.
- [ ] Record provenance/licenses of any assets added to the original procedural art.
- [ ] Prepare the short gameplay trailer and store/landing screenshots using actual play.
- [ ] Establish maintenance windows, an incident owner, rollback procedure and initial room cap.
- [ ] Keep purchases disabled. Payment activation is a separate release requiring merchant eligibility, provider approval, signed webhooks, duplicate/refund handling and entitlement tests.

## Local Beta 0.2 progress

- Real MongoDB tests now cover idempotent concurrent saves, independent connections, profile/session continuity across app restarts, account-link races, and outage recovery.
- A complete two-browser match, result save, share card, rematch and responsive UI passed locally with MongoDB through `npm run dev:db`; this does not replace managed-database staging tests.
- Graceful shutdown, cross-room kick authorization, offline-kick cleanup and strict reconnect expiry have regression tests.
- `npm run check:deploy` reports the production settings still missing; no cloud resources or OAuth credentials have been provisioned.

## Remaining boundaries

- Live rooms and unsaved retry queues are single-process memory; a hard crash can lose an in-progress match or unconfirmed final result.
- The admin view is basic operational control, not a complete observability/analytics platform.
- Load-test bots exercise transport/server behavior; they do not establish real-user retention, internet latency or device performance.
- No actual Google, MongoDB cloud, payment, email, public host or alert provider was configured in the local setup.
- No public matchmaking, chat, ranked ladder, spectators joining beyond six room slots, or live room migration.

# Game rules · v1

## Match

2–6 players in a private room. All connected guests ready before the host starts. Solo training bypasses the two-player requirement and remains private. Three rounds in order: tiles, batteries, doors. Each round: 8 s vote → 1.2 s reveal → up to 45 s play → 4.5 s standings. Final scores persist and the host can rematch without a new invite. Each new match receives a fresh map seed.

The arena is 12 × 8 tiles, rendered inside a fixed 960 × 600 viewport. Players have radius 0.23 tile and speed 3.4 tiles/s. Diagonal speed is normalized. Players do not collide with or push one another. Colors and symbols identify room slots; every skin retains the same collider and assigned room color.

## Voting

Zone A: x 0.5–5.2, y 1–6.4. Zone B: x 6.8–11.5, y 1–6.4. Bounds are inclusive. Everything else abstains. The server counts eligible connected players' centers when the deadline closes. The side with more votes wins. Only voters on the losing side get one extra dash for that round. Ties, including 0–0, use a seeded random selection and grant no bonus. Abstention never grants a bonus.

## Dash

Normal dash: 1.5 tiles / 150 ms, four-second cooldown from activation. The next press during cooldown consumes the one bonus if available in play. No dash stacking and no extra movement speed outside the dash. During voting, normal dash is available; cooldowns reset at round start. In tiles, unsupported ground is ignored during the dash; landing on a fallen tile eliminates. Battery traps still apply. Server results correct any client prediction.

## Games

Solo training opens its first tile round with a one-tile gap and a marked landing spot. The gap is on the edge or near the middle according to the vote. The character faces the gap, so the player can try a stationary dash immediately. The landing cue appears only when the server observed the character over a fallen tile during the dash and then on solid ground.

**Tiles:** edge-first or center-first collapse. After a 3.5-second grace period, stepping on a tile starts a shared 1.65-second fuse. Leaving the tile does not stop the fuse. Dashing over a tile does not arm it. The natural collapse still runs from 3.5 to 43 seconds and takes precedence if earlier. Cracks mark the warning and deepen as the tile approaches collapse. Seeded variation within each layer changes exact tile ordering. Finish when the timer expires or at most one player remains (zero in training). Survivors share the highest surviving time.

**Batteries:** maximum three carried items. Rule A: 14 pickups including five double-value center batteries. Rule B: 24 ordinary pickups spread across the field. Pickups respawn after 4.5 seconds. The active loading bay starts at x 3 and switches between x 3 and x 9 every 12 seconds. Deposit within 1.5 tiles of its center at y above 6.5. The next bay lights up 2.5 seconds before the handover. Three traps run staggered 3.6-second cycles. An active cross lasts 1.2 seconds, an idle ring lasts 1.6 seconds, and a warning mark lasts 0.8 seconds. Crossing an active trap drops one carried battery, with a 1.2-second per-player retrigger cooldown. Rank by deposited value.

**Doors:** three stages, three visible symbol doors per stage. Enter at y below 1.6 within 0.7 tile of x 3, 6 or 9. Match the clue to the door symbol. Wrong door resets position; correct door advances a stage and resets position. Rule A shows each player's current-stage clue for three seconds after reaching that stage; wrong-door resets do not refresh the hint. Snapshots reveal only that viewer's available clue. Rule B keeps the current clue and rotates the three doors once, 1.4 seconds after that racer enters each stage. A wrong guess does not restart the swap. Each racer sees and is judged against the same personal door order. Finishers rank above unfinished players; then by completion time or number of cleared stages.

## Scoring and absence

Competition ranking: 1, 1, 3 for two tied leaders. Points by rank: 5 / 3 / 2 / 1 for all remaining ranks. Shared final score means shared victory. Joining during a match waits until the next match. A 20-second disconnect reservation does not protect a body from hazards or reset the timer. A player eliminated on tiles returns in the next round. A guest whose reservation expires cannot re-enter the current match. Fewer than two connected eligible participants after reservations expire cancels the match without inventing a winner.

Balancing values are initial defaults, not established playtest conclusions. Change shared config and version the protocol/round settings when changing competitive behavior.

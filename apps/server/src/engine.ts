import { randomInt, randomUUID } from 'node:crypto';
import {
  CONFIG,
  BATTERY_TRAPS,
  batteryDock,
  trapPhase,
  doorSymbols,
  GAMES,
  advancePosition,
  makePlayer,
  pointsForRank,
  rankings,
  resolveVote,
  seeded,
  type Room,
  type Player,
  type Skin,
} from '../../../packages/shared/src/index.js';

export function createRoom(
  code: string,
  hostId: string,
  name: string,
  skin: Skin,
  now: number,
  training = false,
): Room {
  return {
    code,
    hostId,
    phase: 'lobby',
    matchId: null,
    round: 0,
    endsAt: 0,
    phaseStartedAt: now,
    createdAt: now,
    updatedAt: now,
    seed: randomInt(1, 2147483647),
    training,
    game: 'tiles',
    players: [makePlayer(hostId, name, 0, skin, now)],
    vote: null,
    tiles: [],
    batteries: [],
    doors: [],
    history: [],
    saved: 'none',
  };
}
function stop(p: Player) {
  delete p.dashSteppedAt;
  p.crossedGap = false;
  p.input = { x: 0, y: 0, seq: p.lastSeq };
  p.dashUntil = 0;
}
export function restorePlayer(room: Room, player: Player, now: number) {
  if (
    player.disconnectedAt !== null &&
    now - player.disconnectedAt >= CONFIG.reconnectMs &&
    !['lobby', 'finished', 'cancelled'].includes(room.phase)
  ) {
    player.eligible = false;
    player.alive = false;
    player.eliminatedAt ??= now;
  }
  player.connected = true;
  player.disconnectedAt = null;
  player.inputAt = 0;
  player.lastSeq = -1;
  stop(player);
}
export function startMatch(room: Room, now: number): void {
  if (!['lobby', 'finished', 'cancelled'].includes(room.phase)) throw new Error('MATCH_ACTIVE');
  const connected = room.players.filter((p) => p.connected);
  if (connected.length < (room.training ? 1 : 2)) throw new Error('NEED_PLAYERS');
  if (!room.training && connected.some((p) => !p.ready)) throw new Error('NOT_READY');
  room.matchId = randomUUID();
  room.seed = randomInt(1, 2147483647);
  room.round = 0;
  room.history = [];
  room.saved = 'none';
  room.reason = undefined;
  for (const p of room.players) {
    p.score = 0;
    p.playing = p.connected;
    p.eligible = p.connected;
  }
  beginVote(room, now);
}
export function beginVote(room: Room, now: number) {
  room.phase = 'vote';
  delete room.practiceGapX;
  room.phaseStartedAt = now;
  room.endsAt = now + CONFIG.voteMs;
  room.game = GAMES[room.round];
  room.vote = null;
  room.tiles = [];
  room.batteries = [];
  room.doors = [];
  room.players.forEach((p, i) => {
    p.alive = p.playing && p.eligible;
    p.roundValue = 0;
    p.rank = 0;
    p.bonus = 0;
    p.dashReadyAt = 0;
    p.carried = [];
    p.doorStage = 0;
    p.doorStageAt = now;
    p.finishedAt = null;
    p.feedback = null;
    p.eliminatedAt = null;
    p.x = 6;
    p.y = 2 + i * 0.55;
    stop(p);
  });
}
export function closeVote(room: Room, now: number) {
  room.vote = resolveVote(
    room.players.filter((p) => p.playing && p.eligible && p.connected),
    seeded(room.seed + room.round),
  );
  for (const p of room.players) p.bonus = room.vote.minority.includes(p.id) ? 1 : 0;
  room.phase = 'reveal';
  room.phaseStartedAt = now;
  room.endsAt = now + CONFIG.revealMs;
  for (const p of room.players) stop(p);
}
export function beginRound(room: Room, now: number) {
  room.phase = 'playing';
  room.phaseStartedAt = now;
  room.endsAt = now + CONFIG.roundMs;
  room.players.forEach((p, i) => {
    p.doorStageAt = now;
    p.x = 3 + (i % 3) * 3;
    p.y = room.game === 'doors' ? 6.8 : 3 + Math.floor(i / 3) * 2;
    stop(p);
    p.dashReadyAt = 0;
  });
  const rng = seeded(room.seed + room.round * 71),
    rule = room.vote!.selected;
  if (room.game === 'tiles') {
    const tiles = Array.from({ length: 96 }, (_, i) => {
      const x = i % 12,
        y = Math.floor(i / 12);
      return {
        x,
        y,
        order:
          (rule === 0 ? Math.min(x, 11 - x, y, 7 - y) : Math.hypot(x - 5.5, y - 3.5)) + rng() * 0.3,
      };
    });
    tiles.sort((a, b) => a.order - b.order);
    room.tiles = tiles.map((t, i) => ({
      x: t.x,
      y: t.y,
      fallsAt: now + 3500 + Math.pow(i / 95, 0.85) * 39500,
    }));
    if (room.training && room.players.filter((p) => p.playing && p.eligible).length === 1) {
      const learner = room.players.find((p) => p.playing && p.eligible)!;
      const gapX = rule === 0 ? 1 : 5;
      room.practiceGapX = gapX;
      learner.x = gapX - 0.2;
      learner.y = 3.5;
      learner.faceX = 1;
      learner.faceY = 0;
      for (const tile of room.tiles.filter((t) => t.y === 3)) {
        if (tile.x === gapX) tile.fallsAt = now;
        if (tile.x === gapX - 1 || tile.x === gapX + 1)
          tile.fallsAt = Math.max(tile.fallsAt, now + 8000);
      }
    }
  }
  if (room.game === 'batteries') {
    room.batteries = Array.from({ length: rule === 0 ? 14 : 24 }, (_, id) => {
      const side = Math.floor(rng() * 3);
      return {
        id,
        x:
          rule === 1
            ? side === 0
              ? 0.6 + rng() * 2.3
              : side === 1
                ? 9.1 + rng() * 2.3
                : 0.6 + rng() * 10.8
            : id < 5
              ? 4 + rng() * 4
              : 0.6 + rng() * 10.8,
        y:
          rule === 1
            ? side === 2
              ? 0.6 + rng() * 1.5
              : 0.6 + rng() * 4.8
            : id < 5
              ? 1.5 + rng() * 3
              : 0.6 + rng() * 4.8,
        value: rule === 0 && id < 5 ? 2 : 1,
        active: true,
        respawnAt: 0,
      };
    });
  }
  if (room.game === 'doors')
    room.doors = Array.from({ length: 3 }, () => {
      const pool = [0, 1, 2, 3, 4, 5];
      const symbols = Array.from(
        { length: 3 },
        () => pool.splice(Math.floor(rng() * pool.length), 1)[0],
      );
      return {
        symbols,
        target: symbols[Math.floor(rng() * 3)],
      };
    });
}
export function dash(room: Room, p: Player, now: number) {
  if (
    !['vote', 'playing'].includes(room.phase) ||
    !p.alive ||
    !p.playing ||
    !p.eligible ||
    p.finishedAt !== null
  )
    throw new Error('CANNOT_DASH');
  if (now < p.dashUntil) throw new Error('DASH_ACTIVE');
  if (now >= p.dashReadyAt) p.dashReadyAt = now + CONFIG.dashCooldown;
  else if (room.phase === 'playing' && p.bonus > 0) p.bonus--;
  else throw new Error('DASH_COOLDOWN');
  const length = Math.hypot(p.faceX, p.faceY) || 1;
  p.dashX = p.faceX / length;
  p.dashY = p.faceY / length;
  p.dashUntil = now + CONFIG.dashMs;
  p.dashSteppedAt = now;
}
export function finishRound(room: Room, now: number) {
  const value = (p: Player) =>
    room.game === 'tiles'
      ? (p.eliminatedAt ?? room.endsAt) - room.phaseStartedAt
      : room.game === 'batteries'
        ? p.roundValue
        : p.doorStage * 100000 +
          (p.finishedAt !== null ? CONFIG.roundMs - (p.finishedAt - room.phaseStartedAt) : 0);
  const standing = rankings(
    room.players.filter((p) => p.playing),
    value,
  );
  const standings = standing.map(({ item: p, rank }) => {
    const points = pointsForRank(rank);
    p.rank = rank;
    p.score += points;
    stop(p);
    return { id: p.id, name: p.name, rank, points, value: Math.round(value(p)) };
  });
  room.history.push({ game: room.game, rule: room.vote!.selected, vote: room.vote!, standings });
  room.phase = 'roundResults';
  room.phaseStartedAt = now;
  room.endsAt = now + CONFIG.resultsMs;
}
export function step(room: Room, now: number, dt: number) {
  if (!['lobby', 'finished', 'cancelled'].includes(room.phase) && !room.training) {
    const connected = room.players.filter((p) => p.playing && p.connected && p.eligible);
    const recent = room.players.some(
      (p) =>
        p.playing &&
        !p.connected &&
        p.disconnectedAt !== null &&
        now - p.disconnectedAt < CONFIG.reconnectMs,
    );
    if (connected.length < 2 && !recent) {
      room.phase = 'cancelled';
      room.reason = 'NOT_ENOUGH_CONNECTED';
      room.endsAt = 0;
      return;
    }
  }
  for (const p of room.players) {
    if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= CONFIG.reconnectMs) {
      p.eligible = false;
      p.alive = false;
      if (p.eliminatedAt === null) p.eliminatedAt = now;
    }
  }
  if (!room.players.some((p) => p.id === room.hostId && p.connected)) {
    const old = room.players.find((p) => p.id === room.hostId);
    if (!old || old.disconnectedAt === null || now - old.disconnectedAt >= CONFIG.reconnectMs) {
      const next = room.players.find((p) => p.connected);
      if (next) room.hostId = next.id;
    }
  }
  if (room.phase === 'vote' && now >= room.endsAt) {
    closeVote(room, now);
    return;
  }
  if (room.phase === 'reveal' && now >= room.endsAt) {
    beginRound(room, now);
    return;
  }
  if (room.phase === 'roundResults' && now >= room.endsAt) {
    if (room.round === 2) {
      room.phase = 'finished';
      room.endsAt = 0;
      room.saved = 'pending';
    } else {
      room.round++;
      beginVote(room, now);
    }
    return;
  }
  if (room.phase !== 'vote' && room.phase !== 'playing') return;
  for (const p of room.players) {
    if (!p.alive || !p.eligible || !p.playing || p.finishedAt !== null) continue;
    const dashing = now < p.dashUntil;
    const dir = dashing
      ? { x: p.dashX, y: p.dashY }
      : p.connected && now - p.inputAt <= CONFIG.inputTtl
        ? p.input
        : { x: 0, y: 0 };
    if (!dashing && (dir.x || dir.y)) {
      p.faceX = dir.x;
      p.faceY = dir.y;
    }
    const end = Math.min(now, p.dashUntil);
    const dashElapsed = p.dashSteppedAt === undefined ? 0 : Math.max(0, end - p.dashSteppedAt);
    const next =
      p.dashSteppedAt !== undefined && p.dashUntil > 0
        ? advancePosition(p, { x: p.dashX, y: p.dashY }, dashElapsed / 1000, true)
        : advancePosition(p, dir, dt, dashing);
    if (dashElapsed && room.phase === 'playing' && room.game === 'tiles') {
      // A delayed tick can traverse the whole gap. Check the path at sub-tile intervals.
      const samples = Math.ceil(Math.hypot(next.x - p.x, next.y - p.y) * 5);
      for (let i = 1; i <= samples; i++) {
        const fraction = i / samples;
        const x = Math.floor(p.x + (next.x - p.x) * fraction),
          y = Math.floor(p.y + (next.y - p.y) * fraction);
        if (
          room.tiles.some(
            (t) => t.x === x && t.y === y && t.fallsAt <= end - dashElapsed * (1 - fraction),
          )
        )
          p.crossedGap = true;
      }
    }
    if (dashing && p.dashSteppedAt !== undefined) p.dashSteppedAt = end;
    else delete p.dashSteppedAt;
    p.x = next.x;
    p.y = next.y;
    if (room.phase !== 'playing') continue;
    if (room.game === 'tiles') {
      const tile = room.tiles.find((t) => t.x === Math.floor(p.x) && t.y === Math.floor(p.y));
      if (tile && !dashing && now - room.phaseStartedAt >= CONFIG.tileGraceMs) {
        tile.fallsAt = Math.min(tile.fallsAt, now + CONFIG.footprintFuseMs);
      }
      if (!dashing && tile && now >= tile.fallsAt) {
        p.alive = false;
        p.eliminatedAt = now;
        p.feedback = { kind: 'fellThrough', at: now, value: 0 };
        stop(p);
      } else if (dashing && tile && now >= tile.fallsAt) {
        p.crossedGap = true;
      } else if (!dashing && p.crossedGap) {
        if (tile && p.connected && p.dashUntil > 0)
          p.feedback = { kind: 'gapCleared', at: now, value: 0 };
        p.crossedGap = false;
      }
    }
    if (room.game === 'batteries') {
      for (const b of room.batteries) {
        if (!b.active && now >= b.respawnAt) b.active = true;
        if (
          b.active &&
          now >= (b.pickupAt ?? 0) &&
          p.carried.length < 3 &&
          Math.hypot(p.x - b.x, p.y - b.y) < 0.48
        ) {
          b.active = false;
          b.respawnAt = b.dropped ? Number.MAX_SAFE_INTEGER : now + 4500;
          p.carried.push(b.value);
        }
      }
      const dock = batteryDock(now - room.phaseStartedAt);
      if (p.y > 6.5 && Math.abs(p.x - dock.x) < 1.5 && p.carried.length) {
        const value = p.carried.reduce((a, b) => a + b, 0);
        p.roundValue += value;
        p.feedback = { kind: 'deposit', at: now, value };
        p.carried = [];
      }
      if (
        now > p.trapUntil &&
        BATTERY_TRAPS.some(
          (t) =>
            trapPhase(now - room.phaseStartedAt, t.offset) === 'active' &&
            Math.hypot(p.x - t.x, p.y - t.y) < 0.5,
        )
      ) {
        const value = p.carried.pop();
        if (value !== undefined) {
          p.feedback = { kind: 'lostBattery', at: now, value };
          room.batteries.push({
            id: Math.max(...room.batteries.map((b) => b.id), 0) + 1,
            x: Math.min(11.5, p.x + 0.8),
            y: Math.max(0.5, p.y - 0.8),
            value,
            active: true,
            respawnAt: 0,
            pickupAt: now + 600,
            dropped: true,
          });
        }
        p.trapUntil = now + 1200;
      }
    }
    if (room.game === 'doors') {
      const stage = room.doors[p.doorStage];
      if (p.y < 1.6) {
        const door = [3, 6, 9].findIndex((x) => Math.abs(p.x - x) < 0.7);
        if (door >= 0) {
          const swapped = room.vote!.selected === 1 && now - p.doorStageAt >= CONFIG.doorSwapMs;
          if (doorSymbols(stage, swapped)[door] === stage.target) {
            p.doorStage++;
            p.doorStageAt = now;
            if (p.doorStage === 3) p.finishedAt = now;
            p.feedback = { kind: 'correctDoor', at: now, value: p.doorStage };
          } else {
            p.feedback = { kind: 'wrongDoor', at: now, value: 0 };
          }
          p.x = 6;
          p.y = 6.8;
          stop(p);
        }
      }
    }
  }
  if (room.phase === 'playing') {
    const active = room.players.filter((p) => p.playing && p.eligible),
      alive = active.filter((p) => p.alive);
    if (
      now >= room.endsAt ||
      (room.game === 'tiles' && alive.length <= (room.training ? 0 : 1)) ||
      (room.game === 'doors' && active.every((p) => p.finishedAt !== null))
    )
      finishRound(room, now);
  }
}

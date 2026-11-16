import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  advancePosition,
  makePlayer,
  rankings,
  resolveVote,
  snapshot,
  voteZone,
} from '../packages/shared/src/index';
import {
  beginRound,
  closeVote,
  createRoom,
  dash,
  finishRound,
  restorePlayer,
  startMatch,
  step,
} from '../apps/server/src/engine';
const NOW = 1000000;
describe('reconnect eligibility', () => {
  it('enforces the reservation deadline even if the next simulation tick has not run', () => {
    const r = room();
    startMatch(r, NOW);
    const p = r.players[1];
    p.connected = false;
    p.disconnectedAt = NOW;
    p.input = { x: 1, y: 0, seq: 2 };
    restorePlayer(r, p, NOW + CONFIG.reconnectMs);
    expect(p.connected).toBe(true);
    expect(p.eligible).toBe(false);
    expect(p.alive).toBe(false);
    expect(p.input.x).toBe(0);
  });
  it('preserves an elimination during a short reconnect and permits participation next match', () => {
    const r = room();
    startMatch(r, NOW);
    const p = r.players[1];
    p.connected = false;
    p.disconnectedAt = NOW;
    p.alive = false;
    restorePlayer(r, p, NOW + 1000);
    expect(p.alive).toBe(false);
    expect(p.eligible).toBe(true);
    r.phase = 'finished';
    startMatch(r, NOW + 2000);
    expect(p.alive).toBe(true);
  });
});
function room() {
  const r = createRoom('ABC234', 'host', 'عمر', 'classic', NOW);
  r.players.push(makePlayer('guest', 'نور', 1, 'sprout', NOW));
  for (const p of r.players) p.ready = true;
  return r;
}
describe('authoritative voting', () => {
  it('counts positions and grants only losing voters a bonus', () => {
    const players = [
      { id: 'a', x: 2, y: 3 },
      { id: 'b', x: 3, y: 3 },
      { id: 'c', x: 9, y: 3 },
      { id: 'd', x: 6, y: 3 },
    ];
    expect(resolveVote(players, () => 0.9)).toEqual({
      counts: [2, 1],
      selected: 0,
      minority: ['c'],
      tied: false,
    });
  });
  it('ties and all-abstain votes grant nobody a bonus', () => {
    expect(
      resolveVote(
        [
          { id: 'a', x: 2, y: 2 },
          { id: 'b', x: 9, y: 2 },
        ],
        () => 0.9,
      ),
    ).toEqual({ counts: [1, 1], selected: 1, minority: [], tied: true });
    expect(resolveVote([{ id: 'a', x: 6, y: 4 }], () => 0.1).minority).toEqual([]);
  });
  it('uses disjoint boundaries and ignores off-zone players', () => {
    expect(voteZone({ x: 5.2, y: 3 })).toBe(0);
    expect(voteZone({ x: 5.21, y: 3 })).toBe(null);
    expect(voteZone({ x: 6.8, y: 3 })).toBe(1);
    expect(voteZone({ x: 2, y: 0.9 })).toBe(null);
  });
  it('locks once before play and snapshots hide server secrets', () => {
    const r = room();
    startMatch(r, NOW);
    r.players[0].x = 2;
    r.players[1].x = 9;
    step(r, r.endsAt, 1 / 30);
    expect(r.phase).toBe('reveal');
    const result = r.vote;
    step(r, r.endsAt - 1, 1 / 30);
    expect(r.vote).toBe(result);
    expect(snapshot(r, NOW)).not.toHaveProperty('seed');
  });
});
describe('movement and dash', () => {
  it('normalizes diagonal movement and respects arena bounds', () => {
    const straight = advancePosition({ x: 4, y: 4 }, { x: 1, y: 0 }, 0.1),
      diagonal = advancePosition({ x: 4, y: 4 }, { x: 1, y: 1 }, 0.1);
    expect(Math.hypot(diagonal.x - 4, diagonal.y - 4)).toBeCloseTo(straight.x - 4);
    expect(advancePosition({ x: 11.7, y: 0.3 }, { x: 1, y: -1 }, 1).x).toBe(12 - CONFIG.radius);
  });
  it('consumes normal dash before bonus and rejects repeated activation', () => {
    const r = room();
    startMatch(r, NOW);
    closeVote(r, NOW + 8000);
    beginRound(r, NOW + 9200);
    const p = r.players[0];
    p.bonus = 1;
    dash(r, p, NOW + 9300);
    expect(p.bonus).toBe(1);
    expect(() => dash(r, p, NOW + 9350)).toThrow('DASH_ACTIVE');
    dash(r, p, NOW + 9500);
    expect(p.bonus).toBe(0);
    expect(() => dash(r, p, NOW + 9700)).toThrow('DASH_COOLDOWN');
  });
  it('expires stale movement and does not replay it after a phase change', () => {
    const r = room();
    startMatch(r, NOW);
    const p = r.players[0];
    p.input = { x: 1, y: 0, seq: 1 };
    p.inputAt = NOW;
    const x = p.x;
    step(r, NOW + 300, 0.1);
    expect(p.x).toBe(x);
  });
  it('allows crossing a hole during dash but eliminates on an unsafe landing', () => {
    const r = room();
    startMatch(r, NOW);
    closeVote(r, NOW + 8000);
    beginRound(r, NOW + 9200);
    const p = r.players[0];
    r.tiles.forEach((t) => (t.fallsAt = 0));
    r.players.forEach((p) => (p.dashUntil = NOW + 9400));
    step(r, NOW + 9300, 0.01);
    expect(p.alive).toBe(true);
    step(r, NOW + 9500, 0.01);
    expect(p.alive).toBe(false);
    expect(p.feedback?.kind).toBe('fellThrough');
  });
  it.each([0, 1] as const)('teaches a confirmed landing for tile rule %s', (rule) => {
    const r = createRoom('TRAIN1', 'host', 'Learner', 'classic', NOW, true);
    startMatch(r, NOW);
    closeVote(r, NOW + 8000);
    r.vote!.selected = rule;
    const start = NOW + 9200;
    beginRound(r, start);
    const p = r.players[0];
    expect(r.practiceGapX).toBe(rule === 0 ? 1 : 5);
    dash(r, p, start);
    // Exercise a delayed server tick as well as a normal 30 Hz crossing.
    if (rule === 0) step(r, start + 185, 1 / 30);
    else for (let tick = 1; tick <= 6; tick++) step(r, start + (tick * 1000) / 30, 1 / 30);
    expect(p.x).toBeCloseTo(r.practiceGapX! - 0.2 + CONFIG.dashDistance);
    expect(p.alive).toBe(true);
    expect(p.feedback?.kind).toBe('gapCleared');
    expect(Math.floor(p.x)).toBe(r.practiceGapX! + 1);
  });
});
describe('rounds, scoring and reconnects', () => {
  it('uses competition ranks for ties', () => {
    expect(rankings([10, 10, 5, 3], (n) => n).map((x) => x.rank)).toEqual([1, 1, 3, 4]);
  });
  it('completes three games and resets rematch totals', () => {
    const r = room();
    startMatch(r, NOW);
    let time = NOW;
    for (let round = 0; round < 3; round++) {
      closeVote(r, time + 8000);
      beginRound(r, time + 9200);
      finishRound(r, time + 54000);
      step(r, r.endsAt, 1 / 30);
      time += 60000;
    }
    expect(r.phase).toBe('finished');
    expect(r.history.map((h) => h.game)).toEqual(['tiles', 'batteries', 'doors']);
    expect(r.players.every((p) => p.score === 15)).toBe(true);
    const oldId = r.matchId;
    startMatch(r, time);
    expect(r.matchId).not.toBe(oldId);
    expect(r.players[0].score).toBe(0);
    expect(r.history).toHaveLength(0);
  });
  it('keeps the match during grace, then cancels when fewer than two remain', () => {
    const r = room();
    startMatch(r, NOW);
    r.players[1].connected = false;
    r.players[1].disconnectedAt = NOW;
    step(r, NOW + 1000, 0.01);
    expect(r.phase).toBe('vote');
    step(r, NOW + CONFIG.reconnectMs + 1, 0.01);
    expect(r.phase).toBe('cancelled');
  });
  it('transfers host after grace', () => {
    const r = room();
    r.players[0].connected = false;
    r.players[0].disconnectedAt = NOW;
    step(r, NOW + CONFIG.reconnectMs + 1, 0.01);
    expect(r.hostId).toBe('guest');
  });
  it('picks up at most three batteries and deposits their actual value', () => {
    const r = room();
    startMatch(r, NOW);
    r.round = 1;
    r.game = 'batteries';
    closeVote(r, NOW + 8000);
    beginRound(r, NOW + 9200);
    const p = r.players[0];
    p.x = 6;
    p.y = 3.5;
    r.batteries = Array.from({ length: 5 }, (_, id) => ({
      id,
      x: 6,
      y: 3.5,
      value: 2,
      active: true,
      respawnAt: 0,
    }));
    step(r, NOW + 9300, 0.01);
    expect(p.carried).toEqual([2, 2, 2]);
    p.x = 3;
    p.y = 7;
    step(r, NOW + 9400, 0.01);
    expect(p.roundValue).toBe(6);
    expect(p.feedback).toMatchObject({ kind: 'deposit', value: 6 });
    expect(p.carried).toEqual([]);
  });
  it('wrong doors reset position; correct doors advance and finish three stages', () => {
    const r = room();
    startMatch(r, NOW);
    r.round = 2;
    r.game = 'doors';
    closeVote(r, NOW + 8000);
    beginRound(r, NOW + 9200);
    r.doors.forEach((d) => {
      d.symbols = [0, 1, 2];
      d.target = 1;
    });
    const p = r.players[0];
    p.x = 3;
    p.y = 1;
    step(r, NOW + 9300, 0.01);
    expect(p.doorStage).toBe(0);
    expect(p.y).toBe(6.8);
    expect(p.feedback?.kind).toBe('wrongDoor');
    for (let i = 0; i < 3; i++) {
      p.x = 6;
      p.y = 1;
      step(r, NOW + 9400 + i * 100, 0.01);
    }
    expect(p.doorStage).toBe(3);
    expect(p.finishedAt).not.toBeNull();
  });
  it('switches the live deposit bay at the same deadline for every carrier', () => {
    const r = room();
    startMatch(r, NOW);
    closeVote(r, NOW);
    r.game = 'batteries';
    beginRound(r, NOW);
    r.batteries = [];
    const p = r.players[0];
    Object.assign(p, { x: 9, y: 7, carried: [2, 1] });
    step(r, NOW + 11999, 0);
    expect(p.roundValue).toBe(0);
    step(r, NOW + 12000, 0);
    expect(p.roundValue).toBe(3);
    p.x = 3;
    p.carried = [1];
    step(r, NOW + 12500, 0);
    expect(p.carried).toEqual([1]);
  });
  it('starts a shared irreversible fuse underfoot after the opening grace period', () => {
    const r = room();
    startMatch(r, NOW);
    closeVote(r, NOW);
    beginRound(r, NOW);
    r.tiles.forEach((t) => (t.fallsAt = NOW + 40000));
    const p = r.players[0];
    const tile = r.tiles.find((t) => t.x === p.x && t.y === p.y)!;
    const armed = NOW + CONFIG.tileGraceMs;
    step(r, armed - 1, 0);
    expect(tile.fallsAt).toBe(NOW + 40000);
    step(r, armed, 0);
    expect(tile.fallsAt).toBe(armed + CONFIG.footprintFuseMs);
    p.x += 1;
    step(r, armed + 400, 0);
    expect(tile.fallsAt).toBe(armed + CONFIG.footprintFuseMs);
    p.x = tile.x + 0.5;
    step(r, tile.fallsAt, 0);
    expect(p.alive).toBe(false);
  });
  it('lets a carrier cross an inactive or warning trap and drops cargo on activation', () => {
    const r = room();
    startMatch(r, NOW);
    closeVote(r, NOW);
    r.game = 'batteries';
    beginRound(r, NOW);
    r.batteries = [];
    const p = r.players[0];
    Object.assign(p, { x: 3, y: 4.5, carried: [2] });
    for (const offset of [1300, 2900]) {
      step(r, NOW + offset, 0);
      expect(p.carried).toEqual([2]);
    }
    step(r, NOW + 3600, 0);
    expect(p.feedback?.kind).toBe('lostBattery');
    expect(p.carried).toEqual([]);
  });
  it('judges the door order shown to each racer from their own stage start', () => {
    const r = room();
    startMatch(r, NOW);
    closeVote(r, NOW);
    r.game = 'doors';
    r.vote!.selected = 1;
    beginRound(r, NOW);
    const at = NOW + CONFIG.doorSwapMs;
    r.players.forEach((p, i) =>
      Object.assign(p, {
        doorStage: 1,
        doorStageAt: i === 0 ? NOW : at,
        x: i === 0 ? 6 : 3,
        y: 1,
      }),
    );
    Object.assign(r.doors[1], { symbols: [0, 1, 2], target: 0 });
    expect(snapshot(r, at, r.players[0].id).doors[1].symbols).toEqual([2, 0, 1]);
    expect(snapshot(r, at, r.players[1].id).doors[1].symbols).toEqual([0, 1, 2]);
    step(r, at, 0);
    expect(r.players.map((p) => p.doorStage)).toEqual([2, 2]);
  });
  it('drops a real battery on traps with a short pickup delay', () => {
    const r = room();
    startMatch(r, NOW);
    r.game = 'batteries';
    closeVote(r, NOW + 8000);
    beginRound(r, NOW + 9200);
    const p = r.players[0];
    p.x = 3;
    p.y = 4.5;
    p.carried = [2];
    r.batteries = [];
    step(r, NOW + 9300, 0.01);
    expect(p.carried).toEqual([]);
    expect(r.batteries).toHaveLength(1);
    expect(r.batteries[0]).toMatchObject({
      value: 2,
      dropped: true,
      active: true,
      pickupAt: NOW + 9900,
    });
    p.x = r.batteries[0].x;
    p.y = r.batteries[0].y;
    step(r, NOW + 9400, 0.01);
    expect(p.carried).toEqual([]);
    step(r, NOW + 10000, 0.01);
    expect(p.carried).toEqual([2]);
  });
  it('does not expose the clue after the disappearing-clue deadline', () => {
    const r = room();
    startMatch(r, NOW);
    r.game = 'doors';
    closeVote(r, NOW + 8000);
    r.vote!.selected = 0;
    beginRound(r, NOW + 9200);
    expect(snapshot(r, NOW + 9300).doors[0].clue).not.toBeNull();
    expect(snapshot(r, NOW + 13000).doors[0].clue).toBeNull();
    expect(snapshot(r, NOW + 13000).doors[0]).not.toHaveProperty('target');
  });
  it('gives later stages their own hint window without exposing another player’s clue', () => {
    const r = room();
    startMatch(r, NOW);
    r.game = 'doors';
    closeVote(r, NOW + 8000);
    r.vote!.selected = 0;
    beginRound(r, NOW + 9200);
    const guest = r.players[1];
    guest.doorStage = 1;
    guest.doorStageAt = NOW + 14000;
    expect(snapshot(r, NOW + 14100, 'host').doors[1].clue).toBeNull();
    expect(snapshot(r, NOW + 14100, 'guest').doors[1].clue).not.toBeNull();
    expect(snapshot(r, NOW + 17101, 'guest').doors[1].clue).toBeNull();
  });
});

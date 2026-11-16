import { z } from 'zod';

export const PROTOCOL = 1;
export const CONFIG = {
  cols: 12,
  rows: 8,
  speed: 3.4,
  radius: 0.23,
  dashDistance: 1.5,
  dashMs: 150,
  dashCooldown: 4000,
  voteMs: 8000,
  revealMs: 1200,
  roundMs: 45000,
  resultsMs: 4500,
  reconnectMs: 20000,
  inputTtl: 250,
  tickRate: 30,
  snapshotRate: 15,
  maxPlayers: 6,
  tileGraceMs: 3500,
  footprintFuseMs: 1650,
  tileWarningMs: 1650,
  doorSwapMs: 1400,
} as const;
export const COLORS = ['#b9ff66', '#ab9dff', '#ff9776', '#77ddff', '#ffce62', '#f599d8'];
export const SYMBOLS = ['●', '◆', '▲', '★', '✚', '☾'];
export const SKINS = ['classic', 'sprout', 'crown', 'headphones', 'ninja'] as const;
export type Skin = (typeof SKINS)[number];
export type GameKind = 'tiles' | 'batteries' | 'doors';
export const GAMES: GameKind[] = ['tiles', 'batteries', 'doors'];
export type Phase =
  'lobby' | 'vote' | 'reveal' | 'playing' | 'roundResults' | 'finished' | 'cancelled';
export type Point = { x: number; y: number };
export type Input = Point & { seq: number };
export type Player = Point & {
  id: string;
  name: string;
  color: number;
  skin: Skin;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  eligible: boolean;
  playing: boolean;
  alive: boolean;
  score: number;
  roundValue: number;
  rank: number;
  bonus: number;
  dashUntil: number;
  crossedGap: boolean;
  dashSteppedAt?: number;
  dashReadyAt: number;
  dashX: number;
  dashY: number;
  faceX: number;
  faceY: number;
  input: Input;
  inputAt: number;
  lastSeq: number;
  eliminatedAt: number | null;
  carried: number[];
  doorStage: number;
  doorStageAt: number;
  finishedAt: number | null;
  trapUntil: number;
  feedback: {
    kind: 'deposit' | 'lostBattery' | 'wrongDoor' | 'correctDoor' | 'gapCleared' | 'fellThrough';
    at: number;
    value: number;
  } | null;
  emoji: string | null;
  emojiUntil: number;
};
export type Tile = { x: number; y: number; fallsAt: number };
export type Battery = Point & {
  id: number;
  value: number;
  active: boolean;
  respawnAt: number;
  pickupAt?: number;
  dropped?: boolean;
};
export type DoorStage = { symbols: number[]; target: number };
// Both the referee and the arena clock use the same two loading bays.
export function batteryDock(elapsed: number) {
  const clock = Math.max(0, elapsed);
  const left = Math.floor(clock / 12000) % 2 === 0;
  return { x: left ? 3 : 9, nextX: left ? 9 : 3, remainingMs: 12000 - (clock % 12000) };
}
export function doorSymbols(stage: DoorStage, swapped: boolean) {
  const [left, middle, right] = stage.symbols;
  return swapped ? [right, left, middle] : stage.symbols;
}
export const BATTERY_TRAPS = [
  { x: 3, y: 4.5, offset: 0 },
  { x: 9, y: 4.5, offset: 1800 },
  { x: 6, y: 2.5, offset: 900 },
] as const;
export function trapPhase(elapsed: number, offset: number) {
  const cycle = (Math.max(0, elapsed) + offset) % 3600;
  return cycle < 1200 ? 'active' : cycle < 2800 ? 'safe' : 'warning';
}
export type VoteResult = {
  counts: [number, number];
  selected: 0 | 1;
  minority: string[];
  tied: boolean;
};
export type RoundRecord = {
  game: GameKind;
  rule: 0 | 1;
  vote: VoteResult;
  standings: { id: string; name: string; rank: number; points: number; value: number }[];
};
export type Room = {
  code: string;
  hostId: string;
  phase: Phase;
  matchId: string | null;
  round: number;
  endsAt: number;
  phaseStartedAt: number;
  createdAt: number;
  updatedAt: number;
  seed: number;
  training: boolean;
  practiceGapX?: number;
  game: GameKind;
  players: Player[];
  vote: VoteResult | null;
  tiles: Tile[];
  batteries: Battery[];
  doors: DoorStage[];
  history: RoundRecord[];
  saved: 'none' | 'pending' | 'saved' | 'local';
  reason?: string;
};
export type PublicPlayer = Omit<
  Player,
  'input' | 'inputAt' | 'disconnectedAt' | 'joinedAt' | 'crossedGap' | 'dashSteppedAt'
>;
export type Snapshot = Omit<Room, 'seed' | 'doors' | 'players' | 'createdAt' | 'updatedAt'> & {
  protocol: number;
  serverTime: number;
  players: PublicPlayer[];
  doors: { symbols: number[]; clue: number | null }[];
};
export type Ack = { ok: boolean; error?: string; code?: string };
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(18)
  .regex(/^[\p{L}\p{N} _.-]+$/u);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create'),
    id: z.string().uuid(),
    name: nameSchema,
    skin: z.enum(SKINS),
    training: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('join'),
    id: z.string().uuid(),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
    name: nameSchema,
    skin: z.enum(SKINS),
  }),
  z.object({ type: z.literal('ready'), id: z.string().uuid(), ready: z.boolean() }),
  z.object({ type: z.literal('appearance'), id: z.string().uuid(), skin: z.enum(SKINS) }),
  z.object({ type: z.literal('start'), id: z.string().uuid() }),
  z.object({
    type: z.literal('dash'),
    id: z.string().uuid(),
    matchId: z.string().uuid(),
    round: z.number().int().min(0).max(2),
    phase: z.enum(['vote', 'playing']),
  }),
  z.object({ type: z.literal('rematch'), id: z.string().uuid() }),
  z.object({ type: z.literal('leave'), id: z.string().uuid() }),
  z.object({
    type: z.literal('emoji'),
    id: z.string().uuid(),
    emoji: z.enum(['🔥', '😂', '💚', '👀', '😎', '💀']),
  }),
  z.object({ type: z.literal('kick'), id: z.string().uuid(), playerId: z.string().uuid() }),
]);
export type Command = z.infer<typeof commandSchema>;
export const inputSchema = z.object({
  x: z.number().finite().min(-1).max(1),
  y: z.number().finite().min(-1).max(1),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  matchId: z.string().nullable(),
  round: z.number().int().min(0).max(2),
});
export type ServerEvents = {
  snapshot: (state: Snapshot) => void;
  notice: (notice: { message: string }) => void;
};
export type ClientEvents = {
  command: (command: Command, ack: (result: Ack) => void) => void;
  input: (input: z.infer<typeof inputSchema>) => void;
};

export function voteZone(p: Point): 0 | 1 | null {
  if (p.y < 1 || p.y > 6.4) return null;
  if (p.x >= 0.5 && p.x <= 5.2) return 0;
  if (p.x >= 6.8 && p.x <= 11.5) return 1;
  return null;
}
export function normalize(x: number, y: number): Point {
  const n = Math.hypot(x, y);
  return n > 1 ? { x: x / n, y: y / n } : { x, y };
}
export function advancePosition(p: Point, dir: Point, dt: number, dash = false): Point {
  const n = normalize(dir.x, dir.y),
    speed = dash ? CONFIG.dashDistance / (CONFIG.dashMs / 1000) : CONFIG.speed;
  return {
    x: Math.max(CONFIG.radius, Math.min(CONFIG.cols - CONFIG.radius, p.x + n.x * speed * dt)),
    y: Math.max(CONFIG.radius, Math.min(CONFIG.rows - CONFIG.radius, p.y + n.y * speed * dt)),
  };
}
export function resolveVote(
  players: Pick<Player, 'id' | 'x' | 'y'>[],
  random: () => number,
): VoteResult {
  const counts: [number, number] = [0, 0];
  for (const p of players) {
    const z = voteZone(p);
    if (z !== null) counts[z]++;
  }
  const tied = counts[0] === counts[1],
    selected: 0 | 1 = tied ? (random() < 0.5 ? 0 : 1) : counts[0] > counts[1] ? 0 : 1;
  return {
    counts,
    selected,
    tied,
    minority: tied
      ? []
      : players.filter((p) => voteZone(p) !== null && voteZone(p) !== selected).map((p) => p.id),
  };
}
export function seeded(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pointsForRank(rank: number) {
  return rank === 1 ? 5 : rank === 2 ? 3 : rank === 3 ? 2 : 1;
}
export function rankings<T>(items: T[], value: (p: T) => number): { item: T; rank: number }[] {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  return sorted.map((item, i) => ({
    item,
    rank: i === 0 ? 1 : sorted.findIndex((p) => value(p) === value(item)) + 1,
  }));
}
export function makePlayer(
  id: string,
  name: string,
  color: number,
  skin: Skin,
  now: number,
): Player {
  return {
    id,
    name,
    color,
    skin,
    x: 6,
    y: 3 + color * 0.24,
    ready: false,
    connected: true,
    joinedAt: now,
    disconnectedAt: null,
    eligible: true,
    playing: false,
    alive: true,
    score: 0,
    roundValue: 0,
    rank: 0,
    bonus: 0,
    dashUntil: 0,
    crossedGap: false,
    dashReadyAt: 0,
    dashX: 0,
    dashY: 1,
    faceX: 0,
    faceY: 1,
    input: { x: 0, y: 0, seq: 0 },
    inputAt: 0,
    lastSeq: -1,
    eliminatedAt: null,
    carried: [],
    doorStage: 0,
    doorStageAt: now,
    finishedAt: null,
    trapUntil: 0,
    feedback: null,
    emoji: null,
    emojiUntil: 0,
  };
}
export function snapshot(room: Room, now: number, viewerId = room.hostId): Snapshot {
  const { seed, createdAt, updatedAt, players, doors, ...state } = room;
  const viewer = players.find((p) => p.id === viewerId);
  return {
    ...state,
    protocol: PROTOCOL,
    serverTime: now,
    players: players.map(
      ({ input, inputAt, disconnectedAt, joinedAt, crossedGap, dashSteppedAt, ...p }) => p,
    ),
    doors: doors.map((d, index) => ({
      symbols: doorSymbols(
        d,
        room.vote?.selected === 1 &&
          index === viewer?.doorStage &&
          now - viewer.doorStageAt >= CONFIG.doorSwapMs,
      ),
      clue:
        room.phase === 'playing' &&
        (index !== viewer?.doorStage ||
          (room.vote?.selected === 0 && now - viewer.doorStageAt > 3000))
          ? null
          : d.target,
    })),
  };
}

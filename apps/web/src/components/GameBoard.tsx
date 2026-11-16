'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BATTERY_TRAPS,
  batteryDock,
  COLORS,
  CONFIG,
  SYMBOLS,
  advancePosition,
  normalize,
  trapPhase,
  voteZone,
  type Snapshot,
} from '@chaos/shared';
import type { GameSocket } from '../lib/client';
import { arenaPalette, paintArena } from './arenaScenery';
import { words, type Lang } from '../lib/i18n';
import { Zap, MoveUpRight } from 'lucide-react';
export type Settings = { sound: boolean; music: boolean; motion: boolean; mute: boolean };
type Props = {
  state: Snapshot;
  playerId: string;
  socket: GameSocket | null;
  lang: Lang;
  settings: Settings;
  onDash: () => Promise<boolean>;
};
const X = 96,
  Y = 44,
  T = 64;
let audio: AudioContext | undefined;
export function tone(freq = 440, duration = 0.12, volume = 0.04, delay = 0) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.type = 'sine';
    const start = audio.currentTime + delay;
    oscillator.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch {
    /* Audio is optional. */
  }
}
export default function GameBoard(props: Props) {
  const mount = useRef<HTMLDivElement>(null),
    localLabel = useRef<HTMLSpanElement>(null),
    current = useRef(props),
    control = useRef({ x: 0, y: 0 }),
    dashSignal = useRef(0),
    stickPointer = useRef<number | null>(null),
    [stick, setStick] = useState({ x: 0, y: 0 }),
    [ready, setReady] = useState(false);
  current.current = props;
  const t = words[props.lang],
    me = props.state.players.find((p) => p.id === props.playerId);
  async function triggerDash() {
    const p = current.current,
      me = p.state.players.find((x) => x.id === p.playerId);
    if (!p.socket?.connected || !me || !me.alive || !['vote', 'playing'].includes(p.state.phase))
      return;
    if (p.state.serverTime < me.dashReadyAt && me.bonus === 0) return;
    dashSignal.current++;
    if (p.settings.sound) tone(720, 0.14);
    await p.onDash();
  }
  const dashAction = useRef(triggerDash);
  dashAction.current = triggerDash;
  useEffect(() => {
    let disposed = false,
      game: import('phaser').Game | undefined;
    const keys = new Set<string>();
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const keydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      keys.add(e.code);
      if (e.code === 'Space' && !e.repeat) void dashAction.current();
    };
    const keyup = (e: KeyboardEvent) => keys.delete(e.code),
      blur = () => {
        keys.clear();
        stickPointer.current = null;
        control.current = { x: 0, y: 0 };
        setStick({ x: 0, y: 0 });
      };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);
    import('phaser').then(({ default: Phaser }) => {
      if (disposed || !mount.current) return;
      class Arena extends Phaser.Scene {
        graphics!: import('phaser').GameObjects.Graphics;
        scenery!: import('phaser').GameObjects.Image;
        labels: import('phaser').GameObjects.Text[] = [];
        seq = 0;
        lastSend = 0;
        seen = 0;
        phase = '';
        dashSeen = 0;
        localDash = 0;
        lastWarning = 0;
        dashDirection = { x: 0, y: 1 };
        predicted = { x: 6, y: 4 };
        pending: { seq: number; x: number; y: number; at: number }[] = [];
        positions = new Map<string, { x: number; y: number }>();
        create() {
          for (const kind of ['tiles', 'batteries', 'doors'] as const) {
            const texture = this.textures.createCanvas('arena-' + kind, 960, 600);
            if (!texture) continue;
            paintArena(texture.context, kind);
            texture.refresh();
          }
          this.scenery = this.add.image(0, 0, 'arena-tiles').setOrigin(0);
          this.graphics = this.add.graphics();
          for (let i = 0; i < 3; i++)
            this.labels.push(
              this.add
                .text(X + (3 + i * 3) * T, Y + T * 1.1, '', {
                  fontFamily: 'Arial',
                  fontSize: '38px',
                  color: '#e8eeef',
                })
                .setOrigin(0.5),
            );
          setReady(true);
        }
        update(time: number, delta: number) {
          const { state, playerId, socket, settings } = current.current,
            p = state.players.find((p) => p.id === playerId);
          if (!p) return;
          const reduceMotion = settings.motion || motionPreference.matches;
          const dt = Math.min(delta / 1000, 0.05);
          const serverNow =
            state.serverTime +
            (this.seen === state.serverTime ? Math.min(Date.now() - this.receivedAt, 500) : 0);
          if (this.seen !== state.serverTime) {
            this.receivedAt = Date.now();
            this.seen = state.serverTime;
            const phase = `${state.matchId}:${state.round}:${state.phase}`;
            if (phase !== this.phase) {
              this.phase = phase;
              this.pending = [];
              this.localDash = 0;
              this.positions.clear();
            }
            this.pending = this.pending.filter((input) => input.seq > p.lastSeq);
            let reconciled = { x: p.x, y: p.y };
            for (const input of this.pending)
              reconciled = advancePosition(reconciled, input, 0.05, serverNow < p.dashUntil);
            this.predicted = reconciled;
          }
          const active =
            (state.phase === 'vote' || state.phase === 'playing') &&
            p.alive &&
            p.playing &&
            p.eligible &&
            p.finishedAt === null &&
            !!socket?.connected;
          const dir = active
            ? normalize(
                control.current.x +
                  (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
                  (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
                control.current.y +
                  (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
                  (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
              )
            : { x: 0, y: 0 };
          if (this.dashSeen !== dashSignal.current) {
            this.dashSeen = dashSignal.current;
            this.localDash = serverNow + CONFIG.dashMs;
            this.dashDirection = dir.x || dir.y ? dir : normalize(p.faceX, p.faceY);
          }
          const dashing = serverNow < Math.max(p.dashUntil, this.localDash);
          if (active) {
            const move = dashing
              ? serverNow < this.localDash
                ? this.dashDirection
                : { x: p.dashX, y: p.dashY }
              : dir;
            this.predicted = advancePosition(this.predicted, move, dt, dashing);
          }
          if (time - this.lastSend >= 50 && socket?.connected) {
            this.lastSend = time;
            const input = { ...dir, seq: ++this.seq, matchId: state.matchId, round: state.round };
            socket.volatile.emit('input', input);
            if (active) {
              this.pending.push({ ...dir, seq: this.seq, at: time });
              if (this.pending.length > 30) this.pending.shift();
            }
          }
          const g = this.graphics;
          const phaseAge = Math.max(0, serverNow - state.phaseStartedAt);
          g.clear();
          const backdrop = 'arena-' + state.game;
          if (this.scenery.texture.key !== backdrop) this.scenery.setTexture(backdrop);
          const showTiles =
            state.game === 'tiles' || state.phase === 'vote' || state.phase === 'reveal';
          for (let y = 0; showTiles && y < 8; y++)
            for (let x = 0; x < 12; x++) {
              const tile = state.tiles.find((t) => t.x === x && t.y === y),
                fallen =
                  state.game === 'tiles' &&
                  state.phase !== 'vote' &&
                  state.phase !== 'reveal' &&
                  tile &&
                  serverNow >= tile.fallsAt;
              if (fallen) {
                const age = serverNow - tile.fallsAt;
                if (!reduceMotion && age < 320) {
                  const progress = age / 320;
                  const cx = X + (x + 0.5) * T, cy = Y + (y + 0.5) * T;
                  g.fillStyle(0xdbb5bb, (1-progress)*0.75);
                  for (const side of [-1,1]) {
                    const fx=cx+side*(12+progress*12), fy=cy+progress*19;
                    g.fillTriangle(fx-5,fy-3,fx+6,fy-3,fx+side,fy+6);
                  }
                }
                continue;
              }
              const warning =
                tile &&
                serverNow >= tile.fallsAt - CONFIG.tileWarningMs &&
                state.phase === 'playing';
              let color = arenaPalette[state.game].floor[(x + y) % 2];
              if (state.phase === 'vote' || state.phase === 'reveal') {
                color = x <= 4 ? 0x558269 : x >= 7 ? 0x786798 : 0x494959;
              }
              if (state.phase === 'reveal' && state.vote) {
                const fromWinner = state.vote.selected === 0 ? x : 11 - x;
                if (reduceMotion || phaseAge >= fromWinner * 50) {
                  color = state.vote.selected === 0 ? 0x577641 : 0x5d507b;
                  if (!reduceMotion && phaseAge - fromWinner * 50 < 130)
                    color = state.vote.selected === 0 ? 0x92ad64 : 0x9a86b9;
                }
              }
              if (warning) color = tile.fallsAt - serverNow < 550 ? 0xc76d50 : 0xe2ac65;
              g.fillStyle(0x2c253d);
              g.fillRoundedRect(X + x * T + 2, Y + y * T + 5, 60, 59, 8);
              g.fillStyle(color);
              g.fillRoundedRect(X + x * T + 2, Y + y * T + 1, 60, 58, 8);
              g.fillStyle(0xffffff, 0.14);
              g.fillRoundedRect(X + x * T + 6, Y + y * T + 3, 52, 4, 2);
              g.lineStyle(1.5, 0xffffff, warning ? 0.45 : 0.25);
              g.strokeRoundedRect(X + x * T + 2, Y + y * T + 1, 60, 58, 8);
              if (!warning && state.phase === 'playing' && (x+2*y)%4===0) {
                const edgeX=X+x*T+8, edgeY=Y+y*T+8;
                g.lineStyle(2,0xf0d8ff,0.36);
                g.lineBetween(edgeX,edgeY+7,edgeX+7,edgeY);
                g.lineBetween(edgeX+7,edgeY,edgeX+19,edgeY);
              }
              if (
                state.phase === 'playing' &&
                state.game === 'tiles' &&
                state.vote &&
                phaseAge < 1800 &&
                tile &&
                tile.fallsAt < state.phaseStartedAt + 8000
              ) {
                // Outline the actual opening hazards for this seed as control returns.
                g.lineStyle(3, 0xffcb83, reduceMotion ? 0.7 : 0.8 * (1 - phaseAge / 1800));
                g.strokeRoundedRect(X + x * T + 5, Y + y * T + 4, 54, 52, 7);
              }
              if (warning) {
                const left = X + x * T,
                  top = Y + y * T;
                g.lineStyle(3, 0x663e34);
                g.lineBetween(left + 15, top + 3, left + 33, top + 22);
                g.lineBetween(left + 33, top + 22, left + 23, top + 32);
                if (tile.fallsAt - serverNow < 1000) {
                  g.lineBetween(left + 23, top + 32, left + 44, top + 56);
                  g.lineBetween(left + 23, top + 32, left + 5, top + 37);
                }
              }
              if (warning && settings.sound && serverNow - this.lastWarning > 800) {
                this.lastWarning = serverNow;
                tone(200, 0.08, 0.015);
              }
            }
          if (state.phase === 'vote' || state.phase === 'reveal') {
            const myZone = state.phase === 'vote' && active ? voteZone(this.predicted) : null;
            if (myZone === 0) {
              g.fillStyle(0xb9ff66, 0.1);
              g.fillRoundedRect(X + 0.5 * T, Y + T, 4.7 * T, 5.4 * T, 15);
            } else if (myZone === 1) {
              g.fillStyle(0xab9dff, 0.12);
              g.fillRoundedRect(X + 6.8 * T, Y + T, 4.7 * T, 5.4 * T, 15);
            }
            g.lineStyle(myZone === 0 ? 3 : 2, 0xb9ff66, myZone === 0 ? 0.95 : 0.55);
            g.strokeRoundedRect(X + 0.5 * T, Y + T, 4.7 * T, 5.4 * T, 15);
            g.lineStyle(myZone === 1 ? 3 : 2, 0xab9dff, myZone === 1 ? 0.95 : 0.55);
            g.strokeRoundedRect(X + 6.8 * T, Y + T, 4.7 * T, 5.4 * T, 15);
          }
          this.labels.forEach((l) => l.setVisible(false));
          if (
            state.practiceGapX !== undefined &&
            state.phase === 'playing' &&
            phaseAge < 5000 &&
            p.alive
          ) {
            const gapX = state.practiceGapX;
            if (p.x < gapX && Math.abs(p.y - 3.5) < 0.6) {
              const cx = X + (gapX + 1.5) * T,
                cy = Y + 3.5 * T;
              g.lineStyle(3, 0xd4ff99);
              g.strokeEllipse(cx, cy, 39, 18);
              g.fillStyle(0xd4ff99);
              g.fillTriangle(cx - 76, cy - 8, cx - 76, cy + 8, cx - 65, cy);
            }
          }
          if (state.phase === 'playing' && state.game === 'batteries') {
            const dock = batteryDock(phaseAge);
            const dockLeft = X + (dock.x - 1.5) * T;
            const hasLoad = p.carried.length > 0;
            if (hasLoad) {
              g.fillStyle(0xb9ff66, 0.14);
              g.fillRoundedRect(dockLeft - 5, Y + 6.5 * T - 5, 3 * T + 10, 1.2 * T + 10, 16);
            }
            g.fillStyle(0xb9ff66, hasLoad ? 0.36 : 0.25);
            g.fillRoundedRect(dockLeft, Y + 6.5 * T, 3 * T, 1.2 * T, 12);
            g.lineStyle(hasLoad ? 3 : 2, 0xb9ff66);
            g.strokeRoundedRect(dockLeft, Y + 6.5 * T, 3 * T, 1.2 * T, 12);
            g.fillStyle(0xc3ef87);
            g.fillRoundedRect(
              dockLeft + 8,
              Y + 6.5 * T + 6,
              ((3 * T - 16) * dock.remainingMs) / 12000,
              4,
              2,
            );
            if (dock.remainingMs <= 2500) {
              g.lineStyle(2, 0xffd894);
              g.strokeRoundedRect(X + (dock.nextX - 1.5) * T, Y + 6.5 * T, 3 * T, 1.2 * T, 12);
            }
            for (const trap of BATTERY_TRAPS) {
              const phase = trapPhase(serverNow - state.phaseStartedAt, trap.offset);
              const tint =
                phase === 'active' ? 0xff8c70 : phase === 'warning' ? 0xffce62 : 0x789386;
              g.fillStyle(tint, phase === 'active' ? 0.32 : 0.1);
              g.fillCircle(X + trap.x * T, Y + trap.y * T, 27);
              g.lineStyle(2, tint);
              g.strokeCircle(X + trap.x * T, Y + trap.y * T, 27);
              if (phase === 'safe') continue;
              if (phase === 'warning') {
                g.fillStyle(tint);
                g.fillRect(X + trap.x * T - 2, Y + trap.y * T - 12, 4, 14);
                g.fillCircle(X + trap.x * T, Y + trap.y * T + 8, 3);
                continue;
              }
              g.lineStyle(4, tint);
              g.lineBetween(
                X + trap.x * T - 12,
                Y + trap.y * T - 12,
                X + trap.x * T + 12,
                Y + trap.y * T + 12,
              );
              g.lineBetween(
                X + trap.x * T + 12,
                Y + trap.y * T - 12,
                X + trap.x * T - 12,
                Y + trap.y * T + 12,
              );
            }
            for (const b of state.batteries)
              if (b.active) {
                const bx = X + b.x * T,
                  by = Y + b.y * T + (reduceMotion ? 0 : Math.sin(time / 250 + b.id) * 3);
                g.fillStyle(b.value === 2 ? 0xffcb61 : 0xb9ff66, 0.16);
                g.fillCircle(bx, by, 23);
                g.fillStyle(0x081f29, 0.38);
                g.fillEllipse(bx, Y + b.y * T + 15, 26, 9);
                g.fillStyle(0x182c36);
                g.fillRoundedRect(bx - 13, by - 16, 26, 33, 6);
                g.fillStyle(b.value === 2 ? 0xffcb61 : 0xb9ff66);
                g.fillRoundedRect(bx - 10, by - 14, 20, 28, 4);
                g.fillRect(bx - 5, by - 18, 10, 5);
                g.fillStyle(0xffffff, 0.75);
                g.fillRoundedRect(bx - 8, by - 12, 3, 14, 1);
                g.fillStyle(0x263829);
                g.fillTriangle(bx + 2, by - 10, bx - 4, by + 2, bx + 4, by);
                g.fillTriangle(bx - 2, by + 10, bx + 4, by - 2, bx - 4, by);
                if (b.value === 2) {
                  g.fillStyle(0xffe8ae);
                  g.fillRect(bx - 9, by + 16, 7, 3);
                  g.fillRect(bx + 2, by + 16, 7, 3);
                }
              }
          }
          if (state.phase === 'playing' && state.game === 'doors') {
            const stage = state.doors[Math.min(p.doorStage, 2)];
            for (let i = 0; i < 3; i++) {
              const dx = X + (3 + i * 3) * T;
              const brass = [0xdac3ff, 0xffd391, 0xffb4a1][i];
              g.fillStyle(brass, 0.1);
              g.fillRoundedRect(dx - 44, Y + 126, 88, 22, 6);
              g.fillStyle(0x321e31);
              g.fillRoundedRect(dx - 48, Y + 13, 96, 118, 20);
              g.fillStyle(brass);
              g.fillRoundedRect(dx - 44, Y + 10, 88, 111, 19);
              g.fillStyle(0x141d18);
              g.fillRoundedRect(dx - 38, Y + 18, 76, 106, 8);
              g.lineStyle(4, [0xab9dff, 0xffce62, 0xff9776][i]);
              g.strokeRoundedRect(dx - 38, Y + 18, 76, 106, 8);
              g.fillStyle(brass);
              g.fillCircle(dx + 27, Y + 82, 3);
              g.fillRoundedRect(dx - 47, Y + 124, 94, 5, 2);
              this.labels[i].setText(SYMBOLS[stage?.symbols[i] ?? 0]).setVisible(true);
            }
          }
          for (const person of [...state.players].sort((a, b) => a.y - b.y)) {
            if (!person.playing || !person.alive) continue;
            const target = person.id === playerId ? this.predicted : person;
            let display = this.positions.get(person.id);
            if (!display) {
              display = { x: target.x, y: target.y };
              this.positions.set(person.id, display);
            }
            const factor = person.id === playerId ? 1 : 1 - Math.exp(-delta / 65);
            const moving = Math.hypot(target.x - display.x, target.y - display.y) > 0.004;
            display.x += (target.x - display.x) * factor;
            display.y += (target.y - display.y) * factor;
            const px = X + display.x * T,
              py = Y + display.y * T,
              inDash = serverNow < person.dashUntil || (person.id === playerId && dashing),
              stride = !reduceMotion && moving && !inDash ? Math.sin(time / 80 + person.color) : 0,
              bob = reduceMotion ? 0 : inDash ? -5 : -Math.abs(stride) * 3,
              color = Number.parseInt(COLORS[person.color].slice(1), 16);
            g.fillStyle(0x000000, 0.25);
            g.fillEllipse(px, py + 15, 35, 13);
            if (person.id === playerId) {
              g.lineStyle(2, 0xffffff, 0.65);
              g.strokeEllipse(px, py + 15, 45, 18);
            }
            if (inDash) {
              const vector =
                person.id === playerId && serverNow < this.localDash
                  ? this.dashDirection
                  : { x: person.dashX, y: person.dashY };
              g.lineStyle(reduceMotion ? 3 : 5, color, 0.75);
              for (const offset of [-7, 7]) {
                const ax = px - vector.y * offset,
                  ay = py - 8 + vector.x * offset;
                g.lineBetween(
                  ax - vector.x * 16,
                  ay - vector.y * 16,
                  ax - vector.x * (reduceMotion ? 25 : 53),
                  ay - vector.y * (reduceMotion ? 25 : 53),
                );
              }
            }
            g.fillStyle(color);
            const ink = 0x242138;
            const bodyWidth = inDash && !reduceMotion ? 40 : 36;
            const bodyTop = py - 30 + bob;
            g.fillStyle(ink);
            g.fillRoundedRect(px - bodyWidth / 2 - 2, bodyTop - 2, bodyWidth + 4, 46, 17);
            g.fillStyle(color);
            g.fillRoundedRect(px - bodyWidth / 2, bodyTop, bodyWidth, 41, 15);
            g.fillStyle(0xffffff, 0.57);
            g.fillEllipse(px - 8, bodyTop + 6, 11, 4);
            g.fillStyle(ink, 0.17);
            g.fillEllipse(px + 4, bodyTop + 35, 18, 5);
            g.fillStyle(color);
            g.fillRoundedRect(px - 15, py + 6 + bob + stride * 3, 11, 12, 4);
            g.fillRoundedRect(px + 4, py + 6 + bob - stride * 3, 11, 12, 4);
            if (state.game === 'batteries') {
              person.carried.forEach((value, i) => {
                g.fillStyle(value === 2 ? 0xffd16a : 0xb9ff66);
                g.fillRoundedRect(px - 10 + i * 8, py + 2 + bob, 6, 8, 2);
              });
            }
            g.fillStyle(color);
            g.fillCircle(px - 19, py - 4 + bob - stride * 3, 6);
            g.fillCircle(px + 19, py - 4 + bob + stride * 3, 6);
            g.fillStyle(0x18251c);
            g.fillRoundedRect(px - 14, py - 18 + bob, 28, 17, 8);
            g.fillStyle(0xffffff);
            const blink = !reduceMotion && (time + person.color * 483) % 3400 < 95;
            const eyeHeight = blink ? 2 : inDash ? 4 : 8;
            g.fillEllipse(px - 5 + person.faceX * 2, py - 10 + bob, 5, eyeHeight);
            g.fillEllipse(px + 6 + person.faceX * 2, py - 10 + bob, 5, eyeHeight);
            if (person.skin === 'sprout') {
              g.lineStyle(3, 0xb9ff66);
              g.lineBetween(px, py - 28 + bob, px, py - 40 + bob);
              g.fillStyle(0xb9ff66);
              g.fillEllipse(px - 5, py - 38 + bob, 12, 6);
              g.fillEllipse(px + 6, py - 42 + bob, 12, 6);
            }
            if (person.skin === 'crown') {
              g.fillStyle(0xffd16a);
              g.fillTriangle(px - 15, py - 32, px - 13, py - 44, px, py - 30);
              g.fillTriangle(px - 6, py - 30, px, py - 48, px + 6, py - 30);
              g.fillTriangle(px, py - 30, px + 14, py - 44, px + 15, py - 32);
              g.fillRect(px - 14, py - 34, 28, 6);
            }
            if (person.skin === 'headphones') {
              g.lineStyle(5, 0xab9dff);
              g.strokeEllipse(px, py - 17, 34, 28);
              g.fillStyle(0xab9dff);
              g.fillRoundedRect(px - 20, py - 17, 8, 15, 3);
              g.fillRoundedRect(px + 13, py - 17, 8, 15, 3);
            }
            if (person.skin === 'ninja') {
              g.fillStyle(0x27343f);
              g.fillRect(px - 15, py - 22, 30, 7);
              g.fillTriangle(px + 15, py - 21, px + 28, py - 27, px + 23, py - 13);
            }
            if (!person.connected) {
              g.lineStyle(2, 0xff987a);
              g.strokeCircle(px, py - 8, 26);
            }
          }
          if (p.playing && p.alive) {
            const px = X + this.predicted.x * T,
              py = Y + this.predicted.y * T;
            if (localLabel.current) {
              localLabel.current.style.left = `${px / 9.6}%`;
              localLabel.current.style.top = `${Math.max(10, py - 71) / 6}%`;
            }
            // Draw last so the local player's marker survives overlapping bodies.
            g.fillStyle(0x15191d);
            g.fillTriangle(px - 9, py - 59, px + 9, py - 59, px, py - 47);
            g.fillStyle(0xffffff);
            g.fillTriangle(px - 6, py - 57, px + 6, py - 57, px, py - 50);
          }
        }
        receivedAt = Date.now();
      }
      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: 960,
        height: 600,
        parent: mount.current,
        backgroundColor: '#111713',
        scene: Arena,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
        fps: { target: 60 },
      });
    });
    return () => {
      disposed = true;
      game?.destroy(true);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
    };
  }, []);
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (stickPointer.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      x = e.clientX - rect.left - rect.width / 2,
      y = e.clientY - rect.top - rect.height / 2,
      travel = Math.max(1, Math.min(rect.width, rect.height) * 0.32),
      dir = Math.hypot(x, y) < travel * 0.12 ? { x: 0, y: 0 } : normalize(x / travel, y / travel);
    control.current = dir;
    setStick({ x: dir.x * travel, y: dir.y * travel });
  }
  function release(e: React.PointerEvent<HTMLDivElement>) {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    control.current = { x: 0, y: 0 };
    setStick({ x: 0, y: 0 });
  }
  const canAct =
    me?.playing &&
    me.eligible &&
    me.alive &&
    me.finishedAt === null &&
    ['vote', 'playing'].includes(props.state.phase);
  const dashWait = Math.max(0, Math.ceil(((me?.dashReadyAt ?? 0) - props.state.serverTime) / 1000));
  const dashAvailable = canAct && (dashWait === 0 || me.bonus > 0);
  const stage = me && props.state.doors[me.doorStage];
  const feedback = me?.feedback;
  const dock = batteryDock(props.state.serverTime - props.state.phaseStartedAt);
  const heard = useRef(0);
  useEffect(() => {
    if (!feedback || feedback.at === heard.current) return;
    heard.current = feedback.at;
    if (!props.settings.sound || props.state.serverTime - feedback.at > 600) return;
    const notes = {
      deposit: [523, 784, 1047],
      gapCleared: [587, 880],
      correctDoor: [494, 622, 740],
      lostBattery: [330, 196],
      wrongDoor: [247, 185],
      fellThrough: [262, 131],
    }[feedback.kind];
    notes.forEach((hz, i) => tone(hz, 0.12, 0.027, i * 0.085));
  }, [feedback, props.settings.sound, props.state.serverTime]);
  return (
    <div className="board-wrap">
      <div
        ref={mount}
        className="phaser-mount"
        role="img"
        aria-label={props.lang === 'ar' ? 'ساحة اللعبة' : 'Game arena'}
      />
      {!ready && (
        <div className="board-loading">
          <span className="spinner" />
          {t.connecting}
        </div>
      )}
      <div className="board-labels" aria-hidden="true">
        {props.state.players
          .filter((p) => p.playing && p.alive)
          .map((p) => (
            <span
              key={p.id}
              ref={p.id === props.playerId ? localLabel : undefined}
              className={p.id === props.playerId ? 'player-label local-player' : 'player-label'}
              style={{
                left: p.id === props.playerId ? undefined : `${(X + p.x * T) / 9.6}%`,
                top: p.id === props.playerId ? undefined : `${(Y + p.y * T - 48) / 6}%`,
                color: COLORS[p.color],
              }}
            >
              {!props.settings.mute && p.emoji && p.emojiUntil > props.state.serverTime ? (
                <b className="emoji-bubble">{p.emoji}</b>
              ) : null}
              {p.id === props.playerId ? t.you : p.name}
            </span>
          ))}
      </div>
      {props.state.phase === 'playing' &&
        feedback &&
        props.state.serverTime - feedback.at < 1200 && (
          <div
            className="action-feedback"
            key={feedback.at}
            role="status"
            dir={props.lang === 'ar' ? 'rtl' : 'ltr'}
          >
            {feedback.kind === 'deposit' ? `${t.banked} +${feedback.value}` : t[feedback.kind]}
          </div>
        )}
      {props.state.phase === 'playing' && props.state.game === 'batteries' && (
        <div
          className="deposit-label"
          style={{ left: `${(X + dock.x * T) / 9.6}%` }}
          data-loaded={!!me?.carried.length}
        >
          {me?.carried.length ? t.dropHere : t.deposit}
        </div>
      )}
      {props.state.game === 'batteries' &&
        props.state.phase === 'playing' &&
        dock.remainingMs <= 2500 && (
          <div
            className="deposit-label next-dock"
            style={{ left: `${(X + dock.nextX * T) / 9.6}%` }}
          >
            {t.nextDock} · {Math.ceil(dock.remainingMs / 1000)}
          </div>
        )}
      {props.state.phase === 'playing' && props.state.game === 'doors' && me && stage && canAct && (
        <div className="clue-label" dir={props.lang === 'ar' ? 'rtl' : 'ltr'}>
          {stage.clue === null ? t.rememberClue : t.clue}
          {stage.clue !== null && <b>{SYMBOLS[stage.clue]}</b>}
          {props.state.vote?.selected === 1 &&
            props.state.serverTime - me.doorStageAt < CONFIG.doorSwapMs && (
              <small>⇄ {t.doorsMoving}</small>
            )}
          <span dir="ltr">{me.doorStage + 1} / 3</span>
        </div>
      )}
      <div className="touch-controls">
        <div
          className="joystick"
          role="group"
          aria-label={props.lang === 'ar' ? 'عصا الحركة' : 'Movement joystick'}
          onPointerDown={(e) => {
            if (!canAct || stickPointer.current !== null) return;
            stickPointer.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            move(e);
          }}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        >
          <span style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}>
            <MoveUpRight size={22} />
          </span>
        </div>
        <button
          className={`touch-dash ${dashAvailable ? 'available' : ''}`}
          disabled={!dashAvailable}
          onPointerDown={(e) => {
            e.preventDefault();
            void triggerDash();
          }}
          aria-label={t.dash}
        >
          <Zap size={27} />
          <small>{canAct && !dashAvailable ? `${dashWait}s` : t.dash}</small>
          {me && me.bonus > 0 && <b>+1</b>}
        </button>
      </div>
      <div className="rotate-overlay">
        <MoveUpRight size={38} />
        <strong>{t.rotate}</strong>
        <span>{t.rotateHint}</span>
      </div>
    </div>
  );
}

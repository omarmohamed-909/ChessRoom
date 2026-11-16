'use client';
import dynamic from 'next/dynamic';
import {
  Copy,
  Keyboard,
  LoaderCircle,
  LogOut,
  Radio,
  Settings2,
  Trophy,
  Zap,
} from 'lucide-react';
import { COLORS, voteZone } from '@chaos/shared';
import type { GameSocket } from '../../lib/client';
import Avatar from '../Avatar';
import type { Settings } from '../GameBoard';
import type { RoomProps } from './types';

const GameBoard = dynamic(() => import('../GameBoard'), {
  ssr: false,
  loading: () => (
    <div className="board-loading">
      <LoaderCircle className="spin" />
    </div>
  ),
});

type Props = RoomProps & {
  socket: GameSocket | null;
  settings: Settings;
  clock: number;
  remaining: number;
  onOpenSettings: () => void;
};

export default function MatchScreen({
  lang,
  t,
  games,
  state,
  identity,
  command,
  leave,
  invite,
  socket,
  settings,
  clock,
  remaining,
  onOpenSettings,
}: Props) {
  const player = state.players.find((p) => p.id === identity?.id);
  const activePlayer = player?.playing && player.eligible && player.alive ? player : undefined;
  const zone = state.phase === 'vote' && activePlayer ? voteZone(activePlayer) : null;

  return (
    <main className="match-page" data-arena={state.game}>
      <div className="match-top">
        <div>
          <div className="round-kicker-row">
            <span className="section-kicker">
              {t.round} 0{state.round + 1} / 03
            </span>
            <span className="round-pips" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <i
                  key={i}
                  className={i < state.round ? 'done' : i === state.round ? 'active' : undefined}
                />
              ))}
            </span>
          </div>
          <h1>{games[state.game].title}</h1>
          {state.phase === 'playing' && state.vote && (
            <p className="active-rule">
              {t.roundRule} · {games[state.game].rules[state.vote.selected]}
            </p>
          )}
        </div>
        <div className={`phase-timer phase-${state.phase}`}>
          <span>{t[state.phase as 'vote' | 'playing' | 'reveal' | 'roundResults']}</span>
          <strong
            key={state.phase === 'vote' && remaining <= 3 ? remaining : 'clock'}
            className={state.phase === 'vote' && remaining <= 3 ? 'final-tick' : undefined}
          >
            {remaining.toString().padStart(2, '0')}
            <small>s</small>
          </strong>
        </div>
        <div className="match-actions">
          <button className="icon-button" onClick={onOpenSettings} aria-label={t.settings}>
            <Settings2 size={21} />
          </button>
          <button className="icon-button" onClick={() => void leave()} aria-label={t.leave}>
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="match-layout">
        <section className="arena-panel">
          <div className="arena-message">
            {state.phase === 'vote' ? (
              <>
                <span className="live-dot" />
                {activePlayer ? t.chooseZone : t.nextMatch}
                {activePlayer && (
                  <b className="vote-readout" role="status">
                    {t.yourVote} · {zone === null ? t.noVote : zone === 0 ? 'A' : 'B'}
                  </b>
                )}
              </>
            ) : state.phase === 'reveal' ? (
              <>
                <Zap size={17} />
                {state.vote?.counts.every((count) => count === 0)
                  ? t.emptyVote
                  : state.vote?.tied
                    ? t.tie
                    : t.minority}
              </>
            ) : (
              <>
                <Radio size={16} />
                {state.phase === 'playing' &&
                state.game === 'doors' &&
                activePlayer?.finishedAt != null
                  ? t.doorsDone
                  : state.practiceGapX !== undefined &&
                      state.phase === 'playing' &&
                      activePlayer &&
                      clock - state.phaseStartedAt < 5000 &&
                      activePlayer.x < state.practiceGapX &&
                      Math.abs(activePlayer.y - 3.5) < 0.6
                    ? t.firstJump
                    : games[state.game].goal}
                {state.phase === 'playing' && state.game === 'batteries' && activePlayer && (
                  <b className="vote-readout">
                    {t.carrying} {activePlayer.carried.length}/3
                  </b>
                )}
              </>
            )}
          </div>

          {state.phase === 'vote' && (
            <div className="vote-labels">
              <div data-selected={zone === 0}>
                <span>A</span>
                {games[state.game].rules[0]}
              </div>
              <div data-selected={zone === 1}>
                <span>B</span>
                {games[state.game].rules[1]}
              </div>
            </div>
          )}

          <GameBoard
            state={state}
            playerId={identity?.id || ''}
            socket={socket}
            lang={lang}
            settings={settings}
            onDash={async () => {
              const ack = await command(
                {
                  type: 'dash',
                  matchId: state.matchId,
                  round: state.round,
                  phase: state.phase,
                },
                true,
              );
              return ack.ok;
            }}
          />

          {state.phase === 'reveal' && (
            <div className="reveal-overlay" data-choice={state.vote!.selected}>
              <span>{t.reveal}</span>
              <h2>{games[state.game].rules[state.vote!.selected]}</h2>
              <div>
                <b>A {state.vote!.counts[0]}</b>
                <b>B {state.vote!.counts[1]}</b>
              </div>
              {player?.bonus ? (
                <p>
                  <Zap size={20} />
                  {t.bonus} +1
                </p>
              ) : null}
            </div>
          )}

          {state.phase === 'roundResults' && (
            <div className="round-overlay">
              <Trophy size={36} />
              <h2>{t.roundResults}</h2>
              {player?.feedback?.kind === 'fellThrough' && <small>{t.fellThrough}</small>}
              {state.history.at(-1)?.standings.map((p) => (
                <div key={p.id}>
                  <b>#{p.rank}</b>
                  <span>{p.name}</span>
                  <strong>+{p.points}</strong>
                </div>
              ))}
            </div>
          )}

          {player && (!player.playing || !player.alive) && state.phase === 'playing' && (
            <div className="spectator-label">
              {player.playing && player.eligible ? t.spectating : t.nextMatch}
            </div>
          )}

          <div className="arena-footer">
            <span>
              <Keyboard size={16} />
              {t.controls}
            </span>
            <div className="dash-status">
              <Zap size={16} />
              {t.dash}
              <b>
                {player && clock >= player.dashReadyAt
                  ? t.dashReady
                  : Math.max(0, Math.ceil(((player?.dashReadyAt || 0) - clock) / 1000)) + 's'}
              </b>
              {player?.bonus ? <span>+1 {t.bonus}</span> : null}
            </div>
          </div>
        </section>

        <aside className="score-panel">
          <h3>
            {t.players}
            <span>{state.players.length}/6</span>
          </h3>
          {[...state.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <div
                key={p.id}
                className={`score-player ${p.id === identity?.id ? 'is-you' : ''} ${!p.alive ? 'is-out' : ''}`}
              >
                <Avatar color={COLORS[p.color]} skin={p.skin} size={47} />
                <div>
                  <strong>
                    {p.name}
                    {p.id === identity?.id && <small> {t.you}</small>}
                  </strong>
                  <span>
                    {!p.connected
                      ? t.disconnected
                      : state.game === 'batteries'
                        ? `${t.carrying} ${p.carried.length}/3 · ${p.roundValue}`
                        : state.game === 'doors'
                          ? `${t.stage} ${p.doorStage}/3`
                          : p.alive
                            ? '●'
                            : '—'}
                  </span>
                </div>
                <b>{p.score}</b>
              </div>
            ))}
          <div className="reactions">
            <span>{lang === 'ar' ? 'قولها بإيموجي' : 'Say it with a reaction'}</span>
            <div>
              {['🔥', '😂', '💚', '👀', '😎', '💀'].map((emoji) => (
                <button
                  key={emoji}
                  aria-label={emoji}
                  onClick={() => void command({ type: 'emoji', emoji }, true)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="room-mini-code">
            <span>{t.code}</span>
            <b>{state.code}</b>
            <button aria-label={t.invite} onClick={() => void invite()}>
              <Copy size={14} />
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

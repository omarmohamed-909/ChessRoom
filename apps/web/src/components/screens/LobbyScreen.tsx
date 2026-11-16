import type { CSSProperties } from 'react';
import { Check, Copy, Crown, LogOut, Play, Plus, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import { COLORS, GAMES } from '@chaos/shared';
import Avatar from '../Avatar';
import type { RoomProps } from './types';

export default function LobbyScreen({
  lang,
  t,
  games,
  state,
  identity,
  isHost,
  command,
  leave,
  invite,
  copied,
}: RoomProps) {
  const player = state.players.find((p) => p.id === identity?.id);
  const connected = state.players.filter((p) => p.connected).length;
  const allReady = !state.players.some((p) => p.connected && !p.ready);
  const ar = lang === 'ar';

  return (
    <main className="room-page">
      <div className="room-title">
        <div>
          <span className="section-kicker">PRIVATE ROOM / {state.code}</span>
          <h1>
            {state.training ? t.training : t.waiting}
            <span className="accent">.</span>
          </h1>
          <p>{state.training ? t.trainingHint : t.lobbyHint}</p>
        </div>
        <button className="button secondary" onClick={() => void leave()}>
          <LogOut size={17} />
          {t.leave}
        </button>
      </div>
      <div className="lobby-grid">
        <section className="lobby-stage">
          <div className="room-code">
            <span>{t.code}</span>
            <strong dir="ltr">{state.code}</strong>
            <span className="room-count" dir="ltr">
              {connected}/6
            </span>
            <button className="button primary" onClick={() => void invite()}>
              {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? t.copied : t.invite}
            </button>
          </div>
          <div className="lobby-crew">
            {Array.from({ length: 6 }, (_, i) => {
              const p = state.players[i];
              return (
                <div
                  className={`crew-slot ${p ? 'occupied' : ''} ${p?.ready ? 'is-ready' : ''}`}
                  style={p ? ({ '--slot-color': COLORS[p.color] } as CSSProperties) : undefined}
                  key={i}
                >
                  {p ? (
                    <>
                      <div className="crew-person">
                        <Avatar color={COLORS[p.color]} skin={p.skin} size={100} />
                        {p.ready && (
                          <span className="ready-check">
                            <Check size={13} />
                          </span>
                        )}
                      </div>
                      <strong>
                        {p.name} {p.id === identity?.id && <small>({t.you})</small>}
                      </strong>
                      <span>
                        {p.id === state.hostId ? (
                          <>
                            <Crown size={12} />
                            {t.host}
                          </>
                        ) : p.connected ? (
                          p.ready ? (
                            t.ready
                          ) : (
                            t.waiting
                          )
                        ) : (
                          t.disconnected
                        )}
                      </span>
                      {isHost && p.id !== identity?.id && (
                        <button
                          className="kick-button"
                          aria-label={`${t.kick}: ${p.name}`}
                          onClick={() => void command({ type: 'kick', playerId: p.id })}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="empty-person">
                        <Plus size={28} />
                      </div>
                      <span>{ar ? 'مكان لصاحبك' : 'Room for a friend'}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lobby-bottom">
            <button
              className={`button ${player?.ready ? 'secondary' : 'primary'}`}
              onClick={() => void command({ type: 'ready', ready: !player?.ready })}
            >
              <Check size={18} />
              {player?.ready ? t.unready : t.ready}
            </button>
            {isHost && (
              <button
                className="button primary"
                disabled={!state.training && (connected < 2 || !allReady)}
                onClick={() => void command({ type: 'start' })}
              >
                <Play size={18} />
                {t.start}
              </button>
            )}
          </div>
        </section>
        <aside className="lobby-sidebar">
          <h3>
            <Zap size={18} />
            {ar ? 'الماتش عامل إزاي؟' : 'The chaos ahead'}
          </h3>
          {GAMES.map((g, i) => (
            <div className="round-preview" data-game={g} key={g}>
              <b>0{i + 1}</b>
              <div>
                <strong>{games[g].title}</strong>
                <small>{games[g].tag} · 45s</small>
              </div>
              <i className="round-dot" />
            </div>
          ))}
          <div className="minority-note">
            <Sparkles size={20} />
            <strong>{t.minority}</strong>
            <p>
              {ar
                ? 'القاعدة بتاعة الأغلبية، بس اللي اختاروا التانية معاهم اندفاع إضافي. استخدمه صح.'
                : 'The majority makes the rule. The other side gets a bonus dash. Make it count.'}
            </p>
          </div>
          <span className="privacy-note">
            <ShieldCheck size={14} />
            {ar ? 'أوضة خاصة. بالرابط بس.' : 'Private room. Invite only.'}
          </span>
        </aside>
      </div>
    </main>
  );
}

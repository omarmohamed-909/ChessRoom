import type { CSSProperties } from 'react';
import { Check, Crown, Download, LoaderCircle, RotateCcw, Trophy } from 'lucide-react';
import { COLORS } from '@chaos/shared';
import { errorText } from '../../lib/i18n';
import { downloadResultCard } from '../../lib/resultCard';
import Avatar from '../Avatar';
import type { RoomProps } from './types';

export default function ResultsScreen({
  lang,
  t,
  games,
  state,
  isHost,
  command,
  leave,
}: RoomProps) {
  const playing = [...state.players].filter((p) => p.playing).sort((a, b) => b.score - a.score);
  const topScore = Math.max(0, ...playing.map((p) => p.score));

  return (
    <main className="results-page">
      <span className="results-eyebrow">
        {state.phase === 'finished' ? 'THE CHAOS HAS A CHAMPION' : 'CHAOS INTERRUPTED'}
      </span>
      <h1>
        {state.phase === 'finished' ? t.finished : t.cancelled}
        <span className="accent">.</span>
      </h1>
      {state.phase === 'finished' ? (
        <>
          <p>{t.finishHint}</p>
          <div className="podium">
            {playing.map((p, i) => {
              const rank = 1 + playing.filter((o) => o.score > p.score).length;
              return (
                <div
                  key={p.id}
                  className={`podium-player ${i === 0 ? 'first' : ''}`}
                  style={{ '--player-color': COLORS[p.color] } as CSSProperties}
                >
                  {p.score === topScore && <Crown size={27} />}
                  <Avatar color={COLORS[p.color]} skin={p.skin} size={i === 0 ? 134 : 100} />
                  <b className="podium-rank" dir="ltr">
                    #{rank}
                  </b>
                  <strong>{p.name}</strong>
                  <span>
                    {p.score} {t.points}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="results-breakdown">
            {state.history.map((r, i) => (
              <div key={i}>
                <span>0{i + 1}</span>
                <strong>{games[r.game].title}</strong>
                <p>
                  {r.standings
                    .filter((p) => p.rank === 1)
                    .map((p) => p.name)
                    .join(' & ')}
                </p>
                <Trophy size={16} />
              </div>
            ))}
          </div>
          <div className="results-buttons">
            {isHost && (
              <button
                className="button primary large"
                onClick={() => void command({ type: 'rematch' })}
              >
                <RotateCcw size={19} />
                {t.rematch}
              </button>
            )}
            <button
              className="button secondary large"
              onClick={() => downloadResultCard(state, lang)}
            >
              <Download size={18} />
              {t.share}
            </button>
            <button className="button ghost" onClick={() => void leave()}>
              {t.leave}
            </button>
          </div>
          <small className="save-status">
            {state.saved === 'pending' ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Check size={14} />
            )}{' '}
            {state.saved === 'saved' ? t.saved : state.saved === 'local' ? t.local : t.pending}
          </small>
        </>
      ) : (
        <>
          <p>{errorText(state.reason || '', lang)}</p>
          <div className="results-buttons">
            {isHost && (
              <button className="button primary" onClick={() => void command({ type: 'rematch' })}>
                {t.rematch}
              </button>
            )}
            <button className="button secondary" onClick={() => void leave()}>
              {t.backHome}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

import { ArrowUpLeft, ArrowUpRight, Hash, Play, Plus, Sparkles, Users, Zap } from 'lucide-react';
import { GAMES } from '@chaos/shared';
import DashScene from '../DashScene';
import { ArenaArt } from '../Art';
import type { Connection, ScreenProps } from './types';

type Props = ScreenProps & {
  busy: boolean;
  connection: Connection;
  onCreate: () => void;
  onJoin: () => void;
  onHelp: () => void;
  onTraining: () => void;
};

export default function HomeScreen({
  lang,
  t,
  games,
  busy,
  connection,
  onCreate,
  onJoin,
  onHelp,
  onTraining,
}: Props) {
  const Arrow = lang === 'ar' ? ArrowUpLeft : ArrowUpRight;
  const ar = lang === 'ar';

  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" />
            {ar ? 'لعبة واحدة. صحاب كتير. فوضى أكتر.' : 'ONE ROOM. YOUR CREW. TOTAL CHAOS.'}
          </div>
          <h1>
            {ar ? (
              <>
                الفوضى أحلى
                <br />
                <span>
                  مع صحابك
                  <span className="heading-star" aria-hidden="true">
                    ✳
                  </span>
                </span>
              </>
            ) : (
              <>
                Chaos is better
                <br />
                <span>
                  with your crew
                  <span className="heading-star" aria-hidden="true">
                    ✳
                  </span>
                </span>
              </>
            )}
          </h1>
          <p className="hero-description">
            {ar ? (
              <>
                اجمع صحابك، صوّت برجليك، واقلب قوانين اللعبة.
                <br />٣ جولات سريعة… ومفيش حد ضامن يكسب.
              </>
            ) : (
              <>
                Round up your friends. Vote with your feet. Rewrite the rules.
                <br />3 quick rounds. Absolutely no guarantees.
              </>
            )}
          </p>
          <div className="hero-buttons">
            <button className="button primary large" onClick={onCreate}>
              <Plus size={21} />
              {t.play}
              <Arrow size={20} />
            </button>
            <button className="button secondary large" onClick={onJoin}>
              <Hash size={20} />
              {t.join}
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <Users size={15} />
              {ar ? '٢–٦ لاعبين' : '2–6 players'}
            </span>
            <i />
            <span>{ar ? '٣ دقايق للماتش' : '3-minute matches'}</span>
            <i />
            <span>{ar ? 'من غير تحميل' : 'No downloads'}</span>
          </div>
          <button
            className="training-link"
            onClick={onTraining}
            disabled={busy || connection !== 'online'}
          >
            <Play size={13} />
            {t.training}
            <span>
              {connection !== 'online'
                ? t[connection]
                : ar
                  ? 'خد لفة قبل ما تناديهم'
                  : 'Get a feel before inviting the crew'}
            </span>
            <Arrow size={14} />
          </button>
        </div>
        <div className="hero-visual">
          <DashScene arabic={ar} />
        </div>
      </section>

      <section className="game-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">
              {ar ? 'نفس الصحاب، تحديات مختلفة' : 'SAME CREW. DIFFERENT CHALLENGES.'}
            </span>
            <h2>{ar ? '٣ جولات. مفيش أمان.' : '3 rounds. Trust nothing.'}</h2>
          </div>
          <span className="section-note">
            <Sparkles size={16} />
            {ar ? 'إنتوا بتختاروا اللي يحصل' : 'You choose what happens'}
          </span>
        </div>
        <div className="game-cards">
          {GAMES.map((game, i) => (
            <button key={game} className={`game-card card-${game}`} onClick={onHelp}>
              <div className="card-image">
                <ArenaArt kind={game} />
                <span className="game-number">0{i + 1}</span>
                <span className="game-tag">{games[game].tag}</span>
              </div>
              <div className="card-copy">
                <div>
                  <h3>{games[game].title}</h3>
                  <p>{games[game].desc}</p>
                  <div className="card-rules">
                    <span>
                      <b>A</b>
                      {games[game].rules[0]}
                    </span>
                    <span>
                      <b>B</b>
                      {games[game].rules[1]}
                    </span>
                  </div>
                </div>
                <span className="card-arrow">
                  <Arrow size={19} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="how-strip">
        <div className="how-title">
          <span className="strip-icon">
            <Zap size={23} />
          </span>
          <strong>
            {ar ? 'من اللينك للفوضى' : 'From link to chaos'}
            <small>{ar ? 'أسرع من «هنلعب إيه؟»' : 'Faster than “what should we play?”'}</small>
          </strong>
        </div>
        {[
          ar ? 'افتح أوضة وابعث الرابط' : 'Create a room. Send the link.',
          ar ? 'اختاروا القاعدة برجليكم' : 'Vote on the rule with your feet.',
          ar ? 'اكسب… أو اطلب ريماتش' : 'Win. Or demand a rematch.',
        ].map((text, i) => (
          <div className="how-step" key={i}>
            <span>0{i + 1}</span>
            <p>{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

import Avatar from './Avatar';
export function ArenaArt({ kind = 'tiles' }: { kind?: 'tiles' | 'batteries' | 'doors' }) {
  return (
    <div className={`arena-art art-small theme-${kind}`} aria-hidden="true">
      <div className="art-grid">
        {Array.from({ length: 48 }, (_, i) => (
          <i
            key={i}
            className={`${[6, 7, 14, 29, 37, 46].includes(i) ? 'missing' : ''} ${[8, 15, 23, 36].includes(i) ? 'warning' : ''}`}
          />
        ))}
      </div>
      {kind === 'doors' ? (
        <div className="art-doors">
          <b>◆</b>
          <b>★</b>
          <b>▲</b>
        </div>
      ) : null}
      {kind === 'batteries' ? (
        <div className="art-batteries">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ left: `${18 + i * 15}%`, top: `${25 + (i % 2) * 27}%` }}>
              ⚡
            </span>
          ))}
        </div>
      ) : null}
      <div className="art-character art-a">
        <Avatar color="#b9ff66" skin="sprout" size={64} />
      </div>
      <div className="art-character art-b">
        <Avatar color="#ad9bff" skin="headphones" size={55} />
      </div>
      <div className="art-character art-c">
        <Avatar color="#ff987a" skin="crown" size={58} />
      </div>
    </div>
  );
}

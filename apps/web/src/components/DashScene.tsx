import Avatar from './Avatar';

// The tile rows are painted back to front so their vertical faces overlap naturally.
function Platform({ x, y, falling = false }: { x: number; y: number; falling?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={falling ? 'loose-tile' : undefined} strokeLinejoin="round">
        <path d="m0 0 54 23 54-23v16L54 43 0 16Z" fill={falling ? '#bd5f32' : '#474071'} />
        <path d="M54 23 108 0v16L54 43Z" fill={falling ? '#743a34' : '#292347'} />
        <path
          d="m0 0 54-25 54 25-54 26Z"
          fill={falling ? '#ffc078' : '#a79adf'}
          stroke={falling ? '#ffe3a4' : '#cfc3f5'}
          strokeWidth="2"
        />
        {falling && (
          <path d="m48-20 10 12-12 5 15 4-9 21" fill="none" stroke="#97503f" strokeWidth="3" />
        )}
      </g>
    </g>
  );
}

export default function DashScene({ arabic }: { arabic: boolean }) {
  return (
    <figure className="dash-scene">
      <svg viewBox="0 0 520 355" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="arena-sky" cx=".66" cy=".37" r=".84">
            <stop stopColor="#604582" />
            <stop offset=".57" stopColor="#342747" />
            <stop offset="1" stopColor="#191827" />
          </radialGradient>
          <pattern id="arena-dots" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="#e9dcff" opacity=".13" />
          </pattern>
        </defs>
        <rect width="520" height="355" fill="url(#arena-sky)" />
        <rect width="520" height="355" fill="url(#arena-dots)" />
        <g transform="rotate(-18 276 160)" fill="none" stroke="#bea0f0">
          <ellipse cx="276" cy="160" rx="222" ry="77" opacity=".38" />
          <ellipse cx="276" cy="160" rx="240" ry="89" opacity=".18" strokeDasharray="4 6" />
        </g>
        <g fill="#ffdc9c">
          <path d="m96 45 3 12 12 3-12 3-3 12-3-12-12-3 12-3Zm352 76 2 8 8 2-8 2-2 8-2-8-8-2 8-2Z" />
          <circle cx="409" cy="71" r="3" />
          <circle cx="57" cy="160" r="2" />
        </g>
        {[
          [193, 183],
          [306, 183],
          [134, 211],
          [248, 211],
          [361, 211],
          [75, 239],
          [189, 239],
          [303, 239],
          [130, 266],
          [245, 266],
        ].map(([x, y]) => (
          <Platform key={x} x={x} y={y} falling={x === 189} />
        ))}
        <g transform="translate(94 125) rotate(-12 50 55)">
          <Avatar size={103} skin="headphones" color="#b2a2ff" />
        </g>
        <g transform="translate(358 143) rotate(12 38 43)">
          <Avatar size={86} skin="crown" color="#ffa27c" />
        </g>
        <g className="dash-flight">
          <g transform="rotate(-22 254 160)" fill="#dfff99">
            <path d="m134 153 92-8-1 6Zm19 15 72-9-1 5Zm12 12 68-7-2 4Z" />
          </g>
          <g transform="translate(198 52) rotate(13 80 86)">
            <Avatar size={174} skin="sprout" color="#c2ff78" look={2} />
          </g>
        </g>
      </svg>
      <figcaption dir={arabic ? 'rtl' : 'ltr'}>
        <b dir="ltr">⚡ +1</b>
        {arabic
          ? 'صوّتّ مع الأقلية؟ ليك Dash إضافية.'
          : 'Voted with the minority? Get an extra dash.'}
      </figcaption>
    </figure>
  );
}

import type { Skin } from '@chaos/shared';
export default function Avatar({
  color = '#b9ff66',
  skin = 'classic',
  size = 80,
  look = 0,
  className = '',
}: {
  color?: string;
  skin?: Skin;
  size?: number;
  look?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 110"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="50" cy="99" rx="30" ry="7" fill="#000" opacity=".22" />
      <path
        d="M28 78L23 94Q28 101 37 95L42 81M60 81L65 96Q76 99 78 92L72 76"
        fill={color}
        stroke="#182220"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M23 48Q9 55 13 69Q18 73 27 65M75 48Q91 52 88 66Q83 72 75 64"
        fill={color}
        stroke="#182220"
        strokeWidth="4"
      />
      <path
        d="M23 43C23 9 77 9 77 43V68C77 95 23 95 23 68Z"
        fill={color}
        stroke="#182220"
        strokeWidth="4"
      />
      <path
        d="M31 40C31 22 51 21 58 23"
        stroke="#fff"
        strokeOpacity=".4"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="32" y="39" width="38" height="25" rx="12" fill="#202923" />
      <ellipse cx={43 + look} cy="50" rx="3.5" ry="5.5" fill="#fff" />
      <ellipse cx={59 + look} cy="50" rx="3.5" ry="5.5" fill="#fff" />
      {skin === 'sprout' && (
        <>
          <path d="M50 20V7" stroke="#283c22" strokeWidth="4" />
          <path
            d="M49 13Q28 13 34 0Q52-2 49 13M51 12Q52-3 68 1Q70 15 51 12"
            fill="#b9ff66"
            stroke="#283c22"
            strokeWidth="3"
          />
        </>
      )}
      {skin === 'crown' && (
        <path
          d="M30 24L26 4L42 12L50 0L59 12L75 4L71 24Z"
          fill="#ffd16a"
          stroke="#4a391e"
          strokeWidth="3"
        />
      )}
      {skin === 'headphones' && (
        <>
          <path d="M23 51V39Q24 12 50 12Q77 12 77 40V51" stroke="#443760" strokeWidth="8" />
          <rect x="17" y="39" width="12" height="25" rx="5" fill="#b4a1fc" />
          <rect x="71" y="39" width="12" height="25" rx="5" fill="#b4a1fc" />
        </>
      )}
      {skin === 'ninja' && (
        <>
          <path d="M22 35H78V44H22Z" fill="#353d49" />
          <path d="M77 37L91 30L88 45Z" fill="#353d49" />
        </>
      )}
    </svg>
  );
}

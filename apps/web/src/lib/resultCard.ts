import { COLORS, type Snapshot } from '@chaos/shared';
import type { Lang } from './i18n';

const escape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

/** Builds a shareable 1200×630 SVG summary of a finished match. */
export function resultCardSvg(state: Snapshot, lang: Lang) {
  const ar = lang === 'ar';
  const playing = state.players.filter((p) => p.playing);
  const top = Math.max(0, ...playing.map((p) => p.score));
  const winners = playing.filter((p) => p.score === top);
  const names = winners.map((p) => p.name).join(' & ');
  const minorityWin = state.history.find(
    (r) =>
      r.game === 'tiles' && r.standings.some((p) => p.rank === 1 && r.vote.minority.includes(p.id)),
  );
  const hero = minorityWin?.standings.find(
    (p) => p.rank === 1 && minorityWin.vote.minority.includes(p.id),
  );
  const fact = hero
    ? ar
      ? `${hero.name} كسب جولة البلاط من الأقلية!`
      : `${hero.name} won falling tiles from the minority!`
    : ar
      ? `${top} نقطة في ٣ جولات`
      : `${top} points across 3 rounds`;
  const dir = ar ? 'rtl' : 'ltr';
  const ranked = [...playing].sort((a, b) => b.score - a.score).slice(0, 6);
  const ranking = ranked
    .map((p, i) => {
      const x = 600 - (ranked.length - 1) * 80 + i * 160;
      return `<g transform="translate(${x} 470)"><circle r="26" fill="${COLORS[p.color]}" opacity=".95"/><text y="9" text-anchor="middle" font-family="Arial" font-weight="800" font-size="22" fill="#14161c">${1 + ranked.filter((o) => o.score > p.score).length}</text><text y="62" text-anchor="middle" direction="${dir}" font-family="Arial" font-size="18" fill="#e9e6df">${escape(p.name.slice(0, 12))}</text><text y="88" text-anchor="middle" font-family="Arial" font-size="16" fill="#8d919c">${p.score}</text></g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="g1" cx=".85" cy=".1" r=".7"><stop stop-color="#c6fa6e" stop-opacity=".22"/><stop offset="1" stop-color="#c6fa6e" stop-opacity="0"/></radialGradient><radialGradient id="g2" cx=".1" cy=".95" r=".6"><stop stop-color="#b49cff" stop-opacity=".22"/><stop offset="1" stop-color="#b49cff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" rx="36" fill="#0d0f14"/><rect width="1200" height="630" rx="36" fill="url(#g1)"/><rect width="1200" height="630" rx="36" fill="url(#g2)"/><rect x="1.5" y="1.5" width="1197" height="627" rx="35" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="3"/><text x="600" y="92" text-anchor="middle" font-family="Arial" font-weight="900" font-size="34" letter-spacing="6" fill="#c6fa6e">CHAOS ROOM.</text><text x="600" y="168" text-anchor="middle" direction="${dir}" font-family="Arial" font-size="28" fill="#9a9ea9">${ar ? 'أبطال الفوضى' : 'CHAMPIONS OF CHAOS'}</text><text x="600" y="258" text-anchor="middle" direction="${dir}" font-family="Arial" font-weight="bold" font-size="64" fill="#f4f1ea">${escape(names)}</text><text x="600" y="322" text-anchor="middle" direction="${dir}" font-family="Arial" font-size="26" fill="#c6fa6e">${escape(fact)}</text><line x1="420" y1="376" x2="780" y2="376" stroke="#ffffff" stroke-opacity=".1" stroke-width="2"/>${ranking}</svg>`;
}

export function downloadResultCard(state: Snapshot, lang: Lang) {
  const svg = resultCardSvg(state, lang);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })),
    a = document.createElement('a');
  a.href = url;
  a.download = `chaos-room-${state.matchId}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

# Asset provenance

The character vector, scene compositions, floor tiles, battery/door graphics, logo, visual effects, share cards, and synthesized sound/music were authored procedurally in this repository. They do not depend on downloaded game art, remote font CDNs, or an image-generation service.

- Character SVG: `Avatar` component; matching Phaser geometry in `GameBoard`.
- Landing dash illustration and miniature arenas use the DashScene and Art components.
- UI icons: `lucide-react`, ISC license; retain its distributed license.
- Emoji and universal symbols: rendered by the visitor's system fonts.
- Cairo and Space Grotesk variable fonts are bundled locally through Fontsource under the SIL Open Font License 1.1. Both notices ship in apps/web/public/licenses.
- Frameworks and libraries retain their respective upstream licenses through npm packages.

Future purchased or commissioned art/audio must have documented commercial usage rights here before inclusion. Keep silhouettes, collision size, player-color visibility and warning contrast consistent across cosmetics.


import type { GameKind } from '@chaos/shared';

// Painted once into a texture for each round. Physics and moving objects share
// the board's 96,44 origin and 64px grid with this scenery.
type Brush = CanvasRenderingContext2D;

export const arenaPalette = {
  tiles: {
    sky: '#14132a',
    horizon: '#714a91',
    rim: '#e5c2ff',
    glow: '#a87eff28',
    base: '#3b304b',
    floor: [0x8b76ab, 0x7c6a9b],
  },
  batteries: {
    sky: '#091f30',
    horizon: '#206b73',
    rim: '#8ef5e7',
    glow: '#52e5d424',
    base: '#1f3943',
    floor: [0x336567, 0x2d5b5e],
  },
  doors: {
    sky: '#221530',
    horizon: '#9b5862',
    rim: '#ffd598',
    glow: '#ffb88424',
    base: '#4a2f42',
    floor: [0x765162, 0x6c475b],
  },
};

function panel(c: Brush, x: number, y: number, w: number, h: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function strokePanel(
  c: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width: number,
) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.stroke();
}

function line(c: Brush, points: number[][], color: string, width: number) {
  c.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

function disc(c: Brush, x: number, y: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

export function paintArena(c: Brush, kind: GameKind) {
  const palette = arenaPalette[kind];
  const sky = c.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, palette.sky);
  sky.addColorStop(0.58, palette.horizon);
  sky.addColorStop(1, palette.sky);
  c.fillStyle = sky;
  c.fillRect(0, 0, 960, 600);

  const aura = c.createRadialGradient(480, 120, 40, 480, 300, 560);
  aura.addColorStop(0, palette.glow);
  aura.addColorStop(1, 'transparent');
  c.fillStyle = aura;
  c.fillRect(0, 0, 960, 600);

  if (kind === 'tiles') {
    for (let i = 0; i < 140; i++)
      disc(c, (i * 331 + 41) % 960, (i * i * 17 + 27) % 586, i % 5 === 0 ? 2 : 1, '#fff3e6a8');
    disc(c, 42, 137, 31, '#ffdaa8');
    c.beginPath();
    c.ellipse(42, 137, 48, 9, -0.32, 0, Math.PI * 2);
    c.strokeStyle = '#e6ace7';
    c.lineWidth = 3;
    c.stroke();
    for (let i = 0; i < 26; i++) {
      const x = i * 39,
        top = 385 + ((i * 107) % 142);
      panel(c, x, top, 35, 600 - top, 3, '#2d2947');
      for (let y = top + 10; y < 580; y += 18) panel(c, x + 7, y, 8, 4, 1, '#e4b8d19e');
    }
  } else if (kind === 'batteries') {
    for (const x of [36, 924]) {
      line(
        c,
        [
          [x, -8],
          [x, 610],
        ],
        '#102c38',
        25,
      );
      line(
        c,
        [
          [x - 3, -8],
          [x - 3, 610],
        ],
        '#497c79',
        11,
      );
      for (let y = 36; y < 600; y += 64) {
        panel(c, x - 16, y, 32, 11, 3, '#b98c5b');
        panel(c, x - 12, y + 1, 24, 2, 1, '#ffe1a0');
      }
      disc(c, x, 173, 28, '#173a44');
      disc(c, x, 173, 21, '#e3c18c');
      disc(c, x, 173, 17, '#446061');
      line(
        c,
        [
          [x, 173],
          [x + 10, 163],
        ],
        '#ffcb84',
        3,
      );
    }
  } else {
    for (const x of [0, 884]) {
      for (let fold = 0; fold < 5; fold++) {
        const bx = x + fold * 16;
        const cloth = c.createLinearGradient(bx, 0, bx + 16, 0);
        cloth.addColorStop(0, '#3b1b36');
        cloth.addColorStop(0.58, '#9c465b');
        cloth.addColorStop(1, '#53253f');
        c.fillStyle = cloth;
        c.fillRect(bx, 0, 16, 600);
      }
      for (let i = 0; i < 3; i++)
        line(
          c,
          [
            [x, 260 + i * 6],
            [x + 75, 244 + i * 6],
          ],
          '#d8ab69',
          3,
        );
    }
  }

  panel(c, 78, 35, 804, 549, 22, '#0a0918cc');
  panel(c, 78, 24, 804, 548, 21, palette.base);
  panel(c, 81, 24, 798, 6, 3, palette.rim);
  panel(c, 90, 38, 780, 526, 12, palette.sky);
  strokePanel(c, 91, 39, 778, 524, 12, '#ffffff1f', 2);
  for (const x of [85, 875])
    for (const y of [40, 552]) {
      disc(c, x, y, 4, '#00000044');
      disc(c, x, y, 2.5, '#ffffffaa');
    }

  // The open space below the tile bridge is visible through every fallen block.
  if (kind === 'tiles') {
    const voidSky = c.createLinearGradient(0, 44, 0, 556);
    voidSky.addColorStop(0, '#181734');
    voidSky.addColorStop(0.55, '#34244a');
    voidSky.addColorStop(1, '#503456');
    c.fillStyle = voidSky;
    c.fillRect(96, 44, 768, 512);
    const nebula = c.createRadialGradient(480, 300, 30, 480, 300, 420);
    nebula.addColorStop(0, '#9668cc24');
    nebula.addColorStop(1, 'transparent');
    c.fillStyle = nebula;
    c.fillRect(96, 44, 768, 512);
    for (let i = 0; i < 145; i++)
      disc(c, 98 + ((i * 179) % 762), 45 + ((i * i * 47) % 509), i % 7 === 0 ? 2 : 1, '#eccef49a');
    return;
  }

  c.save();
  c.beginPath();
  c.rect(96, 44, 768, 512);
  c.clip();
  const floor = c.createLinearGradient(0, 44, 0, 556);
  floor.addColorStop(0, kind === 'doors' ? '#674256' : '#265359');
  floor.addColorStop(1, kind === 'doors' ? '#362940' : '#143640');
  c.fillStyle = floor;
  c.fillRect(96, 44, 768, 512);

  if (kind === 'batteries') {
    for (let gx = 96; gx <= 864; gx += 64)
      line(
        c,
        [
          [gx, 44],
          [gx, 556],
        ],
        '#8ee8da0d',
        1,
      );
    for (let gy = 44; gy <= 556; gy += 64)
      line(
        c,
        [
          [96, gy],
          [864, gy],
        ],
        '#8ee8da0d',
        1,
      );
    for (let i = 0; i < 11; i++) {
      const x = 104 + i * 73;
      line(
        c,
        [
          [x, 44],
          [x, 180],
          [x + 26, 206],
          [x + 26, 392],
          [x, 418],
          [x, 556],
        ],
        '#62c2b03a',
        3,
      );
      disc(c, x + 26, 268, 6, '#81c2b255');
      disc(c, x + 26, 268, 2.5, '#b8fff366');
    }
    for (let i = 0; i < 28; i++) {
      const x = 98 + i * 28;
      line(
        c,
        [
          [x, 52],
          [x + 9, 44],
        ],
        '#ffd48385',
        4,
      );
    }
  } else {
    for (let i = -8; i < 18; i++) {
      const x = i * 90;
      line(
        c,
        [
          [x, 44],
          [x + 512, 556],
        ],
        '#dbb5a422',
        2,
      );
      line(
        c,
        [
          [x, 44],
          [x - 512, 556],
        ],
        '#dbb5a422',
        2,
      );
    }
    for (const x of [288, 480, 672]) {
      const spot = c.createLinearGradient(x, 44, x, 500);
      spot.addColorStop(0, '#ffd89e22');
      spot.addColorStop(1, 'transparent');
      c.fillStyle = spot;
      c.fillRect(x - 48, 44, 96, 460);
      panel(c, x - 38, 140, 76, 344, 4, '#9c536759');
      for (const edge of [-35, 35])
        line(
          c,
          [
            [x + edge, 140],
            [x + edge, 484],
          ],
          '#dbb38275',
          2,
        );
    }
  }
  c.restore();
}

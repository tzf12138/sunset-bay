// Solmar Bay: the city itself, generated once from a seed. Roads form a grid; the blocks
// between them hold buildings, a park, a beach and a harbour. Everything the simulation
// and the renderer need is here: the obstacles (buildings, containers, walls), the props
// (palms, lamps, benches), the named places the story uses, and the hidden packages.

import { BEACH_Y, CAR_COLORS, PALETTE, ROADS_H, ROADS_V, ROAD_W, WATER_Y, WORLD } from './config.js';
import { pick, range, rangeInt } from './random.js';

const BLOCK_MARGIN = 26;
/** The park block: columns/rows of the road grid that bound it (roads 900..1500, 1300..1800). */
const PARK = { x0: 900, y0: 1300, x1: 1500, y1: 1800 };
/** The harbour block: east of the last vertical road, above the 1300 road. */
const DOCKS = { x0: 3365, y0: 365, x1: 3580, y1: 1240 };

const ROOF_COLORS = ['#e8e0d0', '#d8cbb2', '#c9b8a4', '#b7c4c9', '#d9a08a', '#a8b89a', '#c4b49a'];
const WALL_COLORS = ['#8a7f8d', '#7d7468', '#96887a', '#6f7d8c', '#a08a7a', '#7a6f7d'];

function blockRects() {
  const rects = [];
  const xs = [60, ...ROADS_V, WORLD.width - 60];
  const ys = [60, ...ROADS_H, BEACH_Y - 40];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + ROAD_W / 2 + BLOCK_MARGIN;
      const x1 = xs[i + 1] - ROAD_W / 2 - BLOCK_MARGIN;
      const y0 = ys[j] + ROAD_W / 2 + BLOCK_MARGIN;
      const y1 = ys[j + 1] - ROAD_W / 2 - BLOCK_MARGIN;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      rects.push({ x0, y0, x1, y1, col: i, row: j });
    }
  }
  return rects;
}

function inPark(b) {
  return b.x0 >= PARK.x0 - 1 && b.x1 <= PARK.x1 + 1 && b.y0 >= PARK.y0 - 1 && b.y1 <= PARK.y1 + 1;
}
function inDocks(b) {
  return b.x0 >= DOCKS.x0 - 1 && b.y0 >= DOCKS.y0 - 1;
}

export function createCity(random) {
  const buildings = [];
  const palms = [];
  const lamps = [];
  const obstacles = [];
  const parkTrees = [];

  for (const b of blockRects()) {
    if (inPark(b)) {
      // Marina Park: lawn, pond, paths and trees, no buildings.
      for (let i = 0; i < 26; i += 1) {
        parkTrees.push({
          x: range(random, b.x0 + 20, b.x1 - 20),
          y: range(random, b.y0 + 20, b.y1 - 20),
          r: range(random, 12, 20),
        });
      }
      continue;
    }
    if (inDocks(b)) continue; // the harbour is built below, not as city blocks
    const downtown = b.x0 >= 1435 && b.x1 <= 2835 && b.y0 >= 735 && b.y1 <= 1835;
    const count = downtown ? rangeInt(random, 2, 3) : rangeInt(random, 1, 3);
    const bw = (b.x1 - b.x0) / count;
    for (let k = 0; k < count; k += 1) {
      const w = range(random, bw * 0.55, bw * 0.85);
      const h = range(random, 70, Math.min(150, (b.y1 - b.y0) * 0.8));
      const x = b.x0 + k * bw + range(random, 4, Math.max(5, bw - w - 4));
      const y = b.y0 + range(random, 6, Math.max(7, b.y1 - b.y0 - h - 6));
      const tall = downtown ? range(random, 26, 60) : range(random, 8, 22);
      const building = {
        x, y, w, h, tall,
        wall: pick(random, WALL_COLORS),
        roof: pick(random, ROOF_COLORS),
        downtown,
        ac: random() < 0.6,
        sign: downtown && random() < 0.4,
      };
      buildings.push(building);
      obstacles.push({ x, y, w, h });
    }
    // A palm or two on the block's corners.
    for (let k = 0; k < 2; k += 1) {
      palms.push({
        x: range(random, b.x0, b.x1),
        y: range(random, b.y0, b.y1),
        r: range(random, 9, 13),
      });
    }
  }

  // Street lamps along every road, every ~260 px.
  for (const x of ROADS_V) {
    for (let y = 120; y < BEACH_Y; y += 260) lamps.push({ x: x + ROAD_W / 2 + 8, y });
  }
  for (const y of ROADS_H) {
    for (let x = 120; x < WORLD.width - 60; x += 260) lamps.push({ x, y: y + ROAD_W / 2 + 8 });
  }
  // Palms along the beach promenade.
  for (let x = 140; x < WORLD.width - 60; x += 170) {
    palms.push({ x: x + range(random, -20, 20), y: BEACH_Y + 42 + range(random, -8, 8), r: range(random, 10, 14) });
  }

  // The harbour: container rows and two cranes, all obstacles.
  const containers = [];
  const contColors = ['#c25a3a', '#3a7fc2', '#5aa655', '#c2a13a', '#7a5ac2'];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (col === 0) continue; // a clear north-south corridor at the harbour's west edge
      if (random() < 0.18) continue;
      const c = {
        x: DOCKS.x0 + 12 + col * 44,
        y: DOCKS.y0 + 14 + row * 120,
        w: 36, h: 96,
        color: pick(random, contColors),
      };
      containers.push(c);
      obstacles.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    }
  }
  const cranes = [
    { x: DOCKS.x0 + 60, y: DOCKS.y0 + 480 },
    { x: DOCKS.x0 + 200, y: DOCKS.y0 + 480 },
  ];

  // Named places the story and the HUD use. Doors face the nearest road.
  const places = {
    safehouse: { name: "Dice's Apartment", x: 470, y: 470, doorX: 470, doorY: 560 },
    spray: { name: 'Lucky Respray', x: 2400, y: 2050, doorX: 2400, doorY: 1935 },
    bank: { name: 'Solmar National Bank', x: 1800, y: 1050, doorX: 1800, doorY: 1235 },
    hotel: { name: 'The Palms Hotel', x: 1200, y: 1050, doorX: 1200, doorY: 1235 },
    docks: { name: 'Port Solmar', x: 3470, y: 700, doorX: 3365, doorY: 700 },
    hospital: { name: 'St. Marina Hospital', x: 3000, y: 2050, doorX: 3000, doorY: 1935 },
    park: { name: 'Marina Park', x: 1200, y: 1550, doorX: 1200, doorY: 1365 },
    beach: { name: 'Sunset Beach', x: 1800, y: 2490, doorX: 1800, doorY: 2430 },
  };

  // Ten hidden packages stashed around the city, worth $100 each.
  const packageSpots = [
    [660, 640], [1080, 420], [1620, 660], [2280, 420], [2880, 640],
    [660, 1620], [1620, 1960], [2820, 1620], [3180, 1080], [3450, 1150],
  ];
  const packages = packageSpots.map(([x, y], i) => ({ id: i, x, y, taken: false }));

  // Parked cars along the roads (hand-placed, off the driving lanes).
  const parked = [];
  const parkedSpots = [
    [392, 210, 0], [788, 210, 0], [1392, 210, 0], [1992, 210, 0], [2592, 210, 0], [3192, 210, 0],
    [392, 712, 0], [992, 712, 0], [1592, 712, 0], [2192, 712, 0], [2792, 712, 0],
    [212, 420, Math.PI / 2], [212, 1020, Math.PI / 2], [212, 1520, Math.PI / 2], [212, 2120, Math.PI / 2],
    [812, 1520, Math.PI / 2], [1412, 2120, Math.PI / 2], [2012, 1020, Math.PI / 2], [2612, 420, Math.PI / 2],
    [3212, 1520, Math.PI / 2], [3212, 2120, Math.PI / 2],
  ];
  for (const [x, y, angle] of parkedSpots) {
    parked.push({
      x, y, angle,
      color: pick(random, CAR_COLORS),
      model: pick(random, ['sedan', 'sedan', 'hatch', 'van']),
      taxi: false,
    });
  }

  return {
    buildings, palms, lamps, parkTrees, obstacles, containers, cranes,
    places, packages, parked, park: PARK, docks: DOCKS,
  };
}

/** True when the point is on a road, the beach or the water (not a block). */
export function groundAt(x, y) {
  if (y >= WATER_Y) return 'water';
  if (y >= BEACH_Y) return 'sand';
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= ROAD_W / 2) return 'road';
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= ROAD_W / 2) return 'road';
  return 'block';
}

/** Push a circle out of every obstacle it overlaps; returns the corrected position. */
export function resolveCircle(x, y, radius, obstacles) {
  let nx = x;
  let ny = y;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const o of obstacles) {
      const cx = Math.max(o.x, Math.min(nx, o.x + o.w));
      const cy = Math.max(o.y, Math.min(ny, o.y + o.h));
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        ny = cy + (dy / d) * radius;
      } else {
        // Centre inside the obstacle: push out along the smallest penetration.
        const left = nx - o.x;
        const right = o.x + o.w - nx;
        const top = ny - o.y;
        const bottom = o.y + o.h - ny;
        const m = Math.min(left, right, top, bottom);
        if (m === left) nx = o.x - radius;
        else if (m === right) nx = o.x + o.w + radius;
        else if (m === top) ny = o.y - radius;
        else ny = o.y + o.h + radius;
      }
    }
  }
  return { x: nx, y: ny };
}

export { PALETTE };

// SUNSET BAY — an original open-world crime game (a tribute to the genre, 100% original:
// its own city, names, story, art and music; no Rockstar material of any kind).
// Every tuning number and colour in one place. The world is a fixed 3600x2700 city;
// the camera shows a 1280x720 window of it, so no rule depends on the screen size.

export const VIEW = { width: 1280, height: 720 };
/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;
export const WORLD = { width: 3600, height: 2700 };

/** Road centre-lines. Vertical roads run the full height, horizontal ones the full width. */
export const ROADS_V = [300, 900, 1500, 2100, 2700, 3300];
export const ROADS_H = [300, 800, 1300, 1800, 2300];
export const ROAD_W = 130;
export const LANE = 30; // lane offset from a road's centre-line
/** Sand starts here, water below it. The south edge is the beach and the bay. */
export const BEACH_Y = 2420;
export const WATER_Y = 2560;

export const PLAYER = {
  radius: 14,
  walk: 175,
  run: 290,
  health: 100,
  meleeDamage: 12,
  meleeRange: 34,
  meleeArc: 1.1,
  pistolDamage: 34,
  pistolRange: 520,
  magazine: 12,
};

export const CAR = {
  radius: 17,
  accel: 340,
  reverseAccel: 220,
  maxSpeed: 430,
  maxReverse: 150,
  brake: 520,
  steer: 2.6,
  grip: 3.2,
  damageMax: 100,
};

/** Wanted heat 0..100; stars are thresholds on it. */
export const WANTED = {
  thresholds: [1, 25, 45, 65, 85],
  steal: 12,
  hitPed: 10,
  killPed: 18,
  shoot: 2,
  killCop: 25,
  damageCop: 8,
  decayHidden: 1.4,
  decaySeen: 0.35,
  sprayCost: 200,
};

export const MISSION_REWARDS = [300, 500, 400, 800, 2500];
export const TAXI_FARE = 120;
export const PACKAGE_VALUE = 100;
export const HOSPITAL_FEE = 150;
export const BUSTED_FEE = 200;

export const SAVE_KEY = 'sunsetbay.save.v1';
export const BEST_KEY = 'sunsetbay.best.v1';

export const PALETTE = {
  backdrop: '#1c1430',
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  sidewalk: '#cbb28a',
  sidewalkEdge: '#b39a72',
  asphalt: '#3d414d',
  asphaltDark: '#343845',
  lane: '#e8d27a',
  sand: '#e8cf9a',
  water: '#2f7f9e',
  waterDeep: '#256b8a',
  buildingWall: '#8a7f8d',
  roof: '#e8e0d0',
  park: '#79a854',
  wood: '#8a6b4f',
  text: '#f5efe2',
  muted: '#cfc4ae',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4f8ff7',
  green: '#58c96b',
  orange: '#f28c38',
};

/** Car paint jobs (body, roof). */
export const CAR_COLORS = [
  ['#c23b2e', '#8f2a20'], ['#2e6fc2', '#1f4d8a'], ['#e8e4da', '#b9b3a4'],
  ['#3aa655', '#2a7a3e'], ['#e8a13a', '#b57a24'], ['#7a4fc2', '#573a8f'],
  ['#22242c', '#101116'], ['#c2c9d1', '#8f97a3'], ['#d1609a', '#9c3f74'],
  ['#4fb3c2', '#35808c'],
];
export const TAXI_COLORS = ['#f2c94c', '#d9a92c'];
/** Pedestrian shirt / skin pairs. */
export const PED_COLORS = [
  ['#e5534b', '#e8b98d'], ['#4f8ff7', '#c98d5f'], ['#58c96b', '#8d5a3b'],
  ['#f2c94c', '#e8b98d'], ['#9a5fd0', '#f0c8a0'], ['#e8e4da', '#6b4a2f'],
  ['#f28c38', '#c98d5f'], ['#3aa655', '#e8b98d'],
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

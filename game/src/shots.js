// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a small
// autopilot, so the frame is what the game really looks like and the same seed always
// gives the same frame. The four shots show the four things the game is about: the
// title over the city, driving through downtown, a three-star police chase, and the
// dock shootout.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Steer a car along a road lane: `axis` 'v' or 'h', `line` the road centre, `lane` the
 * lane offset, `dir` +1 / -1 along the road. Returns {left, right, up}.
 */
function lanePilot(car, axis, line, lane, dir) {
  const base = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const s = (axis === 'v' && dir > 0) || (axis === 'h' && dir > 0) ? 1 : -1;
  const error = axis === 'v' ? car.x - (line + lane) : car.y - (line + lane);
  const desired = base + s * error * 0.004;
  const diff = angleDiff(desired, car.angle);
  return { left: diff < -0.06, right: diff > 0.06, up: true, down: false };
}

function blankInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    enter: false, melee: false, shoot: false, reload: false, handbrake: false,
    aimX: 0, aimY: 0, aimActive: false,
  };
}

function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * Remove traffic cars inside a box around the shot's route so the autopilot is
 * never boxed in by crossing traffic at an intersection. Parked cars, the
 * player's car and police cars are untouched.
 */
function clearTrafficBox(state, x0, x1, y0, y1) {
  state.cars = state.cars.filter((c) => !c.traffic || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1);
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the best haul
 * to show, and an optional camera override for the title shot.
 */
export function stageShot(name, world) {
  const state = world.state;
  const city = state.city;

  if (name === 'start') {
    // Attract mode: traffic and pedestrians live their lives under a panning camera.
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, blankInput(), 'attract');
    return { screen: SCREEN_TITLE, best: 0, camera: { x: 1800, y: 1150, zoom: 0.82 } };
  }

  if (name === 'drive') {
    world.startFirstMission();
    // Put Dice in a car on the downtown strip (road y=1300), heading east through the city.
    const car = state.cars.find((c) => c.parked && Math.abs(c.x - 1392) < 5 && Math.abs(c.y - 210) < 5)
      || state.cars.find((c) => c.parked);
    const pl = state.player;
    car.x = 600;
    car.y = 1330;
    car.angle = 0;
    car.speed = 280;
    car.traffic = null;
    car.parked = false;
    car.player = true;
    pl.onFoot = false;
    pl.car = car;
    pl.x = car.x;
    pl.y = car.y;
    // Keep the strip clear so the drive reads as driving, not a traffic jam.
    clearTrafficBox(state, 500, 2900, 600, 2000);
    state.noTrafficSpawn = true;
    for (let i = 0; i < 3 / STEP; i += 1) {
      const input = blankInput();
      const pilot = lanePilot(car, 'h', 1300, 30, 1);
      input.up = pilot.up;
      input.left = pilot.left;
      input.right = pilot.right;
      world.step(STEP, input, 'play');
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'chase') {
    world.startMissionAt(2);
    // Dice in a sports car on the north strip (road y=800), heading east; three stars and the law behind him.
    const car = state.cars.find((c) => c.parked && c.model === 'sport')
      || state.cars.find((c) => c.parked);
    const pl = state.player;
    car.x = 600;
    car.y = 830;
    car.angle = 0;
    car.speed = 330;
    car.traffic = null;
    car.parked = false;
    car.player = true;
    car.model = 'sport';
    pl.onFoot = false;
    pl.car = car;
    pl.x = car.x;
    pl.y = car.y;
    world.api.givePistol();
    state.wantedHeat = 52;
    // Keep the strip clear of traffic so the chase keeps moving; the cops stay.
    clearTrafficBox(state, 500, 3200, 100, 1500);
    state.noTrafficSpawn = true;
    for (let i = 0; i < 3 / STEP; i += 1) {
      const input = blankInput();
      const pilot = lanePilot(car, 'h', 800, 30, 1);
      input.up = pilot.up;
      input.left = pilot.left;
      input.right = pilot.right;
      world.step(STEP, input, 'play');
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'mission') {
    world.startMissionAt(3);
    const pl = state.player;
    pl.x = 3400;
    pl.y = 780;
    pl.onFoot = true;
    pl.car = null;
    // Frame the docks with city on the left: shift the camera west of the player.
    state.camOffX = -170;
    world.api.givePistol();
    state.mission.stage = 1;
    world.api.spawnEnemies([
      { x: 3400, y: 490 }, { x: 3520, y: 610 },
      { x: 3420, y: 730 }, { x: 3540, y: 900 },
    ]);
    for (let i = 0; i < 4.5 / STEP; i += 1) {
      const input = blankInput();
      const enemy = nearestEnemy(state);
      if (enemy) {
        const d = Math.hypot(enemy.x - pl.x, enemy.y - pl.y);
        const mx = (enemy.x - pl.x) / (d || 1);
        const my = (enemy.y - pl.y) / (d || 1);
        // Walk at the enemy (the collision slides Dice around the containers).
        input.right = mx > 0.3;
        input.left = mx < -0.3;
        input.down = my > 0.3;
        input.up = my < -0.3;
        input.aimX = enemy.x;
        input.aimY = enemy.y;
        input.aimActive = true;
        pl.aimAngle = Math.atan2(enemy.y - pl.y, enemy.x - pl.x);
        // Only pull the trigger on a clear lane, so the tracers fly at the Vultures.
        if (world.hasLineOfSight(pl.x, pl.y, enemy.x, enemy.y) && i % 21 === 0) input.shoot = true;
      }
      world.step(STEP, input, 'play');
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // Unknown name: the title.
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, blankInput(), 'attract');
  return { screen: SCREEN_TITLE, best: 0, camera: { x: 1800, y: 1150, zoom: 0.82 } };
}

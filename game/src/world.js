// The simulation: the player on foot and in cars, traffic, pedestrians, police, the
// wanted system, combat and the mission hooks — no drawing and no browser in it. step()
// advances one fixed step from an input snapshot and queues events (sounds, banners)
// for the caller to consume. Nothing here knows about screens or the DOM.

import {
  BEACH_Y, CAR, CAR_COLORS, LANE, MISSION_REWARDS, PACKAGE_VALUE, PED_COLORS, PLAYER,
  ROADS_H, ROADS_V, ROAD_W, TAXI_FARE, VIEW, WANTED, WATER_Y, WORLD,
} from './config.js';
import { createCity, groundAt, resolveCircle } from './city.js';
import { createRandom, pick, range, rangeInt } from './random.js';
import { startMission, updateMission } from './missions.js';

const TRAFFIC_COUNT = 14;
const PED_COUNT = 22;
const TAU = Math.PI * 2;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Ray vs circle: the smallest t in [0, maxDist] where the ray hits, or Infinity. */
function rayCircle(ox, oy, dx, dy, cx, cy, r, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const tca = lx * dx + ly * dy;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly - tca * tca;
  if (d2 > r * r) return Infinity;
  const t = tca - Math.sqrt(Math.max(0, r * r - d2));
  return t <= maxDist ? t : Infinity;
}
/** Ray vs axis-aligned box: the smallest t in [0, maxDist], or Infinity. */
function rayBox(ox, oy, dx, dy, b, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  for (const [o, d, lo, hi] of [[ox, dx, b.x, b.x + b.w], [oy, dy, b.y, b.y + b.h]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const events = [];

  const state = {
    seed,
    city,
    time: 0,
    clockMin: 18 * 60 + 47,
    cash: 150,
    health: PLAYER.health,
    armor: 0,
    wantedHeat: 0,
    wantedStars: 0,
    lastCrimeT: -99,
    player: {
      x: city.places.safehouse.doorX, y: city.places.safehouse.doorY,
      angle: -Math.PI / 2, speed: 0, onFoot: true, car: null,
      weapon: 'fists', ammo: 0, reserveAmmo: 0, reloadT: 0, meleeT: 0,
      hurtT: 0, walkPhase: 0, aimAngle: -Math.PI / 2,
    },
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    enemiesAlive: 0,
    particles: [],
    tracers: [],
    floats: [],
    mission: null,
    missionTarget: null,
    objective: 'Welcome to Solmar Bay',
    dialogue: [],
    banner: null,
    taxi: null,
    taxiSpawnT: 30,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, packages: 0, shotsFired: 0 },
    camera: { x: city.places.safehouse.doorX, y: city.places.safehouse.doorY, zoom: 1.15 },
    copSpawnT: 0,
    missionNextT: 0,
    storyDone: false,
    passenger: null,
    attract: false,
  };

  let carId = 1;

  function addHeat(n) {
    state.wantedHeat = clamp(state.wantedHeat + n, 0, 100);
    state.lastCrimeT = state.time;
  }

  function addFloat(x, y, text, color) {
    state.floats.push({ x, y, text, color, t: 0 });
    if (state.floats.length > 24) state.floats.shift();
  }

  function addParticles(x, y, n, color, speed, life) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * TAU;
      const s = range(random, speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, life: range(random, life * 0.5, life), color, size: range(random, 2, 4.5),
      });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  // ---------------------------------------------------------- spawning

  function makeCar(x, y, angle, opts) {
    const car = {
      id: carId++, x, y, angle, speed: 0,
      model: opts.model || 'sedan',
      color: opts.color || pick(random, CAR_COLORS),
      taxi: !!opts.taxi, cop: !!opts.cop,
      parked: !!opts.parked, player: false,
      damage: 0, traffic: opts.traffic || null,
      wrecked: false, sirenPhase: random() * TAU,
    };
    state.cars.push(car);
    return car;
  }

  function randomRoadPoint(nearX, nearY, minD, maxD) {
    for (let tries = 0; tries < 12; tries += 1) {
      const horizontal = random() < 0.5;
      const road = horizontal ? pick(random, ROADS_H) : pick(random, ROADS_V);
      const along = range(random, 200, (horizontal ? WORLD.width : WORLD.height) - 200);
      const x = horizontal ? along : road;
      const y = horizontal ? road : along;
      const d = Math.hypot(x - nearX, y - nearY);
      if (d >= minD && d <= maxD) return { x, y, horizontal, road };
    }
    return { x: 900, y: 800, horizontal: true, road: 800 };
  }

  function spawnTrafficCar(nearPlayer) {
    const p = state.player;
    const spot = nearPlayer
      ? randomRoadPoint(p.x, p.y, 500, 1100)
      : randomRoadPoint(1800, 1350, 0, 4000);
    const dir = random() < 0.5 ? 1 : -1;
    const lane = spot.horizontal ? LANE * dir : -LANE * dir;
    const car = makeCar(
      spot.horizontal ? spot.x : spot.road + lane,
      spot.horizontal ? spot.road + lane : spot.x,
      spot.horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      {
        model: pick(random, ['sedan', 'sedan', 'hatch', 'van', 'sport']),
        taxi: random() < 0.12,
        traffic: {
          axis: spot.horizontal ? 'h' : 'v',
          road: spot.road, along: spot.x, dir,
          speed: range(random, 120, 185),
        },
      },
    );
    car.speed = car.traffic.speed;
    return car;
  }

  function spawnPed(nearPlayer) {
    const p = state.player;
    const spot = nearPlayer
      ? randomRoadPoint(p.x, p.y, 200, 700)
      : randomRoadPoint(1800, 1350, 0, 4000);
    const side = random() < 0.5 ? 1 : -1;
    const off = ROAD_W / 2 + 16;
    const ped = {
      x: spot.horizontal ? spot.x : spot.road + side * off,
      y: spot.horizontal ? spot.road + side * off : spot.x,
      angle: random() * TAU,
      speed: range(random, 55, 85),
      state: 'walk', stateT: 0,
      color: pick(random, PED_COLORS),
      axis: spot.horizontal ? 'h' : 'v',
      road: spot.road, side, dir: random() < 0.5 ? 1 : -1,
      taxi: false, down: false, dead: false, walkPhase: random() * TAU,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnCopCar() {
    const p = state.player;
    const spot = randomRoadPoint(p.x, p.y, 420, 750);
    const car = makeCar(spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), {
      model: 'cop', color: ['#e8e4da', '#22242c'], cop: true,
    });
    car.speed = 200;
    return car;
  }

  function spawnFootCop() {
    const p = state.player;
    const a = random() * TAU;
    const cop = {
      x: p.x + Math.cos(a) * range(random, 260, 420),
      y: p.y + Math.sin(a) * range(random, 260, 420),
      angle: 0, speed: 215, bustT: 0, walkPhase: random() * TAU,
    };
    const fixed = resolveCircle(cop.x, cop.y, 14, city.obstacles);
    cop.x = fixed.x;
    cop.y = fixed.y;
    state.cops.push(cop);
    return cop;
  }

  // Parked cars from the city plan join the world as stealable cars.
  for (const pc of city.parked) {
    makeCar(pc.x, pc.y, pc.angle, { model: pc.model, color: pc.color, parked: true, taxi: pc.taxi });
  }
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(false);
  for (let i = 0; i < PED_COUNT; i += 1) spawnPed(false);

  // ---------------------------------------------------------- mission API

  const api = {
    say(lines) {
      state.dialogue.push({ lines, t: 0 });
      if (state.dialogue.length > 3) state.dialogue.shift();
    },
    setTarget(x, y, label) {
      state.missionTarget = x || y ? { x, y, label } : null;
    },
    setObjective(text) {
      state.objective = text;
    },
    complete(reward, lines) {
      state.cash += reward;
      state.stats.missionsDone += 1;
      state.mission.state = 'done';
      state.missionNextT = 3.2;
      state.banner = { title: 'MISSION COMPLETE', sub: `+$${reward}`, t: 0 };
      events.push({ type: 'cash' });
      if (lines) api.say(lines);
      if (state.mission.index === 4) state.storyDone = true;
    },
    fail(reason) {
      state.mission.state = 'failed';
      state.banner = { title: 'MISSION FAILED', sub: reason, t: 0 };
      events.push({ type: 'fail' });
    },
    spawnEnemies(list) {
      for (const e of list) {
        state.enemies.push({
          x: e.x, y: e.y, angle: 0, health: 60, alive: true,
          shootT: range(random, 0.5, 1.5), walkPhase: random() * TAU,
        });
      }
      state.enemiesAlive = list.length;
    },
    setWanted(heat) {
      state.wantedHeat = heat;
      state.lastCrimeT = state.time;
    },
    givePistol() {
      const pl = state.player;
      pl.weapon = 'pistol';
      pl.ammo = PLAYER.magazine;
      pl.reserveAmmo = 48;
    },
  };

  function startNextMission() {
    const next = (state.mission ? state.mission.index : -1) + 1;
    if (next <= 4) startMission(state, next, api);
  }

  function resetMission() {
    state.enemies = [];
    state.enemiesAlive = 0;
    state.passenger = null;
    state.wantedHeat = 0;
    state.cops = [];
    for (const c of state.cars) if (c.cop) c.remove = true;
    state.cars = state.cars.filter((c) => !c.remove);
    if (state.mission) startMission(state, state.mission.index, api);
  }

  /** True when no building or container blocks the segment between two points. */
  function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const ux = dx / len;
    const uy = dy / len;
    for (const b of city.obstacles) {
      if (rayBox(x1, y1, ux, uy, b, len) < len) return false;
    }
    return true;
  }

  // ---------------------------------------------------------- combat

  function fireBullet(fromX, fromY, angle, shooter) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxDist = PLAYER.pistolRange;
    let bestT = maxDist;
    let hitKind = null;
    let hitObj = null;

    const testCircle = (x, y, r, kind, obj) => {
      const t = rayCircle(fromX, fromY, dx, dy, x, y, r, maxDist);
      if (t < bestT) { bestT = t; hitKind = kind; hitObj = obj; }
    };
    for (const e of state.enemies) if (e.alive) testCircle(e.x, e.y, 15, 'enemy', e);
    for (const c of state.cops) testCircle(c.x, c.y, 15, 'cop', c);
    for (const p of state.peds) if (!p.down) testCircle(p.x, p.y, 13, 'ped', p);
    for (const car of state.cars) {
      if (car === shooter) continue;
      testCircle(car.x, car.y, CAR.radius, 'car', car);
    }
    for (const b of city.obstacles) {
      const t = rayBox(fromX, fromY, dx, dy, b, maxDist);
      if (t < bestT) { bestT = t; hitKind = 'wall'; hitObj = null; }
    }
    const hx = fromX + dx * bestT;
    const hy = fromY + dy * bestT;
    state.tracers.push({ x1: fromX, y1: fromY, x2: hx, y2: hy, t: 0 });
    state._gunshotT = state.time;
    addParticles(hx, hy, hitKind === 'wall' ? 6 : 3, hitKind === 'wall' ? '#c9b18c' : '#e5534b', 120, 0.4);
    events.push({ type: 'shot' });
    state.stats.shotsFired += 1;

    if (hitKind === 'enemy') {
      hitObj.health -= PLAYER.pistolDamage;
      if (hitObj.health <= 0 && hitObj.alive) {
        hitObj.alive = false;
        state.enemiesAlive -= 1;
        state.stats.kills += 1;
        addFloat(hitObj.x, hitObj.y - 20, 'DOWN', '#e5534b');
        addHeat(6);
      }
    } else if (hitKind === 'cop') {
      const idx = state.cops.indexOf(hitObj);
      if (idx >= 0) state.cops.splice(idx, 1);
      state.stats.kills += 1;
      addHeat(WANTED.killCop);
      addFloat(hitObj.x, hitObj.y - 20, 'COP DOWN', '#e5534b');
    } else if (hitKind === 'ped') {
      hitObj.down = true;
      hitObj.state = 'down';
      hitObj.stateT = 8;
      state.stats.kills += 1;
      addHeat(WANTED.killPed);
    } else if (hitKind === 'car') {
      hitObj.damage = Math.min(CAR.damageMax, hitObj.damage + 12);
      if (hitObj.cop) addHeat(WANTED.damageCop);
      if (hitObj.damage >= CAR.damageMax) hitObj.wrecked = true;
    }
    return hitKind;
  }

  function meleeHit() {
    const pl = state.player;
    const rangeR = PLAYER.meleeRange;
    let hitAny = false;
    const tryHit = (x, y, dmg, knock) => {
      const d = Math.hypot(x - pl.x, y - pl.y);
      if (d > rangeR + 14) return false;
      const a = Math.atan2(y - pl.y, x - pl.x);
      let diff = Math.abs(a - pl.angle);
      if (diff > Math.PI) diff = TAU - diff;
      if (diff > PLAYER.meleeArc) return false;
      return { d, a, dmg, knock };
    };
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const h = tryHit(e.x, e.y, PLAYER.meleeDamage, 120);
      if (h) {
        e.health -= h.dmg;
        e.x += Math.cos(h.a) * 14;
        e.y += Math.sin(h.a) * 14;
        if (e.health <= 0) { e.alive = false; state.enemiesAlive -= 1; state.stats.kills += 1; }
        hitAny = true;
      }
    }
    for (const p of state.peds) {
      if (p.down) continue;
      const h = tryHit(p.x, p.y, PLAYER.meleeDamage, 160);
      if (h) {
        p.down = true; p.state = 'down'; p.stateT = 6;
        addHeat(WANTED.hitPed);
        hitAny = true;
      }
    }
    if (hitAny) events.push({ type: 'punch' });
  }

  // ---------------------------------------------------------- player

  function nearestCar(x, y, maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const car of state.cars) {
      if (car.cop) continue;
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const pl = state.player;
    pl.onFoot = false;
    pl.car = car;
    car.player = true;
    car.parked = false;
    if (car.traffic) {
      // Yank the driver out of a moving car.
      car.traffic = null;
      const driver = spawnPed(false);
      driver.x = car.x + 30;
      driver.y = car.y + 30;
      driver.state = 'flee';
      driver.stateT = 3;
      addHeat(WANTED.steal);
      addFloat(car.x, car.y - 24, 'CARJACKED!', '#f2c94c');
    } else {
      addHeat(6);
    }
    state.stats.carsStolen += 1;
    events.push({ type: 'steal' });
  }

  function exitCar() {
    const pl = state.player;
    const car = pl.car;
    if (!car) return;
    car.player = false;
    car.parked = true;
    car.speed = 0;
    const side = { x: pl.x, y: pl.y };
    const a = car.angle + Math.PI / 2;
    side.x = car.x + Math.cos(a) * 30;
    side.y = car.y + Math.sin(a) * 30;
    const fixed = resolveCircle(side.x, side.y, PLAYER.radius, city.obstacles);
    pl.x = fixed.x;
    pl.y = fixed.y;
    pl.angle = car.angle;
    pl.onFoot = true;
    pl.car = null;
  }

  function hurtPlayer(dmg) {
    const pl = state.player;
    if (pl.hurtT > 0) return;
    let rest = dmg;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.6);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.health -= rest;
    pl.hurtT = 0.5;
    addParticles(pl.x, pl.y, 6, '#e5534b', 140, 0.4);
    if (state.health <= 0) {
      state.health = 0;
      events.push({ type: 'wasted' });
    }
  }

  function stepPlayer(dt, input) {
    const pl = state.player;
    if (pl.reloadT > 0) pl.reloadT -= dt;
    if (pl.meleeT > 0) pl.meleeT -= dt;
    if (pl.hurtT > 0) pl.hurtT -= dt;

    if (pl.onFoot) {
      const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const moving = mx !== 0 || my !== 0;
      const speed = input.run ? PLAYER.run : PLAYER.walk;
      if (moving) {
        const len = Math.hypot(mx, my);
        const nx = (mx / len) * speed * dt;
        const ny = (my / len) * speed * dt;
        pl.x += nx;
        pl.y += ny;
        pl.walkPhase += dt * (input.run ? 13 : 9);
        if (pl.weapon === 'pistol' && input.aimActive) pl.angle = pl.aimAngle;
        else pl.angle = Math.atan2(my, mx);
      }
      pl.x = clamp(pl.x, 20, WORLD.width - 20);
      pl.y = clamp(pl.y, 20, WORLD.height - 20);
      if (pl.y > WATER_Y - 16) pl.y = WATER_Y - 16;
      const fixed = resolveCircle(pl.x, pl.y, PLAYER.radius, city.obstacles);
      pl.x = fixed.x;
      pl.y = fixed.y;

      if (input.enter) {
        const car = nearestCar(pl.x, pl.y, 52);
        if (car && (car.traffic ? Math.abs(car.speed) < 80 : true)) enterCar(car);
      }
      if (input.melee && pl.meleeT <= 0) {
        pl.meleeT = 0.45;
        meleeHit();
      }
      if (input.shoot && pl.weapon === 'pistol' && pl.reloadT <= 0) {
        if (pl.ammo > 0) {
          pl.ammo -= 1;
          fireBullet(pl.x, pl.y, pl.aimAngle, null);
          addHeat(WANTED.shoot);
        } else if (pl.reserveAmmo > 0) {
          pl.reloadT = 1.1;
          pl.ammo = 0;
        }
      }
      if (input.reload && pl.weapon === 'pistol' && pl.ammo < PLAYER.magazine && pl.reserveAmmo > 0 && pl.reloadT <= 0) {
        pl.reloadT = 1.1;
      }
      if (pl.reloadT <= 0 && pl._reloading) {
        pl._reloading = false;
        const take = Math.min(PLAYER.magazine, pl.reserveAmmo);
        pl.ammo = take;
        pl.reserveAmmo -= take;
      }
      if (pl.reloadT > 0) pl._reloading = true;
    } else {
      // Driving.
      const car = pl.car;
      if (!car) { pl.onFoot = true; return; }
      const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (input.up) {
        if (car.speed < 0) car.speed += CAR.brake * dt;
        else car.speed += CAR.accel * dt;
      } else if (input.down) {
        if (car.speed > 5) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.reverseAccel * dt;
      } else {
        car.speed -= car.speed * 0.55 * dt;
      }
      if (input.handbrake) {
        car.speed -= car.speed * 2.2 * dt;
        if (Math.abs(car.speed) > 120 && Math.random() < 0.5) {
          addParticles(car.x, car.y, 1, '#8b93a3', 30, 0.5);
        }
      }
      car.speed = clamp(car.speed, -CAR.maxReverse, car.wrecked ? 120 : CAR.maxSpeed);
      if (Math.abs(car.speed) > 2) {
        const steerAmount = CAR.steer * clamp(Math.abs(car.speed) / 220, 0.25, 1) * (input.handbrake ? 1.5 : 1);
        car.angle += steerInput * steerAmount * dt * Math.sign(car.speed);
      }
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const fixed = resolveCircle(nx, ny, CAR.radius, city.obstacles);
      if (fixed.x !== nx || fixed.y !== ny) {
        if (Math.abs(car.speed) > 170) {
          car.damage = Math.min(CAR.damageMax, car.damage + (Math.abs(car.speed) - 170) / 12);
          addParticles(car.x, car.y, 8, '#f2c94c', 160, 0.4);
          events.push({ type: 'crash' });
        }
        car.speed *= 0.45;
        if (car.damage >= CAR.damageMax) car.wrecked = true;
      }
      car.x = clamp(fixed.x, 20, WORLD.width - 20);
      car.y = clamp(fixed.y, 20, WORLD.height - 20);
      if (car.y > WATER_Y - 18) { car.y = WATER_Y - 18; car.speed *= 0.4; }
      pl.x = car.x;
      pl.y = car.y;
      pl.angle = car.angle;
      if (input.enter) {
        // E at the respray is a respray, not getting out (stepPlaces handles it).
        const places = city.places;
        const nearSpray = Math.hypot(pl.x - places.spray.doorX, pl.y - places.spray.doorY) < 90
          && Math.abs(car.speed) < 30;
        if (!nearSpray) exitCar();
      }
    }
  }

  // ---------------------------------------------------------- traffic

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (!car.traffic || car.player) continue;
      const t = car.traffic;
      // Slow down for a car ahead on the same road.
      let target = t.speed;
      for (const other of state.cars) {
        if (other === car || !other.traffic) continue;
        if (other.traffic.axis !== t.axis || other.traffic.road !== t.road || other.traffic.dir !== t.dir) continue;
        const ahead = (other.traffic.along - t.along) * t.dir;
        if (ahead > 0 && ahead < 90) { target = Math.min(target, 40); break; }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      t.along += t.dir * car.speed * dt;
      // Turn at an intersection, sometimes (with a cooldown so it cannot flip-flop).
      if (t.cool === undefined) t.cool = 0;
      t.cool -= dt;
      const cross = t.axis === 'h' ? ROADS_V : ROADS_H;
      if (t.cool <= 0) {
        for (const c of cross) {
          if (Math.abs(t.along - c) < car.speed * dt * 0.5 + 2 && random() < 0.3) {
            const newAxis = t.axis === 'h' ? 'v' : 'h';
            const newDir = random() < 0.5 ? 1 : -1;
            const oldRoad = t.road;
            t.axis = newAxis;
            t.road = c;
            t.along = oldRoad; // position along the new road is where we already are
            t.dir = newDir;
            t.cool = 1.5;
            break;
          }
        }
      }
      const limit = t.axis === 'h' ? WORLD.width - 120 : BEACH_Y - 60;
      if (t.along < 140 || t.along > limit) {
        t.dir *= -1;
        t.along = clamp(t.along, 140, limit);
      }
      const lane = t.axis === 'h' ? LANE * t.dir : -LANE * t.dir;
      car.x = t.axis === 'h' ? t.along : t.road + lane;
      car.y = t.axis === 'h' ? t.road + lane : t.along;
      car.angle = t.axis === 'h' ? (t.dir > 0 ? 0 : Math.PI) : (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    // Recycle traffic far from the player (paused for staged shots so no car
    // respawns onto the shot's route).
    if (!state.noTrafficSpawn) {
      const p = state.player;
      const far = [];
      for (const car of state.cars) {
        if (!car.traffic || car.player) continue;
        if (dist2(car.x, car.y, p.x, p.y) > 1400 * 1400) far.push(car);
      }
      for (const car of far) {
        const idx = state.cars.indexOf(car);
        if (idx >= 0) state.cars.splice(idx, 1);
        spawnTrafficCar(true);
      }
    }
  }

  function stepCarCollisions(dt) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.traffic && b.traffic) continue; // traffic keeps its lanes
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = CAR.radius * 2 - 4;
        if (d2 >= min * min || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        if (a.player || b.player) {
          const other = a.player ? b : a;
          const mine = a.player ? a : b;
          // A crash only counts once per second, however long the cars grind together.
          if (state.time - (mine._collideT || -99) > 1.0) {
            mine._collideT = state.time;
            if (other.cop) addHeat(WANTED.damageCop);
            if (Math.abs(mine.speed) > 140) {
              mine.damage = Math.min(CAR.damageMax, mine.damage + 6);
              addParticles(mine.x, mine.y, 6, '#f2c94c', 140, 0.4);
            }
          }
          mine.speed *= 0.5;
          other.speed *= 0.5;
        }
      }
    }
  }

  // ---------------------------------------------------------- pedestrians

  function stepPeds(dt) {
    const pl = state.player;
    for (const ped of state.peds) {
      ped.walkPhase += dt * 8;
      if (ped.state === 'down') {
        ped.stateT -= dt;
        if (ped.stateT <= 0 && !ped.dead) {
          ped.down = false;
          ped.state = 'flee';
          ped.stateT = 2.5;
        }
        continue;
      }
      if (ped.state === 'flee') {
        ped.stateT -= dt;
        const a = Math.atan2(ped.y - pl.y, ped.x - pl.x);
        ped.x += Math.cos(a) * 250 * dt;
        ped.y += Math.sin(a) * 250 * dt;
        ped.angle = a;
        const fixed = resolveCircle(ped.x, ped.y, 12, city.obstacles);
        ped.x = clamp(fixed.x, 20, WORLD.width - 20);
        ped.y = clamp(fixed.y, 20, Math.min(WORLD.height - 20, WATER_Y - 16));
        if (ped.stateT <= 0) ped.state = 'walk';
        continue;
      }
      // Walking the sidewalk: keep to the line, turn at intersections sometimes.
      const speed = ped.speed;
      if (ped.axis === 'h') {
        ped.x += ped.dir * speed * dt;
        ped.y = ped.road + ped.side * (ROAD_W / 2 + 16);
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
        if (random() < dt * 0.12) {
          const c = pick(random, ROADS_V);
          if (Math.abs(ped.x - c) < 240) {
            ped.axis = 'v';
            ped.road = c;
            ped.dir = random() < 0.5 ? 1 : -1;
          }
        }
        if (ped.x < 120 || ped.x > WORLD.width - 120) ped.dir *= -1;
      } else {
        ped.y += ped.dir * speed * dt;
        ped.x = ped.road + ped.side * (ROAD_W / 2 + 16);
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (random() < dt * 0.12) {
          const c = pick(random, ROADS_H);
          if (Math.abs(ped.y - c) < 240) {
            ped.axis = 'h';
            ped.road = c;
            ped.dir = random() < 0.5 ? 1 : -1;
          }
        }
        if (ped.y < 120 || ped.y > BEACH_Y - 40) ped.dir *= -1;
      }
      // Flee a speeding car or a gunshot nearby.
      const car = pl.car;
      const threatX = car ? car.x : pl.x;
      const threatY = car ? car.y : pl.y;
      const threatSpeed = car ? Math.abs(car.speed) : 0;
      const d = Math.hypot(ped.x - threatX, ped.y - threatY);
      if ((!pl.onFoot && threatSpeed > 200 && d < 130) || (state._gunshotT !== undefined && state.time - state._gunshotT < 0.4 && d < 320)) {
        ped.state = 'flee';
        ped.stateT = 2;
      }
      // Run over by the player's car.
      if (car && Math.abs(car.speed) > 60 && d < CAR.radius + 12) {
        if (Math.abs(car.speed) > 220) {
          ped.down = true;
          ped.dead = true;
          ped.state = 'down';
          ped.stateT = 8;
          state.stats.kills += 1;
          addHeat(WANTED.killPed);
          addFloat(ped.x, ped.y - 20, 'HIT!', '#e5534b');
        } else {
          ped.state = 'flee';
          ped.stateT = 2.5;
          addHeat(WANTED.hitPed);
        }
        car.speed *= 0.82;
      }
    }
    // Keep the crowd topped up near the player.
    if (state.peds.length < PED_COUNT && random() < dt * 1.5) spawnPed(true);
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.down && ped.dead && ped.stateT <= 0) state.peds.splice(i, 1);
      else if (dist2(ped.x, ped.y, pl.x, pl.y) > 1600 * 1600) state.peds.splice(i, 1);
    }
  }

  // ---------------------------------------------------------- police

  function stepPolice(dt) {
    const pl = state.player;
    const stars = state.wantedStars;
    // Desired force scales with stars.
    const wantCopCars = stars >= 2 ? Math.min(1 + stars, 5) : 0;
    const wantFootCops = stars === 1 ? 2 : stars >= 2 ? 1 : 0;
    state.copSpawnT -= dt;
    if (stars > 0 && state.copSpawnT <= 0) {
      state.copSpawnT = 1.6;
      const copCars = state.cars.filter((c) => c.cop).length;
      if (copCars < wantCopCars) spawnCopCar();
      else if (state.cops.length < wantFootCops) spawnFootCop();
    }
    // Cop cars chase the player.
    for (const car of state.cars) {
      if (!car.cop) continue;
      if (stars === 0) {
        // Heat off: drive away and despawn at range.
        car.angle += 0.4 * dt;
        car.speed = 200;
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        const fixed = resolveCircle(nx, ny, CAR.radius, city.obstacles);
        car.x = fixed.x;
        car.y = fixed.y;
        if (dist2(car.x, car.y, pl.x, pl.y) > 900 * 900) car.remove = true;
        continue;
      }
      const targetA = Math.atan2(pl.y - car.y, pl.x - car.x);
      car.angle = angleLerp(car.angle, targetA, Math.min(1, dt * 2.2));
      car.speed = Math.min(car.speed + 260 * dt, 380 + stars * 22);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const fixed = resolveCircle(nx, ny, CAR.radius, city.obstacles);
      if (fixed.x !== nx || fixed.y !== ny) car.speed *= 0.6;
      car.x = clamp(fixed.x, 20, WORLD.width - 20);
      car.y = clamp(fixed.y, 20, Math.min(WORLD.height - 20, WATER_Y - 18));
      car.sirenPhase += dt * 6;
      // Ram the player's car.
      if (pl.car && dist2(car.x, car.y, pl.car.x, pl.car.y) < (CAR.radius * 2) * (CAR.radius * 2)) {
        pl.car.damage = Math.min(CAR.damageMax, pl.car.damage + 4 * dt * 10);
        pl.car.speed *= 0.96;
        if (pl.car.damage >= CAR.damageMax) pl.car.wrecked = true;
      }
      // Bust a slow player in a car.
      if (pl.car && Math.abs(pl.car.speed) < 12) {
        car.bustT = (car.bustT || 0) + dt;
        if (car.bustT > 2.5) {
          events.push({ type: 'busted' });
          car.bustT = -5; // cooldown so the event fires once per bust
        }
      } else car.bustT = 0;
    }
    state.cars = state.cars.filter((c) => !c.remove);
    // Foot cops chase the player on foot.
    for (const cop of state.cops) {
      cop.walkPhase += dt * 10;
      const d = Math.hypot(pl.x - cop.x, pl.y - cop.y);
      if (stars === 0) {
        if (d > 700) cop.remove = true;
        continue;
      }
      cop.angle = Math.atan2(pl.y - cop.y, pl.x - cop.x);
      const sp = pl.onFoot ? 215 : 150;
      cop.x += Math.cos(cop.angle) * sp * dt;
      cop.y += Math.sin(cop.angle) * sp * dt;
      const fixed = resolveCircle(cop.x, cop.y, 13, city.obstacles);
      cop.x = fixed.x;
      cop.y = fixed.y;
      if (pl.onFoot && d < 30) {
        cop.bustT += dt;
        if (cop.bustT > 1.5) {
          events.push({ type: 'busted' });
          cop.bustT = -5; // cooldown so the event fires once per bust
        }
      } else cop.bustT = 0;
    }
    state.cops = state.cops.filter((c) => !c.remove);
  }

  // ---------------------------------------------------------- enemies

  function stepEnemies(dt) {
    const pl = state.player;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.walkPhase += dt * 8;
      const d = Math.hypot(pl.x - e.x, pl.y - e.y);
      e.angle = Math.atan2(pl.y - e.y, pl.x - e.x);
      if (d > 320 || !hasLineOfSight(e.x, e.y, pl.x, pl.y)) {
        // Too far, or a container is in the way: close in for a clear shot.
        e.x += Math.cos(e.angle) * 120 * dt;
        e.y += Math.sin(e.angle) * 120 * dt;
        const fixed = resolveCircle(e.x, e.y, 13, city.obstacles);
        e.x = fixed.x;
        e.y = fixed.y;
      } else {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = range(random, 1.1, 1.9);
          const hitChance = d < 200 ? 0.35 : 0.18;
          const a = e.angle + range(random, -0.14, 0.14);
          state.tracers.push({
            x1: e.x, y1: e.y,
            x2: e.x + Math.cos(a) * 320, y2: e.y + Math.sin(a) * 320, t: 0,
          });
          events.push({ type: 'enemyShot' });
          if (random() < hitChance) {
            if (pl.onFoot) hurtPlayer(rangeInt(random, 5, 10));
            else if (pl.car) {
              pl.car.damage = Math.min(CAR.damageMax, pl.car.damage + 5);
              if (pl.car.damage >= CAR.damageMax) pl.car.wrecked = true;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------- wanted

  function stepWanted(dt) {
    const thresholds = WANTED.thresholds;
    let stars = 0;
    for (let i = 0; i < thresholds.length; i += 1) {
      if (state.wantedHeat >= thresholds[i]) stars = i + 1;
    }
    state.wantedStars = stars;
    const nearCop = state.cops.some((c) => dist2(c.x, c.y, state.player.x, state.player.y) < 550 * 550)
      || state.cars.some((c) => c.cop && dist2(c.x, c.y, state.player.x, state.player.y) < 550 * 550);
    const quiet = state.time - state.lastCrimeT > 5;
    const decay = !nearCop && quiet ? WANTED.decayHidden : WANTED.decaySeen;
    if (state.wantedHeat > 0) state.wantedHeat = Math.max(0, state.wantedHeat - decay * dt);
  }

  // ---------------------------------------------------------- places

  function stepPlaces(dt, input) {
    const pl = state.player;
    const places = city.places;
    const near = (x, y, r) => Math.hypot(pl.x - x, pl.y - y) < r;
    state.nearSpray = !pl.onFoot && near(places.spray.doorX, places.spray.doorY, 90) && Math.abs(pl.car.speed) < 30;
    state.nearSave = pl.onFoot && near(places.safehouse.doorX, places.safehouse.doorY, 64);
    if (state.nearSpray && input.enter) {
      if (state.cash >= WANTED.sprayCost) {
        state.cash -= WANTED.sprayCost;
        state.wantedHeat = 0;
        pl.car.damage = 0;
        pl.car.wrecked = false;
        pl.car.color = pick(random, CAR_COLORS);
        events.push({ type: 'respray' });
        addFloat(pl.car.x, pl.car.y - 26, 'CLEAN!', '#58c96b');
      }
    }
    if (state.nearSave && input.enter) events.push({ type: 'save' });
    // Hidden packages.
    if (pl.onFoot) {
      for (const pkg of city.packages) {
        if (!pkg.taken && Math.hypot(pl.x - pkg.x, pl.y - pkg.y) < 30) {
          pkg.taken = true;
          state.cash += PACKAGE_VALUE;
          state.stats.packages += 1;
          events.push({ type: 'pickup' });
          addFloat(pkg.x, pkg.y - 20, `+$${PACKAGE_VALUE}`, '#f2c94c');
        }
      }
    }
  }

  // ---------------------------------------------------------- taxi

  function stepTaxi(dt, input) {
    const pl = state.player;
    if (state.mission && state.mission.index < 1) return; // taxi opens after the first job
    if (!state.taxi) {
      state.taxiSpawnT -= dt;
      if (state.taxiSpawnT <= 0) {
        state.taxiSpawnT = range(random, 35, 60);
        const ped = state.peds.find((p) => !p.taxi && !p.down && Math.hypot(p.x - pl.x, p.y - pl.y) < 500);
        if (ped) {
          ped.taxi = true;
          ped.state = 'walk';
          const dest = pick(random, Object.values(city.places));
          state.taxi = { ped, tx: dest.doorX, ty: dest.doorY, fare: TAXI_FARE, timer: 0, waiting: true, name: dest.name };
        }
      }
      return;
    }
    const t = state.taxi;
    if (t.waiting) {
      if (pl.onFoot && Math.hypot(pl.x - t.ped.x, pl.y - t.ped.y) < 46 && input.enter) {
        t.waiting = false;
        t.timer = 80;
        state.passenger = t.ped;
        api.say([`FARE: "Take me to ${t.name}, please. $${t.fare} if you're quick."`]);
      } else if (Math.hypot(pl.x - t.ped.x, pl.y - t.ped.y) > 900) {
        t.ped.taxi = false;
        state.taxi = null;
      }
      return;
    }
    t.timer -= dt;
    if (t.timer <= 0) {
      api.say(['FARE: "Forget it, I\'ll walk."']);
      state.taxi = null;
      state.passenger = null;
      return;
    }
    if (!pl.onFoot && Math.hypot(pl.x - t.tx, pl.y - t.ty) < 70) {
      const tip = t.timer > 30 ? 30 : 0;
      state.cash += t.fare + tip;
      events.push({ type: 'cash' });
      addFloat(pl.x, pl.y - 26, `+$${t.fare + tip}`, '#58c96b');
      t.ped.taxi = false;
      state.passenger = null;
      state.taxi = null;
    }
  }

  // ---------------------------------------------------------- main step

  function step(dt, input, mode) {
    state.time += dt;
    state.clockMin += dt / 3;
    const pl = state.player;

    // Reload bookkeeping.
    if (pl._reloading && pl.reloadT <= 0) {
      pl._reloading = false;
      const take = Math.min(PLAYER.magazine, pl.reserveAmmo);
      pl.ammo = take;
      pl.reserveAmmo -= take;
    }

    stepPlayer(dt, input);
    stepTraffic(dt);
    stepCarCollisions(dt);
    stepPeds(dt);
    stepPolice(dt);
    stepEnemies(dt);
    stepWanted(dt);
    if (mode !== 'attract') {
      stepPlaces(dt, input);
      stepTaxi(dt, input);
      if (state.mission && state.mission.state === 'active') updateMission(state, dt, api);
      if (state.mission && state.mission.state === 'done' && !state.storyDone) {
        state.missionNextT -= dt;
        if (state.missionNextT <= 0) startNextMission();
      }
    }

    // Dialogue and banner lifetimes.
    for (let i = state.dialogue.length - 1; i >= 0; i -= 1) {
      state.dialogue[i].t += dt;
      if (state.dialogue[i].t > 7) state.dialogue.splice(i, 1);
    }
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t > 3.4) state.banner = null;
    }
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].t += dt;
      if (state.tracers[i].t > 0.12) state.tracers.splice(i, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      if (p.t > p.life) state.particles.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      state.floats[i].t += dt;
      if (state.floats[i].t > 1.6) state.floats.splice(i, 1);
    }

    // Camera follows the player with a little look-ahead.
    const targetZoom = pl.onFoot ? 1.15 : 0.92;
    state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, dt * 2);
    const lookX = pl.x + (pl.car ? Math.cos(pl.angle) * pl.car.speed * 0.22 : 0) + (state.camOffX || 0);
    const lookY = pl.y + (pl.car ? Math.sin(pl.angle) * pl.car.speed * 0.22 : 0) + (state.camOffY || 0);
    state.camera.x += (lookX - state.camera.x) * Math.min(1, dt * 4);
    state.camera.y += (lookY - state.camera.y) * Math.min(1, dt * 4);
    // Keep the view inside the world so the void beyond the map never shows.
    const halfW = VIEW.width / (2 * state.camera.zoom);
    const halfH = VIEW.height / (2 * state.camera.zoom);
    state.camera.x = clamp(state.camera.x, Math.min(halfW, WORLD.width / 2), Math.max(WORLD.width - halfW, WORLD.width / 2));
    state.camera.y = clamp(state.camera.y, Math.min(halfH, WORLD.height / 2), Math.max(WORLD.height - halfH, WORLD.height / 2));
  }

  function takeEvents() {
    const out = events.splice(0, events.length);
    return out;
  }

  function startFirstMission() {
    startMission(state, 0, api);
  }

  function applySave(save) {
    if (!save) return;
    state.cash = save.cash ?? state.cash;
    state.health = save.health ?? state.health;
    state.player.x = save.x ?? state.player.x;
    state.player.y = save.y ?? state.player.y;
    state.stats = { ...state.stats, ...(save.stats ?? {}) };
    if (save.weapon === 'pistol') api.givePistol();
    state.player.ammo = save.ammo ?? state.player.ammo;
    state.player.reserveAmmo = save.reserveAmmo ?? state.player.reserveAmmo;
    for (const pkg of city.packages) {
      if (save.packagesTaken && save.packagesTaken.includes(pkg.id)) pkg.taken = true;
    }
    const next = save.missionsDone ?? 0;
    if (next >= 5) {
      state.storyDone = true;
      state.mission = null;
      state.objective = 'Free roam — Solmar Bay is yours';
    } else if (next > 0) {
      startMission(state, next, api);
    }
  }

  function makeSave() {
    return {
      cash: state.cash,
      health: state.health,
      x: state.player.x,
      y: state.player.y,
      weapon: state.player.weapon,
      ammo: state.player.ammo,
      reserveAmmo: state.player.reserveAmmo,
      missionsDone: state.stats.missionsDone,
      stats: state.stats,
      packagesTaken: city.packages.filter((p) => p.taken).map((p) => p.id),
    };
  }

  return {
    state, step, takeEvents, api, startFirstMission, resetMission, startNextMission,
    applySave, makeSave, hasLineOfSight,
    startMissionAt(index) {
      startMission(state, index, api);
    },
    get enemiesAlive() {
      return state.enemiesAlive;
    },
  };
}

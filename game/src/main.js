// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between five screens:
// title, controls, play, paused and game over. Missions, the wanted level, saving and
// the story all live in the world; this file only drives the screens and the sounds.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_DOWN, ACTION_ENTER, ACTION_MELEE, ACTION_MUTE,
  ACTION_PAUSE, ACTION_RELOAD, ACTION_RETRY, ACTION_UP, createInput,
} from './input.js';
import {
  SCREEN_CONTROLS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;
/** Seconds of play before the controls hint fades. */
const HINT_SECONDS = 25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
let world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.makeSave()));
    return true;
  } catch {
    return false;
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best haul then lasts this visit only.
  }
}

/** Convert a mouse position on the canvas to world coordinates for aiming. */
function mouseToWorld() {
  const ratio = window.devicePixelRatio || 1;
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.min(cw / VIEW.width, ch / VIEW.height);
  const ox = (cw - VIEW.width * scale) / 2;
  const oy = (ch - VIEW.height * scale) / 2;
  const vx = (input.mouse.x * ratio - ox) / scale;
  const vy = (input.mouse.y * ratio - oy) / scale;
  const cam = world.state.camera;
  return {
    x: cam.x + (vx - VIEW.width / 2) / cam.zoom,
    y: cam.y + (vy - VIEW.height / 2) / cam.zoom,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  if (scene.camera) {
    world.state.camera.x = scene.camera.x;
    world.state.camera.y = scene.camera.y;
    world.state.camera.zoom = scene.camera.zoom;
  }
  let painted = 0;
  const ui = { best: scene.best, menuIndex: 0, saveExists: false, nearCar: false, hint: '' };
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = readSave();
  let menuIndex = 0;
  let pauseIndex = 0;
  let overKind = 'wasted';
  let overFee = 0;
  let playTime = 0;
  let fireCooldown = 0;
  let titlePan = 0;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function menuItems() {
    return save ? ['CONTINUE', 'NEW GAME', 'CONTROLS'] : ['NEW GAME', 'CONTROLS'];
  }

  function newGame() {
    // A fresh city (same seed, so the same Solmar Bay) with clean stats and packages.
    world = createWorld(seed);
    world.startFirstMission();
    playTime = 0;
    screen = SCREEN_PLAY;
    announce('Playing. First job: steal a car.');
  }

  function continueGame() {
    if (!save) return;
    world.applySave(save);
    if (!world.state.mission && !world.state.storyDone) world.startFirstMission();
    playTime = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Welcome back to Solmar Bay.');
  }

  function toTitle() {
    save = readSave();
    menuIndex = 0;
    screen = SCREEN_TITLE;
    announce('Sunset Bay. Press Enter to start.');
  }

  function gameOver(kind) {
    if (screen === SCREEN_OVER) return;
    const state = world.state;
    overKind = kind;
    overFee = kind === 'busted' ? Math.min(state.cash, 200) : Math.min(state.cash, 150);
    state.cash -= overFee;
    if (state.cash > best) {
      best = state.cash;
      saveBest(best);
    }
    if (state.mission && state.mission.state === 'active') state.mission.state = 'failed';
    state.wantedHeat = 0;
    state.cops = [];
    for (const c of state.cars) if (c.cop) c.remove = true;
    state.cars = state.cars.filter((c) => !c.remove);
    if (state.player.car) {
      state.player.car.player = false;
      state.player.car = null;
    }
    const spot = kind === 'busted' ? state.city.places.safehouse : state.city.places.hospital;
    state.player.x = spot.doorX;
    state.player.y = spot.doorY;
    state.player.onFoot = true;
    state.player.angle = -Math.PI / 2;
    state.health = 100;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    screen = SCREEN_OVER;
    announce(kind === 'busted' ? 'Busted. Press R to try again.' : 'Wasted. Press R to try again.');
  }

  function retryFromOver() {
    if (world.state.mission && world.state.mission.state === 'failed') world.resetMission();
    screen = SCREEN_PLAY;
    announce('Playing.');
  }

  function handleEvents() {
    for (const event of world.takeEvents()) {
      const state = world.state;
      switch (event.type) {
        case 'shot':
          audio.shot();
          break;
        case 'enemyShot':
          audio.shot();
          break;
        case 'punch':
          audio.punch();
          break;
        case 'crash':
          audio.punch();
          break;
        case 'pickup':
          audio.pickup();
          break;
        case 'cash':
          audio.cash();
          break;
        case 'fail':
          audio.fail();
          break;
        case 'steal':
          audio.click();
          break;
        case 'respray':
          audio.cash();
          break;
        case 'save':
          if (writeSave()) {
            state.banner = { title: 'GAME SAVED', sub: 'Progress kept at Dice\'s Apartment', t: 0 };
            audio.pickup();
          }
          break;
        case 'wasted':
          audio.fail();
          gameOver('wasted');
          break;
        case 'busted':
          audio.fail();
          gameOver('busted');
          break;
        default:
          break;
      }
    }
  }

  function buildInput() {
    const move = input.move();
    const mouse = mouseToWorld();
    const pl = world.state.player;
    fireCooldown -= STEP;
    let shoot = false;
    if (input.mouse.down && pl.weapon === 'pistol' && pl.onFoot && fireCooldown <= 0) {
      shoot = true;
      fireCooldown = 0.22;
    }
    const actions = input.takeActions();
    const click = input.takeClick();
    return {
      input: {
        up: move.up, down: move.down, left: move.left, right: move.right,
        run: move.run, handbrake: move.handbrake,
        enter: !!(actions & ACTION_ENTER),
        melee: !!(actions & ACTION_MELEE) || (click && pl.weapon === 'fists' && pl.onFoot),
        shoot: shoot || (click && pl.weapon === 'pistol' && pl.onFoot),
        reload: !!(actions & ACTION_RELOAD),
        aimX: mouse.x, aimY: mouse.y,
        aimActive: true,
      },
      actions,
      click,
    };
  }

  function nearCar() {
    const pl = world.state.player;
    if (!pl.onFoot) return false;
    for (const car of world.state.cars) {
      if (car.cop) continue;
      if (Math.hypot(car.x - pl.x, car.y - pl.y) < 52) return true;
    }
    return false;
  }

  function step() {
    const { input: snap, actions } = buildInput();
    const state = world.state;
    const pl = state.player;

    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      state.banner = { title: muted ? 'SOUND OFF' : 'SOUND ON', sub: '', t: 0 };
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_UP) menuIndex = (menuIndex - 1 + menuItems().length) % menuItems().length;
      if (actions & ACTION_DOWN) menuIndex = (menuIndex + 1) % menuItems().length;
      if (actions & ACTION_CONFIRM) {
        audio.start();
        const item = menuItems()[menuIndex];
        if (item === 'CONTINUE') continueGame();
        else if (item === 'NEW GAME') newGame();
        else if (item === 'CONTROLS') screen = SCREEN_CONTROLS;
      }
      // Attract mode: the city lives under a slow pan.
      titlePan += STEP;
      world.step(STEP, {
        up: false, down: false, left: false, right: false, run: false,
        enter: false, melee: false, shoot: false, reload: false, handbrake: false,
        aimX: 0, aimY: 0, aimActive: false,
      }, 'attract');
      state.camera.x = 1800 + Math.sin(titlePan * 0.11) * 700;
      state.camera.y = 1150 + Math.cos(titlePan * 0.07) * 380;
      state.camera.zoom = 0.82;
      return;
    }

    if (screen === SCREEN_CONTROLS) {
      if (actions & (ACTION_CONFIRM | ACTION_PAUSE)) screen = SCREEN_TITLE;
      return;
    }

    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_UP) pauseIndex = (pauseIndex - 1 + 4) % 4;
      if (actions & ACTION_DOWN) pauseIndex = (pauseIndex + 1) % 4;
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_CONFIRM) {
        if (pauseIndex === 0) {
          screen = SCREEN_PLAY;
          announce('Playing.');
        } else if (pauseIndex === 1) {
          if (state.mission) world.resetMission();
          screen = SCREEN_PLAY;
        } else if (pauseIndex === 2) {
          if (writeSave()) {
            state.banner = { title: 'GAME SAVED', sub: '', t: 0 };
            audio.pickup();
          }
          screen = SCREEN_PLAY;
        } else {
          toTitle();
        }
      }
      return;
    }

    if (screen === SCREEN_OVER) {
      if (actions & ACTION_RETRY) retryFromOver();
      else if (actions & ACTION_CONFIRM) toTitle();
      return;
    }

    // SCREEN_PLAY.
    playTime += STEP;
    if (actions & ACTION_PAUSE) {
      pauseIndex = 0;
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (actions & ACTION_RETRY && state.mission && state.mission.state === 'failed') {
      world.resetMission();
      announce('Mission restarted.');
    }
    // Aim follows the mouse while on foot with the pistol.
    if (pl.onFoot && pl.weapon === 'pistol') {
      pl.aimAngle = Math.atan2(snap.aimY - pl.y, snap.aimX - pl.x);
    }
    world.step(STEP, snap, 'play');
    handleEvents();
    // Engine and siren follow the world.
    const car = pl.car;
    audio.engine(car ? Math.abs(car.speed) / 430 : 0);
    const copsNear = state.cops.length > 0 || state.cars.some((c) => c.cop);
    audio.siren(state.wantedStars > 0 && copsNear);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
    }
    const ui = {
      best,
      menuIndex: screen === SCREEN_PAUSED ? pauseIndex : menuIndex,
      saveExists: !!save,
      nearCar: nearCar(),
      overKind,
      overFee,
      hint: screen === SCREEN_PLAY && playTime < HINT_SECONDS
        ? 'WASD move · E steal car · F punch · Click shoot · P pause'
        : '',
    };
    renderer.draw(world.state, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.start(), { once: true });
  window.addEventListener('keydown', () => audio.start(), { once: true });

  announce('Sunset Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

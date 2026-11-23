// Drawing only: the world's state and the current screen in, pixels out. The camera
// shows a 1280x720 window of the 3600x2700 city at golden hour — long shadows to the
// east, warm light, the bay glittering to the south. The HUD, the minimap, the mission
// text and every screen (title, pause, wasted, busted) are drawn here too, on the one
// canvas, so a screenshot always shows the whole game.

import {
  BEACH_Y, CAR, FONT, LANE, PALETTE, PLAYER, ROADS_H, ROADS_V, ROAD_W,
  VIEW, WATER_Y, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_CONTROLS = 'controls';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { x: 16, y: VIEW.height - 166, w: 208, h: 150 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let miniStatic = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function font(size, bold) {
    const key = `${size}:${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }
  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function star(cx, cy, r, filled, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(245,239,226,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------- minimap base

  function buildMinimap(city) {
    const c = document.createElement('canvas');
    c.width = MINIMAP.w;
    c.height = MINIMAP.h;
    const g = c.getContext('2d');
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    g.fillStyle = '#20242e';
    g.fillRect(0, 0, MINIMAP.w, MINIMAP.h);
    g.fillStyle = '#2f7f9e';
    g.fillRect(0, WATER_Y * sy, MINIMAP.w, (WORLD.height - WATER_Y) * sy);
    g.fillStyle = '#e8cf9a';
    g.fillRect(0, BEACH_Y * sy, MINIMAP.w, (WATER_Y - BEACH_Y) * sy);
    g.fillStyle = '#79a854';
    g.fillRect(city.park.x0 * sx, city.park.y0 * sy, (city.park.x1 - city.park.x0) * sx, (city.park.y1 - city.park.y0) * sy);
    g.fillStyle = '#6f6a72';
    g.fillRect(city.docks.x0 * sx, city.docks.y0 * sy, (city.docks.x1 - city.docks.x0) * sx, (city.docks.y1 - city.docks.y0) * sy);
    g.fillStyle = '#3d414d';
    for (const rx of ROADS_V) g.fillRect((rx - ROAD_W / 2) * sx, 0, ROAD_W * sx, WORLD.height * sy);
    for (const ry of ROADS_H) g.fillRect(0, (ry - ROAD_W / 2) * sy, WORLD.width * sx, ROAD_W * sy);
    g.fillStyle = '#8a7f8d';
    for (const b of city.buildings) g.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    return c;
  }

  // ---------------------------------------------------------- world

  function drawGround(city, time) {
    // Base: blocks and sidewalks.
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Park.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(city.park.x0, city.park.y0, city.park.x1 - city.park.x0, city.park.y1 - city.park.y0);
    // Pond.
    ctx.fillStyle = '#3f8fae';
    ctx.beginPath();
    ctx.ellipse(1200, 1560, 90, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Harbour concrete.
    ctx.fillStyle = '#7d7468';
    ctx.fillRect(city.docks.x0 - 10, city.docks.y0 - 10, city.docks.x1 - city.docks.x0 + 20, city.docks.y1 - city.docks.y0 + 20);
    // Beach and bay.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH_Y, WORLD.width, WATER_Y - BEACH_Y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WATER_Y, WORLD.width, WORLD.height - WATER_Y);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const y = WATER_Y + 18 + i * 18;
      ctx.beginPath();
      for (let x = 0; x <= WORLD.width; x += 60) {
        const yy = y + Math.sin(x / 140 + time * 1.4 + i) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Roads.
    for (const rx of ROADS_V) {
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
      ctx.fillStyle = PALETTE.asphaltDark;
      ctx.fillRect(rx - ROAD_W / 2, 0, 10, BEACH_Y);
      ctx.fillRect(rx + ROAD_W / 2 - 10, 0, 10, BEACH_Y);
    }
    for (const ry of ROADS_H) {
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
      ctx.fillStyle = PALETTE.asphaltDark;
      ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, 10);
      ctx.fillRect(0, ry + ROAD_W / 2 - 10, WORLD.width, 10);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of ROADS_V) {
      for (let y = 20; y < BEACH_Y; y += 56) ctx.fillRect(rx - 3, y, 6, 28);
    }
    for (const ry of ROADS_H) {
      for (let x = 20; x < WORLD.width; x += 56) ctx.fillRect(x, ry - 3, 28, 6);
    }
    // Crosswalk stripes at every intersection.
    ctx.fillStyle = 'rgba(232,228,218,0.85)';
    for (const rx of ROADS_V) {
      for (const ry of ROADS_H) {
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(rx + i * 16 - 5, ry - ROAD_W / 2 + 8, 10, 18);
          ctx.fillRect(rx + i * 16 - 5, ry + ROAD_W / 2 - 26, 10, 18);
        }
      }
    }
  }

  function drawBuildings(city) {
    for (const b of city.buildings) {
      const sh = b.tall * 0.55;
      // Long sunset shadow to the east.
      ctx.fillStyle = 'rgba(20,12,40,0.28)';
      ctx.fillRect(b.x + sh * 0.6, b.y + sh * 0.4, b.w, b.h);
      // Wall (the extruded side) and roof.
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x + b.tall * 0.28, b.y + b.tall * 0.28, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Rooftop details.
      if (b.ac) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.22, b.h * 0.2);
        ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.55, b.w * 0.18, b.h * 0.18);
      }
      if (b.sign) {
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(b.x + 6, b.y + b.h / 2 - 4, b.w - 12, 8);
      }
      if (b.downtown && b.tall > 45) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e5534b';
        ctx.font = font(11, true);
        ctx.textAlign = 'center';
        ctx.fillText('H', b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
    // Harbour containers and cranes.
    for (const c of city.containers) {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + (i * c.h) / 6);
        ctx.lineTo(c.x + c.w, c.y + (i * c.h) / 6);
        ctx.stroke();
      }
      ctx.strokeRect(c.x, c.y, c.w, c.h);
    }
    for (const crane of city.cranes) {
      ctx.strokeStyle = '#d8cbb2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(crane.x, crane.y);
      ctx.lineTo(crane.x, crane.y - 150);
      ctx.lineTo(crane.x + 130, crane.y - 150);
      ctx.moveTo(crane.x + 130, crane.y - 150);
      ctx.lineTo(crane.x + 130, crane.y - 110);
      ctx.stroke();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(crane.x + 118, crane.y - 112, 24, 18);
    }
  }

  function drawProps(city, time) {
    // Park trees.
    for (const t of city.parkTrees) {
      ctx.fillStyle = 'rgba(20,12,40,0.2)';
      ctx.beginPath();
      ctx.ellipse(t.x + 6, t.y + 8, t.r, t.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4e7d33';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d9c4c';
      ctx.beginPath();
      ctx.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Palms.
    for (const p of city.palms) {
      ctx.strokeStyle = '#8a6b4f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 10);
      ctx.lineTo(p.x + 4, p.y - 6);
      ctx.stroke();
      ctx.fillStyle = '#3f8f4f';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(p.x + 4 + Math.cos(a) * p.r * 0.7, p.y - 6 + Math.sin(a) * p.r * 0.55, p.r * 0.75, p.r * 0.32, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Lamps.
    for (const l of city.lamps) {
      ctx.strokeStyle = '#3a3f4a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y - 16);
      ctx.stroke();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(l.x, l.y - 18, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Beach umbrellas.
    for (let i = 0; i < 6; i += 1) {
      const x = 300 + i * 520;
      const y = BEACH_Y + 90;
      ctx.strokeStyle = '#8a6b4f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 22);
      ctx.stroke();
      ctx.fillStyle = i % 2 === 0 ? '#e5534b' : '#4f8ff7';
      ctx.beginPath();
      ctx.arc(x, y - 22, 20, Math.PI, 0);
      ctx.fill();
    }
    // Hidden packages.
    for (const pkg of city.packages) {
      if (pkg.taken) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + pkg.id);
      ctx.fillStyle = `rgba(242,201,76,${0.25 + pulse * 0.25})`;
      ctx.beginPath();
      ctx.arc(pkg.x, pkg.y, 22 + pulse * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(pkg.x - 8, pkg.y - 8, 16, 16);
      ctx.fillStyle = '#8a6b1f';
      ctx.fillRect(pkg.x - 8, pkg.y - 2, 16, 4);
    }
  }

  function drawCar(car, time) {
    const len = car.model === 'van' ? 52 : car.model === 'sport' ? 44 : 46;
    const wid = car.model === 'van' ? 24 : 22;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(20,12,40,0.3)';
    roundRect(-len / 2 + 4, -wid / 2 + 5, len, wid, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.color[0];
    roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    // Roof and glass.
    ctx.fillStyle = car.color[1];
    roundRect(-len * 0.22, -wid / 2 + 3, len * 0.44, wid - 6, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,235,0.85)';
    ctx.fillRect(len * 0.22, -wid / 2 + 4, 7, wid - 8);
    ctx.fillRect(-len * 0.32, -wid / 2 + 4, 6, wid - 8);
    if (car.taxi) {
      ctx.fillStyle = '#22242c';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-len / 2 + 6 + i * 8, -3, 4, 6);
      ctx.fillStyle = '#f2c94c';
      ctx.font = font(9, true);
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, -wid / 2 - 6);
    }
    if (car.cop) {
      ctx.fillStyle = '#22242c';
      ctx.fillRect(-len * 0.1, -wid / 2, len * 0.2, 5);
      const phase = Math.floor(time * 4 + car.sirenPhase) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-8, -wid / 2 - 2, 7, 5);
      ctx.fillStyle = phase ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(1, -wid / 2 - 2, 7, 5);
      ctx.fillStyle = '#e8e4da';
      ctx.font = font(9, true);
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, wid / 2 + 12);
    }
    // Headlight cones at dusk.
    ctx.fillStyle = 'rgba(255,240,180,0.16)';
    ctx.beginPath();
    ctx.moveTo(len / 2, -8);
    ctx.lineTo(len / 2 + 90, -26);
    ctx.lineTo(len / 2 + 90, 26);
    ctx.lineTo(len / 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 4);
    ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 4);
    // Damage smoke.
    if (car.damage > 45) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(-len / 2 + 4, 0, 6 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, walkPhase, down, isPlayer, weapon) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(20,12,40,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color[0];
      roundRect(-14, -6, 28, 12, 5);
      ctx.fill();
      ctx.fillStyle = color[1];
      ctx.beginPath();
      ctx.arc(16, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(walkPhase) * 2;
    ctx.fillStyle = 'rgba(20,12,40,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle + Math.PI / 2);
    // Legs (two feet alternating with the walk phase).
    ctx.fillStyle = '#22242c';
    ctx.fillRect(-7, -4 + bob, 5, 12);
    ctx.fillRect(2, -4 - bob, 5, 12);
    // Body.
    ctx.fillStyle = color[0];
    roundRect(-8, -10, 16, 20, 6);
    ctx.fill();
    // Head.
    ctx.fillStyle = color[1];
    ctx.beginPath();
    ctx.arc(0, -14, 6.5, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(-6.5, -20, 13, 4);
    }
    if (weapon === 'pistol') {
      ctx.fillStyle = '#22242c';
      ctx.fillRect(-2, -24, 4, 12);
    }
    ctx.restore();
  }

  function drawMarker(target, time) {
    if (!target) return;
    const bounce = Math.sin(time * 3.2) * 8;
    // Light pillar.
    const grad = ctx.createLinearGradient(0, target.y - 320, 0, target.y);
    grad.addColorStop(0, 'rgba(242,201,76,0)');
    grad.addColorStop(1, 'rgba(242,201,76,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 14, target.y - 320, 28, 320);
    // Ground ring.
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 26 + Math.sin(time * 3) * 4, 0, Math.PI * 2);
    ctx.stroke();
    // Bouncing diamond.
    ctx.save();
    ctx.translate(target.x, target.y - 56 + bounce);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#8a6b1f';
    ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    if (target.label) {
      ctx.font = font(15, true);
      ctx.fillStyle = '#f2c94c';
      ctx.textAlign = 'center';
      ctx.fillText(target.label, target.x, target.y - 84 + bounce);
    }
  }

  // ---------------------------------------------------------- HUD

  function drawHud(state, screen, ui) {
    const pl = state.player;
    const time = state.time;
    // Objective panel (top-left).
    ctx.textBaseline = 'top';
    if (state.storyDone) {
      ctx.fillStyle = 'rgba(16,12,32,0.72)';
      roundRect(16, 14, 430, 54, 8);
      ctx.fill();
      text('FREE ROAM', 30, 24, 13, PALETTE.gold, 'left', true);
      text('Solmar Bay is yours — taxi fares, packages, and the open road', 30, 44, 15, PALETTE.text, 'left');
    } else if (state.mission) {
      ctx.fillStyle = 'rgba(16,12,32,0.72)';
      roundRect(16, 14, 430, 54, 8);
      ctx.fill();
      text(state.mission ? `JOB ${state.mission.index + 1}/5 — ${['FIRST WHEELS', 'THE PICKUP', 'HEAT ON THE STRIP', 'DOCK RATS', 'THE BIG SCORE'][state.mission.index]}` : '', 30, 24, 13, PALETTE.gold, 'left', true);
      text(state.objective, 30, 44, 15, PALETTE.text, 'left');
    }
    const hh = Math.floor(state.clockMin / 60) % 24;
    const mm = Math.floor(state.clockMin % 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    text(`$${state.cash.toLocaleString('en-US')}`, VIEW.width - 24, 22, 26, state.cash < 0 ? PALETTE.red : PALETTE.text, 'right', true);
    text(clock, VIEW.width - 24, 54, 15, PALETTE.muted, 'right');
    if (!pl.onFoot) text('WAVE 88.4 — Sunset FM', VIEW.width - 24, 74, 13, PALETTE.muted, 'right');
    const stars = state.wantedStars;
    for (let i = 0; i < 5; i += 1) {
      const cx = VIEW.width - 24 - (4 - i) * 30;
      const filled = i < stars;
      const pulse = stars > 0 && Math.sin(time * 6) > 0;
      star(cx, 108, 11, filled, pulse && filled ? '#ff5a4e' : PALETTE.gold);
    }
    // Health / armour / weapon / speed (bottom-right).
    const bx = VIEW.width - 224;
    const by = VIEW.height - 66;
    ctx.fillStyle = 'rgba(16,12,32,0.72)';
    roundRect(bx - 12, by - 12, 220, 62, 8);
    ctx.fill();
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(bx, by, 150, 12);
    ctx.fillStyle = state.health > 50 ? '#58c96b' : state.health > 25 ? '#f2c94c' : '#e5534b';
    ctx.fillRect(bx, by, 150 * (state.health / 100), 12);
    text('HEALTH', bx, by + 26, 11, PALETTE.muted, 'left', true);
    if (state.armor > 0) {
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(bx + 60, by + 26, 90, 6);
      ctx.fillStyle = '#4f8ff7';
      ctx.fillRect(bx + 60, by + 26, 90 * (state.armor / 100), 6);
    }
    const weaponText = pl.weapon === 'pistol'
      ? (pl.reloadT > 0 ? 'RELOADING…' : `PISTOL  ${pl.ammo} / ${pl.reserveAmmo}`)
      : 'FISTS';
    text(weaponText, bx + 196, by + 26, 13, PALETTE.text, 'right', true);
    if (!pl.onFoot && pl.car) {
      const mph = Math.round(Math.abs(pl.car.speed) * 0.14);
      text(`${mph} mph`, bx + 196, by - 34, 22, PALETTE.text, 'right', true);
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(bx, by - 14, 150, 6);
      ctx.fillStyle = pl.car.damage > 70 ? '#e5534b' : '#f2c94c';
      ctx.fillRect(bx, by - 14, 150 * Math.max(0, 1 - pl.car.damage / 100), 6);
    }
    // Crosshair when armed on foot.
    if (pl.onFoot && pl.weapon === 'pistol' && screen === SCREEN_PLAY) {
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      ctx.strokeStyle = 'rgba(245,239,226,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }
    drawMinimap(state, time);
    // Context prompts.
    let prompt = '';
    if (state.nearSpray) prompt = 'Press E — Respray $200 (lose the heat)';
    else if (state.nearSave) prompt = 'Press E — Save game';
    else if (state.taxi && state.taxi.waiting) prompt = 'Press E — Taxi fare $120';
    else if (pl.onFoot && ui.nearCar) prompt = 'Press E — Steal car';
    if (prompt) {
      ctx.font = font(16, true);
      const w = ctx.measureText(prompt).width + 28;
      ctx.fillStyle = 'rgba(16,12,32,0.8)';
      roundRect((VIEW.width - w) / 2, VIEW.height - 118, w, 34, 8);
      ctx.fill();
      text(prompt, VIEW.width / 2, VIEW.height - 108, 16, PALETTE.gold, 'center', true);
    }
    // Dialogue box.
    const dlg = state.dialogue[state.dialogue.length - 1];
    if (dlg) {
      const lines = dlg.lines;
      const h = 20 + lines.length * 24;
      ctx.fillStyle = 'rgba(16,12,32,0.82)';
      roundRect(250, VIEW.height - 210 - h + 56, VIEW.width - 500, h + 14, 10);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(250, VIEW.height - 210 - h + 56, 4, h + 14);
      lines.forEach((line, i) => {
        text(line, 272, VIEW.height - 210 - h + 66 + i * 24, 16, PALETTE.text, 'left');
      });
    }
    // Banner.
    if (state.banner) {
      const t = state.banner.t;
      const scale = t < 0.25 ? 0.8 + (t / 0.25) * 0.2 : 1;
      const alpha = t > 2.8 ? Math.max(0, 1 - (t - 2.8) / 0.6) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(VIEW.width / 2, 200);
      ctx.scale(scale, scale);
      ctx.font = font(46, true);
      ctx.fillStyle = state.banner.title === 'MISSION FAILED' ? '#e5534b' : '#f2c94c';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner.title, 0, 0);
      ctx.font = font(22, true);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(state.banner.sub, 0, 36);
      ctx.restore();
    }
    // Floating texts are drawn in world space; the rest (vignette) below.
  }

  function drawMinimap(state, time) {
    const city = state.city;
    if (!miniStatic) miniStatic = buildMinimap(city);
    ctx.save();
    ctx.fillStyle = 'rgba(16,12,32,0.85)';
    roundRect(MINIMAP.x - 6, MINIMAP.y - 6, MINIMAP.w + 12, MINIMAP.h + 12, 10);
    ctx.fill();
    ctx.beginPath();
    roundRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h, 4);
    ctx.clip();
    ctx.drawImage(miniStatic, MINIMAP.x, MINIMAP.y);
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(MINIMAP.x + x * sx, MINIMAP.y + y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Places.
    dot(city.places.safehouse.x, city.places.safehouse.y, 4, '#58c96b');
    dot(city.places.spray.x, city.places.spray.y, 4, '#f28c38');
    dot(city.places.hospital.x, city.places.hospital.y, 3, '#e8e4da');
    if (state.taxi && state.taxi.waiting) dot(state.taxi.ped.x, state.taxi.ped.y, 4, '#f2c94c');
    // Mission target.
    if (state.missionTarget) {
      const pulse = 3 + Math.sin(time * 5) * 1.5;
      dot(state.missionTarget.x, state.missionTarget.y, pulse, '#f2c94c');
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(MINIMAP.x + state.missionTarget.x * sx, MINIMAP.y + state.missionTarget.y * sy, pulse + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Police (flashing).
    const copFlash = Math.floor(time * 3) % 2 === 0;
    for (const car of state.cars) if (car.cop) dot(car.x, car.y, 3.5, copFlash ? '#ff3b30' : '#3b82ff');
    for (const cop of state.cops) dot(cop.x, cop.y, 3, '#3b82ff');
    // Enemies.
    for (const e of state.enemies) if (e.alive) dot(e.x, e.y, 3.5, '#e5534b');
    // Player arrow.
    const px = MINIMAP.x + state.player.x * sx;
    const py = MINIMAP.y + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('N', MINIMAP.x + MINIMAP.w - 12, MINIMAP.y - 12, 12, PALETTE.muted, 'right', true);
  }

  // ---------------------------------------------------------- panels

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const h = 150 + lines.length * 30;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    ctx.fillStyle = 'rgba(12,8,26,0.88)';
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 62, 40, accent || PALETTE.gold, 'center', true);
    lines.forEach((line, i) => {
      text(line, VIEW.width / 2, y + 108 + i * 30, 17, PALETTE.muted, 'center');
    });
    if (prompt) text(prompt, VIEW.width / 2, y + h - 26, 17, PALETTE.text, 'center', true);
  }

  function drawTitle(state, ui) {
    // Warm dusk wash over the panning city.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(60,20,60,0.25)');
    grad.addColorStop(0.6, 'rgba(20,10,40,0.45)');
    grad.addColorStop(1, 'rgba(10,6,24,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Title.
    ctx.save();
    ctx.shadowColor = 'rgba(242,140,56,0.8)';
    ctx.shadowBlur = 34;
    text('SUNSET BAY', VIEW.width / 2, 208, 92, '#ffd98a', 'center', true);
    ctx.restore();
    text('A N   O P E N - W O R L D   C R I M E   S T O R Y', VIEW.width / 2, 248, 18, '#f2c94c', 'center', true);
    text('Steal it. Drive it. Lose the heat. Take the city.', VIEW.width / 2, 282, 17, PALETTE.text, 'center');
    const items = ui.saveExists
      ? ['CONTINUE', 'NEW GAME', 'CONTROLS']
      : ['NEW GAME', 'CONTROLS'];
    items.forEach((item, i) => {
      const y = 380 + i * 52;
      const selected = ui.menuIndex === i;
      if (selected) {
        ctx.fillStyle = 'rgba(242,201,76,0.16)';
        roundRect(VIEW.width / 2 - 190, y - 34, 380, 44, 8);
        ctx.fill();
        text('▸', VIEW.width / 2 - 168, y, 20, PALETTE.gold, 'left', true);
      }
      text(item, VIEW.width / 2, y, 22, selected ? PALETTE.gold : PALETTE.text, 'center', true);
    });
    text('WASD move · E enter / steal car · Mouse aim · Click shoot · F punch · R reload · Shift run · Space handbrake · P pause · M mute', VIEW.width / 2, VIEW.height - 92, 14, PALETTE.muted, 'center');
    text('An original fan-made tribute to the open-world crime genre. Not affiliated with Rockstar Games.', VIEW.width / 2, VIEW.height - 64, 13, PALETTE.muted, 'center');
    if (ui.best > 0) text(`Best haul: $${ui.best.toLocaleString('en-US')}`, VIEW.width / 2, VIEW.height - 38, 14, PALETTE.gold, 'center');
  }

  function drawControls() {
    drawPanel('CONTROLS', [
      'W A S D / Arrows — move on foot, drive in a car',
      'E — enter / steal a car · save at home · respray at the garage',
      'Mouse — aim the pistol · Left click — shoot · F — punch · R — reload',
      'Shift — run · Space — handbrake · P / Esc — pause · M — mute',
      'Missions: follow the yellow marker. Lose the heat at Lucky Respray.',
      'Taxi fares and hidden packages ($100) pay for the quiet life.',
    ], 'Press Esc or Enter to go back', PALETTE.gold);
  }

  function drawPaused(state, ui) {
    ctx.fillStyle = 'rgba(10,6,24,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const items = ['RESUME', 'RESTART MISSION', 'SAVE GAME', 'QUIT TO TITLE'];
    const lines = [
      `Cash $${state.cash.toLocaleString('en-US')} · Missions done ${state.stats.missionsDone}/5 · Packages ${state.stats.packages}/10`,
      'Cars stolen ' + state.stats.carsStolen + ' · Shots fired ' + state.stats.shotsFired,
      '',
    ];
    const w = 640;
    const h = 150 + lines.length * 30 + items.length * 46;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    ctx.fillStyle = 'rgba(12,8,26,0.92)';
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    ctx.stroke();
    text('PAUSED', VIEW.width / 2, y + 62, 40, PALETTE.gold, 'center', true);
    lines.forEach((line, i) => {
      if (line) text(line, VIEW.width / 2, y + 108 + i * 30, 16, PALETTE.muted, 'center');
    });
    items.forEach((item, i) => {
      const iy = y + 108 + lines.length * 30 + i * 46;
      const selected = ui.menuIndex === i;
      if (selected) {
        ctx.fillStyle = 'rgba(242,201,76,0.16)';
        roundRect(VIEW.width / 2 - 190, iy - 26, 380, 36, 8);
        ctx.fill();
      }
      text(item, VIEW.width / 2, iy, 19, selected ? PALETTE.gold : PALETTE.text, 'center', true);
    });
  }

  // ---------------------------------------------------------- main draw

  function draw(state, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cam = state.camera;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Camera transform into world space.
    ctx.translate(VIEW.width / 2, VIEW.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const city = state.city;
    const time = state.time;
    drawGround(city, time);
    drawBuildings(city);
    drawProps(city, time);
    drawMarker(state.missionTarget, time);

    // Cars (traffic, parked, police, player's).
    const allCars = [...state.cars].sort((a, b) => a.y - b.y);
    for (const car of allCars) drawCar(car, time);
    // People, south-to-north so nearer ones overlap.
    const people = [];
    for (const p of state.peds) people.push({ x: p.x, y: p.y, kind: 'ped', obj: p });
    for (const c of state.cops) people.push({ x: c.x, y: c.y, kind: 'cop', obj: c });
    for (const e of state.enemies) if (e.alive) people.push({ x: e.x, y: e.y, kind: 'enemy', obj: e });
    people.sort((a, b) => a.y - b.y);
    for (const entry of people) {
      if (entry.kind === 'ped') {
        const p = entry.obj;
        drawPerson(p.x, p.y, p.angle, p.color, p.walkPhase, p.down, false, null);
        if (p.taxi) {
          ctx.font = font(13, true);
          ctx.fillStyle = '#f2c94c';
          ctx.textAlign = 'center';
          ctx.fillText('TAXI $', p.x, p.y - 30);
        }
      } else if (entry.kind === 'cop') {
        const c = entry.obj;
        drawPerson(c.x, c.y, c.angle, ['#2c3e6e', '#e8b98d'], c.walkPhase, false, false, null);
      } else {
        const e = entry.obj;
        drawPerson(e.x, e.y, e.angle, ['#8c2f2f', '#c98d5f'], e.walkPhase, false, false, 'pistol');
      }
    }
    // The player (on foot only; in a car the car is the player).
    const pl = state.player;
    if (pl.onFoot) {
      const blink = pl.hurtT > 0 && Math.floor(time * 12) % 2 === 0;
      if (!blink) drawPerson(pl.x, pl.y, pl.angle, ['#2e8f8a', '#e8b98d'], pl.walkPhase, false, true, pl.weapon);
    }
    // Tracers, particles, floating text.
    for (const t of state.tracers) {
      ctx.strokeStyle = `rgba(255,240,170,${1 - t.t / 0.12})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = font(15, true);
    ctx.textAlign = 'center';
    for (const f of state.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
    }
    ctx.globalAlpha = 1;

    // Back to screen space.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Sunset wash and vignette.
    const wash = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    wash.addColorStop(0, 'rgba(255,170,90,0.05)');
    wash.addColorStop(1, 'rgba(120,40,90,0.10)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const vg = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,5,25,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    if (screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (screen === SCREEN_CONTROLS) drawControls();
    else if (screen === SCREEN_PAUSED) drawPaused(state, ui);
    else if (screen === SCREEN_OVER) {
      const over = ui.overKind === 'busted' ? 'BUSTED' : 'WASTED';
      const sub = ui.overKind === 'busted'
        ? 'The Solmar Bay PD caught up with you.'
        : 'The streets of Solmar Bay got the better of you.';
      drawPanel(over, [sub, `Cash lost: $${ui.overFee}`, `Missions done: ${state.stats.missionsDone}/5`], 'Press R to try again · Enter for the title screen', ui.overKind === 'busted' ? '#4f8ff7' : '#e5534b');
    } else {
      drawHud(state, screen, ui);
      if (state.mission && state.mission.state === 'failed') {
        ctx.font = font(17, true);
        const msg = 'MISSION FAILED — press R to retry';
        const w = ctx.measureText(msg).width + 28;
        ctx.fillStyle = 'rgba(16,12,32,0.85)';
        roundRect((VIEW.width - w) / 2, 84, w, 34, 8);
        ctx.fill();
        text(msg, VIEW.width / 2, 94, 17, '#e5534b', 'center', true);
      }
      if (ui.hint) {
        text(ui.hint, VIEW.width / 2, VIEW.height - 24, 14, 'rgba(245,239,226,0.75)', 'center');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

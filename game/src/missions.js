// The story of SUNSET BAY: five missions for Danny "Dice" Marlowe, an ex-getaway driver
// back in Solmar Bay after three years away. All names, places and dialogue are original.
// The data lives here; the simulation in world.js calls updateMission() every step with
// a small API (say, setTarget, complete, fail, spawnEnemies, ...) so the missions read
// like a script: each stage names its objective, its marker and what finishes it.

export const STORY_INTRO = [
  'SOLMAR BAY — 6:47 PM. Three years after Dice Marlowe left town in a hurry,',
  'he is back, broke, and out of friends. His fixer Mona has one last job for him.',
];

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    briefing: [
      'MONA: "Dice. You need wheels before anything. Take any car on the street —',
      'just don\'t do it in front of a cop. Bring it to Lucky Respray so it\'s clean."',
    ],
  },
  {
    id: 'the-pickup',
    title: 'THE PICKUP',
    briefing: [
      'MONA: "Tessa needs a ride from The Palms Hotel to Port Solmar. She pays',
      'well and she hates waiting. Don\'t keep her waiting, Dice."',
    ],
  },
  {
    id: 'heat-on-the-strip',
    title: 'HEAT ON THE STRIP',
    briefing: [
      'MONA: "Somebody tipped the cops. You\'ve got two stars and half the precinct',
      'rolling your way. Respray the car at Lucky Respray — or lay low till it cools off."',
    ],
  },
  {
    id: 'dock-rats',
    title: 'DOCK RATS',
    briefing: [
      'MONA: "The Vultures are holding my package at Port Solmar. Four of them,',
      'armed. Take them down, grab the crate, and bring it home. Pistol\'s in the glovebox."',
    ],
  },
  {
    id: 'the-big-score',
    title: 'THE BIG SCORE',
    briefing: [
      'MONA: "One last job, Dice. Solmar National keeps its Friday cash in the back',
      'room. Walk in, take it, and get home. The whole city will be looking for you."',
    ],
  },
];

export const STORY_DONE = [
  'MONA: "That\'s the last of it, Dice. The money\'s clean, the Vultures are gone,',
  'and Solmar Bay is yours again. Welcome home."',
  'STORY COMPLETE — free roam: taxi fares, hidden packages and the whole city are yours.',
];

/**
 * Advance the active mission one step. `w` is the world state, `api` the helpers the
 * simulation provides. Returns nothing; mission progress lives on w.mission.
 */
export function updateMission(w, dt, api) {
  const m = w.mission;
  if (!m || m.state !== 'active') return;
  const places = w.city.places;
  const player = w.player;

  const dist = (x, y) => Math.hypot(player.x - x, player.y - y);

  switch (m.index) {
    case 0: {
      if (m.stage === 0) {
        api.setTarget(0, 0, '');
        api.setObjective('Steal a car — walk up to one and press E');
        if (!player.onFoot) {
          m.stage = 1;
          api.say(['MONA: "Good. Now bring it to Lucky Respray — follow the yellow marker."']);
        }
      } else {
        api.setTarget(places.spray.doorX, places.spray.doorY, 'Lucky Respray');
        api.setObjective('Drive to Lucky Respray');
        if (dist(places.spray.doorX, places.spray.doorY) < 70 && !player.onFoot) {
          api.complete(300, ['MONA: "Clean plates, clean car. Here\'s $300 — and a pistol,',
            'in the glovebox. You\'ll need it in this town."']);
          api.givePistol();
        }
      }
      break;
    }
    case 1: {
      if (m.stage === 0) {
        api.setTarget(places.hotel.doorX, places.hotel.doorY, 'The Palms Hotel');
        api.setObjective('Drive to The Palms Hotel');
        if (dist(places.hotel.doorX, places.hotel.doorY) < 70) {
          m.stage = 1;
          m.timer = 100;
          api.say(['TESSA: "About time. Port Solmar, and step on it — I\'m late already."']);
        }
      } else if (m.stage === 1) {
        api.setTarget(places.docks.doorX, places.docks.doorY, 'Port Solmar');
        api.setObjective(`Drop Tessa at Port Solmar — ${Math.max(0, Math.ceil(m.timer))}s left`);
        m.timer -= dt;
        if (m.timer <= 0) {
          api.fail('Tessa got tired of waiting and took a cab.');
        } else if (dist(places.docks.doorX, places.docks.doorY) < 70) {
          api.complete(500, ['TESSA: "Not bad, driver. Keep the change — all $500 of it."']);
        }
      }
      break;
    }
    case 2: {
      api.setTarget(places.spray.doorX, places.spray.doorY, 'Lucky Respray');
      api.setObjective('Lose the heat — respray the car, or stay out of sight');
      if (w.wantedStars === 0) {
        api.complete(400, ['MONA: "Heat\'s off. $400, and try not to collect stars like souvenirs."']);
      }
      break;
    }
    case 3: {
      if (m.stage === 0) {
        api.setTarget(places.docks.doorX, places.docks.doorY, 'Port Solmar');
        api.setObjective('Get to Port Solmar');
        if (dist(places.docks.doorX, places.docks.doorY) < 110) {
          m.stage = 1;
          api.spawnEnemies([
            { x: 3400, y: 490 }, { x: 3520, y: 610 },
            { x: 3420, y: 730 }, { x: 3540, y: 900 },
          ]);
          api.say(['VULTURE: "Mona\'s boy! Boys — light him up!"']);
        }
      } else if (m.stage === 1) {
        api.setObjective(`Take out the Vultures — ${w.enemiesAlive} left`);
        api.setTarget(places.docks.doorX, places.docks.doorY, 'Port Solmar');
        if (w.enemiesAlive === 0) {
          m.stage = 2;
          api.say(['MONA: "All four down. The crate is by the blue containers — grab it."']);
        }
      } else if (m.stage === 2) {
        api.setTarget(3450, 1080, 'The crate');
        api.setObjective('Grab the crate');
        if (dist(3450, 1080) < 46) {
          m.stage = 3;
          api.say(['MONA: "You\'ve got it. Bring it home, Dice. Don\'t stop for anyone."']);
        }
      } else {
        api.setTarget(places.safehouse.doorX, places.safehouse.doorY, "Dice's Apartment");
        api.setObjective('Bring the crate home');
        if (dist(places.safehouse.doorX, places.safehouse.doorY) < 70) {
          api.complete(800, ['MONA: "$800. The Vultures won\'t forget this — and neither will I."']);
        }
      }
      break;
    }
    case 4: {
      if (m.stage === 0) {
        api.setTarget(places.bank.doorX, places.bank.doorY, 'Solmar National Bank');
        api.setObjective('Get to Solmar National Bank');
        if (dist(places.bank.doorX, places.bank.doorY) < 70) {
          m.stage = 1;
          m.timer = 3;
          api.say(['DICE: "Friday cash, back room. In and out, thirty seconds..."']);
        }
      } else if (m.stage === 1) {
        api.setObjective('Grabbing the cash… stay by the door');
        api.setTarget(places.bank.doorX, places.bank.doorY, 'Solmar National Bank');
        m.timer -= dt;
        if (dist(places.bank.doorX, places.bank.doorY) > 120) {
          m.stage = 0;
          api.say(['DICE: "Not yet — I need to stay on the door."']);
        } else if (m.timer <= 0) {
          m.stage = 2;
          api.setWanted(50);
          api.say(['ALARM: "— INTRUDER ALARM —"  MONA: "Three stars, Dice. RUN. Get home!"']);
        }
      } else {
        api.setTarget(places.safehouse.doorX, places.safehouse.doorY, "Dice's Apartment");
        api.setObjective('Escape the cops — get home to Dice\'s Apartment');
        if (dist(places.safehouse.doorX, places.safehouse.doorY) < 70) {
          api.complete(2500, STORY_DONE);
        }
      }
      break;
    }
    default:
      break;
  }
}

/** Start mission `index` on the world: reset its stage and show the briefing. */
export function startMission(w, index, api) {
  w.mission = { index, stage: 0, timer: 0, state: 'active' };
  api.say(MISSIONS[index].briefing);
  api.setObjective(MISSIONS[index].title);
  // Mission 3 in the chain opens with the cops already on Dice.
  if (index === 2) api.setWanted(30);
}

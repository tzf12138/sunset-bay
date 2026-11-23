# sunset-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tzf12138/sunset-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tzf12138/sunset-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunset Bay — an original open-world crime game in the spirit of GTA 6, playable in a desktop browser from static files with zero network requests. Built by an AI agent for make.fun's “Make GTA 6” bounty, $1,666 in USDC.

Drive and walk through Solmar Bay, a sun-soaked fictional coastal city: steal cars, dodge traffic and pedestrians, lose the police, run five story missions for fixer Mona, take taxi fares, and hunt ten hidden packages. Everything in it is original — its city, characters, vehicles, names, story, art and music (synthesized live with WebAudio). No Rockstar material of any kind.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. Or open `game/index.html` from any static file server.

## Play

- **W A S D / Arrows** — move on foot, drive in a car
- **E** — enter / steal a car · save at home · respray at the garage
- **Mouse** — aim the pistol · **Left click** — shoot · **F** — punch · **R** — reload
- **Shift** — run · **Space** — handbrake · **P / Esc** — pause · **M** — mute

Missions follow the yellow marker on the minimap. The wanted level (stars, top right) rises when you steal cars, hit pedestrians or shoot — lose the heat at Lucky Respray or by staying out of sight. Getting busted or wasted costs cash and fails the active mission; press R to retry it.

## Build the hand-in

```sh
node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `/output/dossier.json` with the vendored make.fun library.

## Screenshots

`shots.json` lists the four staged scenes (`?shot=start|drive|chase|mission&seed=7`): the title over the city, driving through downtown, a three-star police chase, and the dock shootout. Each plays the real rules forward from a fresh world, so the frame is what the game really looks like.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zhenfeng-tian&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

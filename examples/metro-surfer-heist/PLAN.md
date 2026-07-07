# Metro Surfer Heist Plan

## Loop

The player starts in the center lane of a metro track. Hazards and coins move
toward the runner. The player switches lanes, jumps barriers, ducks gates, and
collects coins until the objective is complete or a hazard causes a crash.
Retry is immediate with `R` or `Enter`.

## Controls

- `A` / `ArrowLeft`: lane left.
- `D` / `ArrowRight`: lane right.
- `W` / `ArrowUp` / `Space`: jump.
- `S` / `ArrowDown`: duck.
- `R` / `Enter`: retry after fail or win.

## Objective And Progression

- Objective: collect 12 coins and run 260 meters.
- Score grows from distance and coin pickups.
- Speed increases with distance.
- Hazards recycle through lanes so the route keeps escalating.
- Fail states cover train collision, missed barrier jump, and missed gate duck.

## Assets

High-value surfaces are backed by local custom GLB assets:

- Hero: `assets/models/runner-thief.glb`.
- Obstacles: `assets/models/metro-train.glb`,
  `assets/models/jump-barrier.glb`, `assets/models/duck-gate.glb`.
- Reward: `assets/models/coin.glb`.
- Environment: rails, station platform, signs, trees, asphalt/platform
  textures, and set dressing under `assets/`.
- Audio feedback: `assets/goal-ping.wav`.

The catalog-first asset workflow was attempted during production but the local
SQLite catalog was unavailable, so the game uses a coherent local custom asset
kit. See `CREDITS.md` and `FRICTION.md`.

## Proof

- `node packages/cli/dist/index.js authoring validate --project examples/metro-surfer-heist --json`
- `node packages/cli/dist/index.js build --project examples/metro-surfer-heist --json`
- `node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json`
- `node packages/cli/dist/index.js verify --project examples/metro-surfer-heist --frames 3 --expect-motion --json`
- `node packages/cli/dist/index.js game qa --project examples/metro-surfer-heist --run-proof --entity runner --press KeyD --expect-axis x --json`
- `node packages/cli/dist/index.js game release --project examples/metro-surfer-heist --json`
- Aggregate generated-game gate: `pnpm verify:generated-games`

Raw evidence is under `artifacts/game-production/` and
`tools/verify/artifacts/game-production/verification-report.json`.

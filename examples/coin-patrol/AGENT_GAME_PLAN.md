# Agent Game Plan

Complete this worksheet before creating or substantially changing game source.
Use it as the implementation checklist, and keep
`artifacts/game-production/plan.json` as the machine-readable plan evidence.

## Game Goal

- User request: Collect 10 coins while avoiding 2 patrolling drones; start with 3 lives and show progress in the HUD.
- Template: structured-source-starter
- Project path: examples/coin-patrol
- Date: 2026-07-11
- Planned game category for asset catalog search: top-down

## First Commands

Run these before mutating `content/**/*.json` or `src/scripts/**/*.ts`:

```bash
tn game inspect --project . --json
tn game plan --goal "<game idea>" --project . --apply --json
pnpm run game:plan
```

Use `--apply` only when the goal matches a supported scaffold-first category
such as top-down collector or lane runner. Omit `--apply` for non-mutating
planning or unsupported genres.

If a command is unavailable, record the diagnostic code, path, severity, and
message here before choosing a fallback.

## Playable Loop

- Player verb: Move, collect, evade, and recover.
- Controls: MoveX uses A/D and arrows; MoveZ uses W/S and arrows; no jump action.
- Objective: Collect all ten coins; avoid drones until the CoinPatrol status becomes won or lost.
- Progression: Coins increment and hide on pickup; lives decrement on drone hit; a cooldown prevents repeated hits.
- Fail/retry path: A hit respawns the player; zero lives sets lost. Retry UI is a follow-up, not a release claim.
- Scoring or persistent state: CoinPatrol resource owns coins, lives, status, coinsLabel, and livesLabel.
- Feedback moments: Coin/life HUD mutations, player respawn, You win!, and Game over labels.

## High-Value Surface Inventory

Plan every high-value surface before source mutation.

| Surface | Source owner | Asset/source plan | Fallback blocker |
| --- | --- | --- | --- |
| Player/hero | content/scenes/arena.scene.json | src/scripts/player.ts | movePlayerToGoal | coin-pickup |
| Obstacle/enemy/vehicle | content/scenes/arena.scene.json | src/scripts/player.ts | dronePatrol, coinPatrolRules | coin-lives |
| Reward/interactable | content/scenes/arena.scene.json | src/scripts/player.ts | coinPatrolRules | coin-pickup, coin-win-state |
| World/environment | content/scenes/arena.scene.json | none | none | movement assertions |
| UI/HUD | content/ui/hud.ui.json | src/scripts/player.ts | coinPatrolRules | coin-pickup, coin-lives |
| Audio feedback | content/assets/arena.assets.json | none | none | build asset validation |

Primitive geometry is the last fallback. Do not mark primitive-only or
primitive-looking high-value surfaces as finished.

## UI Approach

- native ThreeNative UI is the portable default for HUD, prompts, menus,
  retained UI state, and UI that coordinates with 3D/game state.
- React webview UI is an optional screen-space panel layer for inventories,
  settings, shops, maps, dialogs, and similar overlays.
- Webview UI cannot attach to a 3D element and must not become the source of
  portable gameplay state.

## Asset Sourcing Plan

For each 3D model surface, search the shipped SQLite asset catalog first:

```bash
tn asset source search --game-category <category> --format glb --direct-only --json
tn asset source get <asset-source-id> --json
tn asset inspect assets --recursive --json
tn model-test assets/<model>.glb --json
```

For outdoor or arena games that need a dressed world, start from the generated
biome source path before hand-placing environment props:

```bash
tn world generate --biome meadow --seed 7 --project . --json
tn world proof --project . --json
```

Record selected catalog records next to committed assets.

| Surface | Search command | asset-source-id | Source URL | Provenance URL | Origin | License evidence | Review status | Downloaded date | Conversion notes | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Player/hero | `tn asset source search --game-category top-down --format glb --direct-only --json` | none selected | n/a | n/a | source capsule | reviewed | 2026-07-11 | portable primitive fallback | replace with catalog hero before release |
| Obstacle/enemy/vehicle | `tn asset source search --game-category top-down --format glb --direct-only --json` | none selected | n/a | n/a | source drones | reviewed | 2026-07-11 | portable primitive fallback | replace with authored or catalog drone before release |
| Reward/interactable | `tn asset source search --game-category top-down --format glb --direct-only --json` | none selected | n/a | n/a | source coins | reviewed | 2026-07-11 | trigger sphere fallback | replace with authored or catalog coin before release |
| World/environment | `tn asset source search --game-category top-down --format glb --direct-only --json` | none selected | n/a | n/a | source arena | reviewed | 2026-07-11 | bounded primitive arena | add dressed world before release |

Only after catalog search fails should you check curated open-source packs,
compatible GitHub/open-source packs, authored custom meshes, and finally
primitive fallback geometry.

## Animation And Scale Plan

- Active actor clips to inspect: none; the current source-owned primitives have no animation clips.
- Intended idle/run/action clips: add idle and patrol clips when hero/enemy catalog assets are selected.
- Runtime bounds expectations for hero: capsule remains visible above the arena floor and fits inside the camera rails.
- Runtime bounds expectations for vehicles, obstacles, rewards, landmarks, and environment: coin and drone bounds remain readable at the orthographic framing scale.
- Camera, pose, lighting, and speed alternatives to incoherent scale changes: keep the player near y=0.35, use ground-xz movement, and tune speed before changing scale.

```bash
tn game scale --project . --json
```

## Source Ownership

Name the durable source owner for every planned behavior.

| Behavior or state | content/**/*.json owner | src/scripts/**/*.ts module | Export | Proof |
| --- | --- | --- | --- | --- |
| Player control | content/input/arena.input.json | src/scripts/player.ts | movePlayerToGoal | coin-pickup |
| Objective/progression | content/schemas/resources.schema.json, content/scenes/arena.scene.json | src/scripts/player.ts | coinPatrolRules | coin-pickup, coin-win-state |
| Fail/retry | content/scenes/arena.scene.json | src/scripts/player.ts | coinPatrolRules | coin-lives |
| HUD/state binding | content/ui/hud.ui.json | src/scripts/player.ts | coinPatrolRules | coin-pickup, coin-lives |
| Audio/VFX feedback | content/assets/arena.assets.json | none | none | build validation |

Do not author raw Three.js scenes, raw Bevy/Rust gameplay, DOM gameplay,
filesystem access, workers, timers, renderer handles, or native runtime
handles.

## Polish Checklist

- [ ] Player/hero silhouette is recognizable and not placeholder geometry.
- [ ] Obstacle/enemy/vehicle silhouette is readable.
- [ ] Reward/interactable is easy to identify.
- [ ] World/environment has context, boundaries, landmarks, and scale cues.
- [ ] Materials communicate surface type through color, roughness/metalness,
      texture/normal detail where available, and coherent UV scale.
- [ ] Lighting and camera framing make the objective readable.
- [ ] Set dressing supports gameplay without obscuring it.
- [ ] VFX, motion, and audio feedback communicate state changes.
- [ ] UI states cover gameplay, pause, settings, loading, fail/retry,
      win/milestone, and touch controls when applicable.
- [ ] Mobile fit is checked.
- [ ] Performance budget and asset counts are recorded.

## Proof Checklist

Run the narrowest relevant proof first, then finish with the production loop.
Use `tn playtest` as an edit loop, not only as a final gate: after each
gameplay/input/script change, run the focused playtest, inspect the compact
stdout or `tn playtest report --latest --scenario <name> --json`, repair the
owning `content/**/*.json` or `src/scripts/**/*.ts`, and rerun until the proof
passes. Open deep machine logs such as `effect-log.json`, `observations.json`,
`runtime-trace.json`, `console.json`, or `network.json` only when the compact
report points to a specific diagnostic that requires them.

Discover what is provable before writing a scenario:

```bash
tn playtest --project . --discover --json
tn playtest --project . --suggest-scenario smoke-movement --json
```

For multi-step mechanics, create a committed scenario under
`playtests/*.playtest.json` and run it with stable artifacts. Use `--watch`
while iterating, and rerun with `--target desktop` to prove the native
runtime, not only web:

```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --watch --pass-once --json
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --target desktop --json
```

For a one-input smoke proof, use the one-shot form, then finish with the
production loop:

```bash
tn authoring validate --project . --json
tn build --project . --json
tn scene inspect <scene-id> --project . --json
tn playtest --project . --entity <entity-id> --press KeyD --frames 30 --expect-moved --json
tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json
tn game scale --project . --json
tn game score --project . --json
tn game qa --project . --run-proof --json
tn game release --project . --json
```

- Build proof: `tn authoring validate`, `tn build`, and `tn iterate` pass for the pickup scenario.
- Runtime readiness proof: web pickup scenario reports runtimeReady with clean diagnostics.
- Nonblank screenshot proof: iterate artifacts under `artifacts/iterate/latest/`.
- Visible motion proof: `coin-pickup.playtest.json` movement assertion.
- Active character/vehicle animation proof: not applicable to current primitive source-owned actors.
- Scale proof: run `tn game scale --project . --json` before release enrollment.
- Input playtest proof: pickup and lives scenarios use MoveX/MoveZ keys.
- Score/QA/release blockers: native pickup parity, mobile evidence, and authored visual assets remain build-only blockers.
- Fallback evidence: committed source, schema, and playtest files document the portable behavior while native parity is investigated.

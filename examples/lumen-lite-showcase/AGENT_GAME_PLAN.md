# Agent Game Plan

Complete this worksheet before creating or substantially changing game source.
Use it as the implementation checklist, and keep
`artifacts/game-production/plan.json` as the machine-readable plan evidence.

## Game Goal

- User request:
- Template:
- Project path:
- Date:
- Planned game category for asset catalog search:

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

- Player verb:
- Controls:
- Objective:
- Progression:
- Fail/retry path:
- Scoring or persistent state:
- Feedback moments:

## High-Value Surface Inventory

Plan every high-value surface before source mutation.

| Surface | Source owner | Asset/source plan | Fallback blocker |
| --- | --- | --- | --- |
| Player/hero |  |  |  |
| Obstacle/enemy/vehicle |  |  |  |
| Reward/interactable |  |  |  |
| World/environment |  |  |  |
| UI/HUD |  |  |  |
| Audio feedback |  |  |  |

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
| Player/hero |  |  |  |  |  |  |  |  |  |  |
| Obstacle/enemy/vehicle |  |  |  |  |  |  |  |  |  |  |
| Reward/interactable |  |  |  |  |  |  |  |  |  |  |
| World/environment |  |  |  |  |  |  |  |  |  |  |

Only after catalog search fails should you check curated open-source packs,
compatible GitHub/open-source packs, authored custom meshes, and finally
primitive fallback geometry.

## Animation And Scale Plan

- Active actor clips to inspect:
- Intended idle/run/action clips:
- Runtime bounds expectations for hero:
- Runtime bounds expectations for vehicles, obstacles, rewards, landmarks, and
  environment:
- Camera, pose, lighting, and speed alternatives to incoherent scale changes:

```bash
tn game scale --project . --json
```

## Source Ownership

Name the durable source owner for every planned behavior.

| Behavior or state | content/**/*.json owner | src/scripts/**/*.ts module | Export | Proof |
| --- | --- | --- | --- | --- |
| Player control |  |  |  |  |
| Objective/progression |  |  |  |  |
| Fail/retry |  |  |  |  |
| HUD/state binding |  |  |  |  |
| Audio/VFX feedback |  |  |  |  |

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

- Build proof:
- Runtime readiness proof:
- Nonblank screenshot proof:
- Visible motion proof:
- Active character/vehicle animation proof:
- Scale proof:
- Input playtest proof:
- Score/QA/release blockers:
- Fallback evidence:

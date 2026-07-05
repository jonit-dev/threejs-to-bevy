# Agent Game Creation Workflow

This workflow is the bounded path for agents creating or improving generated
3D games. It keeps source edits in `content/**/*.json` and
`src/scripts/**/*.ts`, preserves generated `dist/**` as output, and avoids
refactoring unrelated examples.

## Start With Inventory

Run the inventory before editing:

```bash
tn game inspect --project . --json
```

Use the report to identify the project kind, primary scene, editable source
documents, script module/export owners, high-value surfaces, and proof
commands. Existing examples may be playable projects, templates, fixtures, or
production candidates; do not normalize or delete them unless the current task
requires it.

## Plan Before Mutation

In generated starter projects, open `AGENT_GAME_PLAN.md` first. It is the local
worksheet for playable loop, high-value surfaces, native UI versus React
webview UI decisions, catalog-first asset sourcing, animation/scale, source
ownership, polish, and proof. Then run a non-mutating plan:

```bash
tn game plan --goal "<game idea>" --project . --json
```

The plan records playable loop, controls, objective, progression, retry path,
feedback moments, source owners, script owners, asset sourcing commands, polish
tasks, and proof commands. The worksheet is the human/agent checklist;
persisted production work keeps machine-readable evidence at
`artifacts/game-production/plan.json`.
Before writing scripts, inspect the plan's `gameplayBlocks` rows. Select the
matching basis, controller, camera, objective, spawn, or world block, then use
its helper imports and proof commands as the movement/state contract. Common
block IDs include:

| Block | Use |
| --- | --- |
| `basis.y-up-z-forward` | Shared right/up/forward signs and planar conversion through `BasisEx`. |
| `controller.world-cardinal-character` | Character movement intent through `ControllerEx.worldCardinalCharacter`. |
| `camera.position-follow` | Source-owned follow camera framing through `CameraMath`. |
| `objective.collectible` | Triggered pickup/score loops with retained UI resource updates. |
| `objective.checkpoint-lap` | Ordered checkpoint, lap, finish, and retry state through `CheckpointRaceEx`. |
| `spawn.region-sampler` | Deterministic spawn points through `SpawnEx` and `RandomEx`. |

## Apply Bounded Recipes

`tn game improve --apply-plan <file> --json` applies only complete plan steps
with `apply: true`, `recipe`, and `recipeArgs`. Recipes are additive structured
source operations; they do not generate arbitrary TypeScript gameplay bodies.
If a recipe attaches `src/scripts/player.ts#laneRunnerSystem`, that module and
export must exist or validation will fail with a script-owner diagnostic.

Common 3D game recipes:

- `top-down-collector`: creates MoveX/MoveZ input axes, a kinematic capsule
  player, a trigger collectible, score resource/UI binding, camera follow, and
  a gameplay system reference.
- `lane-runner`: creates lane-change and jump actions, a kinematic runner,
  a trigger hazard, camera follow, and a runner system reference.
- `vehicle-checkpoint`: creates steer/throttle axes, a kinematic vehicle,
  checkpoint trigger, camera follow, and a checkpoint system reference.
- `obstacle-avoider`: creates a kinematic player, trigger obstacle, and system
  reference for avoid/fail behavior.
- `physics-target`: creates dynamic projectile and target bodies with
  colliders plus a system reference for target gameplay state.
- `dressed-environment-kit`: creates ground/landmark materials, scene
  dressing, a landmark, and a key light.

Recipe plan output includes:

- `recipeGeneratedIds`: IDs the recipe expects to create or touch.
- `recipeGameplayBlocks`: block IDs that describe the recipe's controller,
  camera, objective, world, or proof semantics.
- `recipeSourceOwners`: source families and bounded operations used.
- `recipeProofCommands`: local commands to validate, build, inspect, and
  playtest the slice.
- `recipeProofHints` and `recipeScriptResponsibilities`: source-owned behavior
  and evidence the attached script module is expected to prove.

## Asset And Visual Work

Before sourcing models, search the shipped SQLite catalog:

```bash
tn asset source search --game-category <category> --format glb --direct-only --json
tn asset source get <asset-source-id> --json
```

Record catalog ID, source URL, provenance URL, origin, license evidence, review
status, downloaded date, and conversion notes next to committed assets. Use
`tn asset inspect` and `tn model-test` after downloading or referencing a
model. Primitive recipes are a source skeleton, not final art direction.

## Proof Loop

Use the narrowest relevant proof first:

```bash
tn authoring validate --project . --json
tn build --project . --json
tn scene inspect <scene-id> --json
tn playtest --project . --entity <entity-id> --press KeyD --frames 30 --expect-moved --json
tn game qa --project . --run-proof --json
```

For a production candidate, finish with `tn game release --project . --json`
and keep the generated evidence under `artifacts/game-production/`.

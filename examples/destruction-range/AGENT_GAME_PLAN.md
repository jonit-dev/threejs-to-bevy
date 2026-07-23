# Destruction Range Production Plan

Status: planned reimplementation, awaiting fresh implementation and proof.

Historical timing note: the first source implementation predated a valid
machine plan, and the earlier task graph reported
`TN_GAME_TASK_SOURCE_MISSING`. That prototype is retained at checkpoint
`3ae94543`; it is not represented as plan-first work.

Reimplementation boundary: on 2026-07-23, after checkpointing the inspected
prototype and before any further implementation mutation, `tn game plan` wrote
`artifacts/game-production/plan.json` with SHA-256
`8de4b4b6c0b0fdebc109c0cd5814d8ec7f692e91961c5772bc1a7342df15ffbd`.
`tn authoring inspect --plan artifacts/game-production/plan.json` then
confirmed the actual projectile, fracture, scene, script, and proof owners.
The planner's generic five-target command was not applied because it does not
cover regional fracture activation, debris budgeting, or settling. The final
implementation must re-author the owners below after this boundary and obtain
fresh proof.

## Playable Loop

- Action: launch a fast projectile into the authored wall.
- Objective: cross the damage threshold, break only the impacted region, keep
  unrelated pieces stable, and let activated debris settle within budget.
- Fail/retry: `KeyR` restores the range and increments the retry state.
- Feedback: impact motion, orange warning materials, regional piece separation,
  retained state, and labeled proof captures.

The positive scenario is `playtests/projectile-threshold.playtest.json`; the
retry control is `playtests/retry.playtest.json`. Both require web and desktop
proof.

## Reimplementation Owners

- `src/scripts/range.ts`: express causal impact, regional activation, debris
  budget, settling, completion, and retry as a plan-driven objective loop.
- `content/scenes/arena.scene.json`,
  `content/fractures/wall.fracture.json`, and
  `content/systems/arena.systems.json`: retain the authored target and portable
  collision contract while exposing bounded state ownership.
- `playtests/projectile-threshold.playtest.json` and
  `playtests/retry.playtest.json`: enroll positive and retry behavior against
  fresh web and desktop source and bundle hashes.
- Generator/asset source, `docs/asset-provenance.md`, and this plan: retain
  deterministic target generation, no-clip rationale, provenance, and scale
  checks.

## High-value Surfaces

| Surface | Durable owner | Production treatment |
| --- | --- | --- |
| Destructible target | `content/generators/destruction.target-block.*`, `content/assets/destruction.target-block.assets.json` | Deterministic project-local GLB with four mesh nodes and authored concrete/warning materials. |
| Fracture behavior | `content/fractures/wall.fracture.json`, scene source | Stable piece/bond IDs, regional thresholds, bounded active pieces, and cleanup policy. |
| Projectile/range | `content/scenes/arena.scene.json` | Authored fast body, floor, lighting, camera, and impact framing. |
| HUD/audio | `content/ui/hud.ui.json`, `content/assets/arena.assets.json` | Retained state and local completion cue. |

## Source Ownership

| Behavior | Structured-source owner | Script/export |
| --- | --- | --- |
| Projectile and collision | `content/scenes/arena.scene.json` | Retained physics runtime |
| Damage, regional break, settle | Scene plus fracture manifest | `src/scripts/range.ts#updateDestructionRange` |
| Retry | `content/input/arena.input.json`, systems source | `src/scripts/range.ts#updateDestructionRange` |
| HUD | `content/ui/hud.ui.json` | `DestructionState` resource |

## Animation, Scale, and Polish

- The target uses physical piece motion rather than animation clips.
- Inspection reports 48 triangles, four mesh nodes, two authored materials,
  and a 2.345 x 1.846 x 0.775 bound with an `ok` scale verdict.
- The generator recipe and generated-source record own reproducibility; the
  checked GLB hash is documented in `docs/asset-provenance.md`.
- Manual review must show intact, regionally broken, and settled states without
  hiding the wall behind debug overlays.

## Required Proof

```bash
tn authoring validate --project . --json
tn build --project . --json
tn playtest --project . --scenario playtests/projectile-threshold.playtest.json --target web --json
tn playtest --project . --scenario playtests/projectile-threshold.playtest.json --target desktop --json
tn playtest --project . --scenario playtests/retry.playtest.json --target web --json
tn playtest --project . --scenario playtests/retry.playtest.json --target desktop --json
```

Completion requires causal impact, regional break, and settle states; bounded
piece allocation; exact adapter state parity; and a separate retry assertion.

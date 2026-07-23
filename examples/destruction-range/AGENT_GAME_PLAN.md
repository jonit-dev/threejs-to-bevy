# Destruction Range Production Plan

Status: implemented and proof-complete on 2026-07-23.

Timing note: this retained plan was regenerated after the first source
implementation. The earlier task graph was invalid and reported
`TN_GAME_TASK_SOURCE_MISSING`; the current task graph is `ok: true` and hashes
the actual system/script ownership. The planner emitted
`TN_GAME_PLAN_OFF_RECIPE`, and inspection confirmed the custom projectile and
fracture loop, so no generic character recipe was applied.

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

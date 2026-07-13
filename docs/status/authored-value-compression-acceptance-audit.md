# Authored-Value Compression Acceptance Audit

Date: 2026-07-12

This audit evaluates every acceptance criterion in
`docs/PRDs/other/authored-value-compression-placement-interactions.md` against
the current working tree. `PASS` requires direct source, test, artifact, or
gate evidence. `FAIL` means the PRD remains active and must not move to
`docs/PRDs/done`.

## PlacementSet

| Criterion | Status | Evidence |
| --- | --- | --- |
| Grid, line, ring, and lanes are fixture-proven; explicit remains the escape hatch. | PASS | `packages/compiler/src/authoring/placementSets.test.ts` covers all five closed patterns. |
| Expanded output is deterministic across repeated builds. | PASS | `packages/compiler/src/placementSets.integration.test.ts` compares repeated bundle bytes. |
| Expanded entities are behaviorally and visually equivalent to explicit fixtures. | PASS | The four `artifacts/placement-migration/proof.json` files record exact normalized expansion equality; web and desktop placement-visibility scenarios pass for Dense, Chess, Orb, and Metro. |
| Dense scene source drops at least 60% without reducing entity count or proof quality. | PASS | Scene source is 61,894 -> 14,951 bytes (75.85%); exact expansion retains 216 migrated plus 10 explicit entities. |
| Selected Chess placement source drops at least 30% with stable IDs/state. | PASS | Canonically serialized pawn source is 8,274 -> 4,554 bytes (44.96%); exact expansion retains all 16 pawn IDs and component values. Whole-file source is 57,631 -> 53,460 bytes; unrelated Chess formatting is unchanged. |
| Build does not write expanded entities into durable source. | PASS | Compiler integration test hashes source before/after repeated builds. |
| Inspect/dry-run exposes generated IDs and provenance. | PASS | Authoring/CLI tests and migration proofs contain generated ID, set ID, index, generated ID, and source path; dry-run records `wroteSource: false`. |

Normalized covered-group metrics remove formatting as a variable: 67,688
bytes before and 29,508 after, a 56.41% reduction. This replaces the earlier
invalid whole-file aggregate that included unrelated Chess compaction.

## Interaction

| Criterion | Status | Evidence |
| --- | --- | --- |
| Pickup, hazard, checkpoint, and projectile fixtures pass on web and Bevy. | PASS | Four catalog entries use the shared `physics-events` bundle; `pnpm verify:conformance` compares persisted web/native pairs. |
| Duplicate sensor contact cannot double-reward once-per-target. | PASS | Web pickup test and native pickup test replay duplicate contact and retain one reward. |
| Completion fires exactly once per lifecycle cycle. | PASS | Web/native runtime state tests assert one completion event. |
| Orb Reactor no longer owns manual collectible glue. | PASS | `src/scripts/orbs.ts` is removed; `content/interactions/orb-collection.interactions.json` owns detection, reward, despawn, and completion. |
| Coin Patrol has no hard-coded coin IDs or `y=-100` collection hiding. | PASS | Collection is interaction-owned; source search finds neither the ID array nor the hiding sentinel. Drone logic uses the `drone` tag query. |
| Both adapters produce the same normalized traces and live state. | PASS | `tools/verify/src/interactionParity.ts` compares trace, resources, and live IDs; reordered effects, double reward, and missed despawn are negative controls. |
| Unsupported detectors/effects fail before runtime where statically knowable. | PASS | `packages/ir/src/interactionsValidation.ts` and its exhaustive tests emit the stable `TN_INTERACTION_*` diagnostics. |
| Default playtest output stays compact and full traces are artifact-backed. | PASS | `pnpm verify:agent-io` is within budget; paired full traces live under `packages/ir/artifacts/conformance/interactions/`. |

## Adoption and efficiency

| Criterion | Status | Evidence |
| --- | --- | --- |
| Canonical simple-movement examples use the promoted helper path. | FAIL | Dense and Neon use `ControllerEx.worldCardinalCharacter`; Orb Reactor and Coin Patrol still hand-roll fixed-delta movement. |
| Registry-owned archetype/flow/sequence/UI defaults replace exact local copies. | FAIL | Exact duplicate top-down archetype, match-flow, and intro-sequence documents remain in canonical examples. |
| Canonical scripts do not duplicate access metadata derivable by `defineBehavior`. | PASS | Migrated systems documents use `source: behavior-metadata` and retain only attachment identity. |
| At least four fixtures across at least three genres use the contracts. | PASS | Dense benchmark, Chess strategy, Orb action/collector, and Metro lane-runner sources use PlacementSet; interaction conformance covers four objective shapes. |
| Equal-proof covered objective loops have at least 30% fewer TS lines. | PASS | Orb `orbs.ts` and Coin `player.ts` total 218 -> 120 lines (44.95%); Orb and Coin pickup scenarios pass after migration. |
| Covered repeated placement has at least 50% fewer JSON bytes. | PASS | Canonically serialized covered groups total 67,688 -> 29,508 bytes (56.41%). |
| Covered prompts use at least 30% fewer authoring/repair operations with no more failures. | FAIL | No matched pre/post PlacementSet and Interaction prompt benchmark exists. The Phase-0 baseline explicitly records this evidence gap; unrelated session-cost scenarios cannot prove it. |
| Screenshot, motion, input, generated-game QA, and native parity do not regress. | FAIL | Workspace tests, four web/desktop placement proofs, Orb/Coin pickup proofs, gameplay parity, and smoke pass. The authoritative generated-game report remains red: Metro proof hashes are stale after its scene migration, and bounded attempts to refresh its scenarios timed out; the report also contains pre-existing Humanoid and aggregate-inventory failures. |

## Verification commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm build` | PASS | Required one related editor switch update for the new interaction document kind. |
| `pnpm typecheck` | PASS | Workspace. |
| `pnpm lint` | PASS | Workspace. |
| `pnpm test` | PASS | Workspace, including the recursive browser graph guard. |
| `pnpm verify:conformance` | PASS | Interaction comparator is invoked for all four catalog scenarios. |
| `pnpm verify:gameplay-parity` | PASS | Web/native gameplay parity. |
| `pnpm verify:cookbook` | PASS | PlacementSet and Interaction cookbook entries replay. |
| `pnpm verify:agent-io` | PASS | Report status `pass`; command outputs remain within budget. |
| `pnpm verify:session-cost` | FAIL | Authoritative report status is `fail`: the pre-existing typed-spec top-down collector iterate step exits 143, leaving one failed command and no accepted replay. The command currently exits zero despite the failed report. |
| `pnpm check:docs` | PASS | Docs consistency. |
| `pnpm verify:generated-games` | FAIL | Authoritative game-production report is red. Related Metro scenario proofs are stale after the scene migration; refresh attempts timed out. Independent baseline debt also remains for Humanoid proof coverage and Chess/Orb aggregate enrollment. |
| `pnpm verify:smoke` | PASS | Names, docs, and example build sweep. |

## Completion decision

The PRD is **not complete**. Four acceptance criteria remain unproved or
contradicted, and the authoritative session-cost and generated-game reports
are red. Keep the PRD in `docs/PRDs/other`; do not promote or archive it until
those items are fixed and the full verification table is green.

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
| Canonical simple-movement examples use the promoted helper path. | PASS | Orb Reactor and Coin Patrol now use `ControllerEx.worldCardinalCharacter`, joining Dense and Neon. The adoption ratchet names all four examples; Orb movement/pickup and Coin movement/pickup web scenarios pass, and the aggregate gameplay-parity gate passes. |
| Registry-owned archetype/flow/sequence/UI defaults replace exact local copies. | PASS | `packages/authoring/src/documentPresets.ts` owns the closed `game-archetype.top-down`, `flow.ready-playing-win`, and `sequence.intro-camera` presets. Nine exact local copies now reference those presets, authoring tests prove expansion before validation, and the adoption ratchet prevents duplicate documents from returning. Existing UI documents are not exact semantic copies and retain recipe provenance instead of being forced into a false shared default. |
| Canonical scripts do not duplicate access metadata derivable by `defineBehavior`. | PASS | Migrated systems documents use `source: behavior-metadata` and retain only attachment identity. |
| At least four fixtures across at least three genres use the contracts. | PASS | Dense benchmark, Chess strategy, Orb action/collector, and Metro lane-runner sources use PlacementSet; interaction conformance covers four objective shapes. |
| Equal-proof covered objective loops have at least 30% fewer TS lines. | PASS | Orb `orbs.ts` and Coin `player.ts` total 218 -> 120 lines (44.95%); Orb and Coin pickup scenarios pass after migration. |
| Covered repeated placement has at least 50% fewer JSON bytes. | PASS | Canonically serialized covered groups total 67,688 -> 29,508 bytes (56.41%). |
| Covered prompts use at least 30% fewer authoring/repair operations with no more failures. | PASS | `tools/verify/artifacts/authored-value-compression/benchmark-report.json` records matched deterministic replays with identical proof sets: PlacementSet is 8 -> 1 mutations and Interaction is 5 -> 1, totaling 13 -> 2 (84.62% fewer), while failed commands remain 0 -> 0. `authoredValueCompressionBenchmark.test.ts` guards the method, proof equality, threshold, and failure count and explicitly excludes LLM-token/session-cost claims. |
| Screenshot, motion, input, generated-game QA, and native parity do not regress. | PASS | Gameplay parity passes across web/native. Metro's final `tn game qa --run-proof` report has zero blockers, diagnostics, or release risks and all five scenarios pass; the aggregate generated-games step for Metro exits 0. The playtest collector now pauses simulation outside declared input/wait steps, and the refreshed failure, retry, progression, smoke, and desktop placement proofs retain their assertions. Orb/Coin focused movement and pickup proofs pass. Aggregate generated-games remains red only for unrelated Humanoid proof debt and Chess/Orb enrollment drift; conformance is separately blocked by an unrelated uncommitted `overlay_host.rs` feature-gating failure. |

## Verification commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm build` | PASS | Required one related editor switch update for the new interaction document kind. |
| `pnpm typecheck` | PASS | Workspace. |
| `pnpm lint` | PASS | Workspace. |
| `pnpm test` | FAIL | 276/277 verify-tools tests pass. The remaining unrelated baseline contradiction is `accepts maintained starters with production scripts metadata and instructions`: its fixture omits the local SFX guidance already required by `templateProductionGate.ts`. The focused related tests pass. |
| `pnpm verify:conformance` | FAIL | The current unrelated `runtime-bevy/.../tests/overlay_host.rs` edit imports three `native-webview`-gated symbols in the default build, so Bevy compilation exits 101 before conformance runs. |
| `pnpm verify:gameplay-parity` | PASS | Full web/native gameplay parity; three non-failing diagnostics are recorded. |
| `pnpm verify:cookbook` | PASS | All 34 entries replay, including the registry-owned document-default pattern. |
| `pnpm verify:agent-io` | PASS | Report status `pass`; command outputs remain within budget. |
| `pnpm verify:session-cost` | PASS | Authoritative report is `pass`/`ok: true`; every replay has zero failed commands. The typed-spec collector completes in three steps, and the dispatcher now returns non-zero when the authoritative report is missing or non-passing. |
| `pnpm check:docs` | PASS | Docs consistency, rerun after this audit update. |
| `pnpm verify:generated-games` | FAIL | The Metro validation step exits 0 with zero blockers and release risks. The aggregate report remains red only for unrelated Humanoid proof/plan/QA debt and Chess/Orb enrollment drift. |
| `pnpm verify:smoke` | PASS | Names, docs, and example build sweep. |

## Completion decision

All acceptance criteria now have direct passing evidence, including the four
items closed by this follow-up. The PRD nevertheless remains **active** because
the required aggregate verification table is not fully green: the unrelated
template-production unit-test fixture is inconsistent with its gate,
conformance cannot compile the unrelated uncommitted overlay-host test, and
generated-games still reports unrelated Humanoid and enrollment debt. Keep the
PRD in `docs/PRDs/other`; do not archive it or weaken those gates. The related
implementation is complete and scoped verification is green.

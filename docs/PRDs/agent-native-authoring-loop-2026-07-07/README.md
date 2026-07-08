# Agent-Native Authoring Loop PRDs

This folder slices
`docs/PRDs/engine-improvement-candidates-2026-07-07.md` into an ordered
execution bundle. The strategic bet is the agent-native authoring loop:
lower the token cost of authored game deltas, raise the visual/gameplay
quality ceiling inside the existing contract, and cut standing maintenance
weight. These PRDs intentionally avoid broad new Bevy parity work.

## Ordered PRDs

1. [PRD-001 Off-Recipe Benchmark Round](../done/agent-native-authoring-loop-2026-07-07/PRD-001-off-recipe-benchmark-round.md) - done
2. [PRD-002 Archetype Scaffolds](../done/agent-native-authoring-loop-2026-07-07/PRD-002-archetype-scaffolds.md) - done
3. [PRD-003 Compositional Mechanic Blocks](../done/agent-native-authoring-loop-2026-07-07/PRD-003-compositional-mechanic-blocks.md) - done
4. [PRD-004 Schema-Aware Mutation Surface](../done/agent-native-authoring-loop-2026-07-07/PRD-004-schema-aware-mutation-surface.md) - done
5. [PRD-005 Prescriptive Diagnostics v2](../done/agent-native-authoring-loop-2026-07-07/PRD-005-prescriptive-diagnostics-v2.md) - done
6. [PRD-006 Cookbook Few-Shot Pattern Pairs](../done/agent-native-authoring-loop-2026-07-07/PRD-006-cookbook-few-shot-pattern-pairs.md) - done
7. [PRD-007 Beautiful Scaffolds](PRD-007-beautiful-scaffolds.md)
8. [PRD-008 API Pruning To In-Distribution Shapes](PRD-008-api-pruning-in-distribution-shapes.md)
9. [PRD-009 Session Cost Ratchet In CI](PRD-009-session-cost-ratchet-ci.md)
10. [PRD-010 Meta-Layer Compression](PRD-010-meta-layer-compression.md)
11. [PRD-011 Native Path Decision And Parity Freeze](PRD-011-native-path-decision-parity-freeze.md)
12. [PRD-012 Ship One Genuinely Good Game](PRD-012-ship-one-good-game.md)
13. [PRD-013 Derived Resource Declarations](../done/agent-native-authoring-loop-2026-07-07/PRD-013-derived-resource-declarations.md) - done
14. [PRD-014 Runtime Resource Parity Diagnostics](../done/agent-native-authoring-loop-2026-07-07/PRD-014-runtime-resource-parity-diagnostics.md) - done
15. [PRD-015 Write-Time Validation And Retry Ratchet](../done/agent-native-authoring-loop-2026-07-07/PRD-015-write-time-validation-and-retry-ratchet.md) - done
16. [PRD-016 Equal-Proof Benchmark Protocol](../done/agent-native-authoring-loop-2026-07-07/PRD-016-equal-proof-benchmark-protocol.md) - done
17. [PRD-017 Typed TypeScript Game Spec](PRD-017-typed-typescript-game-spec.md)
18. [PRD-018 Vanilla-Lift Pipeline Decision](PRD-018-vanilla-lift-pipeline-decision.md)
19. [PRD-019 Step-Class Elimination For The Authoring Loop](../done/agent-native-authoring-loop-2026-07-07/PRD-019-step-class-elimination.md) - done

## Dependency Shape

- PRD-001 is the gate. It answers whether the scaffold-first pass generalized
  off recipe.
- PRDs 002-009 can proceed after or in parallel with PRD-001, but benchmark
  claims must wait for PRD-001 evidence.
- PRDs 010-011 are structural decisions that reduce standing cost and prevent
  parity breadth from pulling effort away from the authoring loop.
- PRD-012 is the capstone and should start only after the scaffolds, blocks,
  cookbook, visual defaults, and native-path decision have usable slices.
- PRDs 013-015 are the round-4 tactical fixes: remove mechanical resource
  declaration failures, close the runtime resource-observation black box, and
  make write-time validation plus retry-chain gates enforce one-step recovery.
- PRD-016 corrects the benchmark protocol before the next decision round:
  equal proof for vanilla and ThreeNative, at least three repeats, honest
  parity thresholds, and beyond-one-shot prompts.
- PRD-017 is the preferred architectural bet if tactical fixes reach parity
  but not a decisive win: make typed TypeScript the authoring schema and keep
  canonical JSON/IR as generated artifacts.
- PRD-018 is decision-gated. Start it only if PRD-016 evidence shows direct
  ThreeNative authoring remains above the equal-proof threshold after PRDs
  013-015 land.
- PRD-019 is done. It responds to the round-5 collector matrix: eliminate the measured
  churn step classes (engine-source greps, standalone verifies, artifact
  forensics, missing iterate adoption) by construction and ratchet them per
  run, so the cross-prompt confirmation rerun that feeds the PRD-017 Phase 5
  and PRD-018 Phase 1 decisions is friction-free.

## Source Evidence

- `CHALLENGES.md`
- `tools/agent-benchmark/OFF-RECIPE-DIRECTIVE.md`
- `tools/agent-benchmark/OFF-RECIPE-ROUND-4-RECOMMENDATIONS-2026-07-07.md`
- `tools/agent-benchmark/TOKEN-COST-DIRECTION.md`
- `tools/verify/artifacts/agent-benchmark/`

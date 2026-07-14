# Agent-Native Authoring Loop PRDs

This folder slices
`docs/PRDs/archive/engine-improvement-candidates-2026-07-07.md` into an ordered
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
7. [PRD-007 Beautiful Scaffolds](../done/agent-native-authoring-loop-2026-07-07/PRD-007-beautiful-scaffolds.md) - done
8. [PRD-008 API Pruning To In-Distribution Shapes](../done/agent-native-authoring-loop-2026-07-07/PRD-008-api-pruning-in-distribution-shapes.md) - done
9. [PRD-009 Session Cost Ratchet In CI](../done/agent-native-authoring-loop-2026-07-07/PRD-009-session-cost-ratchet-ci.md) - done
10. [PRD-010 Meta-Layer Compression](../done/agent-native-authoring-loop-2026-07-07/PRD-010-meta-layer-compression.md) - done
11. [PRD-011 Native Path Decision And Parity Freeze](../done/agent-native-authoring-loop-2026-07-07/PRD-011-native-path-decision-parity-freeze.md) - done
12. [PRD-012 Ship One Genuinely Good Game](PRD-012-ship-one-good-game.md)
13. [PRD-013 Derived Resource Declarations](../done/agent-native-authoring-loop-2026-07-07/PRD-013-derived-resource-declarations.md) - done
14. [PRD-014 Runtime Resource Parity Diagnostics](../done/agent-native-authoring-loop-2026-07-07/PRD-014-runtime-resource-parity-diagnostics.md) - done
15. [PRD-015 Write-Time Validation And Retry Ratchet](../done/agent-native-authoring-loop-2026-07-07/PRD-015-write-time-validation-and-retry-ratchet.md) - done
16. [PRD-016 Equal-Proof Benchmark Protocol](../done/agent-native-authoring-loop-2026-07-07/PRD-016-equal-proof-benchmark-protocol.md) - done
17. [PRD-017 Typed TypeScript Game Spec](../done/agent-native-authoring-loop-2026-07-07/PRD-017-typed-typescript-game-spec.md) - done; remains experimental, not default
18. [PRD-018 Vanilla-Lift Pipeline Decision](../done/agent-native-authoring-loop-2026-07-07/PRD-018-vanilla-lift-pipeline-decision.md) - done; vanilla-lift prototype not started
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
- PRD-017 is closed as an experimental opt-in. Round-5 guided collector
  evidence shows typed-spec at about 0.95x direct ThreeNative, but it missed the
  failed-command budget and does not become the default authoring surface.
- PRD-018 is closed. The vanilla-lift trigger did not fire: guided round-5
  collector evidence shows direct ThreeNative below vanilla at equal proof, and
  the remaining aggregate failure is the symmetric failed-command budget.
- PRD-019 is done. It responds to the round-5 collector matrix by eliminating
  the measured churn step classes (engine-source greps, standalone verifies,
  artifact forensics, missing iterate adoption) by construction and ratcheting
  them per run.

## Source Evidence

- `CHALLENGES.md`
- `tools/agent-benchmark/OFF-RECIPE-DIRECTIVE.md`
- `tools/agent-benchmark/OFF-RECIPE-ROUND-4-RECOMMENDATIONS-2026-07-07.md`
- `tools/agent-benchmark/TOKEN-COST-DIRECTION.md`
- `tools/verify/artifacts/agent-benchmark/`

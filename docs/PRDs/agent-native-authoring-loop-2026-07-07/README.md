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
3. [PRD-003 Compositional Mechanic Blocks](PRD-003-compositional-mechanic-blocks.md)
4. [PRD-004 Schema-Aware Mutation Surface](PRD-004-schema-aware-mutation-surface.md)
5. [PRD-005 Prescriptive Diagnostics v2](PRD-005-prescriptive-diagnostics-v2.md)
6. [PRD-006 Cookbook Few-Shot Pattern Pairs](PRD-006-cookbook-few-shot-pattern-pairs.md)
7. [PRD-007 Beautiful Scaffolds](PRD-007-beautiful-scaffolds.md)
8. [PRD-008 API Pruning To In-Distribution Shapes](PRD-008-api-pruning-in-distribution-shapes.md)
9. [PRD-009 Session Cost Ratchet In CI](PRD-009-session-cost-ratchet-ci.md)
10. [PRD-010 Meta-Layer Compression](PRD-010-meta-layer-compression.md)
11. [PRD-011 Native Path Decision And Parity Freeze](PRD-011-native-path-decision-parity-freeze.md)
12. [PRD-012 Ship One Genuinely Good Game](PRD-012-ship-one-good-game.md)

## Dependency Shape

- PRD-001 is the gate. It answers whether the scaffold-first pass generalized
  off recipe.
- PRDs 002-009 can proceed after or in parallel with PRD-001, but benchmark
  claims must wait for PRD-001 evidence.
- PRDs 010-011 are structural decisions that reduce standing cost and prevent
  parity breadth from pulling effort away from the authoring loop.
- PRD-012 is the capstone and should start only after the scaffolds, blocks,
  cookbook, visual defaults, and native-path decision have usable slices.

## Source Evidence

- `CHALLENGES.md`
- `tools/agent-benchmark/OFF-RECIPE-DIRECTIVE.md`
- `tools/agent-benchmark/TOKEN-COST-DIRECTION.md`
- `tools/verify/artifacts/agent-benchmark/`

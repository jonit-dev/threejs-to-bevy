# Round 5 Equal-Proof Benchmark Protocol

Round 5 compares vanilla Three.js and ThreeNative only after both conditions
prove the same prompt mechanics. Typed-spec trial runs may be added as a third
condition for the PRD-017 default-surface decision; they do not change the
vanilla-vs-ThreeNative round-5 verdict.

## Prompt Set

| Prompt | Class | Required proof |
|--------|-------|----------------|
| `collector` | continuity | movement, pickup objective, win state, retry path |
| `lane-runner` | continuity | lane movement, obstacle fail state, distance objective, retry path |
| `checkpoint-race` | beyond-one-shot | ordered checkpoints, timer/counter, finish state, retry path |
| `physics-knockdown` | beyond-one-shot | launch/push input, target displacement, score update, retry path |

The executable contract lives in
`tools/agent-benchmark/src/proof-contract.ts`; prompt text lives in
`tools/agent-benchmark/prompts/*.md`.

## Gate

- Minimum repeats: `3` proof-passing runs per prompt and condition.
- Continuity token threshold: ThreeNative median raw tokens `<= 1.5x` vanilla.
- Beyond-one-shot token threshold: ThreeNative median raw tokens `<= 1.0x`
  vanilla.
- Failed-command median: `0`.
- Retry-chain medians: same diagnostic `<= 1`; identical failed assertions
  `== 0`.
- Tool-step median: `<= 30`.
- Typed-spec trial threshold: typed-spec proof-passing repeats `>= 3`, median
  raw tokens `<=` direct ThreeNative, failed-command median `0`, and
  retry-chain medians within the same `<= 1` / `== 0` budget.

## Decision Rule

- `pass`: continue investing in direct ThreeNative authoring.
- `fail` because repeats/proof are missing: rerun benchmark before product
  architecture decisions.
- `fail` because equal-proof token or retry budgets exceed thresholds: use the
  result as input to the typed-spec or vanilla-lift decision PRDs.
- `typedSpecVerdict.default-candidate`: typed-spec can become the starter
  default only after comparable typed-spec runs satisfy the separate typed-spec
  trial threshold across the focused prompt set.

## Post-Friction Pre-Commitment

For the post-friction collector rerun started after
`NEXT-STEPS-2026-07-07.md`, do not move the goalposts after seeing the matrix:

- If typed-spec meets the typed-spec trial threshold for the focused collector
  slice (`>= 3` proof-passing typed-spec repeats, median raw tokens `<=`
  direct ThreeNative, failed-command median `0`, retry-chain medians within
  budget), close PRD-017 Phase 5 by flipping the starter default to
  typed-spec and schedule `examples/humanoid-physics-course` as the first
  real-world migration validation.
- If direct ThreeNative and typed-spec both miss the equal-proof token gate
  after failed-command median is demonstrably `0`, the PRD-018 vanilla-lift
  trigger is met; start the vanilla-lift subset/prototype instead of further
  authoring-surface churn.
- If proof failures persist for engine-side or runtime-diagnosability reasons,
  do not make an authoring-surface decision. Treat runtime diagnosability as
  the blocker and write the next PRD there.

Raw tokens, cached/uncached tokens, cost-weighted tokens, tool-output bytes,
behavior counters, and dialect-confusion counts remain supporting diagnostics.

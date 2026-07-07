# Round 5 Equal-Proof Benchmark Protocol

Round 5 compares vanilla Three.js and ThreeNative only after both conditions
prove the same prompt mechanics.

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

## Decision Rule

- `pass`: continue investing in direct ThreeNative authoring.
- `fail` because repeats/proof are missing: rerun benchmark before product
  architecture decisions.
- `fail` because equal-proof token or retry budgets exceed thresholds: use the
  result as input to the typed-spec or vanilla-lift decision PRDs.

Raw tokens, cached/uncached tokens, cost-weighted tokens, tool-output bytes,
behavior counters, and dialect-confusion counts remain supporting diagnostics.

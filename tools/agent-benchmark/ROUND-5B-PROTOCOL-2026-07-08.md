# Round 5B Protocol Addendum

This addendum prepares the post-friction confirmation matrix for
`lane-runner`, `checkpoint-race`, and `physics-knockdown`.

## Unchanged Decision Rule

The round-5 decision rule from `ROUND-5-PROTOCOL.md` is unchanged:

- Continuity prompts pass at `<= 1.5x` vanilla raw tokens.
- Beyond-one-shot prompts pass at `<= 1.0x` vanilla raw tokens.
- Each comparable condition needs at least three equal-proof repeats.
- Direct ThreeNative still has failed-command median `0`, tool-step median
  `<= 30`, and retry-chain budgets unchanged.
- Typed-spec default and PRD-018 vanilla-lift decisions are made only from the
  pre-committed rule; this addendum does not move thresholds.

## Additional Admissibility Conditions

Before preparing or running round 5B, the operator must have a green
`tn-agent-benchmark audit` result showing:

- `verify:session-cost` passes the scaffold -> apply -> iterate path with
  `manualEdits: 0` and `authoredScenarios: 0`.
- Per-run churn budgets are green for direct ThreeNative and typed-spec runs:
  engine-source searches `0`, standalone verifies `0`, artifact forensics
  `<= 1`, iterate commands `>= 1`, and discovery commands `>= 1`.

Use:

```bash
node tools/agent-benchmark/dist/index.js prepare \
  --round-5b \
  --audit-report <audit.json> \
  --out tools/verify/artifacts/agent-benchmark/round-5b-2026-07-08 \
  --json
```

Original intent: Round 5B fed PRD-017 Phase 5 and PRD-018 Phase 1 without
itself choosing typed-spec defaults or the vanilla-lift path.

2026-07-08 update: the guided collector matrix closed those PRD decisions:
typed-spec remains experimental and vanilla-lift does not start. Future 5B
matrices are broader benchmark confidence evidence, not an automatic reopen of
PRD-017 or PRD-018.

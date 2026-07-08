# Vanilla-Lift Decision 2026-07-07

## Decision

Do not start the vanilla-lift compiler prototype yet.

PRD-018 gates prototype work on equal-proof round-5 evidence showing direct
ThreeNative authoring still misses the decision threshold after engineered
failure classes are addressed. That evidence is not complete in the current
artifact set.

## Evidence Reviewed

- `tools/verify/artifacts/agent-benchmark/off-recipe-rerun-2026-07-07b/benchmark-report.json`
  is round-4/off-recipe evidence. It shows direct ThreeNative still expensive
  against vanilla on comparable prompts, but its verdict uses the older
  `threenative-median-tokens <= 0.5x vanilla-median-tokens` threshold rather
  than the round-5 equal-proof threshold.
- `tools/verify/artifacts/agent-benchmark/typed-spec-trial-2026-07-07a/benchmark-report.json`
  is a typed-spec pilot. It has one proof-passing typed-spec collector repeat
  and no comparable direct ThreeNative collector repeat, so its verdict is
  `insufficient-data`.
- `tools/verify/artifacts/agent-benchmark/typed-spec-trial-2026-07-07a/collector-typed-spec-r2-interrupted/interruption-summary.json`
  records a second typed-spec attempt that reached `TN_ITERATE_OK`, but it is
  excluded from aggregate medians because the interrupted Codex run has no
  completed usage record.
- `tools/agent-benchmark/ROUND-5-MATRIX-STATUS-2026-07-07.md` records the
  post-friction matrix boundary. The deterministic scaffold path is now green
  under `pnpm verify:session-cost`, but the fresh equal-proof direct
  ThreeNative, typed-spec, and vanilla collector sessions are still missing.

## Gate Result

- Equal-proof round-5 direct ThreeNative evidence: missing.
- Typed-spec default decision evidence: insufficient.
- Post-friction deterministic failed-command gate: satisfied for the
  scaffold/apply/iterate path, not a substitute for fresh agent repeats.
- Vanilla-lift trigger: not met.

## Next Evidence Needed

Before changing this decision, collect at least:

- Three proof-passing direct ThreeNative repeats for the focused prompt set.
- Three proof-passing typed-spec repeats for the same prompts if typed-spec is
  still being evaluated as the lower-cost authoring surface.
- Comparable vanilla proof reports using the round-5 equal-proof assertion bar.

Only start the lift subset/prototype if that matrix shows direct ThreeNative
and typed-spec remain non-viable against the PRD-018 thresholds.

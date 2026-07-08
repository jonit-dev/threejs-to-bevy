# Tooling And Proof Status

Verification tools own release gates, smoke gates, docs checks, proof manifests,
and aggregate artifacts.

Current support:

- `tn iterate` for inner-loop validate/build/screenshot/playtest reports. By
  default it runs every `playtests/*.playtest.json` scenario in stable order
  and prints compact per-scenario assertion observations.
- `pnpm verify:agent-io` for documented agent command stdout budgets; deep
  playtest logs remain in artifact files while stdout stays compact.
- `pnpm verify:session-cost` replays scaffold-first paths in CI without LLM
  agents and enforces tool steps <= 12, failed commands == 0, and compact
  `tn iterate --json` output <= 2 KB. It also reports
  `maxConsecutiveSameDiagnostic` and `identicalAssertionRepeatCount`, failing
  when same-diagnostic retries exceed one or identical failed assertions repeat.
  The typed-spec collector replay records an explicit scaffold/apply/build/
  playtest acceptance proof with zero manual edits and zero authored scenarios.
  The current deterministic replay set covers all archetype scaffolds plus the
  `top-down-collector` and `lane-runner` `tn game plan --apply` paths that are
  supported today.
- `pnpm verify:webview-package` packages the
  `ui-persistence-settings-facades` conformance bundle through the desktop-web
  path and records raw package, size, startup, input, settings, and save-slot
  evidence under `tools/verify/artifacts/webview-package/`.
- `pnpm verify:template-production` checks iterate-first starter guidance,
  compact-report guidance, and generated API-card parity.
- Rejected boundary fixtures under
  `packages/ir/fixtures/rejected/v10-boundaries/catalog.json` are audited by
  verify-tools so cloud/account storage, raw Three.js, direct Bevy authoring,
  online services, backend-only claims, custom audio decoders, streaming or
  network audio, platform APIs, and 2D-only workflows stay explicit
  diagnostic boundaries.
- Agent benchmark reports are version 2 token-cost artifacts with raw, cached,
  uncached, output, cost-weighted, iteration, failed-command, and tool-output
  medians plus dialect-confusion failure counts. Round-5 aggregation now gates
  only equal-proof runs with prompt assertions, three repeats per condition,
  continuity `<= 1.5x` tokens, beyond-one-shot `<= 1.0x` tokens, and
  failed-command/retry-chain budgets. The benchmark scorer also accepts a
  `typed-spec` condition, imports `TN_PLAYTEST_*` diagnostics from candidate
  playtest `summary.json` artifacts, infers collector equal-proof assertions
  from committed playtest summaries, and emits a separate typed-spec verdict
  comparing typed source against direct ThreeNative without changing the
  vanilla comparison gate. Aggregate reports also emit per-run churn budget
  diagnostics for engine-source searches, standalone verify commands, artifact
  forensics, missing iterate use, and missing discovery.
- Guided Round-5 collector preparation tells ThreeNative agents to use the
  scaffold-first `tn game plan --apply` plus `xvfb-run -a tn iterate` path and
  stop after a passing iterate instead of running standalone proof loops. The
  scorer imports generated `artifacts/iterate/latest/playtest/**/summary.json`
  proof-family scenarios and combines movement, pickup/progress, win-state,
  and retry assertions across summaries. Fresh equal-proof evidence under
  `tools/verify/artifacts/agent-benchmark/round-5-collector-guided-2026-07-08/`
  has status/matrix/audit green and proves collector token medians of 20,950
  direct ThreeNative vs 46,192 vanilla (0.454x raw; `withinHalfX: true`).
- Round-5B preparation generates the lane-runner, checkpoint-race, and
  physics-knockdown matrix only from a green next-steps audit; the addendum is
  `tools/agent-benchmark/ROUND-5B-PROTOCOL-2026-07-08.md`.
- The 2026-07-07 off-recipe benchmark keeps raw transcripts, sessions, scorer
  output, aggregate report, and agent behavior learnings under
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/`.
- Playtest reports attach compact web/native runtime resource observations and
  emit `TN_RESOURCE_DECLARED_NOT_OBSERVED` or
  `TN_PLAYTEST_REPEATED_ASSERTION` when failing assertions would otherwise
  repeat without new diagnostic information. Rich resource assertions now emit
  `TN_PLAYTEST_RESOURCE_STATE_STAGNATED` when a scenario moves the subject but
  an asserted resource path stays unchanged, including owning-system evidence
  from `effect-log.json` when available. Movement assertions also support
  `minAxisDelta` for secondary signed-axis proof, such as requiring positive Y
  gain while the primary route asserts forward motion.
- `pnpm check:docs` for docs consistency and STATUS index budget.
- `pnpm verify:smoke`, `pnpm verify:pre-push`, and `pnpm verify:release` for
  escalating proof levels.
- Aggregate reports belong under `tools/verify/artifacts/<gate>/`; example
  evidence belongs under `examples/<name>/artifacts/<gate>/`.

Verification:

- `pnpm verify:agent-io`
- `pnpm verify:session-cost`
- `pnpm --filter @threenative/verify-tools test`
- `pnpm verify:webview-package`
- `pnpm --filter @threenative/verify-tools test -- --run boundary`
- `pnpm check:docs`
- `pnpm verify:smoke`
- `pnpm verify:release`
- `pnpm --filter @threenative/agent-benchmark test`
- `pnpm --filter @threenative/cli test`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

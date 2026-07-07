# Tooling And Proof Status

Verification tools own release gates, smoke gates, docs checks, proof manifests,
and aggregate artifacts.

Current support:

- `tn iterate` for inner-loop validate/build/screenshot/playtest reports.
- `pnpm verify:agent-io` for documented agent command stdout budgets; deep
  playtest logs remain in artifact files while stdout stays compact.
- `pnpm verify:session-cost` replays scaffold-first paths in CI without LLM
  agents and enforces tool steps <= 12, failed commands == 0, and compact
  `tn iterate --json` output <= 2 KB. It also reports
  `maxConsecutiveSameDiagnostic` and `identicalAssertionRepeatCount`, failing
  when same-diagnostic retries exceed one or identical failed assertions repeat.
  The current deterministic replay set covers all archetype scaffolds plus the
  `top-down-collector` and `lane-runner` `tn game plan --apply` paths that are
  supported today.
- `pnpm verify:webview-package` packages the
  `ui-persistence-settings-facades` conformance bundle through the desktop-web
  path and records raw package, size, startup, input, settings, and save-slot
  evidence under `tools/verify/artifacts/webview-package/`.
- `pnpm verify:template-production` checks iterate-first starter guidance,
  compact-report guidance, and generated API-card parity.
- Agent benchmark reports are version 2 token-cost artifacts with raw, cached,
  uncached, output, cost-weighted, iteration, failed-command, and tool-output
  medians plus dialect-confusion failure counts. Round-5 aggregation now gates
  only equal-proof runs with prompt assertions, three repeats per condition,
  continuity `<= 1.5x` tokens, beyond-one-shot `<= 1.0x` tokens, and
  failed-command/retry-chain budgets. The benchmark scorer also accepts a
  `typed-spec` condition and emits a separate typed-spec verdict comparing
  typed source against direct ThreeNative without changing the vanilla
  comparison gate.
- The 2026-07-07 off-recipe benchmark keeps raw transcripts, sessions, scorer
  output, aggregate report, and agent behavior learnings under
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/`.
- Playtest reports attach compact web/native runtime resource observations and
  emit `TN_RESOURCE_DECLARED_NOT_OBSERVED` or
  `TN_PLAYTEST_REPEATED_ASSERTION` when failing assertions would otherwise
  repeat without new diagnostic information.
- `pnpm check:docs` for docs consistency and STATUS index budget.
- `pnpm verify:smoke`, `pnpm verify:pre-push`, and `pnpm verify:release` for
  escalating proof levels.
- Aggregate reports belong under `tools/verify/artifacts/<gate>/`; example
  evidence belongs under `examples/<name>/artifacts/<gate>/`.

Verification:

- `pnpm verify:agent-io`
- `pnpm verify:session-cost`
- `pnpm verify:webview-package`
- `pnpm check:docs`
- `pnpm verify:smoke`
- `pnpm verify:release`
- `pnpm --filter @threenative/agent-benchmark test`
- `pnpm --filter @threenative/cli test`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

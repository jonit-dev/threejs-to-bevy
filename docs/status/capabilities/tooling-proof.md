# Tooling And Proof Status

Verification tools own release gates, smoke gates, docs checks, proof manifests,
and aggregate artifacts.

Current support:

- `tn iterate` for inner-loop validate/build/screenshot/playtest reports.
- `pnpm verify:agent-io` for documented agent command stdout budgets; deep
  playtest logs remain in artifact files while stdout stays compact.
- `pnpm verify:template-production` checks iterate-first starter guidance,
  compact-report guidance, and generated API-card parity.
- Agent benchmark reports are version 2 token-cost artifacts with raw, cached,
  uncached, output, cost-weighted, iteration, failed-command, and tool-output
  medians.
- `pnpm check:docs` for docs consistency and STATUS index budget.
- `pnpm verify:smoke`, `pnpm verify:pre-push`, and `pnpm verify:release` for
  escalating proof levels.
- Aggregate reports belong under `tools/verify/artifacts/<gate>/`; example
  evidence belongs under `examples/<name>/artifacts/<gate>/`.

Verification:

- `pnpm verify:agent-io`
- `pnpm check:docs`
- `pnpm verify:smoke`
- `pnpm verify:release`
- `pnpm --filter @threenative/agent-benchmark test`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

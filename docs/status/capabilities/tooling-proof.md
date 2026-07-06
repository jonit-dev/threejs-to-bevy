# Tooling And Proof Status

Verification tools own release gates, smoke gates, docs checks, proof manifests,
and aggregate artifacts.

Current support:

- `tn iterate` for inner-loop validate/build/screenshot/playtest reports.
- `pnpm check:docs` for docs consistency and STATUS index budget.
- `pnpm verify:smoke`, `pnpm verify:pre-push`, and `pnpm verify:release` for
  escalating proof levels.
- Aggregate reports belong under `tools/verify/artifacts/<gate>/`; example
  evidence belongs under `examples/<name>/artifacts/<gate>/`.

Verification:

- `pnpm check:docs`
- `pnpm verify:smoke`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

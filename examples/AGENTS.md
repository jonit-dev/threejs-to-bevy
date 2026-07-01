# AGENTS.md

Rules for runnable examples.

- Keep each game example sandboxed under `examples/<name>` with its own config,
  source entry, package metadata, and local runtime assets where practical.
- Source packs such as `assets-source` may be canonical inputs, but emitted
  bundles must copy required assets to deterministic bundle-local paths.
- Do not commit generated `dist/` or verification artifacts unless tracked by
  repo policy.
- Example evidence goes under `examples/<name>/artifacts/<gate>/`, not root
  `artifacts/`.
- Shared conformance fixtures live under `packages/ir/fixtures/*`; examples may
  feed them, but fixtures are stable contract inputs.
- Examples prove product workflows and emit portable IR/bundles. They must not
  introduce runtime-specific source of truth.

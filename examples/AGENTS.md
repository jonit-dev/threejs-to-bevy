# AGENTS.md

Guidance for runnable examples.

- Each game example should be sandboxed under `examples/<name>` as a runnable
  project with its own project config, source entry, package metadata, and
  game-local assets where practical.
- Shared source packs such as `assets-source` may be canonical inputs, but the
  emitted bundle must copy required assets into deterministic bundle-local paths
  and must not require runtime access to the source pack.
- Keep generated outputs such as `dist/` and verification artifacts out of commits
  unless the repo explicitly tracks them.
- Example-specific verification evidence should be generated under
  `examples/<name>/artifacts/<gate>/`; do not write new one-example screenshots,
  traces, or focused reports to root `artifacts/` paths.
- Shared conformance fixtures stay under `packages/ir/fixtures/*`; examples may
  be their source, but fixtures are stable contract inputs rather than example
  output.
- Examples should prove product workflows, not introduce runtime-specific source
  of truth. They should emit portable IR/bundles consumed by runtime adapters.

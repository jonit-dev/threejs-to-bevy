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
- Examples should prove product workflows, not introduce runtime-specific source
  of truth. They should emit portable IR/bundles consumed by runtime adapters.

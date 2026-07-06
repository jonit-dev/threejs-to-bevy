# AGENTS.md

Rules for TypeScript packages.

- Keep dependencies aligned with the product flow: `sdk` authoring, `ir`
  contracts/validators, `compiler` emit/diagnostics, `cli` orchestration,
  runtimes consuming bundles.
- Do not reach through another package's internals.
- Preserve deterministic IR and bundle output.
- Shared IR fixtures stay in `packages/ir/fixtures/*`; package-local generated
  output belongs in package build/artifact folders.
- Prefer precise types over casts. Follow ESM `NodeNext` patterns.
- Runtime packages consume IR schemas/bundles; they must not invent parallel
  game-state source formats.
- When SDK, CLI, compiler, or authoring package changes alter a reusable
  authoring pattern or mutation workflow, update `docs/cookbook` and run
  `pnpm verify:cookbook`.
- Self-verify with the narrowest package test first (`pnpm --filter
  @threenative/<package> test`), then `pnpm typecheck`. For changes to shared
  IR or runtime contracts, also run `pnpm verify:conformance`.

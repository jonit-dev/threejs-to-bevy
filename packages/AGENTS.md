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
- Before adding a package feature, identify the owning contract or registry and
  extend it instead of copying schemas, parsers, helpers, or capability lists.
  Do not use broad casts, disabled tests, silent compatibility fallbacks, or
  weakened assertions to hide a boundary mismatch; an unavoidable bridge must
  have an owner, removal condition, and focused test.
- Changes that cross SDK, IR, compiler, CLI, or runtime boundaries need both
  acceptance and rejection coverage. For web/Bevy behavior, add conformance
  evidence and keep unsupported behavior explicitly diagnostic.
- When SDK, CLI, compiler, or authoring package changes alter a reusable
  authoring pattern or mutation workflow, update `docs/cookbook` and run
  `pnpm verify:cookbook`.
- Self-verify with the narrowest package test first (`pnpm --filter
  @threenative/<package> test`), then `pnpm typecheck`. For changes to shared
  IR or runtime contracts, also run `pnpm verify:conformance`.

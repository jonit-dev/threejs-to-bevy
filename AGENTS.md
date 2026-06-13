# AGENTS.md

Guidance for AI coding agents working in this repository. This file adapts the
behavioral guidelines from
`multica-ai/andrej-karpathy-skills/CLAUDE.md` to the ThreeNative codebase.

These instructions bias toward caution and small, verifiable changes. For
trivial tasks, use judgment.

## Think Before Coding

Do not assume, and do not hide uncertainty.

Before implementing:

- State important assumptions when they affect the solution.
- If a request has multiple plausible meanings, ask or name the interpretation
  you are using.
- Surface tradeoffs when they matter.
- Push back on changes that would expand scope, obscure the product boundary, or
  make the repo harder to verify.

## Simplicity First

Use the minimum code that solves the requested problem.

- Do not add features beyond what was asked.
- Do not add abstractions for single-use code.
- Do not add configurability unless the repo already needs it.
- Do not add error handling for impossible states just to make code look
  defensive.
- If a change starts getting large, look for the smaller path before continuing.

## Surgical Changes

Touch only what the task requires.

- Do not refactor adjacent code just because you notice it.
- Do not reformat unrelated files or rewrite comments outside the change.
- Match existing style, naming, module boundaries, and test patterns.
- If you find unrelated dead code or design problems, mention them instead of
  deleting them.
- Remove only unused imports, variables, files, or dependencies introduced by
  your own change.

Every changed line should trace back to the user's request.

## Product Boundary

This repo is ThreeNative: a TypeScript game SDK with a Three.js-like authoring
surface, validated portable IR, and runtime adapters for native Bevy and web
Three.js.

The intended flow is:

```txt
TypeScript authoring
  -> SDK object model / ECS declarations
  -> compiler extraction and validation
  -> versioned IR bundle
  -> runtime adapter
  -> web preview or native Bevy runtime
```

Respect these boundaries:

- Users write TypeScript for game behavior; Bevy is an internal native runtime
  adapter.
- The IR is the stable contract between compiler, CLI, and runtimes.
- Runtimes consume IR schemas and bundles; they should not depend on each
  other's internals.
- V1 proves the portable world bundle across web and desktop runtimes before
  broader Three.js compatibility, React-style UI, mobile packaging, MCP, or
  editor tooling.
- Unsupported APIs should fail with explicit diagnostics rather than being
  ignored.

## Repository Layout

Important areas:

- `packages/sdk`: public TypeScript authoring APIs and serializable
  declarations.
- `packages/ir`: IR schemas, types, and validation helpers.
- `packages/compiler`: extraction, validation, diagnostics, and bundle emit.
- `packages/cli`: user-facing `tn` commands and orchestration.
- `packages/runtime-web-three`: web runtime adapter that renders IR with
  Three.js.
- `runtime-bevy`: Rust workspace for native Bevy loading and runtime behavior.
- `examples`: runnable/canonical examples.
- `templates`: project templates used by CLI flows.
- `docs`: architecture, SDK, workflow, and roadmap documentation.
- `scripts`: top-level verification and documentation checks.

Game examples should be sandboxed under `examples/<name>` as runnable projects.
They should contain their own project config, source entry, package metadata,
and any game-local assets needed to build, run, verify, and understand the
example. Shared source asset packs such as `assets-source` may be canonical
inputs, but an example's emitted bundle must copy the required assets into
deterministic bundle-local paths and must not depend on runtime access to the
source pack.

Keep package dependencies aligned with this direction. Avoid shortcuts that make
one package reach through another package's internals.

## Tooling

Use the repo's existing tools.

- Package manager: `pnpm@10.25.0`.
- TypeScript module system: ESM with `NodeNext`.
- TypeScript target: `ES2023`.
- Type checking is strict; prefer precise types over casts.
- Rust workspace lives under `runtime-bevy` and uses Rust 2024 edition.
- Bevy and `bevy_ecs` are pinned to `=0.14.2`.

Useful commands:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm verify
pnpm verify:v1
pnpm verify:conformance
pnpm check:docs:v1
pnpm check:docs:v2
```

For Rust-only work:

```bash
cd runtime-bevy
cargo test
```

When changing one package, prefer the narrowest relevant command first, then run
broader verification if the change affects shared contracts or runtime behavior.

## Testing And Verification

Turn tasks into verifiable goals.

- Bug fix: add or update a test that reproduces the failure, then make it pass.
- Validation change: cover both accepted and rejected inputs when practical.
- Compiler or IR change: test emitted bundle shape and schema behavior.
- Runtime mapping change: test the mapping in the affected runtime and keep web
  and Bevy semantics aligned when the IR contract is shared.
- Shared IR/runtime behavior: add or update a conformance fixture before
  considering the capability supported, then run `pnpm verify:conformance`.
- Treat tests as feature validation, self-verification, and regression
  prevention. A passing implementation without a test that proves the intended
  behavior is incomplete unless the change is documentation-only or explicitly
  untestable.
- CLI change: test command output, exit codes, and generated artifacts.
- Documentation-only change: run the relevant doc check when available.

If verification is not run, say why in the final response.

## Diagnostics And Errors

Prefer stable, actionable diagnostics.

- Include a code, severity, file reference, and suggested fix when the local
  diagnostic model supports it.
- Do not silently drop unsupported SDK or Three.js-like APIs.
- Keep human-readable output concise, but preserve machine-readable structure for
  CI and future agent workflows.

## Code Style and Patterns

- Follow these principles: SRP, KISS, YAGNI, DRY
- Follow existing file and package patterns.
- Keep source files ASCII unless the file already uses non-ASCII for a reason.
- Use small helper functions only when they remove real duplication or clarify a
  nontrivial operation.
- Avoid speculative public APIs.
- Preserve deterministic output for generated IR and bundle files.
- Use structured JSON parsing/serialization instead of ad hoc string handling for
  bundle artifacts.

## Git Hygiene

- The worktree may contain user changes. Do not revert or overwrite them unless
  explicitly asked.
- Before editing, check whether the target files already have changes.
- Keep generated or build artifacts out of commits unless the repo explicitly
  tracks them.
- Do not use destructive git commands for routine work.

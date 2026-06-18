# AGENTS.md

Repo-wide guidance for AI coding agents working on ThreeNative.

## Working Style

- Make small, verifiable changes. If a request has multiple plausible meanings,
  state the interpretation you are using or ask before editing.
- Match existing style, package boundaries, naming, and test patterns.
- Do not refactor adjacent code, reformat unrelated files, or delete unrelated
  dead code while solving a narrow task.
- Use structured parsing/serialization for IR and bundle artifacts.
- Keep source ASCII unless the file already has a reason not to.
- The worktree may contain user changes. Do not revert or overwrite them unless
  explicitly asked.
- When capability or release-gate work is completed, update `docs/STATUS.md` and
  `docs/bevy-feature-parity.md` in the same change so the current gate and drift
  tracker reflect what is now implemented, inconsistent, or still missing.
- Current contributor gates include `pnpm check:names`, `pnpm check:docs`, and
  `pnpm verify:release`. Legacy milestone script names remain compatibility
  aliases during the cleanup tracked in `docs/PRDs/cleanup-versioned-debt.md`.
- New verification gate implementation belongs under `tools/verify/src`; use
  `tools/verify/src/cli/run.ts` for focused gate command composition and
  `scripts/` only for temporary wrappers, compatibility shims, or non-gate repo
  maintenance.
- Artifact ownership: one-example evidence belongs under
  `examples/<name>/artifacts/<gate>/`, aggregate reports under
  `tools/verify/artifacts/<gate>/`, shared IR fixtures under `packages/ir/fixtures/*`,
  and Bevy-only evidence under `runtime-bevy/artifacts/<gate>/`.
- Active docs belong under `docs/architecture/`, `docs/contracts/`,
  `docs/runtime/`, `docs/workflows/`, `docs/status/`, or
  `docs/PRDs/`; see `docs/workflows/developer-workflow.md` for the full policy.

## Product Boundary

ThreeNative is a TypeScript game SDK with a Three.js-like authoring surface,
validated portable IR, and runtime adapters for web Three.js and native Bevy.

The intended flow is:

```txt
TypeScript authoring / future editor
  -> SDK object model and ECS declarations
  -> compiler extraction and validation
  -> versioned IR bundle
  -> runtime adapter
  -> web preview or native Bevy runtime
```

Respect these boundaries:

- Users author game behavior in TypeScript; Bevy is an internal native runtime
  adapter.
- The IR bundle is the stable contract between compiler, CLI, and runtimes.
- Three.js and Bevy consume emitted IR/bundle JSON such as `world.ir.json`,
  `environment.scene.json`, and `assets.manifest.json`; they are not sources of
  truth and should not generate game source code.
- Future editor workflows should operate on structured SDK/ECS/IR scene data and
  emit the same portable bundle consumed by web and native runtimes.
- Unsupported APIs should fail with explicit diagnostics rather than being
  ignored.

## Repository Map

- `packages/sdk`: public TypeScript authoring APIs.
- `packages/ir`: IR schemas, types, and validation helpers.
- `packages/compiler`: extraction, validation, diagnostics, and bundle emit.
- `packages/cli`: user-facing `tn` commands and orchestration.
- `packages/runtime-web-three`: Three.js runtime adapter.
- `runtime-bevy`: Rust native runtime adapter.
- `examples`: runnable/canonical sandboxed examples. Game examples should keep
  all required runtime assets inside their example folder or emitted bundle so
  each example can run independently.
- `templates`: project templates used by CLI flows.
- `docs`: architecture, SDK, workflow, roadmap, and PRDs.
- `scripts`: compatibility wrappers and repo maintenance shims; active
  verification logic belongs in `tools/verify`.

Nested `AGENTS.md` files may add more specific guidance for these areas.

## Tooling

- Package manager: `pnpm@10.25.0`.
- TypeScript: ESM with `NodeNext`, target `ES2023`, strict checking.
- Rust: `runtime-bevy` uses Rust 2024 edition; Bevy and `bevy_ecs` are pinned to
  `=0.14.2`.

Useful commands:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm verify
pnpm verify:conformance
```

Prefer the narrowest relevant verification first, then run broader gates when a
change affects shared contracts or runtime behavior. If verification is not run,
say why.

For shared runtime contracts, keep `pnpm verify:conformance` in the
self-verification loop and treat conformance failures as regressions unless the
relevant PRD explicitly changes the contract.

## Testing

- Bug fix: add or update a test that reproduces the failure.
- Validation change: cover accepted and rejected inputs when practical.
- Compiler or IR change: test emitted bundle shape and schema behavior.
- Runtime mapping change: test the affected runtime and keep web/Bevy semantics
  aligned when the IR contract is shared.
- CLI change: test output, exit codes, and generated artifacts.

## Diagnostics

Prefer stable, actionable diagnostics with a code, severity, file/path reference,
and suggested fix when the local diagnostic model supports it.

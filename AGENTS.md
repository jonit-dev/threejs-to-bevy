# AGENTS.md

Repo-wide instructions for AI coding agents working on ThreeNative.

## Work Rules

- Make small, verifiable changes. If scope is ambiguous, state your
  interpretation or ask before editing.
- Match existing style, package boundaries, names, and test patterns.
- Do not refactor, reformat, delete, revert, or overwrite unrelated work.
- Use structured parsing/serialization for IR and bundle artifacts.
- Keep source ASCII unless the file already has a reason not to.
- Capability/release-gate changes must update `docs/STATUS.md` and
  `docs/bevy-feature-parity.md`.
- Finished PRDs move to `docs/PRDs/done`.

## Product Boundary

ThreeNative flow:

```txt
TypeScript authoring / structured source / future editor
  -> SDK object model, ECS declarations, structured source docs
  -> compiler extraction and validation
  -> versioned IR bundle
  -> web Three.js or native Bevy runtime adapter
```

- Users author TypeScript and structured source; Bevy is adapter-private.
- IR bundles are the compiler/CLI/runtime contract.
- Durable source is SDK declarations plus `content/**/*.json`; durable behavior
  is `src/scripts/**/*.ts`.
- `dist/**`, emitted bundle JSON, and `scripts.bundle.js` are generated. Do not
  fix bugs by editing them unless a command marks the file source-persistable.
- Three.js/Bevy consume emitted IR; they are not sources of truth and must not
  generate game source.
- Unsupported APIs should fail with explicit diagnostics.
- Visual parity: never tune adapter colors/materials/lights to match a
  screenshot. Preserve authored IR values; fix mapping, color space, assets,
  shaders/materials, camera, lighting, or test setup. Art-direction transforms
  must be authored data or a documented shared contract.

## Structured Source

Default generated projects use `structured-source-starter`.

- Generated starters must include `AGENTS.md` and `CLAUDE.md`.
- Prefer deterministic source edits through bounded CLI commands:
  `tn scene ... --json`, `tn ui ... --json`, `tn material ... --json`,
  `tn authoring validate --json`, and other `tn ... --json` surfaces.
- Edit `content/**/*.json` directly only when no CLI operation covers the
  change. Preserve schema/version fields and stable IDs unless asked to rename.
- Add/change gameplay in `src/scripts/**/*.ts`, then reference the module/export
  from structured source.
- Do not author raw Three.js scenes, raw Bevy/Rust gameplay, DOM APIs,
  filesystem access, workers, timers, renderer plugin handles, or native runtime
  handles unless a package capability exposes them.
- On diagnostics, preserve code/path/severity/message in notes and repair the
  durable source document or script that owns the problem.

Useful loop:

```bash
tn scene validate arena --json
tn scene inspect arena --json
tn scene proof arena --project . --json
pnpm run validate:authoring
pnpm run build
pnpm run verify
```

## Repo Map

- `packages/sdk`: public authoring APIs.
- `packages/ir`: schemas, types, validation, conformance.
- `packages/compiler`: extraction, validation, diagnostics, bundle emit.
- `packages/cli`: `tn` commands and orchestration.
- `packages/runtime-web-three`: web runtime adapter.
- `runtime-bevy`: native runtime adapter.
- `examples`: runnable examples with local runtime assets.
- `templates`: CLI project templates.
- `docs`: architecture, contracts, workflows, status, PRDs.
- `scripts`: compatibility wrappers and repo maintenance.
- `tools/verify/src`: active verification-gate implementation.

Nested `AGENTS.md` files may add local rules.

## Artifacts And Docs

- One-example evidence: `examples/<name>/artifacts/<gate>/`.
- Aggregate reports: `tools/verify/artifacts/<gate>/`.
- Shared IR fixtures: `packages/ir/fixtures/*`.
- Bevy-only evidence: `runtime-bevy/artifacts/<gate>/`.
- Active docs: `docs/architecture/`, `docs/contracts/`, `docs/runtime/`,
  `docs/workflows/`, `docs/status/`, `docs/PRDs/`.
- Open-source 3D asset kit reference:
  `docs/workflows/open-source-3d-asset-kits.md`.
- Gate implementation belongs in `tools/verify/src`; use `scripts/` only for
  wrappers, shims, or maintenance.

## Tooling

- Package manager: `pnpm@10.25.0`.
- TypeScript: ESM, `NodeNext`, `ES2023`, strict.
- Rust: 2024 edition; Bevy and `bevy_ecs` pinned to `=0.14.2`.

Useful commands:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm verify
pnpm verify:conformance
```

Use the narrowest relevant verification first. For shared runtime contracts,
include `pnpm verify:conformance`. If verification is not run, say why.

Contributor gates include `pnpm check:names`, `pnpm check:docs`, and
`pnpm verify:release`. Use `pnpm verify:smoke` for cheap local drift checks and
`pnpm verify:pre-push` before push. Do not put visual screenshot gates such as
`pnpm verify:parity:smoke` in pre-commit hooks.

## Testing

- Bug fix: add/update a reproducing test.
- Validation change: cover accepted and rejected inputs when practical.
- Compiler/IR change: test emitted bundle shape and schema behavior.
- Runtime mapping change: test the affected runtime and preserve web/Bevy
  semantics for shared contracts.
- CLI change: test output, exit codes, and generated artifacts.

Diagnostics should be stable and actionable: code, severity, path, message, and
suggested fix where supported.

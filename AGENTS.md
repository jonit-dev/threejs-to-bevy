# AGENTS.md

Repo-wide instructions for AI coding agents working on ThreeNative.

## Work Rules

- Make small, verifiable changes. If scope is ambiguous, state your
  interpretation or ask before editing.
- Match existing style, package boundaries, names, and test patterns.
- Do not refactor, reformat, delete, revert, or overwrite unrelated work.
- Use structured parsing/serialization for IR and bundle artifacts.
- Keep source ASCII unless the file already has a reason not to.
- Capability/release-gate changes must update the relevant
  `docs/status/capabilities/*.md` file plus the one-line index entry in
  `docs/STATUS.md`; update `docs/bevy-feature-parity.md` when Bevy parity
  claims or evidence links change.
- Update `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` when adding a new system
  or when you find systemic code-quality, architecture, or technical-debt risk.
- Update `docs/cookbook` and rerun `pnpm verify:cookbook` when reusable
  authoring patterns or CLI mutations change.
- Finished PRDs must be moved from active planning folders to
  `docs/PRDs/done`.

## Engineering Mantras

- Use abstractions for the heavy lifting whenever they are already available
  or clearly pay for themselves, so the code stays DRY, KISS, and SRP.
- Prefer convention over configuration. Script APIs should follow familiar
  Unity naming, fields, and behavior where that fits ThreeNative, so authors
  and agents can rely on established game-engine vocabulary instead of
  inventing project-specific choices.

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
- `dist/**`, emitted bundle JSON, and `scripts.bundle.js` are generated.
- Unsupported APIs should fail with explicit diagnostics.
- Preserve authored IR values for visual parity; fix mapping, color space,
  assets, shaders/materials, camera, lighting, or proof setup.

## Structured Source

- Generated starters must include `AGENTS.md` and `CLAUDE.md`.
- Prefer bounded CLI edits: `tn scene ... --json`, `tn ui ... --json`,
  `tn material ... --json`, `tn authoring validate --json`, and related
  registry-backed commands.
- Edit `content/**/*.json` directly only when no CLI operation covers the
  change. Preserve schema/version fields and stable IDs unless asked to rename.
- Add gameplay in `src/scripts/**/*.ts`, then reference the module/export from
  structured source.
- Do not author raw Three.js scenes, raw Bevy/Rust gameplay, DOM APIs,
  filesystem access, workers, timers, renderer plugin handles, or native
  runtime handles unless a package capability exposes them.

## Game Work

For generated games and playable examples, start with a production plan before
mutating source:

```bash
tn game plan --goal "<game idea>" --project . --json
```

The plan must name the playable loop, controls, objective, progression,
fail/retry path, feedback moments, high-value assets, script modules/exports,
proof commands, polish pass, animation clip wiring for active characters, and
relative scale checks.

Asset sourcing starts with the shipped SQLite catalog:

```bash
tn asset source search --game-category <category> --format glb --direct-only --json
tn asset source get <asset-source-id> --json
```

Prefer catalog/open-source pack assets or authored custom meshes for hero,
primary obstacle/enemy/vehicle, reward/interactable, and dominant environment
surfaces. Primitives are a last fallback and must not be called finished unless
they read as intentional custom art.

If physical contact, gravity, momentum, collision response, rolling, bouncing,
sliding, throwing, stacking, or projectile impact is core to the mechanic,
author portable physics metadata up front (`RigidBody`, `Collider`, materials,
triggers/sensors) and prove behavior with playtests.

Iterate with `tn playtest` after gameplay/input changes, inspect artifacts, fix
the owning source or script, and rerun. Before release claims, rerun the
scenario with `--target desktop` so native behavior is proved too.

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
- `tools/verify/src`: active verification-gate implementation.
- `scripts`: compatibility wrappers and maintenance.

## Docs And Artifacts

- Current front door: `docs/STATUS.md`.
- Capability detail: `docs/status/capabilities/*.md`.
- Active docs: `docs/architecture/`, `docs/contracts/`, `docs/runtime/`,
  `docs/workflows/`, `docs/status/`, `docs/PRDs/`.
- Example evidence: `examples/<name>/artifacts/<gate>/`.
- Aggregate reports: `tools/verify/artifacts/<gate>/`.
- Shared IR fixtures: `packages/ir/fixtures/*`.
- Bevy-only evidence: `runtime-bevy/artifacts/<gate>/`.
- Asset sourcing policy: `docs/workflows/open-source-3d-asset-kits.md`.

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
pnpm check:docs
pnpm verify:smoke
```

Use the narrowest relevant verification first. For shared runtime contracts,
include `pnpm verify:conformance`. If verification is not run, say why.

Diagnostics should be stable and actionable: code, severity, path, message, and
suggested fix or structured `fix` where supported.

# ThreeNative Codebase Architecture Review

Date: 2026-06-15

Scope: static review of the repository for code smells and architectural risks, with emphasis on scalability, SRP, DRY, KISS, YAGNI, and contract drift. This was review-only; no implementation files were changed.

Process:

- Spawned four explorer agents over SDK/IR, compiler/CLI, runtimes, and repo/docs/scripts.
- Spawned one manager reviewer to challenge candidate findings and reduce false positives.
- Locally spot-checked high-priority claims against current files.
- Existing uncommitted worktree changes were present in SDK, IR, compiler, runtime-web-three, Bevy runtime, and docs files. Findings reflect the current working tree and do not revert or overwrite those changes.

## Priority 1

### P1. IR Contract Is Split Across Divergent Sources Of Truth

Evidence:

- `packages/ir/schemas/world.schema.json:18` allows `components` as an unconstrained object.
- `packages/ir/src/types.ts:123` models known components in TypeScript plus an open `Record<string, unknown>`.
- `runtime-bevy/crates/threenative_loader/src/lib.rs:115` defines a separate Rust `EntityComponents` struct with known fields plus flattened extras.
- `packages/ir/src/validate.ts:42` implements another hand-written validation path.

Why it matters:

The IR bundle is the stable cross-runtime contract, but its shape and strictness are maintained in JSON schemas, TypeScript interfaces, TypeScript validators, and Rust loader structs. As the IR grows, this makes drift likely: one consumer can accept a bundle another rejects or silently treats differently.

Recommendation:

Make one layer canonical. Practical options are schema-first code generation for TS/Rust types and validators, or a single strict IR validation package whose rules are consumed by compiler, CLI, and generated runtime tests. Add drift tests that compare schema-required fields, TS types, and Rust deserialization expectations for each bundle artifact.

### P1. `validateBundle` Can Throw Instead Of Returning Diagnostics

Evidence:

- `packages/ir/src/validate.ts:44` parses `manifest.json` via `readJson<IBundleManifest>`.
- `packages/ir/src/validate.ts:52` immediately dereferences `manifest.entry.world`.
- `packages/ir/src/validate.ts:1437` validates nested runtime config fields such as `config.time.fixedDelta`.
- `packages/ir/src/validate.ts:2801` casts arbitrary parsed JSON to `T`.

Why it matters:

Invalid bundles are part of the validator's input space. The validator should produce stable diagnostics, not crash on malformed object shape. This weakens CLI/editor/package reliability and makes automation harder to trust.

Recommendation:

Add structural pre-validation before nested reads. Either run the published JSON Schemas for each artifact first, or add local type guards that emit `TN_IR_*` diagnostics for missing/wrong top-level sections before semantic validation runs.

### P1. Runtime Config Contract And Parity Are Drifting

Evidence:

- `packages/ir/schemas/runtime-config.schema.json:10` makes `renderer` optional and does not require `renderer.antialias`.
- `packages/ir/src/runtimeConfig.ts:6` requires `antialias` whenever `renderer` exists.
- `packages/runtime-web-three/src/render.ts:146` collapses all non-`none` antialias modes to `antialias: true`.
- `packages/runtime-web-three/src/render.test.ts:21` explicitly expects `msaa2`, `msaa4`, and `msaa8` to map identically on web.
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:162` maps `none`, `msaa2`, and `msaa8` to distinct Bevy `Msaa` values.
- `packages/runtime-web-three/src/conformance.ts:39`, `runtime-bevy/crates/threenative_runtime/src/conformance.rs:360`, and `scripts/verify-conformance.mjs:393` do not report or compare runtime renderer settings.

Why it matters:

The portable IR advertises sample-count semantics, but web cannot honor that granularity through `WebGLRendererParameters` while Bevy does. Conformance currently cannot catch this, and schema/type/validator requiredness differs.

Recommendation:

Decide whether antialiasing is portable as `none | enabled` or as sample-count intent. Encode that decision consistently in schema, TS types, validator, compiler emit, web runtime, Bevy runtime, and tests. Add runtime-config observations to conformance reports, including antialias and bloom settings.

### P1. Editor Apply Uses A Weaker Validation Contract Than `tn validate`

Evidence:

- `packages/cli/src/commands/editor.ts:6` imports `validateBundle` from `@threenative/ir`.
- `packages/cli/src/commands/editor.ts:82` uses that validator before applying edited documents.
- `packages/compiler/src/validate/index.ts:30` wraps IR validation and then adds compiler-level referential checks.
- `packages/compiler/src/validate/index.ts:54` emits missing material/mesh reference diagnostics.

Why it matters:

`tn editor apply` can accept and persist a bundle that `tn validate` later rejects. That breaks composability for editor workflows and blurs which validator is the stable bundle contract.

Recommendation:

Move cross-artifact referential checks into `@threenative/ir`, or make editor apply use the same compiler validator as `tn validate`. The key is one canonical validation result for all CLI flows that accept bundles.

### P1. `tn package` Can Ship Invalid Bundles

Evidence:

- `packages/cli/src/commands/package.ts:51` only calls `assertDesktopTarget`.
- `packages/cli/src/commands/package.ts:124` reads just `manifest.json` and `target.profile.json`.
- `packages/cli/src/commands/package.test.ts:72` creates a happy-path fixture whose manifest omits required `assets` and `materials`.
- `packages/compiler/src/emit/bundle.ts:85` emits real manifests with `assets`, `materials`, and `targetProfile`.

Why it matters:

Packaging is currently a bypass around bundle validation. It can produce desktop artifacts that runtime adapters or validation tooling cannot consume.

Recommendation:

Run the canonical bundle validator before copying/package report generation. Update tests so the success fixture is a valid bundle, and add an invalid-bundle rejection case.

### P1. `emit/bundle.ts` Has Too Many Responsibilities

Evidence:

- `packages/compiler/src/emit/bundle.ts` is about 1,045 lines.
- The same module handles bundle assembly (`:27`), capability derivation (`:218`), asset merging/copying (`:655`, `:689`), environment discovery (`:719`), glTF dependency parsing (`:964`), bounds extraction (`:983`), scatter expansion (`:862`), and categorization heuristics (`:1024`).

Why it matters:

This violates SRP in the compiler's most contract-sensitive path. Feature additions to environment assets, scatter generation, bundle manifest shape, or copy rules all land in one module, increasing regression risk and making focused tests harder to structure.

Recommendation:

Split by domain without changing behavior: bundle manifest/write orchestration, asset copy/path safety, environment emit, glTF metadata/dependency extraction, scatter expansion, and capability derivation. Keep `emitBundle` as orchestration over smaller tested units.

## Priority 2

### P2. Bevy Render Mapping Does Not Select `ActiveCamera` Like Web Does

Evidence:

- `packages/runtime-web-three/src/mapWorld.ts:65` selects the first camera, then `:70` overrides from `world.resources.ActiveCamera`.
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:289` spawns each camera as a `Camera3dBundle`.
- The Bevy scene/render mapper does not appear to use `world.resources.ActiveCamera` for active render-camera selection in that path.

Why it matters:

Multi-camera scenes can render differently across web and native. The manager review noted Bevy scripting/picking paths may read `ActiveCamera`; the issue here is specifically scene render-camera activation.

Recommendation:

Read `ActiveCamera` before spawning cameras and set Bevy camera activation to match the web fallback behavior. Add a conformance observation for active camera selection.

### P2. Cross-Runtime Mapping Tables Are Duplicated By Hand

Evidence:

- `packages/runtime-web-three/src/mapWorld.ts:293` maps primitives to Three.js geometries.
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:519` maps the same primitive concepts to Bevy meshes.
- Materials, texture slots, light units, visibility, and runtime renderer settings are also mapped independently across both adapters.

Why it matters:

Some duplication is unavoidable across TypeScript and Rust, but the current approach relies heavily on parallel hand-maintained logic. As the IR surface grows, parity bugs become likely unless every addition lands in several places with matching tests.

Recommendation:

Introduce shared mapping fixtures or generated parity tables for primitives, material slots, light kinds, runtime config, and default values. Prefer conformance tests that prove both runtimes interpret the same IR fields the same way, even if implementation code remains language-specific.

### P2. SDK Runtime Config Allows Invalid Authoring Values

Evidence:

- `packages/sdk/src/time.ts:21` exposes `defineRuntimeConfig`.
- `packages/sdk/src/time.ts:37` copies bloom values with defaults but no finite/non-negative checks.
- `packages/sdk/src/time.ts:44` copies `fixedDelta`.
- `packages/sdk/src/time.ts:48` copies window height/width/title.

Why it matters:

The public SDK can produce declarations that fail later in IR validation. That pushes errors away from the authoring boundary and makes runtime config less consistent than SDK helpers that validate geometry, assets, audio, and physics inputs.

Recommendation:

Validate finite positive `fixedDelta`, positive window dimensions, non-empty title when present, and finite non-negative bloom settings in the SDK. Keep IR validation as the final guard.

### P2. CLI JSON Diagnostics Are Inconsistent

Evidence:

- `packages/cli/src/diagnostics.ts:22` supports JSON output to stderr when callers pass `stderr: true`.
- `packages/cli/src/commands/validate.ts:101` returns validation failure JSON on stdout.
- `packages/cli/src/commands/editor.ts:261` returns editor diagnostic JSON on stdout.
- `packages/cli/src/commands/editor.ts:77` performs `cp`, validation, and writes without converting operational failures into command-specific diagnostics.

Why it matters:

Automation cannot reliably parse `--json` output if failures can land on different streams or escape as raw top-level errors. This will matter more as editor/package/verify commands become product workflows.

Recommendation:

Define one stream policy for JSON mode and centralize command result formatting. Wrap editor/package operational failures into structured diagnostics with stable command-specific codes.

### P2. Compiler Asset Copy Trusts Destination Paths Before Validation

Evidence:

- `packages/compiler/src/emit/bundle.ts:698` resolves source paths.
- `packages/compiler/src/emit/bundle.ts:699` resolves destination paths with `resolve(outDir, asset.path)`.
- `packages/ir/src/validate.ts:685` rejects absolute or parent-traversal asset paths later.

Why it matters:

Normal SDK asset helpers may already reject many bad paths, so this is lower priority than the package/editor validation gaps. Still, the emitter copy routine is a lower-level boundary that trusts paths before the bundle validator has a chance to reject them.

Recommendation:

Add a shared safe bundle-path helper for all compiler copy operations. It should reject absolute paths and traversal before `mkdir`/`cp`, and assert the resolved destination remains inside `outDir`.

### P2. Default `pnpm verify` Is Not The Full Cross-Runtime Gate

Evidence:

- `package.json:21` runs build, typecheck, lint, and test.
- `package.json:22` keeps conformance in a separate `verify:conformance` script.
- `scripts/verify-v7.mjs:153` runs conformance.
- `scripts/verify-v7.mjs:169` runs `cargo test` for the Bevy runtime.

Why it matters:

The obvious repo-wide command can pass while native or conformance behavior is broken. This is especially risky in a repo whose core product promise is web/native parity.

Recommendation:

Either make `pnpm verify` the full cross-runtime gate, or clearly rename/document it as JS-only and add a root `verify:all` or `verify:release` command that includes conformance and Rust tests.

### P2. Docs Index Points To V3 As The Active Gate

Evidence:

- `docs/README.md:72` says the active release gate is V3.
- `docs/README.md:79` recommends `pnpm verify:v3`.
- `docs/STATUS.md:15` says the current active gate is V7.
- `docs/STATUS.md:23` recommends `pnpm verify:v7`.

Why it matters:

The docs index is a likely entry point for contributors and agents. It currently disagrees with the implementation front door, so people can follow stale release instructions while docs checks still pass.

Recommendation:

Make `docs/README.md` defer active-gate language to `docs/STATUS.md`, or include `docs/README.md` in version drift checks.

## Priority 3

### P3. Generated V1 Bundle Is Tracked Despite Example Hygiene Rules

Evidence:

- `examples/AGENTS.md:11` says generated `dist/` and verification artifacts should stay out of commits unless explicitly tracked.
- `examples/v1-canonical/.gitignore:1` ignores `dist/`.
- `examples/v1-canonical/dist/game.bundle/manifest.json` is tracked.
- `scripts/verify-v1.mjs:37` rebuilds the canonical example but does not assert the committed generated bundle is regenerated and clean.

Why it matters:

Tracked generated output can silently drift from source or cause avoidable churn.

Recommendation:

Either remove the tracked bundle and rely on build artifacts, or promote it to an explicit fixture with a regeneration/check-clean step.

### P3. Package Build Scripts Duplicate Workspace Orchestration

Evidence:

- `package.json:8` already runs recursive workspace builds.
- `packages/compiler/package.json:10` manually builds dependencies before itself.
- `packages/runtime-web-three/package.json:10` manually builds dependencies.
- `packages/cli/package.json:10` manually builds dependencies.

Why it matters:

Build ordering logic is spread across package manifests, which makes dependency changes brittle and can slow local verification as the workspace grows.

Recommendation:

Let pnpm workspace topology own dependency ordering where possible. Keep package-local `build` scripts focused on local compilation, with aggregate filtered build flows at the root.


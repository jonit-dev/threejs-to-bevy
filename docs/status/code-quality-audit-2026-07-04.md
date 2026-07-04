# Code Quality Audit - 2026-07-04

## Scope Inspected

Repo-wide architecture, technical debt, and complexity audit for ThreeNative, with hotspots prioritized first. The audit covered:

- TypeScript package boundaries across `packages/sdk`, `packages/ir`, `packages/compiler`, `packages/authoring`, `packages/cli`, `packages/runtime-web-three`, `packages/editor`, and `tools/verify`.
- Rust native runtime and loader crates under `runtime-bevy`.
- Verification scripts, release gates, examples/templates, and docs/status workflow.
- Large files, validation and serialization contracts, runtime parity paths, command orchestration, and generated-game production gates.

This was a read-only audit of source behavior. The only intentional repository modification is this Markdown report.

## Overall Quality Score

**6.7/10**

| Area | Score | Rationale |
| --- | ---: | --- |
| Correctness baseline | 7.1 | Strong focused tests and explicit diagnostics exist, and the Bevy explorer ran `cargo test` successfully. Several contract mismatches remain in public SDK/runtime boundaries. |
| Test and verification workflow | 6.5 | Broad tests and gates exist, but coverage is uneven across critical boundaries. Several high-risk paths have trace/golden coverage rather than live behavior coverage, and package-level test density drops around CLI orchestration, editor/runtime integration, native loader strictness, and generated project packaging. |
| Maintainability | 6.0 | Core behavior is concentrated in several 1.5k-5k LOC files with mixed concerns. |
| Architecture boundaries | 6.2 | Product boundaries are well documented, but contract truth is split across SDK, IR, compiler, runtime adapters, and verification registries. |
| Runtime parity robustness | 6.4 | Web and Bevy parity is actively tested, but native scheduling, entity reconciliation, loader strictness, and visual fallback behavior create high-leverage drift risk. |
| Security/robustness | 6.8 | Diagnostics and validation are generally explicit, but project path containment and native unknown-field handling need tighter guarantees. |

## Top Findings

### 1. Public SDK Physics Contract Can Emit IR That Validation Rejects

- **Refs:** `packages/sdk/src/physics.ts:5`, `packages/sdk/src/physics.ts:197`, `packages/ir/src/validate.ts:2161`, `packages/ir/src/physics.test.ts:190`
- **Current pattern:** `PhysicsColliderKind` and `cylinderCollider()` expose `cylinder` publicly, while IR validation accepts only `box`, `capsule`, `mesh`, and `sphere`. The IR tests explicitly expect cylinder to be unsupported.
- **Impact:** Users can author with the public SDK and produce invalid portable IR. This is a concrete symptom of split contract truth between SDK builders and IR validation.
- **Recommendation:** Pick one contract source. Either deprecate/remove public `cylinderCollider()` until promoted, or promote cylinder through IR validation, schemas, compiler capability derivation, web/Bevy mapping, and conformance.
- **Risk:** Medium. If existing users rely on the SDK helper, removal needs a clear diagnostic/migration path.
- **Verification needed:** Add a compiler emit test for `cylinderCollider()` that asserts either a stable compiler diagnostic or a valid bundle. Run `pnpm --filter @threenative/sdk test`, `pnpm --filter @threenative/compiler test`, and `pnpm --filter @threenative/ir test`.

### 2. Native Runtime System Scheduling Diverges From Web Game Loop Semantics

- **Refs:** `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:177`, `runtime-bevy/crates/threenative_runtime/src/lib.rs:434`, `packages/runtime-web-three/src/gameLoop.ts:33`
- **Current pattern:** Bevy runs `startup`, `fixedUpdate`, `update`, and `postUpdate` every runtime call with a hard-coded fixed delta. Web keeps `startupComplete`, an accumulator, pause state, frame, and tick state.
- **Impact:** Startup effects can repeat every native frame, fixed updates can run at render cadence, and gameplay timers/counters can diverge across web and Bevy.
- **Recommendation:** Introduce a Bevy `NativeGameLoopState` that mirrors web loop state: startup once, accumulator-based fixed steps, pause handling, and frame/tick propagation.
- **Risk:** High behavioral risk, but high payoff. This touches shared runtime semantics.
- **Verification needed:** Add a cross-runtime fixture asserting startup count and fixed tick count after multiple frames. Run `cargo test` in `runtime-bevy` and `pnpm verify:conformance`.

### 3. Native Scripted Spawn/Despawn Mutates Bundle State Without Reconciling Live Bevy Entities

- **Refs:** `runtime-bevy/crates/threenative_runtime/src/systems_effects.rs:415`, `runtime-bevy/crates/threenative_runtime/src/lib.rs:456`, `runtime-bevy/crates/threenative_runtime/src/runtime_gameplay_host.rs:9`
- **Current pattern:** Script effects can spawn/despawn entities in `LoadedBundle`, but the Bevy update path syncs only existing transforms, materials, UI text, and minimap markers. Trace evidence can report bundle-state reconciliation without proving live ECS/rendered entities changed.
- **Impact:** Web can visibly render newly spawned objects while Bevy may only report them in traces. This is a high-risk parity gap for gameplay.
- **Recommendation:** Add a native reconciliation layer keyed by `ThreeNativeId` that creates/removes Bevy entities after script effects.
- **Risk:** High. Requires careful mapping for render components, hierarchy, physics, UI, and cleanup.
- **Verification needed:** Add an `App` test where a script spawns a rendered entity and later despawns it from the real Bevy world.

### 4. Authoring Operations and Validation Are Over-Centralized

- **Refs:** `packages/authoring/src/operations.ts:1`, `packages/authoring/src/operations.ts:2451`, `packages/authoring/src/operations.ts:2776`, `packages/authoring/src/operations.ts:3141`
- **Current pattern:** One nearly 5k-line file owns document creation, mutation transactions, validation, path checks, ID rules, inspection, and schema-specific details.
- **Impact:** Shared changes have broad blast radius, local reasoning is difficult, and tests cannot target document-family behavior cleanly.
- **Recommendation:** Split by document family behind a shared mutation/validation core. Keep `operations.ts` as a thin public facade.
- **Risk:** Medium-high due to many exports and CLI/editor callers.
- **Verification needed:** Move one low-risk family first, then run authoring tests and CLI source-document tests before expanding.

### 5. Bundle Emission Is a Multi-Concern Orchestrator

- **Refs:** `packages/compiler/src/emit/bundle.ts:53`, `packages/compiler/src/emit/bundle.ts:185`, `packages/compiler/src/emit/bundle.ts:346`, `packages/compiler/src/emit/bundle.ts:1039`
- **Current pattern:** One 1.5k-line file normalizes bundle roots, lowers structured source, merges scene/ECS/UI/assets, derives manifest capabilities, writes files, stages output, and builds provenance.
- **Impact:** Any new IR document or structured source document requires edits in distant sections. Missed manifest entries, provenance drift, and incomplete optional-document support are easy to introduce.
- **Recommendation:** Extract `bundle-plan` for canonical document/file planning, `structured-source-lowerers` for `readStructured*`, and `bundle-writer` driven by `IR_DOCUMENTS`.
- **Risk:** Medium. Output shape and deterministic ordering must be preserved.
- **Verification needed:** Snapshot emitted file sets and `manifest.json` before/after. Run `pnpm --filter @threenative/compiler test` and `pnpm --filter @threenative/ir test`.

### 6. IR Contract Truth Is Split Across Types, Schemas, Registries, Validators, and Runtime DTOs

- **Refs:** `packages/ir/src/documents.ts:26`, `packages/ir/src/schemas.ts:10`, `packages/ir/src/bundleDocuments.ts:47`, `packages/compiler/src/emit/capabilities.ts:36`, `runtime-bevy/crates/threenative_loader/src/types.rs:5`
- **Current pattern:** Document metadata, JSON schema exposure, manifest loading, capability strings, TypeScript validators, and Rust DTOs are maintained separately.
- **Impact:** New documents or fields can become compiler-emitted but schema-less, web-loaded but Bevy-ignored, or capability-derived without central validation.
- **Recommendation:** Promote one typed IR registry that records document file, schema id, version, load/write behavior, drift-test metadata, and schemaless reasons. Add a typed capability catalog instead of open string construction.
- **Risk:** Medium. This is best done incrementally by document domain.
- **Verification needed:** Add a test that every emitted optional document has either `schemaFile` or `schemalessReason`, and that unknown capability names are rejected unless explicitly experimental.

### 7. Bevy Loader Accepts Contract Drift Too Broadly

- **Refs:** `runtime-bevy/crates/threenative_loader/src/bundle.rs:1`, `runtime-bevy/crates/threenative_loader/src/types.rs:5`
- **Current pattern:** Native loading accepts broad `0.x` document versions and hand-maintained serde DTOs can silently drop unknown fields.
- **Impact:** Bevy can appear compatible with bundles whose fields it does not understand, creating quiet web/Bevy parity drift.
- **Recommendation:** Validate exact schema/version per loaded file, add `deny_unknown_fields` where feasible, or route native loading through canonical IR validation output.
- **Risk:** Medium. Stricter loading may expose existing fixture drift.
- **Verification needed:** Add loader tests for wrong schema id, unsupported minor version, unknown promoted fields, and missing required promoted fields.

### 8. CLI and Generator Workflows Duplicate Parsing, Path, and Serialization Logic

- **Refs:** `packages/cli/src/index.ts:254`, `packages/cli/src/commands/sourceDocuments.ts:67`, `packages/cli/src/commands/scene.ts:56`, `packages/cli/src/commands/game.ts:747`, `packages/cli/src/commands/sourceDocuments.ts:848`
- **Current pattern:** Flag parsing, JSON/object/vector parsing, usage rendering, JSON output, project resolution, generator dynamic import, conflict checks, and provenance writes are spread across command modules.
- **Impact:** Command edge cases can drift. Generator output path validation is especially sensitive because it hashes and records declared outputs.
- **Recommendation:** Introduce a small typed CLI parsing/rendering utility and extract a `GeneratorRunner` service with injectable compiler/importer/fs/clock. Validate generator outputs as project-relative source paths before hashing.
- **Risk:** Medium. Must preserve exit codes and stdout/stderr shapes.
- **Verification needed:** Golden tests for representative commands plus outside-output, generated-artifact-output, missing-output, conflict-hash, invalid-export, and deterministic `lastRun` cases.

### 9. Web Runtime Mapping and Render Boot Are Large, Mixed-Concern Surfaces

- **Refs:** `packages/runtime-web-three/src/mapWorld.ts:131`, `packages/runtime-web-three/src/mapWorld.ts:248`, `packages/runtime-web-three/src/render.ts:137`, `packages/runtime-web-three/src/systems/context.ts:56`
- **Current pattern:** Web mapping and render startup combine entity mapping, materials, cameras, diagnostics, environment, particles, audio, UI overlays, input, script loading, physics initialization, and render pipeline setup. `systems/context.ts` exposes a very broad service facade.
- **Impact:** Runtime features are easy to add in one place but hard to isolate for tests and parity review. Adapter-local defaults and diagnostics can become implicit contract behavior.
- **Recommendation:** Split web runtime into narrower services: world entity mapper, render bootstrap, environment bootstrap, script/gameplay services, UI/audio services, and diagnostics aggregation. Keep public `renderBundle()` stable.
- **Risk:** Medium. Browser lifecycle, disposal, and diagnostics ordering must be preserved.
- **Verification needed:** Existing `packages/runtime-web-three` tests, plus focused startup/disposal tests that assert identical diagnostics and object counts.

### 10. Verification Gate Metadata and Execution Are Duplicated, With Serial "Parallel" Release Work

- **Refs:** `tools/verify/src/release.ts:170`, `tools/verify/src/cli/run.ts:347`, `tools/verify/src/v9QualityGates.ts:10`, `docs/status/verification-script-classification.md:18`
- **Current pattern:** Gate lists and classifications are duplicated across release, dispatcher, V9 quality, and docs. The release phase named `parallelFocusedGates` still awaits each gate serially.
- **Impact:** New/renamed gates can be routable but absent from release, documented but not enforced, or enforced with stale artifact paths. Release cost grows linearly as gates are added.
- **Recommendation:** Promote one typed gate catalog with name, profile, owner, commands, artifact contract, and docs classification. Add bounded concurrency for non-conflicting release gates while preserving deterministic report order.
- **Risk:** Medium. Artifact-conflict gates must stay serialized.
- **Verification needed:** `pnpm --filter @threenative/verify-tools test -- --run gate`, `pnpm --filter @threenative/verify-tools test -- --run release`, then `pnpm verify:release`.

### 11. Test Coverage Is Uneven Around the Riskiest Integration Boundaries

- **Refs:** `packages/authoring/src/operations.ts:4247`, `packages/cli/src/commands/sourceDocuments.ts:848`, `packages/compiler/src/emit/bundle.ts:53`, `runtime-bevy/crates/threenative_loader/src/types.rs:5`, `runtime-bevy/crates/threenative_runtime/src/lib.rs:456`, `packages/runtime-web-three/src/render.ts:137`
- **Current pattern:** The repo has many focused unit tests and verification gates, but coverage is strongest around existing happy-path contracts and weaker around integration seams: SDK-to-IR acceptance/rejection parity, project-relative path containment, packaged template fallback, generator output boundaries, native loader strictness, live Bevy ECS reconciliation, browser lifecycle/disposal, and cross-runtime gameplay scheduling.
- **Impact:** The highest-risk defects can survive because tests prove nearby artifacts or traces rather than the actual behavior users depend on. Examples include public SDK helpers that fail later in IR validation, Bevy traces that do not prove live ECS entities exist, and CLI source-generation paths that are hard to test without real filesystem/import side effects.
- **Recommendation:** Add targeted coverage before broad refactors. Prioritize small regression tests at each boundary: SDK builder emits accepted IR or a stable diagnostic; authoring rejects absolute/outside/generated script paths; packaged `create` mode uses `dist/template-files`; generator outputs must stay project-relative; Bevy loader rejects unknown/promoted fields; native spawn/despawn changes real ECS entities; web render startup/disposal preserves diagnostics and object lifecycle.
- **Risk:** Low for adding tests, medium where tests expose existing behavior that needs a compatibility decision.
- **Verification needed:** Start with narrow package tests for each boundary, then promote only the cross-runtime cases into `pnpm verify:conformance` or focused gates once they prove behavior that unit tests cannot.

## Lower-Priority Opportunities

- **Project-relative script path containment:** `packages/authoring/src/operations.ts:4247` resolves system script modules against the project but should explicitly reject absolute paths, `../outside.ts`, generated output roots, and non-`src/scripts/**` modules. This is boundary hardening, not just cleanup.
- **Compiler-to-SDK object recognition:** `packages/compiler/src/capture.ts` and `packages/compiler/src/emit/scene-to-world.ts` rely on SDK internal shapes and constructor names. SDK-owned discriminants or snapshot methods would reduce brittleness.
- **Asset validation layering:** `packages/ir/src/assetValidation.ts` mixes pure metadata validation with filesystem and binary payload checks. Split metadata, reference, and payload validation so editor/CLI quick checks can be cheap and deterministic.
- **Coverage gap tracking:** Add a lightweight test-gap checklist next to future PRDs or status reports when a capability is promoted. The checklist should name unit tests, integration tests, parity/conformance evidence, negative diagnostics, and generated-project/package-mode coverage.
- **Runtime trace wrappers:** `scripts/verify-runtime-query-diffing.mjs`, `scripts/verify-runtime-prefabs-hierarchy.mjs`, and `scripts/verify-ui-persistence-settings-facades.mjs` repeat fixture/report/diff harness logic. A typed `runRuntimeTraceParityGate` helper would reduce drift.
- **Visual evidence labeling:** Some visual scripts can copy web evidence into Bevy-labeled artifacts. Parity gates should label copied screenshots as web-only smoke evidence or require real native capture.
- **Verification should not mutate durable source:** `tools/verify/src/physicsSelfVerification.ts` writes fixture/example files during normal verification. Split fixture update from verification and keep routine gates artifact-only.
- **Docs/status policy checks:** `tools/verify/src/docs.ts` relies on brittle substring checks. Structured metadata blocks would make status facts enforceable without constraining prose.

## Hotspot Inventory

Largest source files observed during the audit:

| File | Approx. LOC | Concern |
| --- | ---: | --- |
| `packages/authoring/src/operations.ts` | 4,983 | Authoring mutation, validation, inspection, source path handling |
| `runtime-bevy/crates/threenative_runtime/src/map_world.rs` | 2,619 | Native world mapping and adapter behavior |
| `packages/ir/src/validate.ts` | 2,568 | IR validation contract |
| `packages/runtime-web-three/src/mapWorld.ts` | 2,044 | Web world mapping and startup diagnostics |
| `packages/cli/src/commands/game.ts` | 1,946 | Game workflow CLI orchestration |
| `runtime-bevy/crates/threenative_loader/src/types.rs` | 1,879 | Native mirrored IR DTOs |
| `tools/verify/src/gameProductionGate.ts` | 1,637 | Generated-game quality gate policy |
| `packages/compiler/src/emit/bundle.ts` | 1,527 | Bundle emission orchestration |

These are not automatically bad files, but they are the best first targets because they combine high change frequency, public/runtime contract impact, and broad test surface.

## Commands and Scans Run

- `rg --files` for repo shape, package configs, and nested instructions.
- `find ... wc -l` to identify source-size hotspots.
- Package script/dependency scan via `package.json` parsing.
- Targeted `rg` scans for TODO-style markers, serialization, filesystem access, `as any`, `JSON.parse(JSON.stringify(...))`, and package dependency direction.
- Targeted `nl -ba` / `sed` reads around hotspot files and reported line references.
- Multi-agent explorer audits for compiler/IR/SDK, CLI/authoring/templates, runtime-web-three, runtime-bevy, and verification/examples/docs.
- `cargo test` in `runtime-bevy` was run by the Bevy explorer and passed, with dead-code warnings in test support fixtures.

No full repo `pnpm` verification suite was run during this audit; the request was analysis/report generation rather than implementation.

## Areas Not Fully Covered

- The web runtime explorer had not returned before report writing, so web-runtime findings combine local hotspot inspection with repo metrics rather than a separate completed subagent report.
- Editor UI component quality was sampled through dependency and large-file scans, but not deeply audited as a frontend UX/code review.
- Security review was limited to architectural robustness, path containment, dynamic import, and validation boundary concerns.
- Performance review was static only; no profiling traces were collected.
- Test coverage was assessed from file/test distribution, hotspot inspection, and reported verification behavior, not from an instrumented coverage run. No line, branch, or mutation coverage numbers were collected.

## Open Questions

- Should unsupported-but-authored SDK capabilities be hidden at compile time, rejected with compiler diagnostics, or allowed behind explicit experimental capability markers?
- Should native runtime loading depend on generated TypeScript/JSON-schema validation artifacts, or should Rust own strict schema validation independently?
- Which verification gates are allowed to share artifact directories, and which must remain serialized even after bounded concurrency is introduced?

## Modification Note

This audit did not change implementation files. It created this report at `docs/status/code-quality-audit-2026-07-04.md` as requested.

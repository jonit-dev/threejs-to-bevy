# Code Quality Audit - 2026-06-18

## Summary

Overall codebase quality score: **7.4 / 10**.

ThreeNative is in a healthy functional state by the gates run during this audit:
the naming check, docs check, verify-tools build, TypeScript typecheck, and Bevy
runtime tests all passed. The main quality risk is not current breakage; it is
architecture drift from rapid feature and verification growth around the IR
contract, runtime adapters, and release gates.

## Scorecard

| Area | Score | Rationale |
| --- | ---: | --- |
| Correctness baseline | 8.5 | Core workspace checks and native tests pass. Shared conformance coverage is broad. |
| Test coverage | 8.0 | TypeScript and Rust test density is good, especially around IR/runtime behavior. Some preview-server edge cases are missing. |
| Maintainability | 6.5 | Several high-leverage files are large and mixed-concern, especially IR validation and native loading/mapping. |
| Architecture boundaries | 6.5 | Product boundaries are documented, but `runtime-web-three` currently depends on compiler APIs. |
| Verification workflow | 7.0 | Typed `tools/verify` exists and passes, but orchestration still depends heavily on legacy `.mjs` scripts. |
| Security and robustness | 7.0 | Native bundle path validation is strong; web preview serving has an ad hoc path check that should use the shared policy. |

## Scope Inspected

- TypeScript packages under `packages/*`.
- Typed verification tooling under `tools/verify`.
- Legacy verification and maintenance scripts under `scripts`.
- Bevy runtime and loader under `runtime-bevy`.
- Example and template package layout.
- Repo guidance in `AGENTS.md`, `packages/AGENTS.md`, `runtime-bevy/AGENTS.md`,
  and `examples/AGENTS.md`.

## Verification Run

- `pnpm check:names`: passed.
- `pnpm build:verify-tools`: passed.
- `pnpm check:docs`: passed.
- `pnpm typecheck`: passed.
- `cargo test --manifest-path runtime-bevy/Cargo.toml`: passed, with repeated
  dead-code warnings for unused fields in Rust test support.

## Remediation Progress

- Fixed finding 1 by routing preview `/bundle` requests through the shared
  bundle-relative path policy, single-pass decoding, and a resolved filesystem
  containment check. Added raw HTTP-path tests for encoded traversal,
  absolute-like paths, repeated separators, and malformed escapes.
- Fixed finding 2 by validating preview bundles directly with `@threenative/ir`
  and removing the `@threenative/compiler` dependency from
  `@threenative/runtime-web-three`.
- Started finding 3 by extracting manifest and required-capability validation
  from `packages/ir/src/validate.ts` into
  `packages/ir/src/validateManifest.ts` while preserving the public
  `validateBundle` API and diagnostic behavior. Continued the split by moving
  schema file, component/resource payload, event declaration, and built-in
  component/resource checks into `packages/ir/src/validateSchemas.ts`, then
  moved local-data validation into `packages/ir/src/validateLocalData.ts` and
  audio and UI validation into `packages/ir/src/validateAudio.ts` and
  `packages/ir/src/validateUi.ts`. Scene lifecycle validation now lives in
  `packages/ir/src/validateScenes.ts`, systems validation now lives in
  `packages/ir/src/validateSystems.ts`, and input map validation now lives in
  `packages/ir/src/validateInput.ts`. Runtime config validation now lives in
  `packages/ir/src/validateRuntimeConfig.ts`, and materials validation now
  lives in `packages/ir/src/validateMaterials.ts`. Top-level transform
  animation document validation now lives in
  `packages/ir/src/validateAnimations.ts`, and target profile validation now
  lives in `packages/ir/src/validateTargetProfile.ts`. Model asset animation,
  morph target, and particle metadata validation now lives in
  `packages/ir/src/validateAssetAnimationMetadata.ts`.
- Partially addressed finding 4 by moving the docs gate's naming and artifact
  layout checks into typed verification modules
  `tools/verify/src/currentNames.ts` and `tools/verify/src/artifactLayout.ts`,
  removing the direct `docs.ts` import of `scripts/check-current-names.mjs`.
  The conformance aggregate gate implementation moved into
  `tools/verify/src/conformanceGate.ts`; `scripts/verify-conformance.mjs` is now
  a compatibility wrapper around the built typed gate, and the aggregate
  conformance gate is covered by TypeScript checking rather than `@ts-nocheck`.
  The release gate now calls the typed V9 quality-gate checker directly instead
  of shelling `scripts/check-v9-quality-gates.mjs`. The V7 performance budget
  verifier now lives in `tools/verify/src/v7PerformanceBudgets.ts`; the V7
  packaging target-profile verifier now lives in
  `tools/verify/src/v7PackagingTargetProfiles.ts`; and the V7 character trace
  verifier now lives in `tools/verify/src/v7CharacterTrace.ts`. The shared V6
  resource/event trace verifier family, including the V6 animation and V7
  physics-query and scripting-lifecycle wrappers, now lives in
  `tools/verify/src/v6ResourceEventTrace.ts`. The V7 audio lifecycle verifier
  now lives in `tools/verify/src/v7AudioLifecycleTrace.ts`, the V7 animation
  trace verifier now lives in `tools/verify/src/v7AnimationTrace.ts`, and the
  V7 UI navigation and environment-content trace verifiers now live in
  `tools/verify/src/v7SimpleTrace.ts`. The V9 physics-character verifier now
  lives in `tools/verify/src/v9PhysicsCharacter.ts`, and the V9 animation state
  and blending trace verifiers now live in
  `tools/verify/src/v9AnimationServiceTrace.ts`. The V9 rendering/lights
  verifier now lives in `tools/verify/src/v9RenderingLights.ts`, and the V9
  assets/glTF scene workflow verifier now lives in
  `tools/verify/src/v9AssetsGltfSceneWorkflow.ts`. The scene lifecycle verifier
  now lives in `tools/verify/src/sceneLifecycle.ts`, backed by the extracted
  typed conformance comparison helper in `tools/verify/src/conformanceCompare.ts`.
  The V9 sample-scenes release verifier now lives in
  `tools/verify/src/v9SampleScenes.ts`, and the V9 visual-matrix release
  verifier now lives in `tools/verify/src/v9VisualMatrix.ts`. The release gate
  runs the typed verify-tools test suite instead of direct legacy script tests.
  Focused dispatch for the extracted scene-lifecycle, V9 assets/glTF workflow,
  and V9 rendering/lights gates now calls typed `tools/verify/dist/cli/*`
  entries instead of legacy script paths, and `pnpm check:quality:v9` now runs
  the typed V9 quality-gate CLI. Runtime gameplay host verification now lives in
  `tools/verify/src/runtimeGameplayHost.ts`, with focused dispatch calling the
  typed CLI and `scripts/verify-runtime-gameplay-host.mjs` kept as a
  compatibility wrapper. Bundle safety hardening verification now lives in
  `tools/verify/src/bundleSafetyHardening.ts`, with focused dispatch calling the
  typed CLI and `scripts/verify-bundle-safety-hardening.mjs` kept as a
  compatibility wrapper. Persistence reload and input/UI polish verification now
  live in `tools/verify/src/persistenceReload.ts` and
  `tools/verify/src/inputUiPolish.ts`, with focused dispatch calling their typed
  CLIs and their legacy scripts kept as compatibility wrappers. Rendering
  residuals verification now lives in `tools/verify/src/renderingResiduals.ts`,
  with focused dispatch calling its typed CLI and the legacy script kept as a
  compatibility wrapper. The legacy script paths are compatibility wrappers and
  the aggregate conformance/release gates call the typed verifiers directly.
- Partially addressed the low-priority Rust warning cleanup by allowing the
  shared fixture metadata fields only where integration test crates do not read
  them.
- Finding 4 remains partially open: typed verification has not yet retired the
  remaining legacy `.mjs` orchestration.

Remediation verification run after these changes:

- `pnpm --filter @threenative/runtime-web-three test -- --run devServer`:
  passed build but skipped all subtests because the package runner applies
  `--run` as a test-name pattern.
- `pnpm --filter @threenative/runtime-web-three build && node --test
  dist/devServer.test.js` from `packages/runtime-web-three`: passed.
- `pnpm typecheck`: passed.
- `cargo test --manifest-path runtime-bevy/Cargo.toml`: passed.
- `pnpm --filter @threenative/ir test`: passed.
- `pnpm --filter @threenative/ir typecheck`: passed.
- `pnpm --filter @threenative/verify-tools typecheck`: passed.
- `pnpm --filter @threenative/verify-tools test`: passed.
- `pnpm check:quality:v9`: passed.
- `pnpm check:docs`: passed.
- `pnpm check:names`: passed.
- `pnpm verify:scene-lifecycle`: passed.
- `pnpm verify:runtime-gameplay-host`: passed.
- `pnpm verify:bundle-safety-hardening`: passed.
- `pnpm verify:persistence-reload`: passed.
- `pnpm verify:input-ui-polish`: passed.
- `pnpm verify:rendering-residuals`: passed.
- `pnpm verify:conformance`: passed.
- `pnpm verify:release`: passed.

## Top Findings

### 1. Web preview bundle serving has avoidable path-safety risk

Affected files:

- `packages/runtime-web-three/src/devServer.ts`
- `packages/runtime-web-three/src/devServer.test.ts`
- `packages/ir/src/bundlePaths.ts`

Current pattern:

`startWebPreview` serves `/bundle` requests by rejecting URLs containing literal
`..`, then resolving the request against `bundlePath`.

Impact:

This is a local preview server, but file serving is safety-sensitive. The current
check is not the shared bundle path policy and does not have focused tests for
encoded traversal, absolute-path-like input, repeated separators, or resolved
paths outside the bundle root.

Recommendation:

Decode and normalize the request path once, validate it with the shared IR bundle
relative path policy, reject absolute/current/parent segments, and assert the
resolved path remains inside the bundle root. Add preview-server tests for
malicious and malformed paths.

Risk:

Low implementation risk. Medium robustness value.

Verification:

- `pnpm --filter @threenative/runtime-web-three test -- --run devServer`
- `pnpm typecheck`

### 2. `runtime-web-three` depends on compiler APIs

Affected files:

- `packages/runtime-web-three/package.json`
- `packages/runtime-web-three/src/devServer.ts`
- `packages/compiler/src/validate/index.ts`

Current pattern:

The web runtime package imports `validateBundle` from `@threenative/compiler`.
That compiler API wraps `@threenative/ir` validation and remaps diagnostics.

Impact:

Runtime packages are supposed to consume emitted IR and bundles, not compiler
APIs. This dependency makes the package graph heavier and weakens the intended
compiler/runtime boundary.

Recommendation:

Use `@threenative/ir` validation directly from the web preview server, or move
shared diagnostic formatting into a small contract-level helper if compiler-style
diagnostics are required. Remove `@threenative/compiler` from
`runtime-web-three` dependencies unless it is only needed by tests.

Risk:

Low to medium. The main thing to preserve is user-facing diagnostic shape in CLI
preview flows.

Verification:

- Runtime-web-three tests.
- CLI dev and validate command tests.
- `pnpm typecheck`.

### 3. IR validation is a high-leverage monolith

Affected file:

- `packages/ir/src/validate.ts`

Current pattern:

`validate.ts` was roughly 6,275 lines at audit time and still has about 2,163
lines after the first extractions. It combines bundle IO, manifest
orchestration, per-document validation, schema payload validation, reference
validation, path validation, and feature-specific constraints.

Impact:

This file owns the stable contract between compiler, CLI, and runtimes. Its size
increases merge conflicts and makes contract changes harder to review because
unrelated validation concerns live together.

Recommendation:

Split validation by document or domain while preserving the public
`validateBundle` API. Good extraction boundaries are manifest/bundle
orchestration, assets, materials, world/entities, schemas, scenes, local data,
systems, and shared diagnostics/path helpers.

Risk:

Medium. Diagnostic codes, paths, ordering, severity, and suggestions are
observable and should be preserved.

Verification:

- `pnpm --filter @threenative/ir test`
- `pnpm verify:conformance`

### 4. Verification migration is still split between typed tools and legacy scripts

Affected files:

- `tools/verify/src/cli/run.ts`
- `tools/verify/src/release.ts`
- `tools/verify/src/docs.ts`
- `scripts/*.mjs`

Current pattern:

Typed verification tooling exists under `tools/verify` and builds successfully,
but it still shells out to many legacy `.mjs` scripts. Some typed code imports
legacy scripts during migration.

Impact:

Release gates pass, but gate ownership remains diffuse. Adding or changing a
gate requires understanding both typed `tools/verify` conventions and legacy
script conventions.

Recommendation:

Continue migration in small slices. Move reusable gate specs, artifact path
logic, and report writing into `tools/verify/src`; leave `scripts/` as
compatibility shims only. Retire direct `.mjs` imports from typed code as each
gate moves.

Risk:

Medium. Artifact paths, compatibility aliases, and release reports are visible
contracts.

Verification:

- `pnpm check:names`
- `pnpm check:docs`
- `pnpm verify:release`

## Lower-Priority Opportunities

- `runtime-bevy/crates/threenative_loader/src/lib.rs` is another large contract
  mirror, around 2,133 lines. It is appropriate for native loading, but should be
  split by IR document before it grows much further.
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs` and
  `packages/runtime-web-three/src/mapWorld.ts` encode parallel runtime mapping
  behavior. Conformance fixtures are the right guardrail; avoid hand-maintaining
  undocumented parity rules.
- Rust tests pass but repeatedly warn about unused `bundle_path` and `name`
  fields in `runtime-bevy/crates/threenative_runtime/tests/support/mod.rs`.
  This is low priority but easy to clean up.

## Assumptions And Limits

- This was a code-quality audit, not a full security review or performance
  profiling session.
- The original read-only audit used representative baseline gates; remediation
  later ran full `pnpm verify:release` and `pnpm verify:conformance`.
- The worktree had existing dirty changes before the audit. They were not
  reverted or modified.

## Recommended Next Steps

1. Fix preview-server bundle path validation and tests.
2. Remove the compiler dependency from `runtime-web-three` if diagnostic
   compatibility can be preserved.
3. Split `packages/ir/src/validate.ts` incrementally by validation domain.
4. Continue migrating verification implementation from `scripts/` to
   `tools/verify/src`.

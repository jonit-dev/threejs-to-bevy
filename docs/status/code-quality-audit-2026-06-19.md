# Code Quality Audit - 2026-06-19

## Scope Inspected

- TypeScript package boundaries under `packages/*`, with emphasis on
  `packages/ir`, `packages/runtime-web-three`, and verification consumers.
- Typed verification tooling under `tools/verify/src`.
- Legacy verification and maintenance scripts under `scripts`.
- Native Bevy loader and runtime mapping under `runtime-bevy`.
- Repo guidance in `AGENTS.md`, `packages/AGENTS.md`, `runtime-bevy/AGENTS.md`,
  `examples/AGENTS.md`, and `docs/workflows/developer-workflow.md`.

The worktree already contained unrelated verification-document moves and edits
before this report was written. This audit did not revert them.

## Overall Score

Overall codebase quality score: **7.1 / 10**.

| Area | Score | Rationale |
| --- | ---: | --- |
| Correctness baseline | 8.0 | Existing package and runtime structure is coherent, and the repo has broad gates. This pass focused on static evidence plus targeted verification rather than a full release run. |
| Test coverage | 7.5 | IR and runtime behavior have many focused tests, but preview bundle serving lacks negative path-safety tests. |
| Maintainability | 6.0 | `packages/ir/src/validate.ts` and native loader/mapping files remain large contract mirrors with many feature concerns in one file. |
| Architecture boundaries | 6.5 | Product boundaries are documented, but `runtime-web-three` still reaches into compiler APIs for preview validation. |
| Verification workflow | 6.5 | Typed verification dispatch exists, but current gates still shell to numerous legacy `.mjs` scripts and typed code imports legacy scripts directly. |
| Security and robustness | 6.8 | Native bundle path validation is explicit; web preview bundle serving still uses an ad hoc literal `..` rejection. |

## Top Findings

### 1. Web preview bundle serving still uses ad hoc path validation

Affected files:

- `packages/runtime-web-three/src/devServer.ts`
- `packages/runtime-web-three/src/devServer.test.ts`
- `packages/ir/src/bundlePaths.ts`

Current pattern:

`startWebPreview` serves `/bundle` requests by rejecting URLs containing literal
`..`, then resolving the request path against `bundlePath`.

Evidence:

- `packages/runtime-web-three/src/devServer.ts:77` reads the raw request URL.
- `packages/runtime-web-three/src/devServer.ts:78` rejects only literal `..`.
- `packages/runtime-web-three/src/devServer.ts:84` resolves the result under the
  bundle root without a shared bundle-relative path policy or containment check.
- `packages/runtime-web-three/src/devServer.test.ts:7` covers happy-path serving,
  but there are no encoded traversal, malformed escape, absolute-like path, or
  repeated-separator tests.

Impact:

This is a local preview server, so the exposure is bounded, but file serving is
safety-sensitive. It currently has weaker path handling than the shared IR bundle
path policy and lacks regression tests for bypasses.

Recommendation:

Decode once, normalize once, validate with the shared bundle-relative path
policy, reject absolute/current/parent segments, and assert the resolved
filesystem path remains inside the bundle root. Add raw HTTP-path tests for
encoded traversal, absolute-like inputs, repeated separators, and malformed
escapes.

Risk:

Low implementation risk; medium robustness value.

Verification:

- `pnpm --filter @threenative/runtime-web-three build`
- `cd packages/runtime-web-three && node --test dist/devServer.test.js`
- `pnpm typecheck`

### 2. `runtime-web-three` still depends on compiler APIs

Affected files:

- `packages/runtime-web-three/package.json`
- `packages/runtime-web-three/src/devServer.ts`
- `packages/compiler/src/validate/index.ts`

Current pattern:

The web runtime preview server imports `validateBundle` from
`@threenative/compiler`. That compiler helper wraps IR validation and remaps
diagnostics.

Evidence:

- `packages/runtime-web-three/src/devServer.ts:5` imports from
  `@threenative/compiler`.
- `packages/runtime-web-three/src/devServer.ts:18` validates preview bundles
  through that compiler API.
- `packages/runtime-web-three/package.json:23` declares
  `@threenative/compiler` as a runtime dependency.
- `packages/AGENTS.md` and `docs/workflows/developer-workflow.md` both define
  runtime packages as IR/bundle consumers, not compiler consumers.

Impact:

The dependency weakens the intended compiler/runtime boundary and increases the
runtime package graph. It also makes preview validation depend on compiler
diagnostic formatting rather than the stable IR contract.

Recommendation:

Use `@threenative/ir` validation directly in the web preview server, or extract
shared diagnostic formatting into a small contract-level helper if CLI-style
messages are required. Remove `@threenative/compiler` from
`runtime-web-three` dependencies unless tests still need it as a dev-only build
fixture.

Risk:

Low to medium. Preserve the preview error message shape expected by CLI dev
flows.

Verification:

- Runtime-web-three tests.
- CLI dev/validate tests if preview diagnostic output changes.
- `pnpm typecheck`.

### 3. IR validation remains a high-leverage monolith

Affected file:

- `packages/ir/src/validate.ts`

Current pattern:

`validate.ts` is 6,275 lines and combines bundle orchestration, manifest checks,
document loading, schema validation, feature-specific validation, reference
validation, and diagnostic helpers.

Evidence:

- `packages/ir/src/validate.ts:57` starts the public `validateBundle` flow and
  loads many document kinds directly.
- `packages/ir/src/validate.ts:6123` through the end still contains low-level
  input, vector, numeric, uniqueness, and JSON helpers in the same file.
- `wc -l packages/ir/src/validate.ts` reports 6,275 lines.

Impact:

This file owns the stable contract between compiler, CLI, and runtimes. Its
current size increases merge conflicts and makes behavior-preserving contract
changes harder to review because unrelated validation domains share one module.

Recommendation:

Split validation incrementally by stable domains while preserving the public
`validateBundle` API, diagnostic codes, paths, severity, ordering, and
suggestions. Good first slices are manifest/bundle orchestration, schemas,
systems, local data, scenes, UI/audio, materials/assets, target profile, and
shared primitive/path helpers.

Risk:

Medium. Diagnostic ordering and paths are observable contracts.

Verification:

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/ir typecheck`
- `pnpm verify:conformance` for broader contract confidence.

### 4. Verification implementation is still split between typed tools and legacy scripts

Affected files:

- `tools/verify/src/cli/run.ts`
- `tools/verify/src/scriptGates.ts`
- `tools/verify/src/release.ts`
- `tools/verify/src/docs.ts`
- `tools/verify/src/cli/conformance.ts`
- `scripts/*.mjs`

Current pattern:

Typed verification entry points exist, but many typed gates still shell out to
legacy `.mjs` scripts. Some typed modules import legacy scripts directly with
`@ts-expect-error` during migration.

Evidence:

- `tools/verify/src/scriptGates.ts:23` models script-only gates as
  `node scripts/<name>.mjs`.
- `tools/verify/src/cli/run.ts:31` merges those script-only gates into the typed
  focused gate registry.
- `tools/verify/src/release.ts:129`, `:162`, and `:163` call legacy scripts from
  the release gate.
- `tools/verify/src/docs.ts:100` imports `scripts/check-current-names.mjs`
  directly from typed code.
- `tools/verify/src/cli/conformance.ts:6` imports
  `scripts/verify-conformance.mjs` directly from typed code.

Impact:

Gate ownership remains diffuse. Adding or changing a gate can require
understanding typed verification conventions, legacy script conventions, and
compatibility aliases. This makes release-gate changes harder to review and
keeps TypeScript coverage incomplete for some gate logic.

Recommendation:

Continue the migration in small slices. Move reusable gate logic, artifact path
handling, and report writing into `tools/verify/src`; leave `scripts/` as thin
compatibility wrappers. Remove direct `.mjs` imports from typed code as each
gate moves. Keep script-only gates clearly labeled while they still own durable
visual/runtime evidence.

Risk:

Medium. Artifact paths, compatibility aliases, report shapes, and timeout
behavior are visible contracts.

Verification:

- `pnpm --filter @threenative/verify-tools typecheck`
- `pnpm --filter @threenative/verify-tools test`
- `pnpm check:docs`
- `pnpm verify:release` after substantial gate migration.

## Lower-Priority Opportunities

- `runtime-bevy/crates/threenative_loader/src/lib.rs` is 2,133 lines and mirrors
  much of the IR bundle contract. It is reasonable for a loader, but should be
  split by document family before more feature metadata accumulates.
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs` is 1,393 lines and
  `packages/runtime-web-three/src/mapWorld.ts` is 960 lines. Shared conformance
  fixtures are the right guardrail; avoid adding undocumented hand-maintained
  parity rules in either runtime.
- Root scripts such as `check:names`, `verify:distribution`, and parity gates
  still call `scripts/*.mjs` directly. Some of these may be intentional wrappers,
  but the repo guidance says new verification gate implementation belongs under
  `tools/verify/src`.

## Verification Run

Static inspection and evidence commands:

- `git status --short`
- `find . -name AGENTS.md -print`
- `rg` scans for compiler runtime dependencies, legacy script imports, and
  `.mjs` gate calls.
- `wc -l` for IR validation, native loader, runtime mapping, and verify-tool
  files.
- Targeted source reads with line numbers for the files cited above.

Post-report verification:

- `pnpm --filter @threenative/runtime-web-three build`: passed.
- `cd packages/runtime-web-three && node --test dist/devServer.test.js`:
  passed, 2 tests.
- `pnpm --filter @threenative/verify-tools typecheck`: passed.
- `pnpm --filter @threenative/verify-tools test`: passed, 36 tests.
- `pnpm check:names`: passed.
- `pnpm check:docs`: passed.

## Assumptions And Limits

- This was a code-quality audit, not a full security review or performance
  profiling session.
- No full release gate was run during the inspection phase.
- Existing unrelated worktree changes were preserved.
- The stale 2026-06-18 audit report was deleted before this replacement report
  was written.

## Recommended Next Steps

1. Fix preview-server bundle path validation and add negative tests.
2. Remove the compiler dependency from `runtime-web-three` preview validation.
3. Split `packages/ir/src/validate.ts` by validation domain, one slice at a time.
4. Continue moving active verification implementation from `scripts/` into
   `tools/verify/src`, keeping compatibility wrappers thin.

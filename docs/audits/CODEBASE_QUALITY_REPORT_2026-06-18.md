# ThreeNative Codebase Quality Report

Date: 2026-06-18

Scope: static quality audit of the current working tree with emphasis on critical hotpaths, complexity, SRP, DRY, KISS, contract drift, runtime parity, and developer experience.

Process:

- Used the `complexity-optimizer` skill and ran its scanner:
  `python3 /home/joao/.codex/skills/complexity-optimizer/scripts/analyze_complexity.py /home/joao/projects/threejs-to-bevy --format markdown`.
- Spawned four focused explorer agents over compiler/CLI, IR/SDK contracts, web/Bevy runtimes, and repo-level DX/automation.
- Manually spot-checked the highest-impact findings against current files.
- No product code was changed. This report file is the only intended output.
- The working tree was already dirty before this audit; findings reflect the current working tree.

## Overall Score

Overall: **★★★☆☆ 3.0 / 5**

| Criterion | Score | Notes |
| --- | ---: | --- |
| Architecture clarity | ★★★☆☆ 3.0 | Good package boundaries and clear product flow, but critical contracts are split across schemas, TS types, validators, and Rust structs. |
| Maintainability | ★★☆☆☆ 2.5 | Several large modules carry too many responsibilities, especially IR validation and runtime mapping. |
| Runtime correctness/parity | ★★★☆☆ 3.0 | Strong conformance intent, but web/native bundle loading, system effects, lighting, and mesh payload handling still diverge. |
| Performance/complexity | ★★★☆☆ 3.0 | Most hotpaths are linear and pragmatic, but some unbounded generation and repeated pixel scans/capture code need guardrails. |
| Developer experience | ★★★☆☆ 3.0 | Useful commands and docs exist, but CI/test coverage does not fully match current gates and examples/templates drift outside workspace checks. |
| Safety/robustness | ★★☆☆☆ 2.5 | Bundle path containment, atomic emit, malformed JSON handling, and generated payload validation need hardening. |
| Test strategy | ★★★☆☆ 3.0 | Broad test presence, but gate discovery has gaps and some parity-sensitive behavior is not covered by shared conformance. |

## Executive Summary

The codebase has a solid product shape: SDK authoring, IR contracts, compiler emit, CLI workflows, and separate web/Bevy runtime adapters are recognizable and mostly respected. The highest quality risk is not a lack of tests or missing structure; it is **contract drift across too many independently maintained representations**.

The most urgent work should harden the bundle trust boundary and make validation fail with diagnostics rather than runtime exceptions. After that, focus on reducing the largest SRP violations: the monolithic IR validator, runtime mapping/loaders, and verification scripts that duplicate policies.

## Top Findings

### P0. Bundle and editor paths can escape their artifact roots

Locations:

- `packages/runtime-web-three/src/loadBundle.ts:130-143`
- `runtime-bevy/crates/threenative_loader/src/lib.rs:1917-1927`
- `packages/cli/src/commands/editor.ts:351-367`
- `packages/cli/src/commands/editor.ts:407-411`
- `packages/cli/src/commands/editor.ts:528-538`

Current pattern: manifest and editor document paths are joined/resolved directly against a bundle root. There is no shared containment check rejecting absolute paths or `../` traversal before reads/writes.

Why it matters: the IR bundle is a trust boundary. A malformed local bundle can read or write outside the bundle directory in runtime loading and editor workflows.

Estimated complexity: O(files), but the issue is safety and contract integrity, not algorithmic cost.

Recommended change: add a shared `resolveBundlePath(root, relativePath)` helper in the IR/compiler/runtime boundary that rejects absolute paths, traversal, URL-shaped paths where not allowed, and resolved paths outside the canonical bundle root. Use it in web loader, Bevy loader, compiler copy, package, and editor document reads/writes.

Risk: high. Add malicious-manifest regression tests in CLI, web runtime, and Bevy loader.

### P0. Compiler emit deletes the previous good bundle before success

Location: `packages/compiler/src/emit/bundle.ts:124-130`

Current pattern: `emitBundle` removes `outDir`, recreates it, then writes/copies artifacts. Any later missing asset, parse failure, or write failure leaves users with no previous valid bundle and possibly a partial output.

Why it matters: build failure should not destroy the last runnable artifact. This is especially painful for dev server and editor workflows.

Estimated complexity: current emit is O(files + assets). Recommended behavior remains O(files + assets).

Recommended change: emit to a sibling temporary bundle directory, validate or at least complete all writes there, then atomically replace `outDir` when possible. Preserve the old bundle on failure.

Risk: high. Test a copy failure after an existing bundle and assert the old bundle remains intact.

### P1. IR contract has too many sources of truth

Locations:

- `packages/ir/schemas/world.schema.json:18`
- `packages/ir/schemas/assets.schema.json:5`
- `packages/ir/schemas/manifest.schema.json:18`
- `packages/ir/src/types.ts:368-391`
- `packages/ir/src/validate.ts`
- `runtime-bevy/crates/threenative_loader/src/lib.rs:194-215`

Current pattern: JSON schemas, TypeScript interfaces, hand-written TypeScript validators, compiler validation, and Rust deserialization structs all encode overlapping IR shape rules. Agents found concrete drift: asset schema omits supported asset variants/groups, manifest schema omits accepted entries, schema registry misses existing schema files, and component shapes are looser in schema than in TS/Rust.

Why it matters: one consumer can accept a bundle another rejects or silently interprets differently. This undermines the repo's central contract.

Estimated complexity: maintenance complexity grows roughly O(contract fields * representations).

Recommended change: introduce a canonical contract table or schema-first generation path for schema URLs, validator allowlists, TypeScript types where practical, and Rust loader parity fixtures. At minimum, add drift tests comparing schema keys, TS manifest keys, validator allowlists, and Rust loader expectations.

Risk: high. Start with drift tests before generation/refactors.

### P1. Malformed bundle documents can crash validation instead of returning diagnostics

Locations:

- `packages/ir/src/validate.ts:60-115`
- `packages/ir/src/validate.ts:4857`
- `packages/ir/src/validate.ts:5771`

Current pattern: parsed JSON is cast to typed IR documents and semantic validation then dereferences fields such as `world.entities` without a structural guard.

Why it matters: invalid bundles are normal validator inputs. CLI, editor, dev server, and package flows need stable diagnostics, not `TypeError`.

Estimated complexity: current validation is O(document size). Guarded validation remains O(document size).

Recommended change: run schema/structural guards for each loaded document before semantic validation, or add small per-document `isRecord`/array checks that emit `TN_IR_*_INVALID` diagnostics before nested reads.

Risk: high. Add tests for malformed `world.ir.json`, `assets.manifest.json`, and `target.profile.json`.

### P1. Entry capture handles import scanning but only transpiles the entry file

Locations:

- `packages/compiler/src/capture.ts:26-43`
- `packages/compiler/src/capture.ts:110-115`

Current pattern: the compiler recursively scans relative imports for portability, but writes only the entry file to `packages/compiler/src/.tn/capture-*.mjs`. Relative imports in the transpiled temp file resolve relative to `.tn`, not to the user's project.

Why it matters: a valid multi-file project can pass the scan and then fail during dynamic import. The generated temp modules also accumulate inside source space.

Estimated complexity: current capture is O(entry + scanned imports), but execution is incomplete for imported modules.

Recommended change: use a real bundling/transpile graph step, or emit transpiled files into a temporary directory preserving project-relative layout. Put temp output in OS/project cache and clean it in `finally`.

Risk: high. Add a two-file example fixture that imports local gameplay code.

### P1. Generated mesh binary payloads are not length-validated

Locations:

- `packages/runtime-web-three/src/loadBundle.ts:117-127`
- `runtime-bevy/crates/threenative_loader/src/lib.rs:1888-1914`

Current pattern: web reads `count` values from a `DataView`, throwing if short; Bevy uses `chunks_exact(...).take(count)`, silently returning fewer values if short.

Why it matters: malformed generated mesh bundles behave differently across runtimes and can surface as render corruption instead of a clear load error.

Estimated complexity: O(payload bytes). Same after validation.

Recommended change: validate exact byte length equals `count * elementSize`, reject unsupported index formats, and return structured load diagnostics with asset ID/path context.

Risk: medium-high. Add parity tests for short/long buffers and bad formats.

### P2. Runtime behavior still drifts across web and Bevy

Locations:

- `packages/runtime-web-three/src/systems/effects.ts:126`
- `runtime-bevy/crates/threenative_runtime/src/systems_effects.rs:216`
- `packages/runtime-web-three/src/mapWorld.ts:339`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:600`
- `packages/runtime-web-three/src/mapWorld.ts:108-123`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:466-507`

Current pattern: several shared IR concepts are implemented independently: command entity constraints, ambient lights, camera selection/activation, material and primitive mapping.

Why it matters: a scene can pass web preview and fail or render differently natively. This is exactly the class of issue conformance should prevent.

Estimated complexity: mostly O(entities), unchanged by recommended fixes.

Recommended change: add shared conformance observations for system command constraints, ambient light semantics, active camera selection, primitive/material defaults, and runtime config. Where possible, derive both runtime expectations from shared fixtures/tables.

Risk: medium-high. Favor tests before behavior changes.

### P2. Web render lifecycle leaks work and can freeze silently

Locations:

- `packages/runtime-web-three/src/render.ts:115`
- `packages/runtime-web-three/src/render.ts:156`

Current pattern: `renderBundle` starts a RAF loop and input listeners but does not expose teardown. Rejected async frame work can stop scheduling later frames without a structured runtime diagnostic.

Why it matters: repeated previews/editor sessions can leak listeners and render loops. A single async system failure can appear as a frozen canvas.

Estimated complexity: per frame remains O(scene + systems).

Recommended change: return a teardown handle that cancels RAF, detaches input listeners, and disposes renderer resources. Wrap frame execution in `try/catch` and route failures to diagnostics.

Risk: medium. Add a lifecycle test with fake RAF/listener hooks.

### P2. Scatter expansion has unbounded generated output

Location: `packages/compiler/src/emit/environment.ts:229-273`

Current pattern: scatter count defaults to `area * density`, then attempts up to `count * 20` and stores every emitted instance in memory.

Why it matters: a large bound or accidental density can make builds hang or exhaust memory without an actionable diagnostic.

Estimated complexity: O(count * exclusion checks), with count currently unbounded by the compiler.

Recommended change: define a max scatter count/attempt budget, validate it before emit, and report a diagnostic with suggested density/count limits.

Risk: medium. Add tests for explicit count and density-derived count limits.

### P2. Large modules violate SRP and raise change risk

Locations:

- `packages/ir/src/validate.ts` around 5,782 lines
- `runtime-bevy/crates/threenative_loader/src/lib.rs` around 1,946 lines
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs` around 1,367 lines
- `packages/runtime-web-three/src/mapWorld.ts` around 909 lines
- `scripts/verify-conformance.mjs` around 962 lines

Current pattern: validation, loading, mapping, diagnostics, and feature-specific rules are concentrated in large files.

Why it matters: cross-runtime feature additions require touching broad, high-risk modules and make focused tests harder.

Recommended change: split by artifact/feature boundary: manifest/assets/materials/world validators; loader path safety/binary decode/JSON decode; camera/light/mesh/material runtime mapping; conformance report building versus command orchestration.

Risk: medium. Do this incrementally behind characterization tests.

### P2. Verification and CI gates do not fully match current quality gates

Locations:

- `.github/workflows/ci.yml:40-41`
- `package.json:21`
- `package.json:26-29`
- `pnpm-workspace.yaml:1-3`
- `scripts/check-current-names.mjs:372-409`
- `scripts/artifact-paths.mjs:3-45`
- `tools/verify/src/artifacts.ts:32-70`

Current pattern: CI runs `pnpm verify`, while release/conformance gates are separate. Root `pnpm test` runs `scripts/*.test.mjs` but misses nested script tests such as visual calibration. Examples/templates are outside the workspace, and artifact path policy is duplicated in legacy and typed tools.

Why it matters: contributors can pass the obvious gate while missing release behavior, nested verification tests, example/template drift, or generated-artifact false positives.

Recommended change: align CI with `pnpm verify:release` and `pnpm verify:conformance` where cost permits. Add recursive script test discovery or a dedicated runner. Add `check:examples`/`check:templates` or normalize maintained examples into workspace checks. Keep one artifact path resolver.

Risk: medium. Gate changes may increase CI time; stage them with clear command names.

## Complexity Scanner Notes

The scanner reported many nested-loop and sort-in-loop warnings, especially in CLI verification and examples. Most pixel scans are expected O(width * height) image analysis, and many nested loops are small test/setup code. The actionable complexity items are:

- unbounded scatter generation in `packages/compiler/src/emit/environment.ts`;
- repeated visual capture implementations that duplicate retry/env/readiness logic;
- large monolithic validators/loaders where maintenance complexity is now a bigger risk than raw Big-O.

## Recommended Roadmap

1. Harden bundle path containment across compiler, CLI editor, web loader, and Bevy loader.
2. Make emit atomic so failed builds preserve the previous valid bundle.
3. Add structural pre-validation for all bundle documents.
4. Add contract drift tests for schema/type/validator/Rust loader keys.
5. Fix capture to support multi-file entries and clean temp output.
6. Validate generated mesh binary lengths in both runtimes.
7. Add conformance observations for command constraints, ambient light semantics, and active camera behavior.
8. Align CI/test discovery with the current release and conformance gates.
9. Split the largest files only after characterization tests exist.

## Sequential Execution Strategy

Treat this as a hardening program, not a broad refactor. Each step should leave the repo in a working state and add regression coverage before changing shared behavior. Prefer narrow pull requests in this order.

### Phase 0: Freeze the Baseline

Goal: make the current risk visible before changing behavior.

Tasks:

1. Add failing or characterization tests for the highest-risk cases:
   - malicious bundle paths using `../` and absolute paths;
   - malformed `world.ir.json`, `assets.manifest.json`, and `target.profile.json`;
   - short generated mesh binary buffers;
   - existing bundle preserved when emit fails.
2. Record which gates are required for each touched area:
   - compiler/IR: package tests plus `pnpm verify:conformance`;
   - web runtime: runtime package tests plus conformance where bundle semantics change;
   - Bevy loader/runtime: `cargo test --manifest-path runtime-bevy/Cargo.toml`;
   - CI/DX: `pnpm check:names`, `pnpm check:docs`, and targeted script tests.

Acceptance criteria:

- Each P0/P1 risk has at least one focused failing test or characterization test.
- No production behavior has changed yet except test-only fixtures.
- The team knows which broad gate to run before merging each later phase.

Checkpoint: run the narrow test files added in this phase. Do not proceed to broad refactors until the failures are understood and scoped.

Self-verification before moving on:

- Re-run the new tests and confirm each fails for the original bug before the fix branch changes production code, or document why it is characterization-only.
- Run `git diff --stat` and confirm Phase 0 only adds tests/fixtures or audit docs.
- Confirm no fixture path, generated artifact, or temp directory was left outside the intended test workspace.
- Confirm every failing test names the expected diagnostic/error code or observable behavior, not just "throws".

### Phase 1: Bundle Trust Boundary

Goal: stop reads/writes from escaping bundle and artifact roots.

Tasks:

1. Introduce one path-containment helper for bundle-relative file paths.
2. Apply it first to CLI editor snapshot/set/apply document reads and writes.
3. Apply it to `packages/runtime-web-three/src/loadBundle.ts`.
4. Apply the equivalent canonicalization to the Bevy loader.
5. Reuse the same rule in compiler asset copy/package paths where practical.

Acceptance criteria:

- Absolute paths and parent traversal are rejected before filesystem access.
- Diagnostics or load errors include the offending bundle-relative path.
- Web and Bevy tests cover the same malicious path cases.

Dependencies: Phase 0 path tests.

Checkpoint: run targeted CLI, web runtime, and Bevy loader tests. For shared bundle semantics, run `pnpm verify:conformance`.

Self-verification before moving on:

- Run malicious-path tests for CLI editor, web loader, and Bevy loader.
- Run a happy-path bundle load/build test to prove normal relative paths still work.
- Inspect all remaining `resolve(bundlePath, ...)`, `join(file)`, and `bundle_path.join(...)` call sites that handle manifest-controlled paths; either migrate them or document why they are safe.
- Confirm errors are structured diagnostics or typed load errors, not raw filesystem exceptions.
- Confirm `pnpm verify:conformance` still passes when bundle path semantics are shared across runtimes.

### Phase 2: Atomic Emit and Generated Payload Validation

Goal: prevent destructive builds and make generated mesh payload failures deterministic.

Tasks:

1. Change compiler emit to write into a temporary sibling directory.
2. Replace the output directory only after all JSON writes, generated payload writes, asset copies, and extra file copies succeed.
3. Validate generated mesh binary lengths in web runtime loading.
4. Validate generated mesh binary lengths in Bevy loading.
5. Add tests for short, long, and correctly sized payloads.

Acceptance criteria:

- A failed emit preserves the previous bundle.
- Partial temp output is cleaned up or isolated from the canonical `outDir`.
- Web and Bevy reject malformed generated mesh payloads with stable errors.

Dependencies: Phase 1 helper may be reused for safe destination paths.

Checkpoint: run compiler emit tests, runtime loader tests, and Bevy cargo tests.

Self-verification before moving on:

- Run the failed-copy test and manually inspect that the previous `outDir` still contains the old valid `manifest.json`.
- Run a successful emit twice and confirm the final bundle is deterministic and contains no temporary directory names.
- Run malformed generated-mesh payload tests in both web and Bevy loaders.
- Run at least one existing generated-mesh/procedural-mesh example or fixture to prove valid payloads still load.
- Confirm temp output is cleaned after both success and failure paths.

### Phase 3: Validator Robustness and Contract Drift Tests

Goal: make invalid input diagnostic-driven and expose schema/type/validator drift.

Tasks:

1. Add structural pre-validation before semantic reads in `validateBundle`.
2. Cover malformed top-level documents with stable `TN_IR_*` diagnostics.
3. Add drift tests for manifest keys across schema, TS type expectations, and validator allowlists.
4. Add drift tests for asset variants and manifest `groups`.
5. Add a schema registry test that every schema file is exported or explicitly excluded.

Acceptance criteria:

- Malformed non-manifest bundle documents do not throw raw `TypeError`.
- Known schema drift is either fixed or captured by explicit failing tests with TODO references.
- `tn validate --bundle` and editor/package validation use the same canonical result for shared checks.

Dependencies: Phase 1 path containment, because validators should not read unsafe paths while checking malformed bundles.

Checkpoint: run `pnpm --filter @threenative/ir test`, compiler validate tests, CLI validate/editor/package tests, and `pnpm verify:conformance`.

Self-verification before moving on:

- Run malformed-document tests and confirm failures return `ok: false` plus stable diagnostics with paths.
- Run valid canonical fixture validation to prove structural guards do not reject supported bundles.
- Run schema drift tests and review any explicit exclusions for a reason and owner.
- Compare `tn validate --bundle`, `tn editor apply`, and `tn package` against the same invalid-bundle fixture and confirm they agree on failure.
- Confirm new diagnostics include code, message, path, severity where supported, and a useful suggestion for author-actionable errors.

### Phase 4: Capture Pipeline Correctness

Goal: make TypeScript authoring capture match real project structure.

Tasks:

1. Add a fixture where the entry imports local gameplay code.
2. Replace entry-only `ts.transpileModule` execution with a graph-aware transpile/bundle step or preserved-layout temp emit.
3. Move temp capture output out of package source space.
4. Clean temp output in `finally`.
5. Expand unsupported import detection to Node builtins and `require` forms.

Acceptance criteria:

- Multi-file projects build successfully.
- Unsupported platform APIs fail with stable compiler diagnostics.
- Repeated builds do not leave new files under package source directories.

Dependencies: Phases 1-3 are safer to complete first because capture output becomes bundle input.

Checkpoint: run compiler capture/build tests and at least one example build.

Self-verification before moving on:

- Run the multi-file import fixture and confirm both direct relative imports and nested relative imports execute from the project layout.
- Run unsupported import tests for bare Node builtins, `node:` builtins, dynamic `import()`, and `require` forms.
- Run repeated capture/build twice and confirm no new files appear under `packages/compiler/src/.tn` or other source directories.
- Confirm diagnostics still point to user source paths rather than temp files.
- Build one existing example that uses the normal authoring flow.

### Phase 5: Cross-Runtime Semantic Parity

Goal: reduce web/Bevy behavior drift with conformance-first changes.

Tasks:

1. Define expected semantics for system command entity constraints.
2. Define expected semantics for multiple ambient lights.
3. Define expected semantics for `ActiveCamera` and `ActiveCameras` fallback order.
4. Add conformance observations before changing runtime behavior.
5. Update web and Bevy runtime implementations to match the chosen contract.

Acceptance criteria:

- The same IR fixture proves matching web/native behavior for each semantic rule.
- Runtime behavior changes are reflected in docs/status only if a capability claim changes.
- No runtime silently accepts a behavior the other rejects for these shared contracts.

Dependencies: Phase 3 drift tests make it clearer where shared semantics belong.

Checkpoint: run package runtime tests, Bevy runtime tests, and `pnpm verify:conformance`.

Self-verification before moving on:

- For each semantic rule, run a fixture where web and Bevy previously diverged and verify both runtimes now report the same observation.
- Run at least one negative fixture where invalid shared IR is rejected by both runtimes or by shared validation before runtime mapping.
- Confirm conformance reports include enough detail to diagnose future drift without reading screenshots or raw runtime logs first.
- Re-run existing rendering/camera/light tests to catch accidental changes to normal scenes.
- Update `docs/STATUS.md` and `docs/bevy-feature-parity.md` only if the runtime behavior changes a claimed capability boundary.

### Phase 6: Verification and Developer Experience Gates

Goal: make the commands contributors run match the quality bar the repo claims.

Tasks:

1. Update CI to include the current release gate or make the naming explicit if CI remains JS-only.
2. Replace `node --test scripts/*.test.mjs` with recursive script test discovery or a maintained runner.
3. Add `check:examples` and `check:templates`, or bring maintained examples/templates into workspace checks.
4. Consolidate artifact path policy so `.mjs` legacy scripts and typed verify tools share one implementation.
5. Make generated ignored artifacts invisible to normal name/layout gates unless explicitly requested.

Acceptance criteria:

- A clean checkout can run the documented contributor gates without generated artifact false positives.
- Nested script tests are included by default.
- CI and docs agree on which gates are authoritative.

Dependencies: can run in parallel with Phase 5 after Phase 3, but avoid changing gate behavior while validator tests are unstable.

Checkpoint: run `pnpm check:names`, `pnpm check:docs`, `pnpm verify`, and the chosen release/conformance gates.

Self-verification before moving on:

- Run the exact command sequence documented for contributors in a clean or cleaned worktree.
- Run nested script test discovery and confirm `scripts/visual-calibration/analyze.test.mjs` is included.
- Generate typical ignored artifacts, then re-run name/artifact gates and confirm ignored output does not poison the gate.
- Confirm CI workflow, `package.json`, `AGENTS.md`, and `docs/STATUS.md` agree on which gates are canonical.
- Measure or record expected CI cost if adding `verify:release` or `verify:conformance`, and document any deliberate fast/slow split.

### Phase 7: Incremental SRP Refactors

Goal: split large files only after behavior is pinned.

Tasks:

1. Split `packages/ir/src/validate.ts` by artifact family.
2. Split runtime loaders into path resolution, JSON decode, binary decode, and schema/version support checks.
3. Split runtime world mapping into camera, light, mesh/material, physics, and UI-related modules.
4. Split conformance command orchestration from report comparison/building.

Acceptance criteria:

- No behavior changes without tests in the same change.
- Public APIs remain stable unless an ADR or PRD says otherwise.
- Each extracted module has focused tests or is covered by existing characterization tests.

Dependencies: Phases 1-6. Refactoring before contract and behavior tests exist will increase risk.

Checkpoint: run the broadest relevant package tests after each extraction, then `pnpm verify:conformance` for shared runtime contracts.

Self-verification before moving on:

- Before each extraction, capture the relevant test list and ensure the same or stronger list passes afterward.
- Review `git diff --word-diff` or equivalent around moved logic to verify behavior was moved, not changed.
- Confirm public exports and package boundaries remain unchanged unless the task explicitly included an API change.
- Run conformance after any refactor touching IR validation, bundle loading, or runtime mapping.
- Keep each refactor PR small enough that reviewers can distinguish mechanical moves from semantic edits.

## Self-Verification Policy

Use this policy after every major phase and before merging any phase-sized change:

1. **Regression test first:** every fixed finding must have a test that would fail or characterize the old behavior.
2. **Narrow gate first:** run the smallest relevant package/test command before broad gates.
3. **Shared contract gate:** run `pnpm verify:conformance` whenever IR shape, bundle loading, compiler emit, or cross-runtime behavior changes.
4. **Native gate:** run `cargo test --manifest-path runtime-bevy/Cargo.toml` whenever Bevy loader/runtime behavior changes.
5. **Docs gate:** run `pnpm check:docs` and update `docs/STATUS.md` plus `docs/bevy-feature-parity.md` when a capability or release-gate claim changes.
6. **Artifact hygiene:** check `git status --short` after each phase and verify only intentional source, fixture, docs, or evidence files changed.
7. **Failure audit:** if a broad gate fails, classify it as regression, pre-existing failure, or environment issue before proceeding.
8. **Rollback safety:** for each phase, confirm there is a small revertable change boundary; do not combine hardening, behavior changes, and SRP refactors in one patch.

## Parallelization Plan

Safe parallel work:

- Phase 0 tests can be split by domain: compiler/CLI, IR, web runtime, Bevy runtime, and DX.
- Phase 6 DX gate work can proceed in parallel after Phase 3 stabilizes validator expectations.
- Phase 7 module extraction can be split only after clear ownership boundaries are assigned.

Must stay sequential:

- Path containment before validator hardening, because validators and loaders should not inspect unsafe manifest paths.
- Atomic emit before larger capture changes, because capture failures should not destroy output.
- Contract drift tests before runtime semantic changes, because parity fixes need a shared target.
- Characterization tests before large SRP refactors.

## Risk Controls

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Broad hardening changes break existing examples | High | Add narrow regression tests first, then run representative example builds before broad gates. |
| Schema/validator fixes reveal many existing invalid fixtures | Medium | Fix canonical fixtures first; quarantine historical fixtures with explicit comments only if needed. |
| CI gate expansion becomes too slow | Medium | Stage gate changes: PR gate for fast checks, nightly/manual release gate for expensive parity, but document the split explicitly. |
| Refactors obscure behavior changes | High | Require characterization tests and keep refactor PRs separate from semantic fixes. |
| Web and Bevy choose different fixes for the same IR concept | High | Write conformance expectations before runtime implementation changes. |

## Verification

Tests/builds were not run because this was a read-only audit/report task. The complexity scanner was run, and findings were manually spot-checked against source files.

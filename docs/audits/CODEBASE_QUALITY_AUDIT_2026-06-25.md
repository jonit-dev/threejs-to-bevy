# ThreeNative Code Quality Audit

Date: 2026-06-25

Scope inspected: recent commits from `e344df31..86189d36`, with emphasis on changed runtime mappers, source-document authoring/CLI paths, Bevy catalog residuals, the new stylized nature example, status docs, and existing audit context under `docs/audits/`.

No implementation files were modified. This audit report is the only file added.

## Overall Quality Score

Overall: **6.4 / 10**

| Area | Score | Rationale |
| --- | ---: | --- |
| Correctness baseline | 7.0 | Recent work added focused tests for source documents, residuals, package target profiles, and runtime mappings. |
| Test coverage | 6.5 | Coverage exists around promoted slices, but several new cleanup risks are structural and only indirectly protected. |
| Maintainability | 5.0 | Recent commits worsened large-file pressure in runtime mappers, authoring operations, and CLI command parsing. |
| Architecture boundaries | 6.0 | SDK/IR/compiler/runtime boundaries are recognizable, but feature-specific rendering and source-operation contracts are crowding central modules. |
| Verification workflow | 7.0 | Gates are documented and routed through `tools/verify`, though docs and CLI metadata are becoming harder to audit manually. |
| Robustness/performance | 6.0 | New StylizedNature code has deterministic behavior, but Bevy-side entity expansion and duplicated procedural math create parity and scaling risk. |

## Top Findings

### 1. StylizedNature is embedded in both runtime world mappers and duplicates procedural scene logic

Files:

- `packages/runtime-web-three/src/mapWorld.ts:450`
- `packages/runtime-web-three/src/mapWorld.ts:754`
- `packages/runtime-web-three/src/mapWorld.ts:1069`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:430`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:926`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:1074`

Current pattern: the StylizedNature feature adds source-asset loading, terrain/path generation, tree anchors, grass placement, color math, shader/material policy, and fallbacks directly into each runtime mapper. The web mapper uses `THREE.InstancedMesh` for grass, while Bevy expands grass into one spawned `PbrBundle` per blade in the main mapper loop.

Impact: this is the highest-leverage cleanup target. It violates SRP in the most parity-sensitive files, duplicates math across TypeScript and Rust, and makes visual drift likely because constants such as tree anchors, masks, color mixes, and fallback behavior must be kept in sync by hand. The Bevy implementation also risks scaling poorly for authored `grassCount` values such as 4,200-5,000.

Recommendation: extract feature-local runtime modules, for example `stylizedNature.ts` and `stylized_nature.rs`, leaving `mapWorld`/`map_world` as dispatchers. Preserve behavior first, then add a shared conformance fixture or generated observation report for path mask samples, terrain heights, tree anchors, counts, fallback modes, and source asset policy. Consider Bevy batching/instancing for grass before increasing density further.

Risk: medium. Refactor can be incremental if tests characterize current output names/counts and visual parity evidence is regenerated.

Verification needed: `pnpm --filter @threenative/runtime-web-three test`, `cargo test -p threenative_runtime`, focused visual/parity gate for the stylized example.

### 2. Source-document CLI duplicates the authoring operation registry and has a stale flag parser

Files:

- `packages/authoring/src/operationRegistry.ts:166`
- `packages/authoring/src/operationRegistry.ts:632`
- `packages/cli/src/commands/sourceDocuments.ts:55`
- `packages/cli/src/commands/sourceDocuments.ts:930`
- `packages/cli/src/commands/sourceDocuments.ts:1035`

Current pattern: `@threenative/authoring` now has operation descriptors and dispatchers, but the CLI separately imports operation functions, hand-parses flags, hand-writes usage strings, and maintains its own `flagsWithValues` set. The command file uses flags such as `--profile`, `--rows`, `--path`, `--outputs`, `--overwrite-policy`, `--input-hash`, `--output-hash`, `--queries`, and `--commands`, but many are missing from `flagsWithValues`.

Impact: the default happy-path tests still pass because most examples put positionals before flags. The maintenance problem is that adding a new operation now requires updating descriptors, dispatchers, CLI parsing, usage strings, flag allowlists, and tests. The stale allowlist also makes positional parsing order-sensitive in ways users will not expect.

Recommendation: make the CLI consume `listAuthoringOperationDescriptors()` plus `dispatchAuthoringOperation()` for the shared operation surface. Keep command aliases and friendly usage text if needed, but derive required/optional argument validation and flag value handling from the registry. As an interim fix, add a test that passes valued flags before positionals for representative commands, then fill the missing allowlist entries.

Risk: medium. The safest path is first to route one command family through the registry, then expand.

Verification needed: `pnpm --filter @threenative/cli test -- --run source-documents-command`, plus registry tests.

### 3. Authoring operation files are becoming source-family monoliths

Files:

- `packages/authoring/src/operations.ts:1`
- `packages/authoring/src/operationRegistry.ts:71`
- `packages/authoring/src/operationRegistry.ts:903`

Current pattern: `operations.ts` is 4,453 lines and imports schema keys for every source family. `operationRegistry.ts` is 1,094 lines and keeps operation names, descriptors, dispatchers, argument validation, and argument coercion in one file.

Impact: this is not just file length. The authoring package is becoming the shared editor/CLI/automation contract, so unrelated changes to UI, input, systems, assets, and environment all converge in the same modules. That raises review cost and makes ownership boundaries less obvious.

Recommendation: split by source family while preserving public exports: `operations/ui.ts`, `operations/input.ts`, `operations/environment.ts`, and equivalent registry fragments. Keep a central registry composition file that only combines descriptors and dispatchers. This should be mechanical and covered by existing operation registry tests.

Risk: low-medium if done as move-only chunks.

Verification needed: `pnpm --filter @threenative/authoring test`.

### 4. Status docs are losing their value as front-door documentation

Files:

- `docs/STATUS.md:15`
- `docs/STATUS.md:576`
- `docs/bevy-feature-parity.md:7`

Current pattern: `docs/STATUS.md` is 2,252 lines and still contains historical gate detail mixed with current entry points. `docs/bevy-feature-parity.md` has a single `Evidence anchors` table cell that has grown into a multi-thousand-character comma list.

Impact: these files are supposed to help contributors quickly understand current capability and drift. Their current shape makes review diffs noisy, encourages append-only updates, and hides what is truly current versus historical evidence.

Recommendation: keep `docs/STATUS.md` to current state, active gates, and links. Move long evidence inventories into dated files under `docs/status/` or a generated evidence index. Replace the parity evidence mega-row with a short summary plus links to capability evidence reports.

Risk: low. This is documentation structure, but it should be done carefully to preserve links and `pnpm check:docs`.

Verification needed: `pnpm check:docs`.

### 5. Existing monolith risks remain and recent commits add to them

Files:

- `packages/ir/src/validate.ts:66`
- `packages/compiler/src/emit/bundle.ts:1`
- `packages/runtime-web-three/src/mapWorld.ts:115`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs:158`

Current pattern: prior audits already called out monolithic IR validation, compiler bundle emit, and runtime mapping. Recent changes added roughly 191 lines to `validate.ts`, 208 lines to `emit/bundle.ts`, 1,076 lines to web `mapWorld.ts`, and 1,195 lines to Bevy `map_world.rs` across the inspected commit range.

Impact: the repo is making forward progress, but the main feature path still tends to land in central files. That compounds review risk and makes later cleanup harder.

Recommendation: treat the next capability slice as an opportunity to extract one boundary before adding more behavior. Best first candidates are StylizedNature runtime modules and source-family authoring modules because they have clear seams and recent tests.

Risk: medium if delayed; low if extracted incrementally under existing tests.

Verification needed: narrow package tests first, then `pnpm verify:conformance` for shared runtime contracts.

## Lower-Priority Opportunities

- The new stylized example includes many binary assets under `examples/stylized-nature-component/assets/`. That matches example sandboxing guidance, but asset provenance and conversion expectations should stay documented near `scripts/convert-glbs-native.mjs` so future examples do not copy large ad hoc asset sets without a repeatable path.
- Bevy catalog residual helpers now exist in IR, web runtime, and Bevy runtime. The current shape is small, but diagnostic text and JSON payload shapes are duplicated enough that fixture-based parity assertions would help if this surface grows.
- `sourceDocuments.ts` has long inline usage strings. Once registry-driven parsing exists, usage generation should become data-driven or table-driven to reduce stale docs.

## Commands And Scans Run

- `git status --short`
- `git log --oneline --decorate -12`
- `git diff --stat HEAD~12..HEAD`
- `wc -l` on recent high-growth files
- `rg` scans for TODO/FIXME/HACK/fallback/JSON parsing/casts
- `rg` scans for function boundaries and StylizedNature/source operation references
- Targeted `sed`/`nl` reads of runtime mappers, authoring operations, CLI source-document commands, status docs, and prior audit reports

No verification tests were run because this was a static audit and no implementation behavior was changed.

## Open Questions

- Should StylizedNature remain a special SDK component with custom runtime rendering, or should it become a reusable example/preset that emits lower-level portable IR? The current implementation treats it as runtime-special behavior.
- Should the user-facing `tn ui/material/input/...` commands remain curated command families, or should the generic authoring operation registry become the canonical CLI automation surface?

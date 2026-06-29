# Code Quality Audit - 2026-06-29

## Scope Inspected

- Repo-wide TypeScript and Rust source under `packages/*`, `tools/verify/src`,
  and `runtime-bevy`, excluding local build output under `dist`, `node_modules`,
  and `runtime-bevy/target`.
- Repo instructions in `AGENTS.md`, `packages/AGENTS.md`, and
  `runtime-bevy/AGENTS.md`.
- Contract and runtime hotspots: IR validation, authoring operation dispatch,
  web runtime mapping, native Bevy mapping/loading, and typed verification
  gates.

Static source inventory for the audited scope found 643 tracked TS/TSX/Rust
source files, 218 test files, and 39 source files over 700 lines. The local
worktree was clean before this report was written.

## Overall Score

Overall codebase quality score: **7.0 / 10**.

| Area | Score | Rationale |
| --- | ---: | --- |
| Correctness baseline | 8.0 | Core package boundaries are documented, the worktree is clean, and focused checks passed. |
| Test coverage | 7.5 | There are many contract and runtime tests, including native runtime tests, but high-value parity behavior still depends on broad visual gates. |
| Maintainability | 5.8 | Several stable-contract modules are very large and mix orchestration, parsing, validation, mapping, and feature-specific logic. |
| Architecture boundaries | 6.6 | The SDK -> IR -> compiler -> runtime flow is clear, but parity-sensitive behavior is duplicated across SDK, authoring, web, and Bevy adapters. |
| Verification workflow | 7.0 | Typed verification gates exist and focused checks pass; editor/package E2E remains dense and costly to debug. |
| Robustness | 7.0 | Diagnostics and path validation are generally explicit; long monoliths make it harder to prove ordering and edge-case preservation during change. |

## Top Findings

### 1. IR validation is still the highest-leverage monolith

Affected file:

- `packages/ir/src/validate.ts`

Current pattern:

`validateBundle` directly orchestrates manifest loading, document loading,
cross-document reference validation, feature-specific validation, and diagnostic
assembly. The same file also owns UI, audio, assets, generated meshes,
animation, materials, input, rendering, systems, prefabs, schema, world, and
primitive helper validation.

Evidence:

- `packages/ir/src/validate.ts:66` starts the public bundle validation flow.
- `packages/ir/src/validate.ts:79` through `:140` manually loads each optional
  and required bundle document.
- `packages/ir/src/validate.ts:307`, `:452`, `:977`, `:1651`, `:2203`,
  `:2909`, `:3217`, `:3813`, and `:4878` show many validation domains in one
  file.
- The file is currently 6,708 lines.

Impact:

This file is a stable contract between compiler, CLI, and runtimes. Its current
shape increases merge conflicts and makes behavior-preserving changes risky
because diagnostic order, paths, severity, and suggestions are all observable.

Recommendation:

Split the file incrementally without changing the exported `validateBundle`
surface. Start with low-coupling slices: bundle document loading, shared
primitive/path helpers, schemas/resources/events, UI, audio, systems, and
assets/materials. Preserve diagnostic ordering by keeping one orchestration file
that calls domain validators in the current order.

Risk:

Medium. The refactor is behavior-preserving but touches observable diagnostic
contracts.

Verification needed:

- `pnpm --filter @threenative/ir typecheck`
- `pnpm --filter @threenative/ir test`
- `pnpm verify:conformance` after any cross-document validator split

### 2. Runtime mapping logic is duplicated across web and Bevy adapters

Affected files:

- `packages/runtime-web-three/src/mapWorld.ts`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs`

Current pattern:

Both runtime adapters independently map the same IR concepts into runtime
objects: mesh renderers, model scenes, cameras, light kinds, render layers,
animation playback, material policy, stylized nature, sparkles, ripple water,
visibility, and startup diagnostics.

Evidence:

- Web mapping dispatch lives in `packages/runtime-web-three/src/mapWorld.ts:643`.
- Bevy mapping dispatch lives in `runtime-bevy/crates/threenative_runtime/src/map_world.rs:1458`.
- Both functions branch over the same conceptual component families, but the
  implementation details and defaults are separate.
- The web file is 2,030 lines; the Bevy mapping file is 2,522 lines.

Impact:

Runtime parity changes require two independent implementations and usually two
sets of tests. This is manageable for thin mappings, but it becomes brittle for
features with authored defaults, fallback behavior, diagnostics, and visual
expectations.

Recommendation:

Do not attempt a shared runtime implementation. Instead, extract shared mapping
contract fixtures and trace assertions per feature. For each parity-sensitive
component family, define the expected normalized mapping in IR/conformance
fixtures and assert both adapters emit equivalent trace data before screenshot
comparison.

Risk:

Medium. The work should be incremental per component family; the main risk is
changing adapter behavior while trying to make traces line up.

Verification needed:

- Existing web runtime tests for the touched feature
- `cargo test` under `runtime-bevy`
- `pnpm verify:conformance`
- Relevant visual parity gate only when visual output is intentionally covered

### 3. StylizedNature defaults and expansion policy are scattered

Affected files:

- `packages/sdk/src/stylizedNature.ts`
- `packages/authoring/src/operationRegistry.ts`
- `packages/runtime-web-three/src/mapWorld.ts`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs`

Current pattern:

SDK and authoring defaults describe author intent, while the runtimes expand
that intent into much larger render workloads and carry separate fallback
colors, counts, geometry constants, and source-backed variants.

Evidence:

- SDK density defaults are `48/140/320` grass instances and `3/6/10` trees in
  `packages/sdk/src/stylizedNature.ts:98`.
- SDK default colors and authored values are set in
  `packages/sdk/src/stylizedNature.ts:120`.
- Authoring operation defaults mirror the SDK shape at
  `packages/authoring/src/operationRegistry.ts:761`.
- Web runtime fallback expansion uses `grassCount` default `4200`,
  `treeCount` default `7`, `size` default `34`, and different fallback colors
  in `packages/runtime-web-three/src/mapWorld.ts:760`.
- Bevy uses similar but separate runtime expansion in
  `runtime-bevy/crates/threenative_runtime/src/map_world.rs:441`.

Impact:

This is a parity and performance risk. A future change to authored defaults,
source asset policy, or visual fallback can silently drift across SDK,
authoring, web, and Bevy. It also makes it unclear which values are authored IR
contract and which are runtime presentation policy.

Recommendation:

Introduce a small shared StylizedNature normalization contract at the IR or SDK
contract layer: authored defaults, runtime expansion defaults, fallback colors,
and source-asset policy should be named and versioned. Runtimes should consume
that normalized shape or assert their local normalization matches contract
fixtures.

Risk:

Medium. Visual output may shift if existing runtime-only fallbacks are treated
as authored defaults by mistake.

Verification needed:

- SDK tests for authored defaults
- Authoring operation registry tests for matching defaults
- Web/Bevy trace or conformance checks for normalized expansion values
- Relevant visual parity smoke after any mapping change

### 4. Authoring operation metadata and dispatch are maintained twice

Affected file:

- `packages/authoring/src/operationRegistry.ts`

Current pattern:

The operation registry declares operation names, descriptors, argument
descriptors, source family metadata, and a separate dispatcher table that
manually re-reads the same arguments into typed operation calls.

Evidence:

- The `AuthoringOperationName` union is manually listed at
  `packages/authoring/src/operationRegistry.ts:71`.
- Descriptors are manually declared beginning at
  `packages/authoring/src/operationRegistry.ts:166`.
- Dispatchers are manually declared again beginning at
  `packages/authoring/src/operationRegistry.ts:632`.
- `schema.create` and `schema.set` descriptors use source family `"resources"`
  at `packages/authoring/src/operationRegistry.ts:326`, even though schema has
  its own operation namespace and document kind.

Impact:

Adding an operation requires coordinated edits in multiple places. The current
shape is typechecked, but it still allows metadata drift such as an operation
being dispatched correctly while advertised with the wrong source family.

Recommendation:

Move toward one operation descriptor table that includes the dispatcher and a
typed argument decoder. Derive operation names, registry entries, and dispatch
from that table. Add a small invariant test that operation namespace, source
family, path policy, and document kind agree for schema/resources/system/ui
families.

Risk:

Low to medium. Preserve operation names, diagnostics, argument paths, result
shape, and file write behavior.

Verification needed:

- `pnpm --filter @threenative/authoring test`
- Editor operation API tests if operation metadata is surfaced in UI

### 5. Native bundle loading mirrors the IR schema in one large Rust module

Affected file:

- `runtime-bevy/crates/threenative_loader/src/lib.rs`

Current pattern:

The native loader defines many IR structs, load orchestration, optional document
loading, generated mesh payload loading, and bundle-relative path validation in
one module.

Evidence:

- `LoadedBundle` aggregates all optional and required documents in
  `runtime-bevy/crates/threenative_loader/src/lib.rs:76`.
- `load_bundle` starts at `runtime-bevy/crates/threenative_loader/src/lib.rs:1905`.
- Binary payload and JSON/path helpers are in the same file at
  `runtime-bevy/crates/threenative_loader/src/lib.rs:2090` and
  `runtime-bevy/crates/threenative_loader/src/lib.rs:2174`.
- The file is 2,216 lines.

Impact:

The loader is a critical contract mirror for Bevy. Keeping schema mirrors,
filesystem loading, binary payload validation, and path policy in one file makes
it harder to audit whether native runtime support tracks IR evolution.

Recommendation:

Split by responsibility: `types` or document modules for serde structs,
`bundle` for load orchestration, `paths` for path validation, and
`generated_mesh` for binary payload handling. Keep public exports stable so
runtime code does not churn.

Risk:

Low to medium if the move is mechanical and public names remain re-exported.

Verification needed:

- `cargo test` in `runtime-bevy`
- `pnpm verify:conformance` if loader behavior or error shapes change

## Lower-Priority Opportunities

- `tools/verify/src/editorPackage.ts` is a useful but dense 911-line E2E gate.
  It starts Vite, drives Playwright, creates fixtures, mutates editor state,
  writes artifacts, and cleans up temporary files in one module. Consider
  splitting fixture creation, browser actions, assertions, and artifact writing
  once the higher-risk contract work above is stable.
- Several runtime and compiler test files exceed 1,200 lines. They are valuable
  regression coverage, but future additions should prefer feature-local test
  files over appending to the largest suites.

## SRP, KISS, DRY, YAGNI, and Complexity Addendum

This follow-up used the `complexity-optimizer` scanner as lead generation and
then inspected production hotspots manually. Scanner hits in examples/tests and
intentional deterministic sorting were treated as low signal unless surrounding
code showed broader maintenance or runtime risk.

### SRP/code smell: native systems host mixes Rust orchestration with a large embedded JavaScript runtime bridge

Affected file:

- `runtime-bevy/crates/threenative_runtime/src/systems_host.rs`

Current pattern:

The Rust host module owns diagnostics, schedule execution, QuickJS setup,
snapshot/effect plumbing, and a large embedded JavaScript bridge string that
implements query filtering, physics helpers, navigation, audio, persistence,
UI, asset lookup, and service facades.

Evidence:

- QuickJS module setup starts in
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:160`.
- The embedded bridge starts at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:364`.
- Asset lookup scans `data.assets` in the bridge at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:425`.
- Character/controller, sensor, navigation, persistence, UI, and service logic
  continue through the same embedded source around
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:731`,
  `:756`, `:800`, and `:1042`.

Impact:

This is the clearest SRP violation found in this pass. It makes native script
host behavior hard to unit-test in isolation and hides JavaScript complexity
inside a Rust string, where editor support, formatting, linting, and small
behavior-preserving changes are weaker.

Complexity:

Current complexity is not a single algorithmic bug; it is compounded module
complexity. Some bridge helpers are O(n) per call and some service helpers are
O(sensors * entities), which may be acceptable for conformance fixtures but
should be explicit if exposed to larger worlds.

Recommended change:

Extract the bridge source into a checked-in JS template or dedicated Rust string
module with narrow service sections, then add bridge-level tests around each
service family. Precompute bridge indexes such as `assetById`, `entityById`,
`settingsByKey`, and sorted navigation regions once per invocation snapshot.

Risk:

Medium. Behavior and diagnostics are visible through native system-host tests.

Verification needed:

- `cargo test -p threenative_runtime systems_host`
- Existing runtime gameplay host trace gates if touched

### KISS/DRY smell: generated-bundle import repeats field reader calls and source-document reconstruction logic

Affected file:

- `packages/authoring/src/importBundle.ts`

Current pattern:

The importer reconstructs structured source documents from generated bundle
artifacts. Many object builders repeatedly call `readString`, `readNumber`, or
field-specific readers for the same property while constructing optional object
spreads.

Evidence:

- Material import repeats reader calls for many fields in
  `packages/authoring/src/importBundle.ts:258`.
- Asset import repeats `readString(asset.path)`/`readString(asset.kind)` style
  checks in `packages/authoring/src/importBundle.ts:295`.
- Audio import repeats `readString(sound.asset)` in
  `packages/authoring/src/importBundle.ts:396`.

Impact:

This is mostly KISS/DRY, not a serious runtime-performance issue. The importer
is offline and bundle sizes are bounded, but repeated reads make each mapped
field noisier and easier to update inconsistently when source-document schemas
evolve.

Complexity:

Current and proposed asymptotic complexity remain O(n) per document. The
improvement is lower local complexity and fewer repeated conversions.

Recommended change:

Introduce small helpers such as `optionalStringField`, `optionalNumberField`,
or a typed field-copy table for simple one-to-one imported fields. Avoid a
framework-sized abstraction; the goal is only to remove duplicated reader/spread
patterns where the target field name is identical.

Risk:

Low. Preserve output ordering, omitted-field behavior, fallback IDs, and stable
JSON formatting.

Verification needed:

- `pnpm --filter @threenative/authoring test`

### Complexity smell: bridge services repeatedly scan snapshot arrays

Affected file:

- `runtime-bevy/crates/threenative_runtime/src/systems_host.rs`

Current pattern:

The embedded bridge repeatedly scans arrays for lookups and service execution.
Examples include `data.assets.find`, `data.entities.find`, `data.entities`
filter/sort pipelines for controller blocking and sensor snapshots, and
navigation region sorting inside point lookup.

Evidence:

- `assetById` is a linear find at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:425`.
- Character movement builds sorted blockers on each move request at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:731`.
- Sensor snapshots compare every sensor with every collider at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:756`.
- `navigationRegionFor` sorts regions on each lookup at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:800`.
- Local-data setting lookup scans settings at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:1042`.

Impact:

For current small conformance fixtures this is probably acceptable. If native
hosted scripts are used for larger scenes, service calls become unnecessarily
expensive and the repeated scans obscure where performance limits are expected.

Estimated current complexity:

- Asset and setting lookup: O(n) per call.
- Character movement blockers: O(e log e) per move request because it filters
  and sorts entities each time.
- Sensor snapshot: O(s * e), plus sorting occupants.
- Navigation region lookup: O(r log r) per lookup due to repeated sorting.

Recommended change:

Build snapshot-local indexes once inside the bridge invocation: maps for assets,
entities, settings, tasks, plugin groups, and sorted arrays for colliders,
sensors, and navigation regions. Keep ordering identical by sorting the indexed
arrays once with the existing comparators.

Estimated complexity after:

- Asset/entity/setting lookup: O(1) after O(n) setup.
- Character movement blockers: O(e log e) once per invocation, O(e) per request.
- Navigation lookup: O(r) per lookup after one O(r log r) setup.
- Sensor snapshot remains O(s * e) unless spatial partitioning is justified.

Risk:

Medium. Indexing must preserve first-match vs sorted-match behavior and must not
change mutable snapshot semantics.

Verification needed:

- `cargo test -p threenative_runtime systems_host`
- Add focused tests for duplicate IDs if duplicate handling is currently
observable

### KISS/code smell: runtime mapping does one avoidable repeated entity lookup

Affected file:

- `packages/runtime-web-three/src/mapWorld.ts`

Current pattern:

After mapping all entities into `objectsById`, camera collection iterates mapped
objects and performs `entities.find((entry) => entry.id === id)` for each camera.

Evidence:

- Camera collection starts at `packages/runtime-web-three/src/mapWorld.ts:161`.
- The repeated lookup is at `packages/runtime-web-three/src/mapWorld.ts:165`.

Impact:

This is a small O(cameras * entities) smell. It is not urgent, but it is a good
example of a cheap KISS fix if the file is already being touched.

Recommended change:

Build `entitiesById` once alongside the sorted `entities` array or iterate
entities directly when collecting cameras. Preserve camera insertion order and
diagnostic behavior.

Risk:

Low.

Verification needed:

- `pnpm --filter @threenative/runtime-web-three test`

### Not a finding: deterministic sort and stable JSON formatting

The scanner flagged sorting in `packages/authoring/src/diagnostics.ts` and
`packages/authoring/src/format.ts`. Those are intentional stable-output paths:
diagnostics and serialized source documents need deterministic ordering. They
should not be optimized unless measurement shows these cold paths are costly.

## Commands Run

- `git status --short` - clean before writing this report.
- `find`/`wc -l` source inventory scans excluding `dist`, `node_modules`, and
  `runtime-bevy/target`.
- `rg` scans for large files, risky casts, TODO-style markers, IO/process/time
  usage, and duplicated StylizedNature defaults.
- `python3 /home/joao/.codex/skills/complexity-optimizer/scripts/analyze_complexity.py /home/joao/projects/threejs-to-bevy --format markdown` - used as lead generation for the addendum.
- `pnpm check:names` - passed.
- `pnpm --filter @threenative/verify-tools typecheck` - passed.
- `pnpm check:docs` - passed after this report was added.

Full release, conformance, Rust, and visual parity gates were not run because
this was an audit-only pass with no behavior change.

## Open Questions

- Should StylizedNature runtime expansion be treated as authored IR semantics or
  as adapter-local presentation policy? The answer determines whether defaults
  belong in SDK/IR normalization or only in conformance trace fixtures.
- Should operation registry source families align strictly with operation
  namespace, or are schema operations intentionally grouped under resources for
  editor presentation?

## Modification Note

No source code was modified. This audit added and then updated only this
Markdown report.

# Diagnostic Report: Urgent (Red) Systemic Risks

Date: 2026-07-08
Scope: the four 🔴 rows in `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
covering contract truth, game loop scheduling, scripted spawn/despawn
reconciliation, and compiler bundle emission. Evidence gathered by four
parallel code audits with file/line references verified against the working
tree on the date above.

Severity ordering (most urgent first):

1. Native scripted spawn/despawn reconciliation — a confirmed functional gap,
   not just a testing gap.
2. Native game loop scheduling — a confirmed semantic divergence between
   runtimes (accumulator clamping), plus structural drift risk.
3. IR/source/runtime contract truth — broad silent-drift exposure; no single
   confirmed bug, but multiple classes of change that would slip through.
4. Compiler bundle emission — testability and maintainability debt; behavior
   appears correct today but changes are expensive to prove.

---

## 1. Native scripted spawn/despawn reconciliation

### Diagnosis

This is worse than the status row implies. The row says "trace evidence can
hide missing visible entities"; the audit found that runtime spawn/despawn
never reaches the live Bevy world at all.

- Script effects apply spawn/despawn/instantiate to the bundle IR only.
  `apply_command` pushes into or retains on `bundle.world.entities`
  (`runtime-bevy/crates/threenative_runtime/src/systems_effects.rs:468-594`)
  and never issues Bevy `Commands`.
- The per-frame driver `run_scripted_runtime_systems`
  (`runtime-bevy/crates/threenative_runtime/src/lib.rs:507-620`) receives a
  `commands: Commands` parameter but never uses it. After effects are applied
  it syncs only transforms, materials, and UI text — each sync iterates
  entities that already exist in the Bevy world and silently `continue`s past
  bundle entities with no live counterpart.
- The only live `world.spawn` in the crate is the one-time startup mapping
  (`runtime-bevy/crates/threenative_runtime/src/map_world.rs:394`), and no
  live-ECS `despawn` call exists anywhere in
  `crates/threenative_runtime/src` (verified by grep). Hierarchy attachment
  also runs only at startup.

Consequences:

- A script `spawn` produces an entity with full IR state that is never
  rendered, never simulated by physics, and never pickable.
- A script `despawn` leaves a ghost Bevy entity: still rendered (with stale
  transform), collider potentially still active, children orphaned, renderer
  resources never freed.
- A runtime prefab `instantiate` creates IR hierarchy that is never attached
  in the live world.
- The effect trace log (`systems_effects.rs:325-423`) records these commands
  as applied, so trace-based conformance evidence reports success while the
  visible world is wrong. This is exactly the "trace evidence can hide"
  failure mode, made structural.

Test coverage matches the gap: `tests/systems_effects.rs` and
`tests/spawner.rs` assert on bundle IR state and event logs only;
`tests/map_world.rs` covers startup mapping only; the headless-App tests in
`lib.rs` assert on bundle resources, not on live entity queries.

### Recommendations

1. Implement live reconciliation, not just tests. After
   `apply_system_effects_with_report`, diff `bundle.world.entities` against
   live `ThreeNativeId` entities and: spawn missing entities through the same
   mapping path `map_bundle_into_world` uses (extract a per-entity
   `spawn_world_entity` helper from `map_world.rs` so startup and runtime
   share one truth); recursively despawn live entities whose IR record is
   gone; attach hierarchy for newly spawned entities. Wire it into
   `run_scripted_runtime_systems` using the already-available `Commands`.
2. Add the live headless-App tests the status row asks for, building on the
   existing `scripted_runtime_app` harness (`lib.rs:1071-1095`):
   - script spawn → entity appears in a `ThreeNativeId` query with transform
     and material/mesh handles;
   - prefab instantiate → `ChildOf`/children relationships exist live;
   - recursive despawn → entity and descendants gone from queries, handles
     released;
   - despawn of an entity with an active collider → physics no longer
     reports contacts.
3. Until reconciliation lands, make the gap fail closed: emit a runtime
   diagnostic (and mark the effect log entry) when a spawn/despawn command
   mutates the bundle but no live reconciliation occurred, so traces cannot
   claim success for invisible entities.
4. Keep spawn ordering deterministic (IR array order) so fixed-tick trace
   fixtures stay reproducible once live sync exists.

Verification for the fix: targeted `cargo test` under `runtime-bevy` for the
new live tests, plus `pnpm verify:conformance` to confirm existing trace
fixtures still pass.

---

## 2. Native game loop scheduling

### Diagnosis

Web (`packages/runtime-web-three/src/gameLoop.ts`, 254 lines) and Bevy
(`runtime-bevy/crates/threenative_runtime/src/systems_host.rs`, 868 lines)
independently implement startup ordering, the fixed-step accumulator, pause,
interpolation, and tick/frame counting. Most semantics currently agree
(startup-once, pause guards, alpha clamped to [0,1], tick/frame counting),
but the audit found real divergences:

- Accumulator clamping is materially different. Web clamps the incoming
  frame delta to 0.25s (`gameLoop.ts:68`) with no substep cap; Bevy clamps
  the accumulator to `fixed_delta * MAX_FIXED_STEPS_PER_FRAME` with the
  constant 5 (`systems_host.rs:28`, applied at 251-253). With
  `fixed_delta = 1/60`, a long frame yields up to 15 fixed steps on web but
  at most 5 on Bevy — divergent tick counts, elapsed simulation time, and
  physics results after any hitch. This alone can break cross-runtime trace
  parity for every gameplay system.
- Schedule grouping differs: web runs `update` and `postUpdate` as separate
  passes (`gameLoop.ts:94-95`); Bevy batches them (`systems_host.rs:314-319`).
  Observable if one system's writes should be visible to another between the
  two schedules.
- Bevy tracks `script_posed_entities` across the kinematic/physics step
  (`systems_host.rs:275-281`); web has no equivalent filter.
- Interpolation overlay/restore takes an extra snapshot on Bevy
  (`systems_host.rs:301-334`) versus web (`gameLoop.ts:91-98`).
- Web has a stateless single-frame fallback path (`gameLoop.ts:101-107`)
  with no Bevy counterpart.

Testing today is asymmetric: web has procedural unit tests
(`gameLoop.test.ts`), Bevy has its own tests plus fixture-style checks
(`tests/systems_host.rs:691-781`). Nothing compares the two runtimes against
one canonical expectation, which is how the clamping divergence survived.

### Recommendations

1. Fix the clamp divergence first — it is a behavior bug, not just drift
   risk. Pick one canonical rule (the Bevy `5 * fixed_delta` substep cap is
   the safer spiral-of-death guard) and apply it to both runtimes.
2. Add the shared conformance fixtures the status row calls for, reusing the
   existing fixture-catalog format
   (`tools/verify/src/conformance.ts:5-22`,
   `packages/ir/fixtures/conformance/fixture-catalog.json`). Scenarios that
   pin the contract: fixed-step accumulation (delta spanning multiple ticks
   with a remainder), long-frame clamping, pause (elapsed advances, ticks do
   not, accumulator preserved), startup-once ordering, interpolation alpha at
   a mid-step boundary, and variable-schedule writes taking precedence over
   interpolation. Each scenario asserts one expected state snapshot
   (frame, tick, accumulator, schedules executed) that both runtimes must
   reproduce.
3. Decide and document whether update/postUpdate separation is contractual;
   if it is, split the Bevy batch and cover it with a fixture; if not,
   record it as intentionally unobservable.
4. Longer term, extract the loop state machine into a pure, port-per-runtime
   specification (a small table of transitions) so the two implementations
   are ports of one definition rather than parallel inventions.

---

## 3. IR/source/runtime contract truth

### Diagnosis

A single document contract is re-declared in up to six places. For the
materials document: the JSON schema
(`packages/ir/schemas/materials.schema.json`), the IR interfaces
(`packages/ir/src/types.ts:618-654`), the Rust loader DTO
(`runtime-bevy/crates/threenative_loader/src/types.rs:747-777`, 2289 lines
total), the compiler emitter's hardcoded schema/version literals
(e.g. `packages/compiler/src/emit/scene-to-world.ts:123-125`), and the
metadata-only registry entry (`packages/ir/src/documents.ts:101-107`).

`contractDrift.ts` and its test are genuinely useful but bounded:

- They validate document registration, schema URL/ID/version literals, and —
  for the 9 schema-backed documents — required-field agreement between JSON
  schema, TS interfaces, and Rust DTOs
  (`packages/ir/src/contractDrift.test.ts:171-207`).
- About 9 further document types (animations, audio, gameFlow, gltfScene,
  localData, prefabs, sequences, systems, ui) have no JSON schema, so they
  have no structural contract check at all.
- Optional fields are not compared. An optional field added to the TS
  interface but not the Rust DTO is silently dropped by serde on load — the
  highest-likelihood silent-drift class, since most contract growth is
  optional fields.
- Enum constraints are checked only for two hand-picked cases; a TS union
  lowered to a plain Rust `String` accepts values the schema forbids.
- Compiler emitters hardcode `schema`/`version` strings with no check
  against `IR_VERSION`/`IR_SCHEMA_IDS`, so a version bump can silently leave
  emitters producing the old literal.
- `#[serde(rename_all = "camelCase")]` mappings are unverified; a manual
  rename typo silently drops a field.

### Recommendations

1. Promote `IR_DOCUMENTS` (`packages/ir/src/documents.ts:28-185`) into the
   typed registry the status row describes. Per document: schema id, version,
   file name, manifest key, schema file (or explicit `schemaFile: null` as a
   tracked debt marker), required and optional key lists, enum-valued fields,
   and drift-test metadata (which layers must agree). The existing
   `IComponentReflectionRegistry` (`packages/ir/src/reflection.ts:15-34`)
   shows the pattern; generalize it beyond components.
2. Close the two cheapest high-value gaps in `contractDrift` first, before
   the full registry:
   - compare optional field sets, not just required ones, between JSON
     schema, TS interface source, and Rust DTO source (the test already
     parses all three; extend the extraction);
   - assert every compiler emitter's hardcoded schema/version literal against
     the registry (grep-style source scan is acceptable, matching the
     existing test technique).
3. Author JSON schemas for the 9 unschemed documents, prioritized by runtime
   blast radius: systems, gameFlow, prefabs first (they feed the risk-area-1
   spawn path), then ui, animations, audio, sequences, localData, gltfScene.
4. Add enum-set comparison for fields the registry marks as enum-valued, so
   Rust `String` catch-alls are flagged.
5. Longer term, consider generating the Rust DTOs or the JSON schemas from
   one source (e.g. schema-first with codegen) so agreement is by
   construction; the registry from step 1 is the prerequisite either way.

---

## 4. Compiler bundle emission

### Diagnosis

`packages/compiler/src/emit/bundle.ts` is 1225 lines and `emitBundle`
interleaves at least nine concerns: structured-source document reading
(79-121), scene-to-world lowering (69-99), SDK/ECS lowering (74-77), input
merging, asset collection/mesh payload preparation (84-95), capability
derivation (136-155), manifest construction (108-190), provenance (214-300),
and staging-dir creation, document writes, asset copies, and atomic rename
(192-332). Asset validation even happens during the copy itself
(`asset-copy.ts:56-82` parses GLB files mid-write to resolve texture
dependencies).

Testing reflects the coupling. `bundle.test.ts` (1716 lines) is solid but
almost entirely end-to-end: every manifest or capability assertion pays for
a full emit to a temp directory. The merge helpers
(`mergeWorlds`, `mergeInputs`, `mergeUis`, `mergeSceneEmits`,
`mergeEcsEmits`, `bundle.ts:880-1096`) and the `readStructured*` parsers in
`structured-documents.ts` (462 lines) have no direct unit tests, and
manifest construction has no isolated test at all.

The good news: the seam the status row asks for already exists in the code's
shape. Everything before `createEmitStagingDir` (`bundle.ts:192`) is pure
computation over already-read inputs; provenance is already pure; mesh
payload preparation (`bundle.ts:1160-1194`) computes without writing. The
main complications are `emitEnvironment`/`emitOverlays`, which are async and
may perform their own file operations, and asset dependency discovery living
inside the copy step.

### Recommendations

1. Split along the existing seam into a pure planner and a writer:
   - `planBundle(...) -> IBundlePlan | ICompilerError[]` producing all IR
     documents, the manifest, mesh payloads, and an asset copy list of
     `{ from, to }` tuples;
   - `writeBundlePlan(plan, projectPath, outDir)` owning staging, writes,
     copies, and the atomic rename.
   Move GLB dependency discovery out of `asset-copy.ts`'s copy loop into the
   planning phase so the copy list is complete before any I/O, and give
   `emitEnvironment`/`emitOverlays` the same read-then-plan treatment.
2. Snapshot the plan. One snapshot test of `IBundlePlan` (documents plus
   manifest shape plus copy list) per representative fixture replaces a
   large share of the current end-to-end assertions and makes manifest or
   capability regressions reviewable as a diff. This also directly serves
   the status doc's verification expectation ("snapshot emitted files and
   manifest shape").
3. Backfill unit tests for the merge helpers (entity dedup by id, input
   action/axis merging, multi-root UI stacking) and for the
   `readStructured*` parsers — these are the functions most likely to be
   touched when new document types land for risk area 3.
4. Keep the existing integration tests for what only they can prove:
   staging atomicity, failure-preserves-previous-bundle, and temp cleanup
   (`bundle.test.ts:79-121`).

---

## Cross-cutting observations

- Risk areas 1 and 3 compound: spawn/despawn flows through the systems and
  prefab documents, which are among the documents with no JSON schema. Fixing
  reconciliation (area 1) without a systems/prefab schema (area 3) leaves the
  new live path validated against an unpinned contract.
- Trace-based evidence is currently overtrusted in two places (areas 1 and
  2). The shared theme: a trace that records what the IR layer did is not
  evidence about the live world or about cross-runtime agreement. New
  promotions should require either a live-ECS assertion or a two-runtime
  fixture comparison, matching the status doc's fail-closed guidance.
- Suggested sequencing given fixed effort: (a) area 1 live reconciliation +
  tests, since it is a present functional gap; (b) area 2 clamp unification +
  shared loop fixtures, since it silently corrupts every cross-runtime
  comparison; (c) area 3 quick wins (optional-field and emitter-literal
  drift checks) which are small test-only changes; (d) area 4 planner/writer
  split, which then de-risks the larger area 3 registry work.

## Verification

Docs-only change: no build or test run required per the status doc's
verification expectations. `pnpm check:docs` should pass; per-area
verification commands are listed inline above for when fixes land.

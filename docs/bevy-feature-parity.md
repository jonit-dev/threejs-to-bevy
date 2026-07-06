# Three.js Game Engine x Bevy Parity

| Scope            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract         | Three.js-style TypeScript game engine -> validated IR bundle -> web Three.js + native Bevy                                                                                                                                                                                                                                                                                                                                                                                                             |
| Native baseline  | Bevy and `bevy_ecs` pinned to `=0.14.2`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Evidence anchors | native test, visual scene, game-authoring ergonomics, agent-safe authoring core diagnostics, agent-safe `tn scene create` first-document UX, structured authoring source-document boundary inventory, structured UI/material/asset/input/system/prefab/audio source document validation tests, recoverable bundle catalog import tests for structured source, initial full-source CLI mutation groups for UI/material/mesh/prefab/input/system documents, structured authoring provenance ownership tests, structured-source-starter template build and CLI source edit proof, generated starter `AGENTS.md`/`CLAUDE.md` CLI-authoring instructions, authoring MCP wrapper smoke tests and structured UI/bundle-import adapter parity tests, read-only `@threenative/editor` shell and `tn editor dev/open` launch tests, editor `content/**` source-persistable IR classification and shared authoring operation registry tests, editor workbench source inventory and operation parity tests, editor runtime preview build/status, selection overlay, catalog preview, Vibe Coder-derived shell chrome, ThreeNative-branded editor chrome, source-backed Three.js editor viewport scene, hierarchy selection, viewport picking, selected-object inspector rows, viewport selection ownership helpers for loaded GLB children and helper exclusion, editor Move/Rotate/Scale gizmo mode state and W/E/R shortcuts, camera/light/terrain viewport cue browser proof, editor source scene lifecycle metadata tests, editor active-scene switching and dirty/build-ready Zustand lifecycle tests, editor GLB asset picker and source prefab/entity operation tests, editor environment terrain skybox and estimated LOD row tests, source-schema-backed inspector field inventory, typed inspector controls, source row JSON-pointer and operation metadata, editor operation coverage matrix and read-only reason tests, editor prefab, asset catalog, and scene resource row persistence tests, editor Zustand session-store modal/selection/project/nesting/transform/async-action tests, editor Zustand refactor `verify:editor-package` browser proof, editor malformed operation diagnostics and unsupported component edit tests, real hierarchy icons, icon playback controls, AI chat rail, editor AI chat source-backed ECS approval and `verify:editor-ai-chat` proof, editor production panel read model for game-quality reports, source-backed reference scene visual details, hierarchy drag/drop affordance, editor default scene creation with main camera/directional light/ambient light, editor scene load/save reload proof, source-derived editor LOD triangle footer status, project-served GLB/GLTF editor viewport loading with Draco decoder proof, attached-component-driven inspector panels, editor Add Object/Add Component/Save/New/Build modal smoke coverage, Add Object Primitive/Empty/Camera/Light source-operation payload tests and browser source/IR proof, Add Component shared defaults/incompatibility/pack metadata and persistence tests, Playwright `verify:editor-package` inspector-control smoke, and browser primitive/color source/IR persistence proof, CLI-authored `.scene.json` build-entry proof with attached script, `tn scene proof` same-source/same-bundle report, `tn game plan/score/qa/release` source-backed production report contract, `pnpm verify:game-production` blocker gate, headless Xvfb-wrapped native proof capture, and web/Bevy screenshots, modular SDK scene/entity/prefab/resource/input/UI/audio/asset source metadata tests, compiler authoring graph normalization tests, modular compiler capture tests, authoring provenance sidecar conformance proof, script module reference and generated manifest tests, scripting host matrix and web/Bevy effect validation parity tests, scene lifecycle SDK declaration tests, scene lifecycle IR validation tests, scene lifecycle compiler emission tests, scene lifecycle web/Bevy runtime trace tests, scene lifecycle example build smoke, animation/physics/navigation residual traces, input/UI polish traces, production hardening traces, rendering residual traces, bundle safety hardening traces, capability conformance fixtures, IR distribution capability manifest and diagnostics catalog tests, AI distribution `llms.txt`/`llms-full.txt` front door and packed CLI `dist/ai` docs proof, `pnpm verify:release`, `pnpm verify:conformance`, `pnpm verify:animation-physics-residuals`, `pnpm verify:input-ui-polish`, `pnpm verify:production-hardening`, `pnpm verify:rendering-residuals`, `pnpm verify:bundle-safety-hardening`, focused gates routed through `tools/verify/dist/cli/run.js`, release reports with step timing categories and budget warnings, `pnpm --filter @threenative/ir test` contract drift and bundle path coverage, `pnpm --filter @threenative/ir test -- --run contractDrift` schema literal and Bevy DTO drift coverage, web/Bevy generated-mesh payload rejection tests, release artifacts under `tools/verify/artifacts/release/` and `packages/ir/artifacts/conformance/`, historical milestone archive under `docs/PRDs/archive/`, V10 PRDs, focused V10 evidence gates |

## Status

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| ✅     | Works across the Three.js-style API, IR, web runtime, and Bevy where claimed. |
| ⚠️     | Partly works, but web and Bevy are not fully aligned yet.                     |
| ❌     | Not implemented in this repo.                                                 |
| ⏭️     | Intentionally deferred or never portable.                                     |

## Bevy Feature Checklist

This checklist is a Bevy-derived backlog for the portable ThreeNative contract.
Checked items have an explicit ThreeNative row or promoted slice in the parity
table below. Unchecked items are reminders to either promote through SDK/IR,
validation, web, Bevy, conformance, and docs evidence, or explicitly defer with
diagnostics. The baseline remains Bevy `=0.14.2`, not latest Bevy.

Priority labels on unchecked items:

- `P0`: Blocks a functional simple game or makes promoted behavior misleading.
- `P1`: High-value small-game parity after the current promoted surface.
- `P2`: Production workflow, scale, or polish needed before a stable release.
- `P3`: Advanced engine parity, specialized workflows, or long-tail features.
- `D`: Deferred or intentionally non-portable.

### V10 Residual Ownership Map

V9 closes the practical small-game parity surface and leaves a smaller residual
set. V10 planning assigned those residual items without claiming
implementation:

- `V10-01` owns final-gap triage, aggregate V10 gate planning, and diagnostics
  for intentionally non-portable boundaries.
- `V10-02` owns advanced renderer, lighting, material/shader, post-processing,
  native-instancing, dynamic mesh-collider, and high-end physics residuals.
- `V10-03` now owns and implements the cross-runtime visual calibration gate for
  isolated color, material, lighting, atmosphere, post-processing, geometry,
  dense content, and combined-scene look-and-feel parity. Run
  `pnpm verify:v10:visual-calibration`; evidence and screenshot artifact paths
  are indexed from `docs/pr-evidence/v10-visual-calibration/`.
- `V10-04` owns production platform work: custom asset/audio extension policy,
  streaming diagnostics, cloud-save boundary, signed/mobile packaging, profiler
  maturity, and release hardening.
- `V10-05` now implements the grouping model: ECS tags as queryable zero-field
  marker components plus scene `Group` containers that lower to hierarchy-only
  `SceneContainer` entities with viewable multi-lane moving-cube web/Bevy
  conformance coverage.
- Broader authoring-tool UX remains outside this V10 batch except for bounded
  visual panel evidence explicitly promoted below. Tooling now includes
  `tn model-test` for one-model proof projects, `tn screenshot`/`tn record` for
  direct Playwright proof artifacts with web runtime ready metadata, screenshot
  canvas/nonblank/visible-mesh/resource-failure diagnostics, `--viewport
  desktop|mobile|<width>x<height>` layout proof, project-relative short video
  proof with input-script metadata and unavailable-state diagnostics, and shared
  single-frame `tn verify --frames 1` screenshot diagnostics plus
  `tn verify --json` projected nonblank bounds diagnostics. Web preview
  readiness also exposes current scene ID, culled mesh count, recent runtime
  errors, per-rendered-entity bounds/scale/projected-bounds/camera-distance/
  clipping/material evidence, an optional `?debugOverlay=1` human overlay, and
  `?debugColliders=1` runtime-owned collider wire volumes surfaced by
  `tn playtest --debug` and `tn dev --target web --debug`; these are
  CLI/runtime QA aids, not new portable Bevy runtime capabilities. SDK transform
  helper methods and runtime Transform patch merge semantics are documented and
  tested so partial position patches preserve authored scale. Current scaffold
  evidence uses `structured-source-starter`; legacy visual starter templates
  are no longer project creation paths.
- The playable authoring-loop hardening slice now treats keyboard input
  spelling as an authoring/IR contract rather than a runtime surprise.
  Structured source reports source-pointer normalization warnings for aliases,
  emitted IR rejects non-canonical keyboard codes, and the compiler normalizes
  supported aliases before web or Bevy consume the shared `input.ir.json`.
  This is a cross-runtime contract guard; it does not add new Bevy-only input
  capabilities.
- Game-production scoring now rejects two generated-game failure modes before
  completion claims: clunky unproven motion (`TN_GAME_MOTION_FEEL_UNPROVEN`)
  and primitive-only placeholder visuals
  (`TN_GAME_VISUAL_BASELINE_PLACEHOLDER`). Template and example agent
  instructions require smooth fixed-time movement, authored visual baselines,
  nonblank screenshot evidence, visible motion evidence, and input-playtest
  proof. Visual scorecard phase scoring now reaches a full pass only from
  retained source coverage plus screenshot/motion proof, not from source-only
  or proof-only outputs.
- Game-production QA proof now writes lightweight `performance.json`,
  `visual-quality.json`, `asset-budget.json`, and `ui-fit.json` sidecars under
  `artifacts/game-production/`, can reuse existing desktop/mobile screenshots
  when no preview URL is supplied, records objective screenshot nonblank,
  projected-bounds, color-variety, and local-contrast metrics, and infers basic
  web playtest defaults from authored player/input source when project proof
  commands are absent. `tn game release --json` now writes the same lightweight
  asset-budget proof for already-built projects when that sidecar is missing.
  This improves generated-game release evidence and does not claim native/Bevy
  input injection parity.
- Game-development velocity kits now provide source-backed kit candidates in
  `tn game plan`, read-only `tn game next` task graphs, `tn prove changed`
  proof manifests/diffs, artifact-local proof metadata on selected proof
  reports, and promoted pure reducer helper imports for
  `@threenative/collector-kit`, `@threenative/lane-runner-kit`, and
  `@threenative/checkpoint-race-kit`. `pnpm verify:generated-games` also
  ratchets the promoted kit proof artifact for reducer, recipe, asset-role,
  UI, playtest, screenshot, scale, and QA evidence. This is an authoring and
  release-evidence improvement; it does not add a new Bevy runtime gameplay
  capability.
- GameBlocks-informed gameplay accuracy now adds source-owned
  `gameplayBlocks` planning descriptors, recipe block/proof metadata, and pure
  named stdlib helpers (`BasisEx`, `ControllerEx`, `CheckpointRaceEx`,
  `SpawnEx`) for generated-game movement, camera, objective, and spawn
  semantics. The helpers are proven by stdlib bundle parity and compiler
  import validation, and generated-game plan evidence is validated when
  present. This does not vendor GameBlocks and does not add Bevy, Rapier,
  renderer, DOM, filesystem, worker, timer, or native-handle script access.
  It is authoring/compiler guidance rather than a new native runtime
  capability claim.
- The authoring-abstractions Phase 1 web runtime slice promotes direct
  `ctx.character.move(entity, { direction, speed })` tracing and web
  script-authored kinematic transform authority to remove same-tick
  double-integration. IR validation covers inconsistent `RigidBody.mass` /
  `inverseMass` and suspect zero-centered character capsules. Native Bevy does
  not yet have an equivalent script-authority execution hook for this new web
  runtime behavior; treat it as an explicit parity gap until a focused native
  trace or conformance fixture proves the same semantics.
- The authoring-abstractions Phase 4 slice introduces a portable
  `KinematicMover` IR component shape and formatted UI binding validation.
  Web runtime support currently covers sine movers, stable authored-origin
  tracking, derivative kinematic velocity, and formatted UI text resolution.
  Structured source validation and compiler lowering now preserve
  `KinematicMover` components and formatted retained UI bindings, and
  `examples/humanoid-physics-course` uses those abstractions for its
  non-player-movement hazard/HUD source.
  Native Bevy does not yet map or prove the new `KinematicMover` component, and
  no web/Bevy conformance fixture has been added for this contract yet.
- The authoring-abstractions Phase 5 paper-cut slice improves structured
  authoring commands and recipes: third-person recipes now stamp safe capsule
  centers, material editing works inside grouped material documents, and scene
  transforms accept degree-authored rotations. These are source-authoring
  ergonomics and validation-path improvements; they do not add a new Bevy
  runtime capability.
- `tn game plan --json` now emits a schema-tagged
  `threenative.game-plan` artifact with non-mutating source-shape guidance for
  scene, input, systems, UI, materials, and assets documents, including
  canonical keyboard binding strings, supported primitive names, explicit system
  read/write metadata, retained UI nodes/bindings, material `color`, asset
  `id/path/type` rows, script ownership, polish categories, proof commands, and
  first-step direct GLB catalog search guidance. Harbor, ferry, boat, dock,
  pier, and ship prompts now route to the naval asset-source category, while
  explicit space/spaceship prompts still route to space. This is authoring-loop
  guidance for generated games; it does not add a new runtime capability.
- `tn game improve --apply-plan <file> --json` now rejects incomplete
  generated-game plan evidence before mutating source or writing canonical
  evidence, then writes the successfully applied non-mutating plan to
  `artifacts/game-production/plan.json`, so bounded recipe application also
  preserves generated-game planning evidence. This is authoring workflow
  hardening, not a Bevy runtime capability.
- Fresh `structured-source-starter` and `racing-kit-rally-starter` scaffolds
  now include `game:plan`, `game:improve`, `game:score`, proof-running
  `game:qa`, and `game:release` scripts plus production metadata for loop,
  controls, objective, retry path, and proof commands.
  `pnpm verify:template-production` gates those maintained starters directly,
  including normalized `production.agent` source-owner metadata, and is
  included in the release focused-gate profile. This improves the starting
  authoring loop; it does not add a Bevy runtime capability.
- `pnpm verify:template-playability` now proves the racing starter's first-use
  loop from a fresh scaffold: authoring validate, build, source camera proof,
  modular track actor/lane proof, web `tn playtest` throttle movement, and a
  negative malformed-input validation check. This is a web authoring-loop proof;
  native/Bevy playtest injection remains pending.
- `pnpm verify:generated-games` aggregates generated-game release proof for
  `asteroid-mail-runner`, `clockwork-garden-heist`, `copper-rail-switcher`,
  `crystal-cavern`, `firefly-grove-keeper`, `glassworks-prism-sorter`,
  `harbor-lantern-ferry`, `lantern-orchard`, `magnet-yard-sorter`,
  `metro-surfer-heist`, `moon-canyon-courier`, `neon-sushi-rush`, `paper-plane-postmaster`,
  `river-rescue`, `rooftop-wind-courier`, `sky-lighthouse-relay`,
  `storm-buoy-rescue`, `sunken-library-salvage`, `tidepool-crab-courier`,
  `toy-train-yard-switcher`, and `windup-workshop-sorter`, requiring zero
  release blockers/risks and a persisted
  `artifacts/game-production/plan.json` with schema
  `threenative.game-plan`, `mutate:false`, complete design/source/script/
  asset/polish/proof sections, source-shape guidance for scene/input/systems/
  UI/materials/assets documents, proof commands for authoring validate, build,
  input-driven playtest, screenshot, game score, QA `--run-proof`, and release,
  acceptance criteria for the objective/input loop, asset/provenance,
  script/source wiring, authored visual baseline, and proof loop, and first-step
  direct GLB catalog search guidance,
  with opt-in game-agent inventory diagnostics available for stricter migration
  batches, and README/package script drift checks. This remains generated-game
  workflow evidence, not a Bevy runtime parity claim. The gate also requires a
  durable gameplay system source declaration under
  `content/systems` or `content/scenes` that points at an existing
  `src/scripts/**/*.ts` named export, declares `GameState` writes, and records
  component/resource access, retained `content/ui/*.ui.json` HUD source with
  multiple text/status nodes and `GameState` bindings targeting those nodes
  plus gameplay, pause, settings, loading, fail/retry, win/milestone, and
  touch-control state affordances,
  authored `content/materials/*.json` source with multiple material rows,
  distinct colors, and roughness values,
  `qa-report.json` with a passing `proofRun` containing the required
  doctor/build/playtest/desktop screenshot/mobile screenshot/recorded
  motion/quality/budget/fit proof steps, input-driven playtest movement above
  the recorded threshold with a non-empty playtest screenshot artifact, zero QA
  blockers/diagnostics/release risks in the persisted QA report, the motion
  step backed by an existing non-empty `artifacts/game-production/motion.webm`,
  an existing clean persisted `release-report.json`, resolvable persisted
  QA/release report evidence paths across top-level, phase, scorecard,
  UI-state, and asset/audio evidence rows, max persisted visual scorecard, all
  phase ledgers passing with full score, complete retained UI-state coverage,
  artifact-backed persisted production command rows including
  `artifacts/game-production/doctor.json` debug proof and the actual discovered
  bundle manifest path, durable source/provenance evidence for every
  asset/audio ledger surface,
  usable source `VisualProvenance` describing
  catalog
  searches, selected assets, or authored fallback surfaces, and passing
  visual-quality sidecars that include objective nonblank, visible-bounds,
  color-bucket, and local-contrast metrics plus an existing non-empty PNG
  screenshot artifact whose dimensions match those metrics before treating the
  set as current evidence. It also parses performance,
  asset-budget, and UI-fit sidecars to require concrete screenshot paths with
  matching byte sizes, mobile viewport dimensions, a
  present dist marker, and numeric size measurements within their recorded
  budgets. The gate is included in the release focused-gate profile. It
  writes a self-describing summary with project counts, audited paths, and
  required-proof counts, and fails inventory drift when a generated example has
  production planning artifacts but is not enrolled in the aggregate list. The
  summary also records aggregate visual metric ranges from visual-quality
  sidecars so future visual threshold ratchets have release evidence. It
  strengthens authoring/QA proof; it is not a new Bevy runtime capability.
- `tn playtest` now provides web-runtime gameplay proof by injecting a
  canonical keyboard code, sampling emitted-bundle effect-log Transform patches,
  and reporting movement delta/distance plus screenshot evidence. Optional
  `--expect-axis x|y|z` catches false positives where autonomous idle motion
  moves the entity but the requested input does not affect the intended axis.
  Native/Bevy playtest injection is still pending, so this is marked as web
  proof rather than Bevy parity.
- Structured scene source now has compact prefab-backed `instances` for repeated
  ECS entities. This is an authoring/compiler ergonomics improvement: emitted
  bundles still contain ordinary world entities and do not introduce any
  Bevy-private source concept. Validation rejects ambiguous compact source
  before build, and `tn scene inspect --json` exposes repeated-block/refactor
  evidence for agents.
- Structured `content/ui/*.ui.json` source now emits runtime `ui.ir.json`
  instead of provenance-only UI evidence for generated structured-source
  projects. The compiler normalizes 1280px starter-style HUD rows without
  horizontal anchors into left/right anchored UI so `tn screenshot --viewport
  mobile` captures visible HUD text. This is an authoring/compiler/runtime-web
  proof improvement, not a new Bevy-only UI capability.

Residual rows below should not be treated as implementation claims unless they
name SDK/IR, validation, compiler, web, Bevy, conformance, docs, and artifact
evidence, or stable diagnostics that make the feature explicitly unsupported.

### Post-V10 PRD Slice Map

The residual backlog is now split into planning PRDs without claiming new
implementation. These slices supersede the coarse V10 ownership map for future
execution order while keeping parity claims tied to explicit evidence:

- [Runtime Gameplay Host Semantics](PRDs/done/other/post-v10-runtime-gameplay-host.md):
  now release-gated by `pnpm verify:runtime-gameplay-host` for P0/P1 ECS host
  execution, live rendered-entity reconciliation, event windows, dynamic state
  handoff, hooks, system-local state, bounded timer/channel evidence, stoppable
  observer controls, and runtime plugin/raw-handle diagnostics.
- [Durable Persistence and State-Preserving Reload](PRDs/done/other/post-v10-persistence-hot-reload.md):
  durable Bevy save/settings backend, autosave/checkpoint restore, hot reload
  with state policy, live scene mutation needed for reload proof, and
  cloud/filesystem boundary diagnostics.
- [Input, UI, and Platform UX Polish](PRDs/done/other/post-v10-input-ui-platform-polish.md):
  platform touch streams, settings-screen polish, richer gestures/device repair,
  virtual keyboard behavior, runtime disabled-state updates, nested scrolling,
  spatial navigation, focus narration, italic text, grid residuals, and desktop
  webview inspection.
- [Rendering, Materials, Geometry, and Asset Residuals](PRDs/done/other/post-v10-rendering-materials-geometry-residuals.md):
  runtime LOD swapping, mesh deformation/terrain streaming, material/specular/
  blend proof, instancing APIs, custom GPU attributes, compressed environment
  formats, broader live asset streaming, glTF custom attribute consumption, and
  advanced renderer/material/shader diagnostics.
- [Animation, Physics, and Navigation Residuals](PRDs/done/other/post-v10-animation-physics-navigation-residuals.md):
  animation masks, morph targets, UI/property animation, blend-tree residuals,
  sloped mesh grounding, constraints, triangle narrow phase, dynamic navmesh,
  crowd/off-mesh links, vehicle diagnostics, and advanced physics deferrals.
- [Production Audio, Diagnostics, Profiling, and Packaging](PRDs/done/other/post-v10-production-audio-diagnostics-packaging.md):
  live mixer/effects, audio routing diagnostics, UI/audio integration,
  profiler/GPU timing reports, signed/mobile packaging preflight,
  domain-specific repair hints, debug rendering, and production boundary
  diagnostics.

The latest parity pass has no remaining unchecked checklist rows in this file;
future work is now tracked as PRD slices for diagnostic boundaries or promotion
evidence rather than raw unchecked items. Recent completed slices based on the
residual wording below are:

- [Render Look, Shadow, and Bloom Polish Profiles](PRDs/done/other/render-look-shadow-bloom-polish.md):
  screenshot-backed `balanced` profile promotion, bounded shadow/bloom/exposure
  polish controls, and reserved `cinematic`/`stylized` profile evidence.
- [Animation, Morph, Mask, and Lightweight VFX Polish](PRDs/done/other/animation-morph-mask-vfx-polish.md):
  morph targets, animation masks, bounded blend residuals, and deterministic
  script-triggered VFX commands.

### Prioritized Native Gap Backlog

This pass treats the Bevy runtime crate as the source of truth and ranks
remaining gaps by usefulness for building and shipping ordinary 3D games:

- `P0` Durable native save/settings storage is promoted by
  `pnpm verify:persistence-reload`, which proves declared resource/component
  save records, settings, autosave restore, and migration diagnostics across web
  and Bevy.
- `P0` State-preserving reload is promoted by `pnpm verify:persistence-reload`
  for bundle-local asset replacement, retained state policy, reset state
  classification, and unsupported cloud/filesystem boundary diagnostics.
- `P1` Runtime gameplay lifecycle parity is promoted by
  `pnpm verify:runtime-gameplay-host`, which compares web and Bevy live
  rendered-entity reconciliation, event-window policy, dynamic state handoff,
  command-time/removal hook ordering, system-local evidence, stoppable observer
  propagation, bounded timer/channel semantics, native startup-once and
  accumulator-based fixed tick loop-state evidence, and stable diagnostics for
  raw handles, runtime plugins, workers, timers, and unbounded promises.
- `P1` Scene-scoped lifecycle fields are promoted for compiler/runtime scope
  evidence: scene-local input maps, system schedules, and UI roots lower into
  bundle documents with scoped scene references, and web/Bevy scene managers
  expose matching active/additive `activeScopes` snapshots.
- `P1` Source-authored system metadata now persists through structured
  `content/systems/*.systems.json` documents and `tn system set-metadata`,
  exposes matching editor metadata rows, imports generated bundle metadata back
  to source, and lowers access lists, ordering, query declarations, service
  declarations, and command declarations into `systems.ir.json`.
- `P1` Source-authored ECS tags and scene groups now have typed CLI/source
  mutation via `tn scene add-tag` and `tn scene add-group`; structured scene
  builds lower zero-field marker components and `SceneContainer` group entities
  into `world.ir.json` plus component schemas.
- `P1` Portable scripting host conformance is backed by the service matrix,
  focused web and Bevy effect-validation tests that reject undeclared
  component/resource/event/command/service effects before mutation, canonical
  effect-log ordering, compiler module-state diagnostics, and native QuickJS
  ambient API isolation tests.
- `P1` Portable script helper imports now have a supported compiler bundle path
  for named `@threenative/script-stdlib` imports. Pure numeric, angle, `Vec2`,
  `Vec3`, quaternion, transform, bounds, easing, deterministic random, color,
  text, input, motion, timer, array, and camera helpers are injected into
  `scripts.bundle.js`, helper import metadata is recorded in
  `scripts.manifest.json`, and unsupported helper packages/import shapes are
  rejected with `TN_SCRIPT_UNSUPPORTED_IMPORT`. `pnpm --filter
  @threenative/script-stdlib test` proves export/bundle parity for every
  promoted helper, and `pnpm verify:scripting-helpers-lifecycle` records the
  focused helper import, web playtest, and Bevy context-helper bridge evidence.
- `P1` Source-referenced portable systems now reject module-local helper or
  constant references with `TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED`,
  because only the selected export is emitted into `scripts.bundle.js`.
  Deterministic helpers must be scoped inside the exported system or promoted
  through supported helper imports. Focused compiler coverage lives in
  `packages/compiler/src/scripts/sourceRefs.test.ts`.
- `P1` Core script context ergonomics now exist in SDK typings, web runtime
  context, and the Bevy QuickJS bridge for entity lookup, shallow resource
  state, clamped fixed delta, normalized one-axis input, and Transform facade
  read/write helpers. Focused compiler, web, and native tests prove
  helper-driven resource writes and Transform patches use existing diagnostics
  and effect validation paths; `pnpm verify:scripting-helpers-lifecycle`
  carries the focused release evidence.
- `P1` Script lifecycle authoring facade now lowers SDK
  `scriptLifecycle(...)` declarations and structured-source `scriptLifecycles`
  entries into existing portable schedules with source module/export refs.
  Unsupported `onEnter`/`onExit` script hooks remain rejected until they can
  lower to the promoted scene lifecycle contract. Current evidence is focused
  SDK lifecycle tests, structured-source compiler build/manifest proof, and
  `pnpm verify:scripting-helpers-lifecycle`.
- `P1` Optional racing domain helpers now live outside core scripting in
  `@threenative/racing-kit`. `Track2D` and `CheckpointRace` are pure,
  compiler-bundled helper imports, and the `examples/racing-kit-rally`
  structured-source proof uses local GLB assets plus stdlib/context/lifecycle
  helpers. Current evidence is racing-kit unit tests, compiler helper-bundle
  tests, CLI build, screenshot proof, web playtest movement, and the
  `pnpm verify:scripting-helpers-lifecycle` Bevy helper-bridge step.
- `P1` Hidden runtime changed-query diffing is promoted by
  `pnpm verify:runtime-query-diffing`, which compares web and Bevy component
  snapshot diffing for `changed: [...]` queries after command-buffer mutation
  and before deterministic ordering, offset, and limit windows.
- `P1` Portable UI, persistence, and settings script facades are promoted by
  `pnpm verify:ui-persistence-settings-facades`, which compares web and Bevy
  retained UI state reads/writes plus declared local-data save/settings
  behavior without exposing DOM, filesystem, cloud, or native widget handles.
- `P1` Runtime prefab instantiation and hierarchy commands are promoted by
  `pnpm verify:runtime-prefabs-hierarchy`, which compares bundle-local prefab
  expansion, deterministic instance prefixes, and `setParent`/`clearParent`
  hierarchy mutation across web and Bevy.
- `P1` Source-authored prefab catalogs now lower from
  `content/prefabs/*.prefab.json` into bundle `prefabs.ir.json` with manifest
  entries, so runtime prefab proofs can use compiler-emitted catalogs instead
  of hand-authored bundle roots.
- `P1` Standalone asset catalogs now lower supported SDK asset modules and
  structured `content/assets/*.assets.json` model/texture/audio/buffer entries
  into `assets.manifest.json`, so file-backed asset proofs do not need scene,
  environment, or audio references solely to appear in the runtime catalog.
- `P1` Production input/device UX. Keyboard, mouse, gamepad snapshots, touch
  hooks, rebinding, drag picking, and picking debug reports exist, but polished
  device repair overlays, platform touch stream wiring, and richer navigation
  diagnostics remain useful game-facing gaps.
- `P1` Runtime UI mutation and platform UI behavior. Bevy can spawn retained UI,
  widgets, images, rich text, actions, accessibility metadata, and debug reports;
  missing work is disabled-to-enabled updates, nested/axis-specific scrolling,
  virtual keyboard behavior, spatial navigation heuristics, focus narration, and
  native italic rich text.
- `P2` Native audio production depth is promoted by
  `pnpm verify:production-hardening` for bounded mixer/effect-chain reports,
  device routing diagnostics, internal-only native handle boundaries, and
  UI-triggered audio actions. Custom decoders and streaming/network audio remain
  diagnostic-only boundaries.
- `P2` Profiling and packaging hardening is promoted by
  `pnpm verify:production-hardening` for captured CPU profiler host state, GPU
  timer unavailable state, debug-render report evidence, domain repair hints,
  and signed/mobile package preflight without secrets. Actual signed installer
  generation still requires release credentials outside repo verification.
- `P2` Rendering/material/asset residuals are promoted by
  `pnpm verify:rendering-residuals` for runtime LOD selection reports, chunked
  terrain asset-group policy, bounded instancing policy, specular texture proof,
  extended material preset proof, manifest streaming diagnostics, and advanced
  renderer boundary diagnostics.
- `P2` Render look profile selection is partially promoted for `parity` and
  `balanced` source/config/runtime semantics. Web and Bevy both load the same
  `renderer.renderLook` profile, report requested/applied/fallback values, and
  keep `cinematic`/`stylized` reserved until screenshot proof exists. New
  maintained starters default to `balanced`; missing profiles remain `parity`
  for existing projects and conformance fixtures. `pnpm verify:render-look` is
  available as a focused threshold gate with captured web/Bevy screenshots and
  screenshot-derived web metrics. It is intentionally not in the release profile
  until the screenshot capture path is promoted for CI release runs.
- `P3` Advanced renderer and physics breadth. Custom shaders, bindless,
  volumetrics, SSR, deferred rendering, decals, auto exposure, DOF, motion blur,
  virtual geometry, full constraints, vehicles, ragdolls, soft bodies, arbitrary
  triangle narrow phase, and dynamic navmesh rebakes are valuable but less
  important than the runtime/save/hot-reload gaps above.

### GitHub Open-Game Usage Scan

This backlog is also informed by a lightweight scan of open-source Bevy games
and game templates on GitHub, focused on `Cargo.toml` dependencies and source
usage rather than Bevy engine examples. Sampled repos include
`fishfolk/jumpy`, `Dreamtowards/Ethertum`, `RaminKav/LostInTime`,
`opstic/gdclone`, `ShenMian/sokoban-rs`, `wesfly/bevy_fs`,
`NiiightmareXD/golab`, `traffloat/traffloat`, `aratama/magiaforge`,
`PraxTube/tsumi`, `cleder/brkrs`, `chriamue/flyconomy`,
`nilaysavant/keep-it-rolling-game`, and `jmbhughes/rustytowers`.

Repeated patterns in those games:

- ECS resources/events/states, explicit schedules, commands, timers, and
  state-gated systems are the common gameplay backbone.
- Real games frequently reach for physics plugins (`bevy_rapier`, Avian),
  action-map input (`leafwing-input-manager`), asset loading/state machines,
  audio plugins, inspector/debug UI, egui-style panels, save/config crates, and
  dev-time asset watching.
- Many open Bevy games are 2D-first, but ThreeNative is currently scoped as a
  3D-only engine. Treat sprites, tilemaps, LDtk/Tiled, and 2D-specific
  collisions as out of active scope unless the product boundary changes.
- Some games use networking (`lightyear`, `bevy_renet`, websockets), but this
  remains outside the portable contract for now. The priority is stable
  unsupported-networking diagnostics, not runtime networking parity.

### Upstream Bevy Example Catalog Watchlist

The current upstream Bevy examples catalog also exposes feature families that
were previously missing or too coarsely represented in this tracker. Some of
these rows may be beyond the pinned Bevy `=0.14.2` baseline, so they are tracked
as watchlist items until a PRD either verifies baseline relevance, promotes a
portable subset, or adds stable diagnostics. The watchlist covers editable text
and IME, UI viewport nodes, UI drag and drop, custom UI materials,
window/cursor/power behavior, runtime asset authoring/saving, generated asset
export, glTF extension processing, and deeper ECS query/callback ergonomics.
These rows are not implementation claims unless their checklist text names
evidence or diagnostics.

### Advanced Visual Polish Research Notes

This section expands the backlog for features that make authored games look
finished: richer light transport, camera/post-processing, material response,
asset LOD, animation feel, particles, and texture delivery. It is intentionally
source-of-truth neutral: Bevy `=0.14.2` shows what the native adapter could use,
but ThreeNative promotion still requires portable SDK/IR semantics, validation,
compiler lowering, web Three.js mapping, Bevy mapping, conformance evidence, and
clear unsupported-feature diagnostics.

Rows below are planning guidance, not implementation claims:

| Feature family | Bevy 0.14 signal | Game-polish value | ThreeNative promotion bar |
| -------------- | ---------------- | ----------------- | ------------------------- |
| HDR emissive bloom | Bevy's 3D bloom example uses HDR cameras, bloom settings, and emissive materials; ThreeNative already has runtime bloom config and emissive material metadata. | Pickups, magic, signage, vehicle lamps, warning lights, and diegetic UI read immediately instead of looking like flat colored meshes. | Keep as `P1`: prove threshold/intensity/exposure interactions with web and Bevy screenshots, preserve invalid metadata diagnostics, and avoid per-adapter color tuning. |
| Filmic look controls | Bevy 0.14 adds filmic color grading and existing tone mapping/exposure controls; ThreeNative render-look profiles already reserve `balanced`, `cinematic`, and `stylized`. | Cohesive mood, less washed-out lighting, better dusk/night/cave readability, and material response that feels authored. | Promote only bounded semantic controls first: tone map, exposure, saturation, contrast, bloom intensity, and shadow quality profile rows. `cinematic`/`stylized` stay reserved until web and Bevy screenshot proof exists. |
| Auto exposure | Bevy 0.14 exposes camera auto-exposure, but it is histogram-driven and platform-sensitive. | Useful for tunnels, caves, explosions, day/night transitions, and bright outdoor-to-indoor cuts. | Keep `P3` diagnostic-only. `TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED` now reports the web/Bevy target surface and the missing deterministic histogram, convergence, and mobile fallback evidence. |
| Depth of field | Bevy 0.14 has focal-distance/aperture depth-of-field examples; ThreeNative currently records a runtime-config/report boundary. | Hero-object focus, scale cues, menu scenes, and cinematic moments. | Keep report-only until visual blur calibration, mobile/performance budget, camera ownership rules, and unsupported-platform fallback evidence are captured. |
| Motion blur and motion vectors | Bevy 0.14 includes per-object motion blur and improved motion vectors/TAA for animated meshes. | Racing, projectiles, fast enemies, camera pans, and attacks feel smoother. | Keep diagnostic-only. Unsupported diagnostics now require shutter/sample semantics, motion-vector or authored approximation policy, and video/screenshot proof before promotion. |
| Screen-space reflections and deferred rendering | Bevy 0.14 SSR is deferred-only, has WebGL limitations, and is constrained to smooth surfaces. | Wet floors, water, glossy metal, mirrors, and polished interiors. | Do not expose Bevy SSR directly. `SSR`, mirrors, and deferred path remain stable diagnostics with material/reflection intent, forward fallback, target-profile policy, and web/native screenshot evidence as the promotion bar. |
| Volumetric fog and light shafts | Bevy 0.14 adds volumetric fog/light shafts with camera settings and directional shadowed light participation. | Forest shafts, caves, arenas, magic beams, underwater haze, and atmospheric screenshots. | Keep `P3` diagnostic-only unless a shared profile can define density/scattering, participating light kinds, shadow dependency, light-count limits, performance budgets, and web/Bevy screenshot proof. |
| Advanced PBR and glTF extensions | Bevy 0.14 release notes and glTF loader cover texture transforms, clearcoat, transmission, emissive strength, anisotropy, extras, and morph-related metadata. | Imported assets retain authored glass, varnish, brushed metal, trim sheets, emissive signage, and material identity. | Preserve/report supported metadata, promote only fields with web/Bevy visual or report parity, and diagnose unsupported extensions, shader transforms, and Bevy feature-flag gaps. |
| Morph targets | Bevy 0.14 loads morph target data and has a morph-target animation example. | Facial expressions, squash/stretch, damage states, shape variants, and expressive collectibles. | Promote as `P2` only with glTF morph-name extraction, validated weight targets, deterministic weight tracks, web/Bevy mapping, and visible silhouette proof. |
| Animation graph blending | Bevy 0.14 introduces `AnimationGraph`; ThreeNative already has constrained graph metadata and blending traces. | Idle/run/action transitions stop looking mechanical, especially for humanoid or vehicle rigs. | Keep the portable state-machine/blend-second contract; reject raw Bevy graph assets, arbitrary graph topology, IK, retargeting, and backend-only animation handles. |
| Particles and lightweight VFX | Bevy 0.14 has no general built-in 3D particle system, while ThreeNative promotes bounded deterministic rendered particles. | Dust, sparks, pickups, impacts, exhaust, splashes, and objective feedback. | Treat as a ThreeNative-owned portable effect: CPU-deterministic seed, max count/rate/lifetime caps, billboard or simple mesh representation, alpha material constraints, and web/Bevy visible-region proof. |
| Decals and surface marks | Bevy 0.14 has no broadly portable built-in decal API in the official example surface. | Tire marks, scorch marks, bullet hits, puddles, route arrows, and signage overlays. | Start, if promoted, with authored surface-aligned decal quads and material/depth policy. Projected/deferred decals remain `P3` diagnostics. |
| Billboard impostors and HLOD | Bevy 0.14 visibility ranges explicitly support distance-based replacement patterns, but not a complete portable billboard-facing contract. | Distant trees, crowds, signs, and VFX remain readable without dense geometry. | Add authored camera-facing quad impostor metadata, distance/fade thresholds, material constraints, and web/Bevy selection/facing proof before claiming support. |
| GPU instancing and dense props | Bevy 0.14 has renderer batching/GPU preprocessing and shader-instancing examples; ThreeNative has native instancing evidence for repeated content. | Grass, rocks, debris, crowds, city props, and repeated set dressing become affordable. | Promote repeated static model/material batching and bounded per-instance transform/color only with draw-grouping reports; arbitrary instance buffers and custom shader attributes remain diagnostics. |
| Texture compression and delivery | Bevy's image loader is feature-gated for formats such as WebP, JPEG, KTX2/DDS/Basis paths, and device compressed formats. The runtime currently enables only a subset. | Smaller downloads, faster load, HDR/environment-map feasibility, and mobile budget control. | Separate source acceptance from target/device support. Require target-profile diagnostics, fallback texture selection, and per-target evidence before enabling native compressed texture features. |

Practical order for game-polish work:

1. Promote and release-gate screenshot-backed `balanced` render look defaults
   across web and Bevy.
2. Add bounded polish presets for shadows, bloom, exposure, and material
   defaults before exposing high-end renderer internals.
3. Improve imported-asset fidelity through glTF material-extension reports,
   morph-target metadata, and animation blend proof.
4. Add dense-scene affordability through LOD, impostors, instancing reports, and
   texture target-profile diagnostics.
5. Keep SSR, volumetrics, auto exposure, motion blur, projected decals, custom
   post-processing, deferred rendering, bindless resources, and raw shader
   features diagnostic-only until portable semantics and visual evidence exist.

### 🧩 ECS, App, and Scheduling

- [x] Entities, stable IDs, components, and component schemas
- [x] ECS tags as queryable zero-field marker components
- [x] Scene `Group` containers as hierarchy-only `SceneContainer` entities
- [x] Parent/child hierarchy and local/global transform propagation
- [x] Resources and typed game events
- [x] Startup, fixed update, update, and post-update schedules
- [x] Deterministic system ordering and command-buffer spawn/despawn
- [x] State metadata and constrained lifecycle traces
- [x] Bevy-style computed states and substates
- [x] Observer/event propagation model
- [x] Component hooks and lifecycle hooks
- [x] Scene serialization/deserialization as an authoring feature
- [x] Named lifecycle scenes, stack/push/pop traces, and transition readiness
- [x] Structured source/CLI/editor mutation for scene lifecycle kind, activation, and initial-scene metadata
- [x] Scene-local input, system, and UI scope references with web/Bevy active-scope snapshots
- [x] Reflection/type registration surface for portable components
- [x] Async task/channel patterns
- [x] Plugin/plugin-group composition as a portable declaration
- [x] `P0` Full gameplay host semantics against live rendered Bevy entities
- [x] `P1` Broad dynamic reconciliation for spawned/despawned rendered entities
- [x] `P1` Resource/event cleanup and event-windowing semantics
- [x] `P1` Dynamic app-state lifecycle transitions and richer state handoff
- [x] `P1` Command-time/removal component hook callbacks
- [x] `P1` System-local persisted state
- [x] `P2` Stoppable observer propagation
- [x] `P2` Dynamic runtime plugin loading diagnostic boundary
- [x] `P2` Bounded async timers and channels; arbitrary workers/promises remain diagnostic-only
- [x] `P2` ECS callback components and callable system handles as a diagnostic-only boundary until named, permissioned declarations are promoted
- [x] `P2` Delayed command scheduling bounded to timer/channel-backed fixed-trace services; arbitrary deferred closures remain diagnostic-only
- [x] `P2` Query combination helpers and pairwise iteration semantics with deterministic ordering
- [x] `P2` Entity disabling/suspended ECS participation separate from renderer visibility with raw Bevy `Disabled` rejected
- [x] `D` Raw Bevy/renderer type IDs in portable gameplay APIs

### 📐 Transforms, Math, and Geometry

- [x] Translation, rotation, scale, and nested transforms
- [x] Basic 3D mesh primitives: box, sphere, plane, capsule, cylinder
  (renderable mesh primitive only; portable physics collider helpers remain
  box, sphere, capsule, and mesh, and raw cylinder colliders are rejected)
- [x] Source/editor primitive mesh declaration edits
- [x] Structured source and CLI torus primitive declarations for mesh rows and scene prefabs
- [x] Bounding/raycast-style queries for promoted physics traces
- [x] Full Bevy primitive catalog and extrusions
- [x] Custom mesh generation and custom vertex attributes
- [x] Structured source/CLI custom mesh declarations with binary bundle payloads
- [x] `P1` Portable procedural mesh authoring
  - [x] MeshBuilder API for generated static meshes
  - [x] Primitive composition helpers for organic props
  - [x] Compiler-only Three.js BufferGeometry import/snapshot
- [x] Mesh bounds, AABB/sphere intersection utilities, and sampling
- [x] Curves, splines, easing functions, and path sampling
- [x] `P1` Transform interpolation/smoothing helpers
- [x] `P2` Gizmo geometry as debug/editor-only output
- [x] `P2` Runtime mesh deformation diagnostic boundary
- [x] `P2` Chunked/streamed mesh terrain and world geometry policy
- [x] `P3` CSG and boolean mesh operations diagnostic boundary
- [x] `P3` Storage-buffer/shader-driven procedural geometry diagnostic boundary

### 🎥 Cameras and Views

- [x] Perspective camera and active camera selection
- [x] Orthographic projection metadata and conformance observation
- [x] Source-authored camera projection/frustum fields lower into promoted IR camera components
- [x] First-person camera/controller metadata
- [x] `P1` Multiple active cameras, camera ordering, and split-screen
- [x] `P1` Viewports, sub-views, and render layers
- [x] `P2` Render-to-texture and depth-only camera targets
- [x] Web/Bevy runtime allocation for declared color and write-only depth render targets
- [x] Source/CLI/editor render-target declarations lower into the asset manifest
- [x] `P3` Custom projections
- [x] `P1` Camera effects: screen shake, orbit, pan, zoom, and view models
- [x] `P1` Follow/orbit camera helpers converge on both runtimes: the web
  adapter now runs camera helpers on the post-processing composer path and
  persists helper poses into the world IR transform (matching Bevy's persistent
  transform semantics), proven by `tn playtest --follow` assertions in
  `examples/humanoid-physics-course`
- [x] `P2` Screenshot/export camera workflows
- [x] `P2` Residual camera diagnostics and editor/debug tooling

### 💡 Lights, Shadows, and Global Illumination

- [x] Ambient light
- [x] Directional light
- [x] Point light with range
- [x] Spot light with range and angle
- [x] Shadow metadata and shadow conformance observations
- [x] `P2` Report-only V8-12 shadow-policy and shadow-sensitive web/native screenshot trace
- [x] `P2` Dynamic light limits and light culling budget observations
- [x] `P2` Point-light PCF/shadow-filtering metadata parity
- [x] `P1` Shadow bias controls
- [x] `P1` Per-mesh shadow caster/receiver controls
- [x] `P3` Spherical/area-light behavior as a diagnostic-only boundary until
      web/Bevy light-shape semantics, fallbacks, and screenshot proof exist
      (V10-02)
- [x] `P3` Lightmaps and mixed baked/dynamic lighting as a diagnostic-only
      boundary until authoring, bake provenance, asset packaging, and runtime
      fallback semantics exist (V10-02)
- [x] `P2` Light probes and environment maps
  - [x] V9-04 SDK/IR/compiler/runtime conformance contract and evidence for
        bundle-local skybox, environment-map, and bounded light-probe declarations
- [x] `P2` Light/probe gizmo debug observations
- [x] `P2` Shadow quality profile backlog for small-game polish: map bounded
      low/medium/high profile rows to point-light PCF, directional cascade
      distance/count, map size, bias defaults, light budgets, and screenshot
      evidence before treating the profile as a visual parity claim

### 🎨 Materials, Textures, and Shaders

- [x] Standard material base color, metalness, roughness
- [x] Texture references and web/native material slot observations
- [x] Visibility flags on mesh renderers
- [x] Native texture image loading through Bevy `AssetServer` for promoted material slots
- [x] `P1` Authored alpha modes, opacity, alpha cutoff, and web/native material observations
- [x] `P1` Transparency sorting metadata, portable blend modes, and depth policy with web/native observations
- [x] `P1` Authored emissive material color/intensity and web/native material observations
- [x] `P1` HDR bloom contribution from emissive materials
- [x] `P1` Normal/occlusion texture refs plus authored specular, clearcoat, and transmission scalar factors
- [x] `P1` Clearcoat, clearcoat-roughness, and transmission texture maps
- [x] `P1` Specular texture maps
- [x] `P1` Structured source/CLI/editor mutation for promoted material PBR fields and texture slots
- [x] `P3` Parallax mapping and depth maps as a diagnostic-only boundary (V10-02)
- [x] `P3` Anisotropy, specular tint, and advanced PBR fields as a
      diagnostic-only boundary until scalar/texture/tangent requirements,
      glTF extension import policy, web mapping, Bevy feature flags, and
      visual proof are defined (V10-02)
- [x] `P1` Authored texture repeat/wrap/filter/UV transform controls in IR, web runtime mapping, native sampler/UV application, and conformance observations
- [x] `P1` WebP texture asset format support across SDK/IR validation, compiler emission, web runtime loading, and Bevy asset loading
- [x] `P2` Multiple generated-mesh UV channels
- [x] `P2` Generated-mesh vertex colors
- [x] `P2` Constrained extended material presets (`unlitMasked`, `foliage`)
- [x] `P2` Explicit portable shader promotion criteria and unsupported-feature diagnostics
- [x] `P2` Advanced blend parity diagnostics on Bevy beyond normal alpha/mask/blend policy
- [x] `P2` Native specular texture rendering proof
- [x] `P2` Broader extended-material catalog policy beyond current constrained presets
- [x] `P2` glTF advanced material extension policy backlog: preserve/report Bevy
      0.14-supported texture transform, clearcoat, transmission, emissive
      strength, extras, and anisotropy metadata, but promote only fields with
      web/Bevy report or screenshot parity and stable unsupported-extension
      diagnostics
- [x] `P3` Custom shaders, shader defs, storage buffers, and render phases diagnostic boundary (V10-02)
- [x] `P3` Bindless materials/textures diagnostic boundary (V10-02)

V8-13 keeps custom shaders, storage buffers, and raw render phases behind
stable advanced renderer diagnostics until portable promotion criteria and
web/Bevy evidence exist.

### 🌌 3D Rendering, Atmosphere, and Post-Processing

- [x] Basic 3D scene rendering through web Three.js and native Bevy
- [x] Installed CLI package carries the Bevy runtime source and can compile the
      native preview binary from a generated npm project
- [x] Fog, sky/horizon color, tone mapping, exposure, and color-space metadata
- [x] Dense-content budget estimates and repeated-instance observations
- [x] Source asset LOD metadata and fixed LOD-selection traces
- [x] `P1` Focused visual fog/sky parity evidence in native output
- [x] `P1` Focused unlit color swatch and lit PBR sphere parity evidence
- [x] `P1` Seven-scene web/Bevy baseline visual parity gate, including v1
      canonical no-ambient fill and crystal runner ambient calibration evidence
- [x] `P3` Atmospheric scattering and atmospheric fog through bounded atmosphere/fog profiles (V10-02, V10-03 calibration)
- [x] `P3` Volumetric fog and volumetric lighting diagnostic boundary until
      density/scattering profiles, participating light limits, shadow-map
      dependency, web fallback, and performance budgets are proven (V10-02,
      V10-03 calibration)
- [x] `P1` Skyboxes and cubemap/equirect texture handling
  - [x] V9-04 validates bundle-local cubemap/equirect texture refs, emits
        rendering capabilities, reports web/native skybox observations, and writes
        screenshot-level web/native/diff/contact-sheet evidence under
        `tools/verify/artifacts/rendering-lights/skybox-environment/`; compressed texture
        formats remain deferred
- [x] `P1` Bloom through runtime config in web and native camera runtime
- [x] `P1` MSAA anti-aliasing modes through runtime config in web and native
- [x] `P2` Render look profiles for `parity` and `balanced` source/runtime
      semantics with captured web screenshot metrics; release-profile
      promotion remains pending CI capture promotion
- [x] `P2` FXAA, TAA, and SMAA anti-aliasing modes
- [x] `P2` Color grading and filmic metadata observations
- [x] `P3` Auto exposure diagnostic boundary until deterministic histogram,
      adaptation-speed, EV-range, capture, and web fallback behavior exist
      (V10-02, V10-03 calibration)
- [x] `P2` Depth of field runtime-config/report boundary; visual blur
      calibration, camera ownership rules, mobile fallback, and performance
      budgets remain deferred
- [x] `P3` Motion blur and motion vectors diagnostic boundary until shutter,
      sample count, prepass, animated-mesh motion vectors, web fallback, and
      video/screenshot proof exist (V10-02, V10-03 calibration)
- [x] `P3` Screen-space reflections and mirrors diagnostic boundary; Bevy 0.14
      SSR is deferred-path and platform constrained, so portable promotion must
      define material/reflection intent and forward/web fallback first (V10-02,
      V10-03 calibration)
- [x] `P2` Decals diagnostic boundary; surface-aligned decal quads are the first
      portable candidate, while projected/deferred decals remain unsupported
      until shared renderer semantics exist (V10-02, V10-03 calibration)
- [x] `P3` Deferred rendering diagnostic boundary; portable source should express
      visual intent rather than selecting a Bevy render path directly (V10-02)
- [x] `P2` Visibility ranges/HLOD fade observations
- [x] `P1` Renderer-level native instancing and batching parity
- [x] `P1` Visual runtime LOD mesh swapping
- [x] `P2` Arbitrary user-authored instancing APIs as bounded report policy
- [x] `P2` Custom GPU instance attributes diagnostic boundary
- [x] `P2` Compressed skybox/environment texture format diagnostics
- [x] `P2` Billboard/impostor LOD metadata for camera-facing quad impostors with
      ordered distance/fade validation plus web/Bevy report evidence; visual
      screenshot calibration remains a later dense-scene polish gate
- [x] `P2` Texture delivery target-profile metadata for WebP/JPEG/PNG baseline
      fallback and optional KTX2/DDS/Basis/BC/ETC2/ASTC variants, with
      deterministic selected-path reports and unsupported-target diagnostics
- [x] `P3` Virtual geometry/meshlet rendering diagnostic boundary (V10-02, V10-03 calibration)
- [x] `P3` Custom post-processing passes diagnostic boundary (V10-02, V10-03 calibration)

V8-13 keeps volumetrics, atmospheric scattering/fog, deferred rendering,
SSR/GI/lightmaps, and custom post-processing behind stable advanced renderer
diagnostics until portable promotion criteria and web/Bevy evidence exist.

### 📦 Assets, glTF, and Scenes

- [x] Bundle-local glTF/GLB assets
- [x] glTF `.bin` and texture dependency bundling
- [x] Model scene instances in web and Bevy
- [x] Material/texture/mesh asset diagnostics and conformance observations
- [x] Source-authored stylized nature, ripple water, and sparkle component slice with SDK helpers, shared registry operations, web/Bevy runtime mapping, recursive glTF dependency waits for native proof capture, and aligned source-GLB grass placement/material policy
- [x] Typed animation clip metadata from model assets
- [x] `P1` Declared embedded asset manifest entries with bounded payload validation
- [x] `P1` Declared HTTPS network asset manifest entries with target-profile validation
- [x] `P3` Custom asset loaders and custom asset types diagnostic boundary (V10-04)
- [x] `P1` Deterministic multi-asset load synchronization trace
- [x] `P1` Declared asset groups and default `bundle.requiredAssets` manifest group
- [x] `P2` glTF extras and custom glTF vertex attributes
- [x] `P1` Query/update spawned glTF scene entities
- [x] `P2` glTF extension processing policy with promoted AnimationGraph metadata import and stable diagnostics for executable/custom transforms
- [x] `P2` Imported glTF visual-fidelity backlog: compiler/inspection metadata
      now preserves material extensions, texture transforms, material/node
      extras, and morph target names; `tn asset inspect` reports unsupported
      extension processors with stable diagnostics; web and Bevy conformance
      expose matching `gltfFidelity` report rows guarded by
      `pnpm verify:gltf-fidelity`.
- [x] `P1` Scene viewer/editor inspection workflow
- [x] `P1` CLI glTF/GLB asset inspection for bounds, dependency checks, and scale calibration (`tn asset inspect`)
- [x] `P1` Modular track proof reports connector continuity, actor-on-road placement, and actor footprint versus material-derived lane width (`tn scene proof-modular-track`)
- [x] `P1` Packaged CLI asset source catalog for reviewed direct GLB records and typed pack/material/texture/HDRI fallback records (`tn asset source search/get/suggest/export`)
- [x] `P1` CLI one-model proof reports with scale presets, screen occupancy verdicts, isolated-proof caveats, and screenshot captured/unavailable states (`tn model-test`)
- [x] `P1` Dev-time asset file watching and explicit reload diagnostics
- [x] `P2` Asset hot reload and state-preserving reload behavior
- [x] `P1` Broader live asset streaming through manifest asset-group policy
- [x] `P2` Runtime asset saving/export with subasset manifest policy as an artifact-root diagnostic boundary
- [x] `P2` Generated runtime assets that can be persisted or reloaded as schema-backed bundle artifacts
- [x] `P2` Arbitrary runtime file/network asset access from portable scripts diagnostic boundary
- [x] `P2` Custom shader consumption of glTF custom attributes diagnostic boundary

### 🎞️ Animation and Particles

- [x] Animation clip metadata and validated clip refs
- [x] `animation.play` service-call trace
- [x] Constrained animation graph metadata
- [x] Animation event-marker metadata and fixed event traces
- [x] Bounded particle-emitter metadata and deterministic spawn traces
- [x] Runtime animation playback binding and time advancement for model renderers in web and Bevy
- [x] `P0` Visual skeletal animation deformation from loaded glTF clips
- [x] `P1` Transform animation authored in code/IR
- [x] `P1` `animation.query` / `animation.stop` declared command-shape/service-payload parity
- [x] `P1` Animation blending beyond fixed graph traces
- [x] `P2` Animation masks: portable skeleton target addressing, per-joint mask
      validation against loaded glTF nodes, web/Bevy blend behavior, and
      residual visual evidence are promoted for the bounded subset.
- [x] `P1` Stateful animation stop/state query runtime semantics
- [x] `P2` Morph-target animation: extracted glTF morph names, authored weight
      target validation, deterministic weight tracks, web/Bevy mapping, and
      visible residual evidence are promoted for the bounded subset.
- [x] `P3` Retargeting and inverse kinematics diagnostic boundary (V10-02)
- [x] `P2` UI/property animation
- [x] `P2` Arbitrary blend trees beyond bounded crossfade/graph traces as a
      diagnostic boundary; raw Bevy `AnimationGraph` assets, arbitrary graph
      topology, IK, retargeting, and backend animation handles remain outside
      the portable source contract
- [x] `P1` Script-triggered lightweight VFX through a ThreeNative-owned bounded
      command contract: `particles.start`, `particles.stop`, `particles.burst`,
      and `particles.reset` run only over declared emitters with deterministic
      seed/count/status observations, max count/rate/lifetime caps, simple mesh
      or billboard representation, alpha material constraints, and web/Bevy
      visible-region proof. This is not Bevy-native particle-system parity and
      does not expose backend particle handles.

### 🧱 Physics, Collision, and Character Movement

- [x] Fixed-timestep movement contract
- [x] Box, sphere, and capsule colliders
- [x] Rigid-body metadata
- [x] Primitive solver v2 contract metadata for bounded primitive multi-body
      declarations, including mass, inverse mass, velocity, angular velocity,
      sleep threshold, and solver iteration policy
- [x] Primitive rigid-body solver trace for gravityScale, damping, restitution,
      friction, and a falling dynamic box against a static floor
- [x] Trigger/contact event phases for fixed traces
- [x] Collision layer/mask metadata
- [x] Raycast-style grounding trace
- [x] Overlap and shape-cast service traces
- [x] Narrow character controller movement and blocking trace
- [x] `P1` Full rigid-body solver parity beyond the current primitive
      falling-box trace
- [x] `P2` Dynamic mesh colliders
  - [x] Bounded static/dynamic mesh collider AABB metadata for racing-style
        track and chassis traces
  - [x] Swept-AABB CCD metadata and deterministic high-speed track contact trace
  - [x] Portable rigid-body translation and rotation axis locks
  - [x] Portable hinge, slider, and suspension joint metadata observations
- [x] `P1` Broad sensors beyond current trigger/overlap scope
- [x] Step offsets, ledge ungrounding, moving-platform carry, and richer ground contact trace
- [x] `P0` Slope limits and sloped-surface walkability for promoted ramp colliders
- [x] `P1` Character interaction volumes and object pushing
- [x] Fixture-backed physics self-verification gate for gravity/collision,
      material response, mass/stacking, character obstacles, query services,
      bounded mesh CCD, joint metadata, and unsupported-boundary diagnostics;
      current aggregate conclusion is `PASS` with real Bevy traces, web/native
      trace diffs, selected P1 trace-diagram contact sheets, promoted physics
      gates, and conformance covered by `pnpm verify:physics-self-verification`;
      runtime camera screenshots and videos are not emitted by this gate
- [x] Portable collider local centers for aligning physics shapes to imported
      model origins across web and Bevy Rapier paths
- [x] `P1` Navmesh/pathfinding behavior
- [x] `P1` External physics backend integration strategy
- [x] `P1` Arbitrary sloped mesh terrain for character grounding
- [x] `P1` Full constraint solving beyond hinge/slider/suspension metadata as a deferred diagnostic boundary
- [x] `P2` Arbitrary triangle narrow phase for mesh colliders as a bounded-mesh-collider diagnostic boundary
- [x] `P2` Dynamic navmesh rebakes
- [x] `P2` Crowd steering and off-mesh links
- [x] `P2` Vehicle drivetrain and tire/friction models as deferred residuals
- [x] `P3` Soft bodies and ragdolls as deferred residuals
- [x] `D` Public backend physics/navmesh handles in portable APIs

### 🎮 Input, Picking, and Controls

- [x] Keyboard/mouse-style input references for promoted systems
- [x] Pointer-lock expectation metadata
- [x] UI action queue metadata
- [x] Fixed first-person movement trace
- [x] Native keyboard, mouse-button, and pointer-axis input capture for Bevy preview/runtime systems
- [x] `P1` Optional gamepad button/axis state in web and Bevy runtime input snapshots
- [x] `P1` Touch control/axis state hooks in web and Bevy runtime input snapshots
- [x] `P1` Gamepad viewer-style diagnostics and device capability reporting
- [x] `P1` Basic touch gesture recognition for tap, swipe, and pinch
- [x] `P1` Mesh picking service for generated mesh renderer bounds in web and Bevy scripts
- [x] `P1` Mouse/screen pointer ray generation for picking workflows
- [x] `P1` Basic UI picking/action dispatch for web and Bevy buttons/touch controls
- [x] `P1` Structured source/CLI/editor mutation for input actions and keyboard axes
- [x] `P2` Drag-and-drop picking events
- [x] `P2` Picking debug overlay
- [x] `P1` Basic input rebinding helpers and device capability diagnostics
- [x] `P1` Controls settings rebind metadata and local input override persistence
- [x] `P1` Platform touch event stream wiring beyond deterministic hooks
- [x] `P1` Full visual settings-screen UX polish
- [x] `P2` Richer touch/gamepad gestures beyond tap, swipe, and pinch as a diagnostic-only boundary
- [x] `P2` Richer device diagnostics overlays and repair hints (V10-04)
- [x] `P2` Richer navigation diagnostics for input/UI flows

### 🧭 UI, Text, and Accessibility

- [x] Retained UI IR and validation
- [x] Web DOM overlay and Bevy UI entity spawning
- [x] Text, resource-bound bars, and focusable buttons
- [x] Focus order, navigation links, input action refs, and safe-area metadata
- [x] Fixed web/native focus and activation trace
- [x] `P0` Explicit flex layout metadata for direction, alignment, justification, gaps, padding, size, and grow
- [x] `P2` Basic CSS grid-style layout for repeat-count rows/columns and auto-flow
- [x] `P1` UI overflow clipping and z-index layering
- [x] `P1` UI absolute anchors and inset positioning
- [x] `P1` Native Bevy overlay UI camera renders retained UI above multi-camera/viewport scenes
- [x] `P1` Native Bevy `Minimap` UI nodes render static paths and live resource-bound markers
- [x] `P1` UI min/max size constraints
- [x] `P1` Basic vertical UI scrolling containers
- [x] `P1` UI background/text color, borders, rounded corners, and opacity
- [x] `P1` Portable UI shadow/linear-gradient metadata and web DOM rendering
- [x] `P1` Native-rendered UI shadows and gradients
- [x] `P1` Build-time UI theme tokens and token refs lower to concrete retained layout/style/image fields before web or Bevy runtime mapping
- [x] `P1` Source-level reusable UI component instances expand to ordinary retained UI nodes with deterministic IDs and generated-node provenance before runtime mapping
- [x] `P1` UI screen stack, modal/dialog roles, focus scopes, restore policy, and input-capture metadata validate in IR with deterministic web focus-restoration and Bevy modal input-capture dispatch trace proof
- [x] `P1` Bounded game UI recipes generate ordinary editable source nodes, bindings, screens, focus order, and provenance with required screenshot/accessibility proof artifacts
- [x] `P1` Responsive target-class UI recipe metadata, bounded virtual range metadata for large retained lists, deterministic web/Bevy visible-range traces, and desktop/mobile UI-fit artifact checks
- [x] `P1` Common UI affordance metadata for input glyph prompts, tooltips, localization fallback/cases, progress/cooldown presentation, toast queues, and logical feedback hooks with web/native observation traces
- [x] `P1` Bounded retained UI effect presets for glow, outline, pulse, tint, and focus rings with renderer escape-hatch diagnostics, advanced UI fixture states, and web/native strategy traces
- [x] `P1` World-attached retained UI for nameplates, health bars, interact prompts, pickup labels, quest markers, and off-screen indicators with web/Bevy projection traces and asserted visual parity reports
- [x] `P1` Basic UI text size, alignment, and wrapping
- [x] `P1` Portable UI text weight/decoration metadata and web DOM rendering
- [x] `P1` Rich text styling: font assets, inline spans, and native-rendered weight/decoration
- [x] `P1` Basic UI image nodes
- [x] `P1` UI texture atlases, 9-slice scaling, flipping, and tiling
- [x] `P2` Standard widgets: sliders, scrollbars, and context menus
- [x] Structured source/CLI/editor mutation for retained UI node type, label, and promoted style fields
- [x] `P1` Editable text input widgets with deterministic value/action events
- [x] `P1` IME composition diagnostics for unsupported text input targets
- [x] `P1` Platform virtual keyboard behavior as a diagnostic boundary (V10-04)
- [x] `P1` Basic automatic tab/sequential directional navigation parity
- [x] `P2` UI transforms and render-to-texture/3D-world UI as diagnostic boundaries (V10-04)
- [x] `P2` UI viewport nodes with picking/input routing as a diagnostic-only boundary
- [x] `P1` Basic UI accessibility roles, labels, and missing-label diagnostics
- [x] `P1` Broader screen-reader diagnostics for focusable names, progressbar names, and list/listitem structure
- [x] `P1` Static disabled UI metadata for focus/action suppression and ARIA/AccessKit state
- [x] `P2` UI debug overlay/gizmos
- [x] `P1` Runtime disabled-to-enabled UI updates
- [x] `P1` Nested and axis-specific scroll behavior
- [x] `P1` Spatial navigation heuristics
- [x] `P1` Focus narration
- [x] `P2` Native-rendered italic rich text as a diagnostic-only boundary until native font-style rendering is promoted
- [x] `P2` Letter spacing, generic/system font families, and OpenType font variation policy as a diagnostic-only boundary
- [x] `P2` Arbitrary grid placement, named areas, and dense packing as a diagnostic-only boundary
- [x] `P2` UI drag-and-drop node interactions distinct from world picking drag events as a diagnostic-only boundary
- [x] `P2` Custom UI material/shader declarations as diagnostic-only until bounded presets exist
- [x] `P2` Broad gamepad/touch UI coverage through focused interaction fixture evidence
- [x] `P2` Broad manually inspected desktop webview packaging artifact

### 🪟 Window and Platform Runtime

- [x] Source-backed window title, resolution, and runtime configuration metadata
- [x] Source-backed target profile documents for targets, budgets, and performance JSON
- [x] Target-profile diagnostics for web, offline/native, and package outputs
- [x] `P1` Window resize and scale-factor change observations in web and native runtimes
- [x] `P2` Custom cursor image and cursor animation policy as a diagnostic-only boundary
- [x] `P2` Low-power/present-mode and background throttling runtime policy as a diagnostic-only boundary
- [x] `P2` Clear-color/window background updates as a diagnostic-only boundary
- [x] `P2` Multi-window and per-window target diagnostics while portable runtime remains single-window

### 💾 Persistence, Settings, and Local Data

- [x] `P1` Portable save slots for declared resources/components
- [x] `P1` Local settings/key-value persistence for controls, audio, video, and accessibility options
- [x] `P2` Save migration/version metadata and diagnostics
- [x] `P2` Checkpoint/autosave lifecycle hooks
- [x] `P0` Durable Bevy save/settings backend for declared resources/components
- [x] `P1` Runtime autosave/checkpoint execution and restore flow
- [x] `P3` Cloud save and account-bound storage integration as a deferred boundary (V10-04)

### 🔊 Audio

- [x] Local OGG/WAV asset validation
- [x] Web HTML-audio sink and Bevy autoplay loop spawning
- [x] Portable volume and deterministic audio command observations
- [x] Bus, listener, and spatial-emitter metadata
- [x] Fixed loop start/stop lifecycle traces
- [x] Playback-id controls for pause, resume, seek, stop, and query traces
- [x] `P1` Real 3D spatial attenuation and listener movement
- [x] `P1` Mixer buses, ducking, and routing observations
- [x] `P2` Pitch control and generated tone playback metadata
- [x] `P1` Soundtrack/state-driven music transitions
- [x] `P1` Live mixer/effect-chain behavior
- [x] `P2` Platform audio device routing diagnostics
- [x] `P2` Platform-native audio handles as internal-only diagnostics
- [x] `P2` Richer UI/audio service integration
- [x] `P3` Custom audio source/decoder support as a diagnostic boundary (V10-04)
- [x] `P3` Streaming and network audio as a diagnostic boundary (V10-04)
- [x] `P2` Platform-specific audio diagnostics

### 🧪 Diagnostics, Tooling, Packaging, and Performance

- [x] Stable IR/compiler/CLI/native diagnostic shapes
- [x] JSON severity, suggestions, paths, and metadata preservation
- [x] Web runtime advisory diagnostics for partial `Transform` patches that merge omitted rotation/scale fields
- [x] IR distribution capability manifest and diagnostics catalog metadata
- [x] AI-consumable packed artifacts and clean-consumer metadata access are release-gated
- [x] Agent game planning worksheet scaffold and catalog-first starter instructions are release-gated through template-production and distribution proof
- [x] Conformance reports for web and Bevy observations
- [x] Release verification gates and artifact presence checks
- [x] Desktop package manifest and runtime args for V7 packaging
- [x] Fixed metric reports for frame/load/draw/entity/package-size budgets
- [x] Target-profile schema, version, fixture, and native-loader drift gates
- [x] `P2` Live profiler captures and native platform profiler evidence
- [x] `P2` GPU profiling and render-pass timing breakdowns
- [x] `P1` In-app FPS overlay and custom diagnostics
- [x] `P3` Signed installers and app-store/mobile packaging preflight (V10-04)
- [x] `P1` Broader platform target profiles and repair hints
- [x] `P1` Large-scene stress-test fixtures for UI, text, lights, cubes, and animated models
- [x] `P1` Stable unsupported-feature diagnostics for advanced renderer, material, and runtime declarations
- [x] `P1` Stable unsupported-networking diagnostics for multiplayer/websocket/replication declarations
- [x] `P1` Better domain-specific asset/runtime failure codes and repair hints
- [x] `P1` `tn doctor --url` preview-readiness diagnostics for canvas, runtime errors, resource failures, visible meshes, page errors, and failed requests
- [x] `P1` Web preview runtime diagnostics for scene visibility, rendered-entity bounds, clipping state, material/texture state, and optional human debug overlay
- [x] `P2` Live engine-integrated debug rendering beyond current overlay/report helpers

### 🛠️ Editor, Debugging, and Developer Tools

- [x] Local editor project snapshot validation
- [x] Editor document classification for source, generated, runtime, and derived snapshots
- [x] Structured editor source patch validation over durable source documents
- [x] Shared authoring operation registry for CLI/MCP/editor mutation adapters
- [x] TypeScript authoring-client transaction and fluent scene facade over the shared operation registry, preserving structured source as the editable truth
- [x] Project-local TypeScript generator runner with authoring-client facade execution, last-run provenance, input/output hashes, and manual-output conflict diagnostics
- [x] Registry-backed authoring recipes and `tn recipe` command for common source-persistable game-object plans
- [x] Registry-backed CLI source mutation for asset catalogs and audio sound documents
- [x] Registry-backed CLI/editor source mutation for project metadata documents
- [x] Registry-backed CLI/editor source mutation for reusable resources documents
- [x] Registry-backed CLI/editor source mutation for system schedules after creation
- [x] Registry-backed CLI/source mutation and compiler lowering for reusable component/resource schema documents
- [x] Registry-backed CLI/source mutation and compiler lowering for input controls-settings and persisted binding override metadata
- [x] Typed CLI/source operations for common ECS components (`camera`, `light`, `mesh-renderer`, `render-layers`, `visibility`, `rigid-body`, `collider`, `character-controller`), including camera projection/frustum fields
- [x] Source-level camera framing proof with `tn scene set-camera-look-at` and `tn scene proof-camera`, reporting target visibility, projected occupancy, roll, clipping range, and world bounds before web/Bevy screenshot proof
- [x] Discoverable `tn physics add-rigid-body`, `tn physics add-collider`, and `tn nav add-agent` CLI aliases over promoted source components
- [x] CLI/source operations for promoted model animation clips, graph states, and bounded particle emitters
- [x] One-way generator provenance source documents plus `generator.record` / `tn generator record`
- [x] Editor workbench source inventory and structured operation dispatch
- [x] Live preview edit classification with provenance-backed source mapping
- [x] Deterministic structured bundle-relative JSON diffs
- [x] CLI entry points for `tn editor snapshot`, `tn editor apply`, and `tn editor diff`
- [x] `P1` Visual editor UI and inspector panels
- [x] Source-schema-backed inspector field mapping and Add Component compatibility/default metadata
- [x] Explicit `featureStatus` metadata for visible modal/Add Component actions, with tests that enabled actions have handlers/operations and unavailable actions have reasons
- [x] Add Component MeshRenderer, RenderLayers, Visibility, RigidBody, Collider, and CharacterController source-operation mappings with typed inspector rows
- [x] Add Object source-backed Primitive/Empty/Camera/Light modal operations
- [x] Add Object Terrain source operations update flat environment terrain/walkability and create a visible scene terrain entity
- [x] Focused editor required-operations smoke that creates a scene, adds a primitive/entity, moves it, attaches a component and script reference, rebuilds, and checks emitted `world.ir.json`
- [x] Focused editor required-operations smoke covers editor-authored RigidBody and Collider source plus emitted `world.ir.json` proof
- [x] Focused animation/physics residual gate emits web/native runtime evidence for promoted physics residual behavior
- [x] Script references remain module/export inspector fields backed by `system.attach_script`; inline script body editing stays in the separate code-mode workflow
- [x] Delete, Settings, hierarchy nesting, and playback controls are source-backed or explicitly disabled/view-only with stable user-visible reasons
- [x] Editor/CLI Light kind, intensity, color, range, angle, shadow bias, and shadow normal bias rows persist through `scene.set_light`
- [x] Editor custom component JSON payload rows persist through `scene.set_component`
- [x] Environment source document classification plus CLI/editor skybox, environment-map, terrain, path, walkability, light-probe, and source-asset LOD mutation rows
- [x] Editor prefab primitive/color/asset, asset catalog type/path, scene resource path/value, and environment path/walkability/light-probe/source-asset LOD rows persist through registry-backed source operations
- [x] Editor build-preview evidence for source scene, GLB assets, environment terrain/path/walkability, and asset manifest artifacts
- [x] Save/load round trips through structured SDK/ECS/IR data
- [x] `P1` Scene hierarchy inspector and property editing
- [x] `P2` Gizmo overlays for transforms, lights, bounds, cameras, and UI nodes
- [x] `P1` Gamepad, scene viewer, and asset preview tools
- [x] `P2` Connected-device gamepad inspection
- [x] `P2` Hot reload with state policy
- [x] Dev preview freshness metadata and stale-watch diagnostics for the CLI web preview loop (`tn dev --target web`)
- [x] `P1` Debug draw APIs for gameplay systems
- [x] `P1` Live runtime scene mutation
- [x] `P2` Full native desktop visual editor shell as an explicit deferred boundary; current editor support is browser/CLI plus package inspection

### 🚧 Intentionally Deferred or Non-Portable

- [x] `D` Direct Bevy authoring from user TypeScript (V10-01 boundary)
- [x] `D` Raw Three.js authoring as the source of truth (V10-01 boundary)
- [x] `D` Public plugin escape hatches into renderer/runtime internals (runtime gameplay host boundary)
- [x] `D` Online services, networking, replication, and collaboration (V10-01 boundary)
- [x] `D` 2D sprite, tilemap, LDtk/Tiled, and 2D-specific collision workflows while ThreeNative is scoped as 3D-only (V10-01 boundary)
- [x] `D` Arbitrary npm, filesystem, worker, timer, or platform APIs in portable scripts (runtime gameplay host and persistence boundary)
- [x] `D` Backend-only features that cannot be represented in portable IR (V10-01 boundary)

## Sources

| Source                       | Link                                     |
| ---------------------------- | ---------------------------------------- |
| Bevy feature overview        | https://bevy.org/                        |
| Bevy examples catalog        | https://bevy.org/examples/               |
| Bevy 0.14 release notes      | https://bevy.org/news/bevy-0-14/         |
| Bevy crate documentation     | https://docs.rs/bevy                     |
| Open Bevy game: Jumpy        | https://github.com/fishfolk/jumpy        |
| Open Bevy game: Ethertum     | https://github.com/Dreamtowards/Ethertum |
| Open Bevy game: Lost In Time | https://github.com/RaminKav/LostInTime   |
| Open Bevy game: gdclone      | https://github.com/opstic/gdclone        |
| Open Bevy game: sokoban-rs   | https://github.com/ShenMian/sokoban-rs   |
| Open Bevy game: Golab        | https://github.com/NiiightmareXD/golab   |
| Open Bevy game: Tsumi        | https://github.com/PraxTube/tsumi        |
| Open Bevy game: Flyconomy    | https://github.com/chriamue/flyconomy    |

# ThreeNative Status

This file is the current implementation front door. Read it before the
conceptual docs when deciding what is supported, partial, or future-facing.

## Product Goal

ThreeNative aims to reach practical game-engine feature parity between Bevy and
the Three.js-based game engine SDK/runtime we are building. Bevy is the
reference for common game-engine capabilities; Three.js is the web rendering
runtime those capabilities run on. Features should be promoted only when the
portable SDK/IR contract works across the web Three.js runtime and the native
Bevy runtime where support is claimed.

## Current Active Gate

V7: deep engine gap-closure, functional scene/template, packaging, performance,
conformance, docs, diagnostics, and native evidence gate.

Current release command:

```bash
pnpm verify:v7
```

`verify:v7` runs the V7 docs gate, docs/gate tests, selected TypeScript tests,
the maintained V7 functional scene/template proof, rendered web evidence,
shared conformance, Bevy native test evidence, desktop packaging checks,
performance budget reports, and release-artifact presence checks. It writes the
V7 aggregate report under `artifacts/v7/verification-report.json`.

## V4 Proves

V4 is complete for the primitive native scripting proof. It proves one
constrained TypeScript system bundle running as the same `scripts.bundle.js` in
web JavaScript and embedded QuickJS, with equivalent patch, event, command, and
service-call logs for a primitive demo under `pnpm verify:v4`.

Current implemented V4 slice:

- `systems.ir.json` carries V4 stage, query, read/write, event, command, and
  service metadata for portable systems.
- `scripts.bundle.js` is emitted only when systems exist, includes stable
  system ID metadata, and can serialize declared component/event handles used by
  portable system functions.
- portable script diagnostics reject unsupported DOM, Node, timer, worker,
  arbitrary runtime import, undeclared write, command, event, and service
  usage before runtime.
- compiler tests run an ESM loadability probe for the emitted script bundle,
  and Bevy focused tests load the same bundle through QuickJS.
- the web runtime executes portable systems through cloned query snapshots,
  validates effects before applying them, and writes canonical web effect logs
  through `tn verify`.
- the Bevy runtime embeds `quickjs-rusty`/QuickJS-ng, loads
  `scripts.bundle.js`, calls declared system exports with portable context
  snapshots, validates effects against `systems.ir.json`, applies declared
  transform/custom-component patches, syncs scripted transform updates into
  the live Bevy preview each frame, and emits the same canonical effect-log
  shape as the web runner.
- web and Bevy expose deterministic V4 service facades for time, input, events,
  commands, `physics.raycast`, and `animation.play`, including permission
  checks and canonical service-call log entries.
- `pnpm verify:v4` compares web and native QuickJS patch/event/command/service
  effect logs with stable numeric normalization and writes
  `artifacts/v4/web-effects.json`, `native-effects.json`, and
  `effects-diff.json`.
- `examples/v4-scripting` builds a primitive scripted scene covering rotation,
  movement, spawn/despawn, event handoff, `physics.raycast`, and
  `animation.play`; it passes web visual verification with expected motion,
  writes a web patch/event/command/service effect-log artifact, and captures a
  native Bevy frame artifact at `artifacts/v4/native-bevy-frame-01.png`.
- `templates/v4-scripting` scaffolds the same primitive demo as a CLI template
  through `tn create --template v4-scripting`.

## V4 Does Not Prove

- arbitrary npm dependencies inside portable scripts
- public Lua or Luau authoring
- async systems or state-preserving hot reload
- full physics, animation graphs, UI runtime parity, or editor tooling
- direct Three.js, Bevy, renderer, DOM, filesystem, network, or platform access
- full dynamic native spawn/despawn reconciliation, runtime hot reload, or
  browser/native visual equivalence beyond the current primitive frame artifact

## Next Roadmap Scope

V5 is planned as a refactoring, test-harness, Rust/Bevy coverage, 3D visual
quality, and game-authoring ergonomics milestone. It should strengthen existing
V1-V4 contracts before adding large new product surfaces, while requiring a
game-first SDK/template layer and allowing selected advanced 3D
rendering/content work when the feature has SDK, IR, validation, web runtime,
Bevy runtime, conformance, and release-gate coverage.

The V5 ticket slice is tracked in [V5 PRDs](PRDs/v5/README.md). Those tickets
define planned work; they do not mark promoted V5 features as implemented until
the corresponding contract, runtime, Rust test, conformance, scene, and release
gate evidence lands.

V5-01 has landed the first hardening slice: generated manifests now derive
`requiredCapabilities` from emitted world, material, asset, systems, UI, input,
audio, physics, and environment IR, and the shared conformance catalog includes
`v5-drift-surface` for known V5 drift contracts. This is fixture and manifest
evidence, not a claim that every listed capability has full web/native runtime
parity.

V5-02 has landed the conformance-report and native-observation slice:
web and Bevy conformance reports now expose stable asset, material, texture
slot, visibility, mesh-renderer, runtime camera projection, environment-ID,
diagnostic, and entity observations, while report mismatches carry
JSON-path-like locations plus bundle/artifact paths. The Bevy runtime also provides a headless
`threenative_conformance` command, and `pnpm verify:conformance` writes an
inspectable native summary at `artifacts/conformance/basic-scene/bevy.report.json`.
The shared `basic-scene` fixture now also proves capsule and cylinder generated
mesh assets and mesh-renderer entities across web and Bevy conformance reports.

V5-03 has landed the diagnostic-shape normalization slice: IR diagnostics now
carry optional severity and concrete suggestions for high-volume bundle
failures, compiler validation preserves upstream `TN_IR_*` codes instead of
rewriting them, CLI JSON errors include normalized severity, Bevy map errors
expose stable native code/path/suggestion accessors, and `check:docs:v5`
verifies V5 diagnostic-range documentation.

V5-04 has landed the fixture-builder and harness-refactor slice: focused IR
validation tests share package-local minimal bundle builders, compiler
validation tests use a package-local fixture copy helper, and Bevy conformance
tests load shared conformance fixtures by name with fixture/path-aware failure
messages. This is harness cleanup and does not change runtime behavior.

V5-05 has landed the native runtime regression-coverage slice: Rust tests now
pin loader read-error paths, Bevy mesh/material diagnostic shapes, native
renderer mapping for lights/cameras/visibility/transforms/material scalar
fields, environment observation and instance placement summaries, and V4
scripting effect behavior for transform/custom-component patches plus
event/command/service log shapes. This is regression evidence for existing
V3/V4 contracts, not a new rendering feature promotion by itself.

V5-06 has landed the textured standard-material parity slice: supported material
texture slots now serialize through SDK/compiler output, validate against
texture assets and target formats, appear in shared conformance fixtures and
observations, map to Three.js material texture slots, and map to Bevy
`StandardMaterial` image handles for native regression coverage. The
`examples/v5-functional` scene seed builds, validates, and visually verifies
with bundle-local textured environment assets.

V5-07 has landed the lighting, atmosphere, shadow, and color parity-evidence
slice: shared fixtures now cover visible/hidden meshes plus ranged point and
spot lights, SDK/compiler output preserves point-light range and spot-light
range/angle, web and Bevy map those fields with runtime-normalized conformance
observations, and atmosphere observations expose promoted fog, sky, color
management, and shadow fields. Native fog/sky/color rendering remains
target-drift rather than full visual parity, but the promoted fields are now
validated, observable, and exercised by `examples/v5-functional`. The
`v5-drift-surface` fixture now also reports web and Bevy runtime orthographic
camera projection observations for the active camera.

V5-08 has landed the dense content, LOD metadata, and budget-evidence slice:
environment source assets now carry validated bounded LOD metadata, compiler
emission copies LOD target models without treating them as extra source assets,
web performance reports expose source asset, instance, group, draw, triangle,
texture, texture-byte, and bundle-byte estimates, and Bevy observations
distinguish repeated model-backed groups from placeholders. The
`examples/v5-functional` scene now exercises repeated grass scatter, source
asset LOD metadata, and environment-asset budget reports.

V5-09 has landed the maintained visual-quality scene gate:
`examples/v5-functional` is now the V5 functional scene for promoted visual
contracts, and `pnpm verify:v5` builds, validates, visually verifies it in web,
writes dense-content budget evidence under `artifacts/v5`, and records artifact
links in `artifacts/v5/verification-report.json`. This is the current V5 visual
scene gate, not the final aggregate release gate planned for V5-10.

V5-11 has landed the game-authoring ergonomics slice: `defineGame`,
`defineControls`, `definePrefab`, `primitiveActorPrefab`, and
`modelActorPrefab` are exported from `@threenative/sdk` as authoring sugar over
existing bundle root, scene, world, input, mesh, ECS component, and model asset
metadata shapes. `tn create --template v5-game-starter` scaffolds a small
playable scene/world/input/system starter that uses those helpers, and
`pnpm verify:v5` creates, builds, and validates that starter under
`artifacts/v5/starter-smoke`. This does not add a new runtime contract, editor
workflow, networking, raw Three.js compatibility, plugin API, custom renderer
support, or runtime model loading.

V5-10 has landed the aggregate V5 release gate: `pnpm verify:v5` now produces a
schema/versioned machine-readable report with ordered steps, diagnostics,
startedAt/durationMs, first-failing-step diagnostics, conformance artifacts,
Rust native test evidence at `artifacts/v5/rust-test-report.json`, visual scene
artifacts, dense-content budget evidence, and game-authoring ergonomics starter
smoke artifacts. V5 is complete for the documented scope of hardening,
conformance, native tests, visual scene proof, diagnostics, and SDK/template
ergonomics.

V5 should add or improve Rust tests for native runtime behavior whenever work
touches shared IR, native runtime mapping, native scripting behavior, Bevy
diagnostics, or visual-quality features that claim native support. The expected
verification loop for those changes includes focused `cargo test` commands, and
broader V5 gates should include Rust tests alongside TypeScript and conformance
checks.

V5 and later versions must produce a functional 3D scene that visually
demonstrates most or all promoted features where visual proof is applicable.
Starting with V5, use `assets-source/environment` assets when they reasonably
show the feature. Nonvisual refactoring and harness work should still connect
to the version scene through shared fixtures, runtime observations,
diagnostics, or artifact checks.

V5 must also prove that a small playable game can be authored with less
low-level setup than direct scene/world assembly by adding required game-first
SDK ergonomics, a `v5-game-starter` template, stable diagnostics, and release
gate evidence. This is authoring sugar over portable contracts unless a V5 PRD
explicitly promotes a new SDK/IR/runtime contract.

V6 is now planned as the common game-engine feature parity milestone. It should
cover the highest-value missing features needed by most small 3D games across
web Three.js and native Bevy, including gameplay systems, physics collision
events, character interaction, animation playback, UI, audio, assets,
materials, environment parity, and native observations, only when SDK, IR,
validation, web, Bevy where claimed, conformance, docs, examples, and release
gates agree.

The V6 ticket slice is tracked in [V6 PRDs](PRDs/v6/README.md). Those tickets
define planned work; they do not mark promoted V6 features as fully implemented
until the corresponding SDK, IR, validation, web runtime, Bevy evidence,
conformance, docs, example scene, and `verify:v6` release gate evidence lands.

V6-01 has started with the SDK/IR declaration slice: portable system metadata
now carries deterministic `resourceReads` and `resourceWrites`, compiler emit
preserves those fields in `systems.ir.json`, and IR validation rejects resource
access declarations that lack matching resource schemas. The web runtime now
queues `ctx.resources.set` calls as validated resource write effects, rejects
undeclared web resource writes before mutation, and records resource writes in
the canonical web system effect log. The native QuickJS host now queues
`ctx.resources.set` calls through the same effect shape, validates them against
`resourceWrites`, applies declared writes to bundle world resources, and records
resource log entries. Shared web and Bevy conformance reports now also expose
serialized resource values and queued event payloads through the
`v6-resources-events` fixture, and `pnpm verify:conformance` writes a native
V6 observation artifact at
`artifacts/conformance/v6-resources-events/bevy.report.json`. The same fixture
now runs an executable fixed trace in web and native, compares canonical event
and resource effect logs, and writes
`artifacts/conformance/v6-resources-events/web-effects.json`,
`native-effects.json`, and `effects-diff.json`. V6 scene evidence remains part
of later V6 phases.

V6-02 has started with the schedule contract slice: SDK, compiler, and IR now
accept a declared `startup` schedule alongside `fixedUpdate`, `update`, and
`postUpdate`, and `docs/scripting-api.md` records the deterministic V6 stage
ordering and unsupported lifecycle/state behavior. The web runner and native
QuickJS host now execute schedules in `startup`, `fixedUpdate`, `update`,
`postUpdate` order with same-stage systems sorted by name, and
`pnpm verify:conformance` compares the V6 fixture's startup-before-update
resource/event trace artifacts. Broader lifecycle/state coverage remains later
V6 work.

V6-03 has started with the collider validation contract: IR validation now
accepts positive finite box, sphere, and capsule primitive collider dimensions,
checks rigid-body mass and velocity fields, rejects cylinder colliders, dynamic
mesh colliders, and mesh trigger colliders, and fails closed for V6 collider
layer/mask fields that are deferred to V7. The web runtime and native Bevy
adapter now emit deterministic collision and trigger event phases (`enter`,
`stay`, `exit`) for fixed traces, and the shared `v6-physics-events` fixture
exposes collision/trigger `enter` observations in web and Bevy conformance
reports. Full rigid-body solver parity and contact filtering remain deferred to
V7.

V6-04 has started with the character contract slice: the SDK now exposes a
`characterController` helper that lowers to a built-in `CharacterController`
component, IR validation checks collider/body dependencies plus input
axis/action references, and emitted bundles advertise character controller,
grounding, blocking, and interaction capabilities. Runtime movement/blocking
trace parity remains later V6-04 work.

V6-05 has started with the animation clip contract: SDK model assets can now
carry deterministic named clip metadata, emitted asset manifests preserve those
clips, IR validation checks clip IDs, optional source clip names, loop flags,
positive playback speeds, model-only placement, and V7-deferred graph/blend/IK/
retargeting/particle fields, and the `v6-animation-clips` conformance fixture
tracks the contract. The fixture now also runs a fixed web/native
`animation.play` service trace and both web and Bevy conformance observations
report model clip metadata. Real model animation mixer/AnimationPlayer visual
playback, stop/state queries, and graph behavior remain later work.

V6-06 has started with the retained UI contract and observation layer: duplicate
UI node IDs are rejected, the `v6-retained-ui` conformance fixture carries HUD
text, a resource-bound bar, and a focusable action button, and web/Bevy
conformance reports now expose the portable UI tree. The web runtime now mounts
that retained tree as a DOM overlay whose resource bindings update with the
game loop and whose button/touch clicks enqueue UI actions. The Bevy runtime now
spawns retained UI entities with stable `ThreeNativeId` metadata, hierarchy,
buttons, bars, and text. Focus navigation and native click-to-event delivery
remain later V6-06 runtime work.

V6-07 has started with bundle-local audio playback evidence: the shared
`v6-audio-playback` conformance fixture declares local OGG/WAV assets,
autoplay looping music, an event-triggered one-shot, and portable command
volume. The web runtime now has a testable HTML audio-element sink for local
asset playback and stable missing asset/playback diagnostics, while the Bevy
runtime can spawn autoplay loop audio bundles with volume settings and both
adapters report deterministic audio command observations through conformance.
Stop, spatial audio, buses, and richer system/UI audio services remain later
V6-07/V7 contract work.

V6-08 has started with diagnostic metadata preservation: compiler validation
and CLI JSON output now keep upstream IR diagnostic `limit` and `value` fields
alongside existing code, severity, path, and suggestion metadata. The diagnostic
guide now lists the V6 feature-code ranges for systems, physics, character,
animation, UI, audio, and target-specific runtime drift. Native conformance
reports now surface bundle-inspection audio and UI diagnostics instead of
silently dropping them, so missing native audio assets and unsupported Bevy UI
nodes appear in runtime observation artifacts.

V6-09 has started with the functional scene and initial aggregate gate:
`examples/v6-functional` builds one bundle that combines V6 ECS resources,
events, startup/update systems, primitive physics, a character controller,
animation clip metadata, retained UI, input, audio, and runtime config.
`pnpm verify:v6` now runs the V6 docs gate, V6 gate-script tests, CLI build,
functional scene build/validation, web visual smoke verification, and shared
conformance, then writes `artifacts/v6/verification-report.json`. Web
screenshots and the web effect log are mirrored under
`artifacts/v6/web-visual/`, and the aggregate report marks
`visualEvidenceStatus` as `web-captured` when that smoke passes. Native frame
capture, richer playable traces, and final visual parity observations remain
later V6-09 work before the scene can serve as final visual parity evidence.

V7 is now planned as the deep engine gap-closure milestone. It should continue
parity work that is too large or risky for V6, such as deeper physics,
animation graphs, richer UI/audio, renderer/content parity, scripting/runtime
determinism, packaging, and performance gaps. Remaining gaps should be
explicitly deferred or marked never portable with stable diagnostics.

The V7 ticket slice is tracked in [V7 PRDs](PRDs/v7/README.md). V7 starts from
the [post-V6 gap triage](feature-maturity.md#post-v6-gap-triage) table and
should promote deeper engine/runtime parity only when shared fixtures, runtime
observations, native evidence where claimed, docs, diagnostics, functional
scene/template proof, and `verify:v7` agree.

V7-01 has started with the conformance evidence harness: the V7 fixture catalog
now assigns each V7 feature ticket from V7-02 through V7-09 a baseline bundle,
planned accepted/rejected fixture paths, target capabilities, conformance
artifact paths, and rejected diagnostic code families. Conformance mismatch
diagnostics now also expose V7-friendly `expected`, `actual`,
`expectedRuntime`, `actualRuntime`, and `artifactPath` fields while preserving
the existing `left`/`right` report shape.

V7-02 has started at the physics/character contract layer: portable collider
filters now validate with stable `layer`/`mask` metadata, backend-specific
physics handles fail with `TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED`, and
systems may declare `physics.overlap` and `physics.shapeCast` service
permissions beside `physics.raycast`. The first runtime phase now has a
`v7-advanced-physics-character` conformance fixture and fixed web/native trace
for primitive overlap and swept box shape-cast queries with portable collider
layer filters, writing web/native effect logs and a diff under
`artifacts/conformance/v7-advanced-physics-character`. The fixture now carries
a grounded/blocking `CharacterController` and `input.ir.json` axes, and
`pnpm verify:conformance` compares a fixed web/native character movement trace
with deterministic stop-before-penetration behavior. Web and native runtime
tests also pin deterministic ordering for simultaneous collision/trigger
contacts. Full solver behavior, sensors beyond the query fixture, and advanced
character-controller behavior such as slopes, steps, navmesh, and full
interaction parity remain V7 work.

V7-03 has landed the first animation/effects parity slice: model assets can now
carry a constrained `animationGraph` with states, transition conditions, blend
durations, parameters, and animation event markers, plus bounded
`particleEmitters` metadata. The SDK, IR schema/validator, compiler emission,
capability manifest derivation, and `v7-animation-graphs-particles`
conformance fixture cover the accepted portable shape, while IK, retargeting,
engine-specific controllers, and unbounded particle behavior remain rejected or
unsupported. `pnpm verify:conformance` now compares a fixed web/native V7
animation trace for parameter-driven graph transitions, active clip
selection, queued animation event payloads, and bounded particle spawn counts,
writing web/native trace artifacts and a diff under
`artifacts/conformance/v7-animation-graphs-particles`. Full visual mixer
playback, stop/state query APIs, richer event scheduling, and rendered particle
systems remain later V7 work.

V7-04 has landed the first rich UI navigation parity slice: `ui.ir.json` now
accepts portable `focusOrder`, per-node `navigation` links, `safeArea`
metadata, and UI `inputActions`, with validation for duplicate or invalid focus
targets, bad navigation links, invalid safe-area edges, and malformed action
refs. The `v7-rich-ui-navigation` conformance fixture covers a small menu, and
`pnpm verify:conformance` compares a fixed web/native focus and activation
trace under `artifacts/conformance/v7-rich-ui-navigation`. Keyboard, gamepad,
pointer, and touch remain adapter inputs that lower into the same portable
logical trace; richer platform-specific UI widgets and broad interaction
coverage remain later V7 work.

V7-05 has landed the first portable audio-routing and lifecycle evidence slice:
audio IR accepts validated buses, listener positions, spatial emitter
positions/radii, and bus/emitter references on looping music and
event-triggered one-shots while rejecting streaming/network/platform-only
fields. The SDK, IR validator, compiler emitter, web runtime command log,
native Bevy observation path, and `v7-spatial-audio-buses` conformance fixture
preserve the deterministic routed/spatial command shape. `pnpm
verify:conformance` now compares a fixed web/native audio lifecycle trace for
loop start/stop cleanup and writes web/native trace artifacts and a diff under
`artifacts/conformance/v7-spatial-audio-buses`. Real spatial attenuation, mixer
effects, streaming/network audio, and platform audio handles remain unsupported
or later work.

V7-06 has landed the first renderer/dense-content parity evidence slice: the
`v7-renderer-dense-content` conformance fixture carries bounded environment LOD
metadata, imported transform edge cases, and repeated model-backed scatter
instances. The IR validator now rejects backend-specific renderer/content
fields such as ad hoc post-processing, native instancing flags, and material
overrides with `TN_IR_ENVIRONMENT_FIELD_UNSUPPORTED`. `pnpm
verify:conformance` compares a fixed web/native environment content trace for
runtime LOD selection and instancing observations, writing web/native trace
artifacts and a diff under `artifacts/conformance/v7-renderer-dense-content`.
Actual renderer-level native instancing, visual LOD mesh swapping, and portable
post-processing remain unclaimed.

V7-07 has landed the first scripting determinism and lifecycle evidence slice:
`systems.ir.json` now accepts explicit lifecycle metadata for `fixed-trace`
replay, `system-local-disallowed` state, and `invalidate` hot reload behavior,
while unsupported lifecycle fields and async/timer/system-local state metadata
fail with stable IR diagnostics. The `v7-scripting-lifecycle` fixture runs a
script-heavy multi-schedule trace covering startup, fixedUpdate, update, and
postUpdate resource handoff, queued events, spawn/despawn commands, and
`animation.play` service effects. `pnpm verify:conformance` compares the
canonical web/native effect logs and writes artifacts under
`artifacts/conformance/v7-scripting-lifecycle`. State-preserving hot reload,
async systems, arbitrary npm/platform APIs, and dynamic scene reconciliation
remain unsupported or later work.

V7-08 has landed the first desktop packaging and target-profile diagnostics
slice: `tn package --target desktop --bundle <path>` now accepts an existing
bundle, validates the bundle target profile, emits a predictable local artifact layout
under `dist/package/desktop` or the requested `--out` path, and writes
`package.manifest.json` plus `runtime.args.json` for the Bevy runtime loader.
`pnpm verify:v7` currently records this packaging evidence under
`artifacts/v7/packaging` and fails with stable `TN_PACKAGE_*` /
`TN_VERIFY_V7_*` diagnostics for unsupported targets or broken artifact checks.
Signed installers, mobile app stores, online publishing, and hosted services
remain out of V7 scope.

V7-09 has landed the first target-profile-aware performance evidence slice: the
`v7-performance-budgets` conformance fixture declares frame, load, draw,
instance, entity, texture, triangle, and package-size thresholds in
`target.profile.json`. `scripts/verify-v7-performance-budgets.mjs` writes fixed
web and Bevy-style metric reports plus a comparison report under
`artifacts/conformance/v7-performance-budgets`, and `pnpm verify:v7` mirrors the
current performance evidence under `artifacts/v7/performance`. Budget failures
use `TN_PERF_*` diagnostics with metric, measured value, threshold, and artifact
path fields. These reports are deterministic budget evidence, not live browser
or native profiler captures; richer frame capture and platform profilers remain
later work.

V7-10 has landed the first maintained functional V7 scene/template slice:
`examples/v7-functional` and `templates/v7-functional` keep their placeholder
model/audio assets local, build through the standard CLI, and combine the
currently SDK-authored V7-facing gameplay surface: primitive 3D scene content,
physics colliders, a character controller declaration, input, retained UI,
audio, resources/events, scripted event writes, and `animation.play`
service effects. `pnpm verify:v7` now builds, validates, captures web visual
artifacts for the example, packages its desktop bundle under
`artifacts/v7/functional-package`, and create/build/validates the V7 template
under `artifacts/v7/template-smoke/v7-functional`. Deeper V7 feature parity is
still proven by the focused conformance fixtures rather than by direct SDK
authoring for every promoted IR shape.

V7-11 has landed the aggregate release gate and docs consistency slice:
`pnpm verify:v7` now runs the V7 docs gate, docs/gate script tests, selected
TypeScript checks, conformance, the functional scene/template smoke, Bevy
workspace tests, desktop packaging checks, performance reports, diagnostics
checks, and final artifact presence checks. The gate writes
`artifacts/v7/verification-report.json` with links to docs/diagnostics inputs,
rendered web evidence, packaged desktop artifacts, template smoke output,
`artifacts/conformance/verification-report.json`,
`artifacts/v7/rust-test-report.json`, packaging, and performance reports. V7 is
complete for the documented promoted slices when `verify:v7` passes; editor,
online, networking, replication, collaboration, public plugin, raw Three.js,
direct Bevy authoring, mobile packaging, and broad shader graph scope remain
deferred or never portable as tracked in the parity and maturity docs.

V8 is the first planned local editor and inspector milestone, tracked in
[V8 PRDs](PRDs/v8/README.md). V8 starts with offline structured SDK/ECS/IR
project data, local save/load, structured diffs, diagnostics, and bundle
preview evidence. V9 is the first planned online project and publishing
milestone. V10 is the first planned collaboration and runtime replication
milestone. Online services, networking, replication, collaboration, presence,
and conflict resolution should not be treated as V8 support unless a later PRD
explicitly changes that boundary.

## V3 Proves

The V3 evidence loop is `pnpm verify:v3`, which regenerates the environment
bundle, web screenshots, Bevy GLTF smoke captures, and side-by-side contact
sheet under `artifacts/v3`.

- deterministic environment scene IR for the forest proof scene
- bundle-local glTF/GLB, `.bin`, and texture dependency copying
- web Three.js environment preview with first-person walkthrough checks
- Bevy native loading of the same environment bundle for scene load smoke and
  bookmarked screenshot artifacts
- V3 web performance budget reporting
- V3 web performance reports distinguish synthetic/placeholder instancing
  evidence from model-asset-backed instancing plans
- portable bounded environment LOD metadata with web and Bevy observation
  summaries
- bookmarked visual verification artifacts
- atmosphere metadata checks for the V3 scene
- walkability and blocking probes for the V3 scene

## V3 Does Not Prove

- general gameplay ECS/system hosting
- native TypeScript or QuickJS gameplay scripting
- portable UI runtime
- mobile packaging
- full physics engine parity
- full Three.js, R3F, or Drei compatibility
- editor tooling
- custom shaders, render graph, or postprocessing parity

## Status Levels

| Status | Meaning |
| --- | --- |
| ✅ | Implemented and verified for the stated scope. |
| ⚠️ | Partial implementation, known drift, or target-specific behavior exists. |
| 🧪 | Schema-only, experimental, or not release-gated. |
| ❌ | Not implemented. |

## Current Truth Sources

- [V7 PRDs](PRDs/v7/README.md)
- [V6 PRDs](PRDs/v6/README.md)
- [V5 PRDs](PRDs/v5/README.md)
- [V3 Completion Checklist](releases/v3-completion.md)
- [Bevy Feature Parity Drift](bevy-feature-parity.md)
- [Feature Maturity Matrix](feature-maturity.md)
- [verify:v7](verify-v7.md)
- [verify:v6](verify-v6.md)
- [verify:v4](verify-v4.md)
- [verify:v5](verify-v5.md)
- [verify:v3](verify-v3.md)
- [Coordinate, Units, Rotation, and Color Conventions](conventions.md)

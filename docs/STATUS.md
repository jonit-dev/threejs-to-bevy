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

Focused V8 evidence exists for the optional React webview overlay slice:
`pnpm verify:v8:overlay` builds `examples/v8-overlay-webview`, bundles a
React/CSS inventory overlay with local item sprites, validates
`overlays.ir.json` and `requiredCapabilities.overlay`, exercises typed
`inventory:use-item` bridge messages, verifies non-pointer overlay modes do not
capture game clicks, runs native overlay bridge/input diagnostics tests, checks
the default native unsupported-host diagnostic path, and writes
`artifacts/v8-overlay-webview/verification-report.json`. Retained `ui.ir.json`
remains the portable game UI contract; overlays are explicit, bundle-local,
capability-gated, and optional. The desktop native webview host is
adapter-private behind `runtime-bevy`'s optional `native-webview` feature, which
selects the `wry` backend; default builds fail fast with
`TN_OVERLAY_TARGET_UNSUPPORTED` when desktop overlays are declared without that
host.

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

Post-V7 generated-mesh attribute coverage now treats `uv1` and `color` as
promoted rendering attributes: SDK/IR validation already constrains their item
sizes, compiler bundle capabilities now report `mesh.attribute.uv1` and
`mesh.attribute.color`, web maps them to Three.js geometry attributes and
enables material `vertexColors` for color-attributed meshes, and Bevy maps them
to `Mesh::ATTRIBUTE_UV_1` and `Mesh::ATTRIBUTE_COLOR`.

V8-04 has landed the portable procedural mesh authoring slice:
`MeshBuilder` now produces deterministic static custom meshes from portable
primitive composition, transforms, modifiers, normals, UVs, vertex colors,
bounds, generation metadata, and budget metadata. Generated custom meshes can
emit deterministic bundle-local binary attribute/index payloads under
`generated/meshes/`, validate through IR/schema checks, hydrate in the web
Three.js loader and Bevy loader, and map to matching `BufferGeometry` / Bevy
`Mesh` attributes. Organic helpers include reusable pine tree, stylized tree,
mushroom, and rock recipes, and compiler-only BufferGeometry snapshots normalize
into the same portable mesh contract. The focused gate
`node scripts/verify-v8-procedural-mesh.mjs` builds the pine fixture, captures
real web Three.js and native Bevy screenshots, and writes comparison artifacts
under `artifacts/v8/procedural-mesh/`. This promotes static procedural mesh
authoring only; runtime deformation, CSG, chunk streaming, and shader/storage
buffer procedural geometry remain future work.

V5-06 has landed the textured standard-material parity slice: supported material
texture slots now serialize through SDK/compiler output, validate against
texture assets and target formats, appear in shared conformance fixtures and
observations, map to Three.js material texture slots, and map to Bevy
`StandardMaterial` image handles for native regression coverage. The
`examples/v5-functional` scene seed builds, validates, and visually verifies
with bundle-local textured environment assets.

Post-V7 material gap closure has started on the high-value transparency slice:
`MeshStandardMaterial` now carries authored `alphaMode` (`opaque`, `mask`,
`blend`), `opacity`, and `alphaCutoff`; compiler emission serializes non-default
alpha metadata; IR validation rejects invalid alpha values with stable material
diagnostics; web maps alpha to Three.js material transparency and alpha-test
fields; Bevy maps alpha to `StandardMaterial` `AlphaMode` and base-color alpha;
and web/native material conformance reports preserve the promoted alpha
metadata. Renderer-level transparency sorting and richer blend operations remain
future work.

The same post-V7 material gap pass now also promotes authored emissive material
factors: `MeshStandardMaterial` accepts `emissive` and non-negative
`emissiveIntensity`, compiler emission preserves non-default values, IR
validation rejects invalid intensities, web maps them to Three.js emissive
material fields, Bevy maps them to `StandardMaterial.emissive`, and material
conformance reports preserve the promoted fields. Bloom/post-processing
contribution from emissive values remains a separate renderer feature.

Post-V7 physical material scalar coverage now promotes `specularIntensity`,
`clearcoat`, `clearcoatRoughness`, and `transmission` as normalized
`MeshStandardMaterial` factors. Compiler emission preserves non-default values,
IR validation rejects out-of-range factors, web maps authored factors to
Three.js `MeshPhysicalMaterial` when needed, Bevy maps them to
`StandardMaterial.reflectance`, clearcoat, and specular transmission fields, and
material conformance reports preserve the promoted factors. Clearcoat,
clearcoat-roughness, and transmission texture maps are now promoted through SDK,
IR validation, compiler emission, web physical material maps, Bevy PBR texture
fields with `pbr_multi_layer_material_textures` /
`pbr_transmission_textures`, and web/native conformance reports. Specular
texture maps remain future material work.

Post-V7 texture-control coverage now promotes portable texture asset sampler and
UV transform metadata: `textureAsset` accepts wrap, min/mag filter, repeat,
offset, center, and rotation options; compiler emission preserves those fields
in `assets.manifest.json`; IR/schema validation allows the promoted metadata;
web maps it to Three.js texture wrapping, filtering, and transform properties;
and web/native conformance reports preserve the authored asset controls. Bevy
runtime visual application of sampler/UV controls remains future material work.

Post-V7 shadow gap closure has also promoted per-mesh shadow controls:
`Mesh` accepts optional `castShadow` and `receiveShadow` flags, compiler
emission preserves them on `MeshRenderer`, IR validation rejects non-boolean
shadow flags, web maps them to Three.js mesh shadow booleans, Bevy maps explicit
false values to `NotShadowCaster` / `NotShadowReceiver`, and conformance
reports preserve the authored mesh-renderer shadow metadata. Shadow filtering,
point-light shadow parity, and broader visual shadow proof remain future work.

Post-V7 light shadow-bias coverage now promotes optional `shadowBias` and
`shadowNormalBias` on directional, point, and spot lights. SDK validation
requires finite bias values, compiler emission preserves them on `Light`, IR
validation rejects non-finite values, bundle manifests declare
`rendering:light.shadow-bias`, web maps them to Three.js `LightShadow` bias
fields, Bevy maps them to light `shadow_depth_bias` /
`shadow_normal_bias`, and web/native conformance reports preserve authored and
runtime-applied bias values.

Post-V7 renderer-quality coverage now promotes runtime-configured MSAA modes:
`defineRuntimeConfig({ renderer: { antialias } })` emits `none`, `msaa2`,
`msaa4`, or `msaa8`; IR validation rejects unsupported renderer antialias
modes; web maps `none` to WebGL antialias disabled and all MSAA modes to
WebGL antialias enabled; and Bevy maps the same contract to `Msaa::Off`,
`Sample2`, `Sample4`, or `Sample8`. FXAA, TAA, SMAA, and visual
post-processing antialias comparisons remain future work.

Runtime-config drift checks now include conformance report observations:
web and Bevy reports preserve authored renderer antialias and bloom settings,
and `verify:conformance` compares `runtimeConfig` alongside assets, materials,
entities, resources, events, audio, UI, and diagnostics.

Post-V7 bloom coverage now promotes a small runtime renderer bloom contract:
`defineRuntimeConfig({ renderer: { bloom } })` emits `enabled`, `intensity`,
and `threshold`; IR validation rejects malformed bloom values; web routes
enabled bloom through an `EffectComposer`/`UnrealBloomPass` pipeline; and Bevy
maps enabled bloom onto camera `BloomSettings` with matching intensity and
threshold. Advanced post-processing stacks and renderer-specific bloom radius
controls remain future work.

Post-V7 camera parity now also pins Bevy render-camera activation to
`world.resources.ActiveCamera` when present, matching the web runtime fallback
of selecting the first camera and then applying the active-camera resource.
Web and Bevy conformance reports now include the selected active camera ID so
`verify:conformance` can catch drift in multi-camera scenes.

Post-V7 primitive mapping parity now includes the shared `primitive-mapping`
conformance fixture. It covers all promoted generated mesh primitives across
web Three.js and native Bevy report paths so changes to the hand-maintained
runtime primitive tables have a fixture-backed drift surface.

Post-V7 UI layout coverage now promotes two practical HUD layering controls:
UI layout metadata accepts validated `overflow: "hidden" | "visible"` and
integer `zIndex`; the UI authoring package preserves those fields; bundle
capabilities report `ui:overflow` and `ui:z-index`; the web DOM overlay maps
them to CSS overflow and z-index; and the Bevy UI adapter maps them to
`Style.overflow` plus `ZIndex::Local`. Anchors, richer constraints, and
scrolling remain future UI layout work.

The same UI layout pass now promotes practical HUD anchoring: UI layout
metadata accepts `position: "absolute" | "relative"` plus non-negative
`inset` edges; the UI authoring package, IR validation, and bundle capability
derivation preserve the fields; web maps them to CSS position and edge
offsets; and Bevy maps them to `Style.position_type` plus top/right/bottom/left
`Val::Px` offsets. Richer min/max constraints and scroll containers remain
future work.

Post-V7 UI layout constraints now promote `minWidth`, `maxWidth`, `minHeight`,
and `maxHeight` as non-negative pixel constraints. The UI authoring package and
IR validation preserve the fields, bundle capabilities report
`ui:size-constraints`, the web DOM overlay maps them to CSS min/max dimensions,
and the Bevy UI adapter maps them to `Style` min/max `Val::Px` fields.
Axis-specific and nested scrolling remain future UI layout work.

Post-V7 UI grid layout now promotes a narrow CSS-grid-style subset for common
inventory/menu grids. `layout.grid` accepts positive integer `columns` and/or
`rows` plus optional `autoFlow`, validation rejects unsupported grid fields and
invalid track counts, bundle capabilities report `ui:grid-layout`, the web DOM
overlay maps the fields to repeat-count CSS grid tracks, and the Bevy UI adapter
maps them to `Display::Grid`, repeated flexible grid tracks, and grid
auto-flow. Explicit item placement, named grid areas, dense packing, and
arbitrary CSS track strings remain future layout work.

Post-V7 UI visual styling now promotes common HUD/menu style fields:
`backgroundColor`, `color`, `borderColor`, `borderWidth`, `borderRadius`, and
`opacity`. The UI authoring package and IR validation preserve them, bundle
capabilities report `ui:style` plus granular style capabilities, the web DOM
overlay maps them to CSS visual properties, and the Bevy UI adapter maps them to
`BackgroundColor`, `TextStyle.color`, `BorderColor`, `Style.border`, and
`BorderRadius`. Shadows and gradients remain future UI styling work.

The same UI style surface now covers basic text presentation for high-frequency
HUD/menu cases: `fontSize`, `textAlign`, and `wrap` (`word`, `character`, or
`none`) validate through IR, emit as bundle style capabilities, map to CSS
font-size/text-align/wrapping behavior in the web DOM overlay, and map to Bevy
`TextStyle.font_size`, `Text.justify`, and `BreakLineOn`. Font assets, weights,
inline spans, underline, and strikethrough remain future rich-text work.

Basic vertical UI scroll containers are now promoted through
`layout.overflow: "scroll"`. The IR validator and UI authoring types accept the
value, bundle capabilities report `ui:scroll-container`, the web DOM overlay
maps it to vertical browser scrolling with horizontal clipping, and the Bevy UI
adapter maps it to `Overflow::clip_y()` plus a `NativeUiScrollContainer` wheel
system that offsets direct children after layout. Nested scroll hit-testing,
horizontal scroll containers, and richer scrollbar styling remain future work.

Basic UI image nodes are now promoted for common HUD portraits, icons, and menu
artwork. The UI authoring package exposes an `Image` helper / `image` intrinsic,
IR validation accepts `kind: "image"` with a required bundle-relative `src`,
bundle capabilities report `ui:image`, the web DOM overlay renders `<img>` with
alt text from `label`, web/native conformance reports preserve `src`, and the
Bevy UI adapter spawns `ImageBundle` with `AssetServer` loading when available.
Texture atlases, 9-slice scaling, flipping, tiling, and richer image diagnostics
remain future UI image work.

Basic UI accessibility semantics are now promoted for common HUD/menu controls.
UI nodes accept portable `role` and `accessibilityLabel` metadata, validation
rejects invalid roles, missing accessible names for image/button/bar/focusable
controls, unnamed explicit progressbars, and malformed list/listitem structure,
bundle capabilities report `ui:accessibility` with label/role granularity, the
web DOM overlay maps metadata to ARIA roles and labels, web/native conformance
reports preserve the fields, and the Bevy UI adapter inserts AccessKit
`AccessibilityNode` components. Focus narration, disabled-state semantics, and
target-specific accessibility audits remain future work.

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
buttons, bars, and text. Native click-to-event delivery is now covered by a
Bevy UI action queue that records `Interaction::Pressed` on buttons and touch
controls. Broader focus heuristics and advanced widgets remain later UI work.

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
with deterministic stop-before-penetration behavior. Portable scripts may also
declare `character.move`; `ctx.character.move(entity, { axes, fixedDelta })`
returns the same fixed-trace character observation through web and Bevy QuickJS
service logs. Web and native runtime tests also pin deterministic ordering for
simultaneous collision/trigger contacts. Full solver behavior, sensors beyond
the query fixture, and advanced character-controller behavior such as navmesh
and full
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
`pnpm verify:conformance` compares a fixed web/native Tab focus and activation
trace under `artifacts/conformance/v7-rich-ui-navigation`. The web DOM overlay
now lowers Tab/Shift+Tab and arrow keys into the same focus model and activates
focused controls with Enter/Space. Gamepad, pointer, and touch remain adapter
inputs that lower into the same portable logical trace; spatial focus heuristics,
richer platform-specific UI widgets, and broad interaction coverage remain
later V7 work.

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

Generated mesh primitive parity now covers the promoted Bevy-style primitive
catalog in the shared SDK/IR asset contract: cone, conical frustum, torus,
circle, annulus, regular polygon, and extruded rectangle join box, sphere,
plane, capsule, and cylinder. The SDK/compiler emit deterministic primitive
size tuples, IR validation rejects malformed tuple arity/radii/sides, the web
runtime maps them to Three.js geometry, and the Bevy runtime maps them to native
Bevy mesh primitives including `Extrusion<Rectangle>`.

Custom generated mesh parity now covers SDK-authored indexed meshes with
portable float vertex attributes. `CustomMeshGeometry` emits sorted attributes
and optional U32 triangle indices, IR validation requires a float3 `position`
attribute and matching vertex counts, the web runtime builds `BufferGeometry`
attributes and indices, and the Bevy runtime builds `Mesh` attributes including
stable `custom:<name>` float attributes.

Mesh bounds and sampling utilities now exist in both runtimes for generated
primitive and custom mesh assets. The web runtime exports deterministic point
sampling, AABB, bounding-sphere, AABB intersection, and sphere intersection
helpers, while the Bevy runtime mirrors the same calculations in
`mesh_bounds` for native tests and host-side tooling.

Curves, splines, easing functions, and path sampling now have matching web and
Bevy runtime utilities. Both runtimes expose linear/ease-in/ease-out/ease-in-out
quadratic easing plus deterministic line, quadratic Bezier, cubic Bezier, and
Catmull-Rom path sampling helpers.

Transform interpolation and smoothing helpers now have matching web and Bevy
runtime utilities. Both runtimes expose deterministic vec3 interpolation,
shortest-arc quaternion interpolation, full transform interpolation, and
exponential smoothing helpers for host-side animation/state handoff code.

Gizmo geometry now has matching debug/editor-only runtime helpers in web and
Bevy. Both runtimes can emit axis, wire-box, and wire-sphere line geometry with
per-line colors, and focused tests prove the Three.js `BufferGeometry` and Bevy
`LineList` mesh conversion paths.

V7-07 has landed the first scripting determinism and lifecycle evidence slice:
`systems.ir.json` now accepts explicit lifecycle metadata for `fixed-trace`
replay, `system-local-disallowed` state, `invalidate` hot reload behavior, and
bounded resource-derived app states, computed states, substates, and
component `onAdd`/`onInsert` hook observations, portable component reflection
from component schemas, target-to-ancestor observer propagation, plus
fixed-trace task declarations and typed event-backed channels exposed to
scripts as `ctx.states.get()`, `ctx.components.hooks()`,
`ctx.components.type()` / `ctx.components.types()`, and
`ctx.observers.propagate()`, `ctx.tasks.*()`, `ctx.channels.*()`, and
read-only plugin composition through `ctx.plugins.*()`, while unsupported
lifecycle fields, dynamic runtime plugins, and arbitrary async/timer/system-local
state metadata fail with stable IR diagnostics. The
`v7-scripting-lifecycle` fixture runs a script-heavy multi-schedule trace
covering startup, fixedUpdate, update, and postUpdate resource handoff, queued
events, spawn/despawn commands, `animation.play` service effects, derived
state/substate reads, component-hook observations, component-reflection reads,
observer-route reads, fixed-trace channel handoff, read-only bundle asset
manifest lookups through `ctx.assets.get()` / `ctx.assets.list()`, and declared
bundle-local asset load service effects through `ctx.assets.load()` /
`assets.load`. Portable systems also expose deterministic per-context random
helpers through `ctx.random.float/range/int/bool/pick`, seeded from
`world.resources.Random.seed` or `world.resources.__randomSeed`, without using
wall-clock or platform RNG state. Deterministic timer/cooldown helpers are
available as `ctx.timers.elapsed/remaining/progress/done/ready`, derived only
from `ctx.time.elapsed` with no async scheduling or hidden timer state. Query
declarations and `ctx.query(...)` now support deterministic entity-id ordering,
offset/limit windows, and fixed-trace changed-component filters backed by
structured change metadata instead of hidden runtime diffing. Systems can now
declare same-stage `before`/`after` ordering constraints; SDK/IR/compiler,
web, and Bevy QuickJS resolve them with deterministic topological ordering and
system-name tie breaks, while validation rejects missing, cross-stage,
self-referential, and cyclic constraints.
It also records portable plugin/plugin-group composition metadata in the shared
trace without exposing renderer or native runtime extension points.
`pnpm verify:conformance`
compares the canonical
web/native effect logs and writes artifacts under
`artifacts/conformance/v7-scripting-lifecycle`. Follow-up focused runtime tests
now prove command-buffer spawn/despawn reconciliation across later web/native
schedules, native persistence for direct and command-buffer event writes, and
native query filtering against dynamically spawned components. State-preserving
hot reload, arbitrary async timers/promises/workers, arbitrary npm/platform APIs,
network/file asset loading, custom runtime asset loaders,
dynamic runtime plugins, public plugin escape hatches, broad live-scene
reconciliation, event clearing/windowing rules, raw Bevy/renderer type IDs,
command-time/removal component hook callbacks, stoppable observers, and
system-local persisted state remain unsupported or later work.

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

V8-01 has landed the first local editor data contract slice:
`@threenative/ir` now exposes `threenative.editor-project` snapshot validation
and deterministic structured diffs over bundle-relative JSON documents. This is
offline SDK/ECS/IR project data plumbing for future save/load, inspector, and
bundle preview workflows; it does not add a visual editor UI, online services,
collaboration, raw Three.js authoring, or direct Bevy authoring.

The next V8 editor plumbing slice exposes those helpers through the CLI as
`tn editor snapshot --bundle <path>`, `tn editor apply --snapshot <path>
--bundle <path>`, and `tn editor diff --before <path> --after <path>`, so local
bundle JSON can be captured, edited as structured documents, validated through a
temporary bundle, saved back to the portable bundle, and compared without making
editor state a source of truth.

After the initial V8 editor-plumbing slices, functional-game parity work has
closed the P0 native input-capture gap for keyboard/mouse preview controls. The
Bevy loader now preserves `axis.value`, the native runtime captures Bevy
keyboard, mouse-button, pointer-motion, cursor-position, and optional gamepad
button/axis input into `NativeInputState`, and live native system snapshots
receive captured input instead of fixed trace values. Web and Bevy runtimes also
expose touch control/axis state hooks for portable touch bindings. Portable
scripts can now declare `picking.mesh` and query generated mesh renderer bounds
through matching web and Bevy service logs. The picking surface now also includes
`picking.pointerRay`, which turns normalized screen/pointer coordinates plus
portable camera IR into web/native service-logged rays that can feed
`picking.mesh`. Basic UI Tab/arrow keyboard navigation now works through the web
DOM overlay and matching web/native fixed traces, and basic UI control picking
now dispatches portable action events from web clicks and Bevy button/touch
interactions. Touch gestures, drag-and-drop picking, rebinding, and richer
navigation diagnostics remain future input work.

Gamepad diagnostics now include a lightweight viewer-style capability report in
web and Bevy. The report lists gamepad controls declared by `input.ir.json`,
classifies them as portable button/axis/unknown controls, reports connected
browser/Bevy gamepad devices when available, and emits stable warnings or errors
for unavailable gamepad APIs/resources, no connected controller, and unknown
required controls. Input rebinding and richer interactive device overlays remain
future work.

Touch input now has a shared deterministic gesture recognizer for common mobile
flows. Web and Bevy runtime helpers classify tap, directional swipe, and pinch
gestures from timestamped touch-point frames with matching thresholds and event
payloads. Direct platform event stream wiring and richer gestures remain future
input work.

Input rebinding now has matching deterministic helpers in web and Bevy. The
helpers clone an `input.ir.json` map, replace an action binding or axis slot, and
return stable diagnostics for missing actions/axes, invalid binding indexes,
duplicate bindings, and required gamepad bindings that should remain optional
for portable projects. Interactive rebinding UI, persistence, and richer device
overlays remain future work.

The retained UI style surface now accepts portable `shadow` and linear
`gradient` metadata with validation and capability flags. The web DOM overlay
renders those as CSS `box-shadow` and `linear-gradient`; Bevy currently preserves
the metadata in `NativeUiStyle` for native mapping, but native visual rendering
of shadows/gradients remains incomplete.

Common rich-text styling has also moved one step forward: UI style now accepts
portable `fontWeight` (`normal`/`bold`) and `textDecoration`
(`none`/`underline`/`lineThrough`) metadata. The web DOM overlay renders these
through CSS font weight and text decoration, while Bevy preserves the metadata
for future native text rendering. Font assets and inline spans remain incomplete.

The same functional-game parity pass also closes the P0 native material texture
loading gap for promoted standard-material slots. Bevy runtime material mapping
now resolves bundle-local texture asset paths through `AssetServer::load` when
the runtime app has an asset server, with headless mapping tests retaining
placeholder handles. Renderer-specific native sampling differences, alpha/blend
modes, and advanced PBR texture fields remain tracked as later material work.

The audio P0 has also moved from bare loop start/stop traces to portable
playback-id controls. SDK audio declarations can now include validated
`pause`, `resume`, `seek`, `stop`, and `query` controls targeting declared
music or one-shot playback ids; compiler output preserves those controls in
`audio.ir.json`; web and Bevy lifecycle traces apply the controls and report
active, paused, seek, stop, and query state deterministically. Platform-native
audio handles, mixer effects, real spatial attenuation, streaming, and richer
runtime audio services remain later work.

The retained UI P0 flex-layout gap is also closed for portable HUD/container
composition. UI nodes now carry validated `layout` metadata for flex direction,
alignment, justification, row/column gaps, padding, size, and grow; the web DOM
overlay maps those fields to CSS flex styles, the Bevy runtime maps them to
Bevy `Style`, and compiler bundle capabilities flag `ui:flex-layout` when the
metadata is present. Anchors, constraints, overflow/clipping/scrolling, z-index,
richer styling, widgets, and accessibility semantics remain future UI work.

The character-controller P0 is now closed for the promoted deterministic
movement contract needed by the functional-game target. `CharacterController`
now promotes both `stepOffset` and `slopeLimit` as SDK/IR fields with validation
and manifest capability emission, box colliders can declare a portable planar
`slope` ramp surface, and both web and Bevy deterministic character traces step
onto low blockers, walk shallow ramp colliders, reject too-steep ramp colliders,
report actual ground-entity contact, become ungrounded past ledges, and apply
moving-platform carry from rigid-body velocity. Arbitrary sloped mesh terrain,
navmesh behavior, interaction volumes, and object pushing remain later
controller work.

The animation P0 has moved from trace-only metadata toward runtime playback:
model-backed renderers now receive a derived active animation playback state
from clip and graph metadata in both web and Bevy, including active state, clip,
source clip, loop flag, speed, and deterministic time advancement. Web and Bevy
now resolve model-backed mesh renderers to bundle-local glTF/GLB scene assets;
web replaces the placeholder geometry and drives the selected visual clip
through a Three.js `AnimationMixer`, while Bevy attaches a one-clip
`AnimationGraph` to glTF-created `AnimationPlayer` entities and starts the
selected clip with the authored loop and speed. `pnpm verify:v9:skeletal-animation`
now proves cross-runtime skinned-mesh deformation from bundle-local glTF clips
through `examples/v9-skeletal-animation`, web motion screenshots, and native
Bevy dual-frame capture evidence under `artifacts/v9/skeletal-animation/`.
Richer graph runtime control, stop/state queries, IK, retargeting, and rendered
particles remain later animation work.

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

# Bevy Feature Parity Drift

Purpose: keep cross-runtime claims honest. This is not a Bevy API coverage
matrix. It only tracks product-contract drift that matters for the V3 forest
scene, the V4 native scripting proof, and V5 promoted visual/ergonomics work:

```txt
TypeScript authoring -> validated IR bundle -> web-three + native Bevy behavior
```

Baseline: the repo pins Bevy and `bevy_ecs` to `=0.14.2`.

## Status

| Status | Meaning |
| --- | --- |
| ✅ | Implemented consistently enough across SDK/IR/compiler/runtime/tests for the current scope. |
| ⚠️ | Some pieces exist, but SDK, IR, validation, web, Bevy, or verification disagree. |
| ❌ | Not implemented in the repo yet. |

## V3 Parity

| Area | Status | What's drifting or missing |
| --- | --- | --- |
| Stable entities, transforms, hierarchy | ✅ | V1 contract is present across IR, web, and Bevy. Keep conformance green. |
| Primitive mesh rendering | ✅ | Box/sphere/plane are proven; capsule/cylinder appear in IR/Bevy but need matching SDK/web confidence before treating as broad parity. |
| Perspective camera | ✅ | Current cross-runtime path is usable. Orthographic exists in IR/Bevy but is not the V3 proof path. |
| Ambient/directional lights | ✅ | Current baseline works. |
| Point/spot lights | ✅ | V5-07 preserves point range plus spot range/angle through SDK/compiler IR, maps them in web and Bevy, and exposes runtime-normalized conformance observations. |
| Visibility | ✅ | V5-07 shared fixtures and runtime tests cover visible and hidden mesh states in web and Bevy reports. |
| Active camera/resource model | ⚠️ | `ActiveCamera` exists; general resources are still absent. |
| Standard material scalar fields | ✅ | Color, metalness, and roughness are implemented for the base render slice. |
| Material texture slots | ⚠️ | V5-06 validates texture refs, web maps supported slots to Three.js textures, Bevy maps supported refs to `StandardMaterial` image handles, and conformance reports expose refs. Full native image loading/parity remains adapter-dependent. |
| glTF/GLB asset bundling | ✅ | Compiler copies selected glTF/GLB, `.bin`, and texture dependencies; web-three and Bevy now resolve V3 environment instances to real bundle-local glTF scenes instead of placeholder model primitives. |
| Asset manifest validation | ⚠️ | Bundle-relative existence, formats, and references are validated; diagnostics are still partly generic compiler errors instead of stable domain diagnostics everywhere. |
| V3 environment scene IR | ✅ | `environment.scene.json` supports source assets, instances, scatter, terrain/path, hero placements, camera bookmarks, atmosphere, first-person config, and walkability metadata for the V3 proof scene. |
| Instancing/batching | ⚠️ | Web builds an instancing plan and the async glTF loading path can emit real geometry/material `InstancedMesh` groups for repeated compatible assets. V5-08 reports source asset, instance, group, draw, triangle, texture, texture-byte, and bundle-byte estimates, and Bevy observations now distinguish repeated model-backed groups from placeholders. Native renderer-level instancing remains adapter drift. |
| Environment LOD metadata | ⚠️ | V5-08 adds portable bounded source-asset LOD metadata with validation, compiler emission, deterministic web selection, and Bevy observation. Runtime mesh swapping is not yet claimed as visual parity. |
| V3 performance budgets | ✅ | Target profile, performance metrics, and `verify:v3` budget checks are wired for the V3 web proof. |
| `verify:v3` release gate | ✅ | Script builds and validates the example, scaffolds and builds the V3 template, saves web performance reports, captures bookmarked Three.js/Bevy side-by-side visual artifacts from real model-loading paths, and runs V3 scene/atmosphere/first-person/walkability gates. |
| Bevy V3 environment loading | ⚠️ | Native runtime maps `environment.scene.json` into terrain/path placeholders plus real glTF scene instances and can capture bookmarked Bevy screenshots; atmosphere/lighting parity and broader native interaction remain limited. |
| Forest atmosphere | ⚠️ | V5-07 exposes fog, sky/horizon color, tone mapping, exposure, color spaces, and shadow fields in web/Bevy observations with focused tests. Native fog/sky/color rendering parity remains limited. |
| First-person controls | ⚠️ | Portable first-person config, pointer-lock expectations, movement update, and walkthrough verification exist; native input capture is still smoke-level. |
| Walkability and scene collision | ⚠️ | V3 walkable regions and blocking probes exist in IR, web resolver, Bevy helper, and release gate; this is not a general physics collision system. |
| Coordinate/color-space conventions | ⚠️ | `docs/conventions.md` now defines axes, units, handedness, rotations, color space, and imported asset scale; runtime capture/parity work must keep proving adapters follow it. |
| UI | ❌ | UI IR types exist, but retained UI rendering and input/focus parity are not implemented. Not V3-critical unless verification overlays need it. |
| Audio | ⚠️ | Audio IR and asset validation exist; runtime playback is not implemented. Not V3-critical unless ambience enters scope. |
| Gameplay ECS/systems | ❌ | Components/resources/events/system schemas are not a working gameplay host. Keep out of V3 unless a ticket explicitly narrows the slice. |
| Game-first SDK ergonomics | ✅ | V5-11 `defineGame`, prefab/control helpers, and `v5-game-starter` are supported as SDK/template composition over existing portable contracts. There is no new Bevy runtime surface beyond the emitted scene, world, input, runtime config, system, and model asset metadata contracts. |
| Mobile packaging | ❌ | Out of current V3 scope. Do not let old roadmap language imply this is part of V3. |
| Custom shaders/render graph/Solari/networking/editor | ❌ | Out of V3 scope and should stay adapter-internal or post-V3. |

## What Is Drifting

- The V3 bundle contract now drives real model loading in both visual paths, but
  Bevy still has drift in native atmosphere, lighting, instancing, and first-
  person interaction depth.
- Validation is ahead of user-facing diagnostics in places: missing files and
  unsupported assets are caught, but not every failure has stable V3 diagnostic
  codes and suggested fixes.
- IR types are ahead of parity: texture slots, UI, audio, collider shapes, point
  lights, spot lights, and orthographic cameras exist in schema form without
  equal SDK/compiler/web/Bevy proof.
- `verify:v3` is now the V3 release gate, but its visual comparison remains a
  practical side-by-side artifact and nonblank/composition proof rather than
  pixel-perfect renderer equivalence.
- Old roadmap language still risks implying V3 is a broad production platform.
  Current V3 is only the first-person forest scene proof.

## What Is Left For V3

1. Tighten Bevy vs Three.js visual parity for lighting, atmosphere, camera
   framing, and imported asset scale/rotation using the real side-by-side
   screenshots.
2. Tie real web glTF instancing and the Bevy equivalent to captured
   draw/instance/triangle budget evidence instead of synthetic verifier
   estimates.
3. Strengthen native first-person input capture beyond smoke-level reporting.
4. Prove runtime adherence to the documented coordinate, unit, handedness,
   rotation, imported scale, and color conventions.
5. Keep post-V3 features out of the V3 gate unless a PRD explicitly pulls in a
    narrow slice.

## V5 Native Test, Visual-Quality, And Authoring Focus

V5 should move unresolved Bevy drift into explicit Rust tests and shared
conformance fixtures instead of relying on broad release-gate smoke checks.
When a V5 feature claims native support, it needs native-side evidence in
`runtime-bevy`, usually through focused `cargo test` coverage plus any relevant
shared fixture or artifact comparison.

The planned V5 implementation slice is tracked in
[V5 PRDs](PRDs/v5/README.md). The PRDs define the order for shared fixtures,
native observations, Rust regression coverage, promoted visual-quality features,
required game-authoring ergonomics, the functional V5 scene, and the final
`verify:v5` release gate.

Every V5 feature that affects visible output, interaction, or runtime state
should also appear in the V5 functional 3D scene where practical. That scene
should use `assets-source/environment` assets when they can show the feature,
and Bevy evidence should connect back to the same scene through native tests,
observed scene summaries, screenshots, effect logs, or diagnostics.

V5 also requires a game-first SDK ergonomics layer and `v5-game-starter`
template. Native parity is required only for the portable contracts emitted by
that layer; authoring helpers remain SDK sugar unless a V5 PRD explicitly
promotes new runtime behavior.

V5-01 is implemented for manifest and fixture hardening: emitted bundle
manifests derive capability tags from concrete IR payloads, and
`packages/ir/fixtures/conformance/v5-drift-surface` records current drift
surfaces for shared validation. The fixture is a contract catalog until later
V5 PRDs add native observations, Rust regression coverage, and visual parity
evidence for each promoted feature.

V5-02 is implemented for shared observations: web and Bevy conformance reports
now expose assets, materials, texture slots, mesh renderer state, visibility,
entity transforms, lights, cameras, diagnostics, and environment IDs in one
stable report shape. `pnpm verify:conformance` also produces a headless Bevy
summary artifact at `artifacts/conformance/basic-scene/bevy.report.json`; this
improves inspectability and mismatch localization but is not by itself a claim
that every V5 visual feature has native parity.

V5-03 is implemented for diagnostic normalization: high-volume IR failures now
carry optional severity and actionable suggestions, compiler validation keeps
upstream `TN_IR_*` codes stable, CLI JSON errors expose normalized severity, and
Bevy world-mapping failures for missing mesh/material references expose stable
native code/path/suggestion accessors. This improves failure repairability but
does not add new rendering parity by itself.

V5-04 is implemented for fixture harness cleanup: Rust conformance tests now
load shared conformance fixtures by name with fixture/path-aware failure
messages, and TypeScript fixture builders reduce repeated bundle setup in
focused validation tests. This makes later Bevy parity coverage cheaper without
changing supported runtime behavior.

V5-05 is implemented for native regression coverage: Rust tests now pin loader
error paths, missing mesh/material diagnostics, renderer mapping for lights,
cameras, visibility, transforms, and standard-material scalar fields,
environment observation/placement summaries, imported glTF normalization via
the existing V3 environment suite, and V4 scripting effect behavior for
patch/event/command/service logs. This strengthens Bevy support evidence for
already-promoted V3/V4 contracts and keeps future V5 visual work accountable
to focused native tests.

V5-06 is implemented for textured standard-material parity: texture slots are
serialized deterministically, rejected unless they reference valid texture
assets, surfaced in conformance observations, applied to Three.js material
slots, mapped to Bevy `StandardMaterial` image handles, and demonstrated by the
`examples/v5-functional` scene seed with bundle-local textured environment
assets. Native texture image loading still needs later visual parity evidence
before this row can move from partial to fully implemented.

V5-07 is implemented for lighting, atmosphere, shadow, and color parity
evidence: `v5-drift-surface` covers visible/hidden meshes and ranged point/spot
lights, web and Bevy map point-light range plus spot-light range/angle, and
runtime observations expose promoted fog, sky/horizon, color-management, shadow
map, bias, normal-bias, cascade, and max-distance fields. The V5 functional
scene builds, validates, and visually verifies with the promoted lighting and
atmosphere fields, while native fog/sky/color output remains documented drift
instead of a full renderer-parity claim.

V5-08 is implemented for dense content, LOD metadata, and budget evidence:
source assets can carry validated bounded LOD levels, LOD target models are
bundled without inflating source asset counts, web reports include concrete
dense-content budget estimates, and Bevy environment observations identify
model-backed repeated groups versus placeholders. The V5 functional scene now
uses repeated grass scatter and source-asset LOD metadata, while native
renderer-level instancing and runtime mesh LOD swapping remain documented drift.

V5-09 is implemented for the maintained visual-quality scene gate:
`examples/v5-functional` is the current V5 functional scene for promoted visual
contracts, and `pnpm verify:v5` writes web visual evidence plus dense-content
budget artifacts under `artifacts/v5`. Bevy evidence for scene-visible promoted
contracts still comes from shared conformance and focused Rust tests until the
later aggregate V5 gate expands native artifact collection.

V5-11 is implemented for the game-authoring ergonomics slice: `defineGame`,
prefab/control helpers, and `v5-game-starter` lower into existing portable
scene, world, input, runtime config, system, mesh, ECS component, and model
asset metadata contracts. There is no new Bevy runtime surface; native evidence
remains whatever the emitted existing contracts already have through
conformance and focused Rust tests.

V5-10 is implemented for the aggregate release gate. `pnpm verify:v5` now links
the visual scene artifacts, shared conformance report, focused Bevy native test
evidence, dense-content budget report, diagnostics/docs gate, and
game-authoring ergonomics starter smoke in one V5 report. This does not change
the Bevy runtime surface; it makes the existing native tests and artifacts part
of the V5 completion evidence.

Priority V5 native coverage:

1. Loader and fixture reuse for shared IR bundles used by both web and Bevy
   tests.
2. Renderer mapping tests for material texture slots, visibility, lights,
   shadows, atmosphere, fog, skybox, and color-space behavior promoted by V5.
3. Environment-scene tests for dense 3D content quality: instancing/batching,
   LOD, mesh/texture optimization metadata, asset budgets, and imported
   transform conventions.
4. Scripting-host tests for V4 behavior preserved through V5 refactors:
   service facades, effect logs, diagnostics, and native patch application.
5. Native artifact checks where practical: observed scene summaries, canonical
   effect logs, screenshots, and stable failure messages that can be compared
   against web runtime output.
6. Starter-template evidence showing the ergonomic SDK path emits the same
   validated portable contracts consumed by web and, where claimed, Bevy.

V5 is not the scene-editor, online, networking, plugin, or custom renderer
milestone. Those remain V6 or later unless a V5 PRD scopes the work as internal
cleanup or test-harness preparation.

## V6 Common Game-Engine Parity Plan

The planned V6 implementation slice is tracked in
[V6 PRDs](PRDs/v6/README.md). V6 should promote the highest-value missing
contracts needed by most small 3D games: resources/events, deterministic
gameplay schedules, primitive colliders and collision events, character
interaction, animation playback, retained UI, audio playback, asset and
diagnostic hardening, one functional V6 scene, and an aggregate `verify:v6`
gate.

V6 parity claims should move a row from partial or missing only when SDK, IR,
compiler, validation, web runtime, Bevy runtime where claimed, shared
conformance observations, docs, diagnostics, example evidence, and release-gate
artifacts agree. Features that remain too large for V6, including deeper
physics, animation graphs, richer UI/audio, packaging, and broad performance
profiling, should be explicitly deferred to V7.

V6-01 has started at the contract layer: systems can now declare
`resourceReads` and `resourceWrites`, compiler output preserves those fields,
and IR validation checks them against resource schemas. The web runtime now
validates queued resource write effects against `resourceWrites` before applying
them and records those writes in canonical web effect logs. The native QuickJS
host now deserializes the same `resourceReads`/`resourceWrites` metadata,
validates queued resource write effects, applies declared writes to bundle world
resources, and records resource entries in canonical native effect logs. Shared
web and Bevy conformance reports now expose serialized resource values and
queued event payloads through the `v6-resources-events` fixture, with native
artifact evidence under `artifacts/conformance/v6-resources-events`. The same
fixture now runs a fixed web/native trace that compares canonical event and
resource effect logs, including the `Score` resource write and `DamageEvent`
payload. This is not yet a full resource/event runtime parity claim; functional
V6 scene proof still needs to land before the gameplay ECS/systems row can move
out of partial/missing status.

V6-02 has started for schedule declarations: `startup` is now a valid SDK,
compiler, and IR schedule value beside `fixedUpdate`, `update`, and
`postUpdate`, with deterministic ordering documented in
`docs/scripting-api.md`. Web and native now execute `startup`, `fixedUpdate`,
`update`, and `postUpdate` in that order with same-stage systems sorted by
name, and shared conformance compares a V6 startup-before-update
resource/event trace. Broader lifecycle/state evidence is not claimed yet.

V6-03 has started for the physics contract layer: IR validation now accepts
positive finite primitive box, sphere, and capsule collider dimensions, checks
rigid-body mass and velocity fields, rejects cylinder colliders, dynamic mesh
colliders, and mesh trigger colliders, and rejects V6 collider layer/mask fields
because contact filtering is deferred to V7. Web/Bevy contact and trigger event
trace parity is not claimed yet.

## V7 Deep Engine Gap-Closure Plan

The planned V7 implementation slice is tracked in
[V7 PRDs](PRDs/v7/README.md). V7 starts after V6 and should close deeper parity
gaps, or mark them deferred/never portable with stable diagnostics: advanced
physics and character behavior, animation graphs/state machines/events and
bounded particles, richer UI navigation/input, spatial audio and buses,
runtime LOD/native instancing/imported asset edge cases, scripting determinism
and lifecycle, desktop packaging/target profiles, performance budgets, one
functional V7 scene/template, and an aggregate `verify:v7` gate.

V7 is still not the editor, online service, networking, replication,
collaboration, public plugin, direct Bevy, raw Three.js, or broad shader graph
milestone. Those capabilities require separate future PRDs and should not be
implied by V7 parity work.

## V4 Scripting Parity

| Area | Status | What's drifting or missing |
| --- | --- | --- |
| V4 PRD scope and docs gate | ✅ | `docs/PRDs/v4` defines the QuickJS scripting proof and `check:docs:v4` rejects obvious scope drift. |
| `systems.ir.json` scripting contract | ✅ | V4 system declarations include reads/writes, queries, events, commands, services, stage, and script export metadata for the primitive scripting proof. Broader dynamic world reconciliation is V5+ scope. |
| `scripts.bundle.js` compiler output | ✅ | The compiler emits deterministic portable script bundles only when systems exist, includes stable system ID metadata, passes an ESM loadability probe, and is loaded by the Bevy QuickJS host in focused tests. |
| Web portable system runner | ✅ | Web executes the V4 primitive example through cloned portable query snapshots, validates effects before mutation, and emits canonical web patch/event/command/service logs for rotation, movement, spawn/despawn, event handoff, `physics.raycast`, and `animation.play`. |
| Bevy QuickJS host | ✅ | The native adapter embeds `quickjs-rusty`/QuickJS-ng, loads `scripts.bundle.js`, calls declared exports, snapshots portable ECS data, validates effects, applies declared patches, syncs scripted transform updates into the live Bevy preview, captures a V4 Bevy frame artifact, and keeps an unsupported-host diagnostic helper for unavailable builds. Full dynamic native spawn/despawn reconciliation is V5+ scope. |
| Host service facades | ✅ | Web and native expose deterministic time/input/events/commands plus primitive `physics.raycast` and `animation.play` service facades with declared-service validation. Full physics and animation playback remain V5+ scope. |
| Patch/event/command/service-call log parity | ✅ | `pnpm verify:v4` builds the primitive demo, runs web and native QuickJS over the same fixed trace, and compares canonical patch/event/command/service logs into `artifacts/v4/effects-diff.json`. |
| V4 primitive scripting template | ✅ | `examples/v4-scripting` and `templates/v4-scripting` provide a self-contained primitive-only demo and `tn create --template v4-scripting` path for the current MVP API surface. |
| Unsupported portable-script diagnostics | ✅ | DOM, Node/runtime imports, timer and worker APIs, arbitrary npm imports, undeclared writes, commands, events, and services fail before runtime for current bundled systems. Deeper AST coverage is V5+ hardening scope. |

## Sources

- Bevy feature overview: https://bevy.org/
- Bevy 0.18 release notes: https://bevy.org/news/bevy-0-18/
- Bevy examples catalog: https://bevy.org/examples/
- Bevy crate documentation: https://docs.rs/bevy

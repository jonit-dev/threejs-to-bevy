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

ThreeNative groups current support by **product capability** (animation,
physics, rendering, assets, packaging, conformance, and tooling). Version
labels such as `V7`, `V8`, and `V9` are legacy milestone names retained in
scripts, examples, and historical docs during a staged cleanup. See
[PRDs/archive/cleanup-versioned-debt.md](PRDs/archive/cleanup-versioned-debt.md) for the naming
contract, target command map, and allowlist enforced by `pnpm check:names`.

Current contributor entry points:

The first agent-safe scene authoring slices now have a shared
`@threenative/authoring` package for stable AI-repair diagnostics,
deterministic source JSON formatting, source-document discovery, generated
artifact rejection, reusable operation result shapes, and core structured
`.scene.json` validation. The validator rejects malformed IDs, duplicate
declarations, unknown fields, invalid transform vectors, missing prefab/entity/
resource/UI/script references, generated source paths, inline script strings,
and missing script exports before source mutation. The CLI now exposes the
initial canonical automation surface through `tn scene validate [scene-id]
--json`, `tn scene inspect <scene-id> --json`, `tn scene create <scene-id>
--json`, and bounded source mutations: `add-entity`, `set-transform`,
`set-camera`, `attach-script`, and `bind-ui`. `tn scene create` removes the
manual first `.scene.json` seed step by writing a minimal valid scene source,
rejecting invalid scene IDs, existing file collisions, generated artifact
paths, and duplicate scene IDs, and returning JSON next-command guidance for
the authoring/proof loop. `tn scene proof <scene-id> --project <path>
--web-url <preview-url> --out <dir> [--native] --json` now provides the
CLI-first proof handoff for authored scenes: it validates source, builds,
checks authoring provenance and scene IR, captures web and optional Bevy native
screenshots, and writes `proof-report.json` plus `proof.md` with exact commands,
artifacts, capture frame/timing labels, and an explicit same-source/same-bundle
not-pixel-parity caveat. Headless native proof sessions automatically run Bevy
capture through `xvfb-run -a` when no display is present and Xvfb is available,
or fail with `TN_SCENE_PROOF_NATIVE_HEADLESS_XVFB_MISSING` when the user must
install/use Xvfb or run in a graphical session. The focused smoke proof mutates
and validates a source scene, then builds and validates the same project's
normal bundle.
`@threenative/mcp-server` now
provides optional AI-facing wrappers for inspect/validate/mutate/build/
screenshot/verify operations by delegating to the same `tn ... --json` command
surface, with project-root and generated-artifact guardrails.
`@threenative/authoring-client` now provides the first TypeScript facade slice
over the same registry-backed authoring operations. `openProject(projectPath)`
creates transaction objects that queue operation names and JSON arguments,
dispatch through `@threenative/authoring` rather than duplicating mutation
logic, and return an inspectable trace with per-operation results, diagnostics,
written source files, stop-on-error behavior, and aggregate changed/ok status.
The facade also exposes `project.scene(sceneId)` fluent helpers for common
scene operations such as adding prefabs/entities, setting transforms, cameras,
lights, mesh renderers, rigid bodies, colliders, character controllers, script
references, resources, and UI bindings. `dryRun()` reports the registry-backed
operation trace and argument-shape diagnostics without writing files. This
facade is an authoring client for `content/**/*.json`, not a new durable
TypeScript scene source model.

The agent debugging workflow now has a stronger `tn doctor` gate. It checks
package manager state, CLI dependency/local shim setup, required scripts,
template metadata, source entrypoint, required bundle files, and
manifest-declared optional bundle files. When passed `--url`, it probes a
running web preview for canvas presence, `window.__THREENATIVE_READY__`,
runtime error diagnostics, resource failures, visible mesh count, browser
console logs, page errors, and failed requests, returning stable severities and
JSON diagnostics for setup, bundle, and preview-readiness failures.
`tn screenshot [--project <path>] --url <preview-url> --out <file.png>
[--wait-ready] --json` now writes a PNG plus machine-readable proof metadata:
the invoked command, URL, timestamp, viewport, canvas dimensions, runtime
readiness payload, nonblank analysis, visible mesh count, resource failures,
browser logs, page errors, failed requests, and stable errors for missing
canvas, missing readiness, runtime errors, zero visible meshes, and blank
captures. `tn verify --frames 1` reuses the same screenshot capture path and
maps those diagnostics into the verification report; multi-frame motion checks
keep their continuous browser session. `tn record [--project <path>] --url
<preview-url> --out <file.webm|file.mp4> [--duration <seconds>|--seconds
<seconds>] [--input-script <path|default|none>] --json` now resolves proof
artifacts relative to the project, clamps video proof to 1-59 seconds, reports
seconds/FPS/path/input-script metadata, runs a default W/steer/boost input
sequence, and returns `TN_RECORD_UNAVAILABLE` for browser video or codec
failures. Web preview `runtimeDiagnostics` now also reports current scene ID,
culled mesh count, recent runtime errors, and per-rendered-entity visibility
evidence: final scale, world bounds, projected screen-space bounds, camera
distance, clipping state, and material/texture load state. Appending
`?debugOverlay=1` enables a read-only browser debug overlay for humans without
changing the CLI JSON proof contract.

The structured authoring parity PRD has started with a source-document contract
and testable inventory in `@threenative/authoring`. The inventory makes the
durable source boundary explicit: editor-owned scene/map/UI/material/asset/
input/system/audio/runtime-target data belongs in structured source documents,
TypeScript is limited to script references and optional one-way generators, and
generated bundle files such as `world.ir.json`, `ui.ir.json`,
`scripts.bundle.js`, `materials.ir.json`, `assets.manifest.json`,
`prefabs.ir.json`, and `manifest.json` are classified as non-source artifacts.
The authoring package now discovers, classifies, formats, and project-validates
the first stable structured source document families beyond scene ECS:
`content/ui/*.ui.json`, `content/materials/*.materials.json`,
`content/assets/*.assets.json`, `content/input/*.input.json`,
`content/systems/*.systems.json`, `content/prefabs/*.prefab.json`, and
`content/audio/*.audio.json`. This Phase 2 slice uses minimal schema-versioned
contracts, rejects generated bundle paths as source paths, validates duplicate
stable IDs within each document, keeps TypeScript scene-map misuse out of the
durable source model, and validates scene `MeshRenderer.material` references
against material source documents. Broader UI/resource and runtime parity
references remain future structured-authoring work.
The Phase 3 bundle import slice adds `@threenative/authoring` `importBundle()`
and `tn bundle import <bundle-dir> --project <path> --mode source --json`
for recoverable generated catalog import. It normalizes `world.ir.json`,
`materials.ir.json`, `assets.manifest.json`, `ui.ir.json`, `input.ir.json`,
`systems.ir.json`, and optional `audio.ir.json` into `content/**/imported.*`
structured source documents with import provenance, and now also recovers
`runtime.config.json` and `target.profile.json` into structured runtime and
target source documents. It supports dry-run reports and keeps generated bundle
files out of durable source. `scripts.bundle.js`
remains unrecoverable without source-safe manifest/provenance and reports
`TN_AUTHORING_IMPORT_UNRECOVERABLE_SCRIPT_BODY`.
The Phase 4 CLI operation slice adds shared authoring operations and registered
`tn ui`, `tn material`, `tn mesh`, `tn prefab`, `tn input`, `tn asset`,
`tn audio`, `tn environment`, `tn project`, `tn runtime`, `tn target`, and
`tn system` commands for deterministic source-document
mutation. The supported initial operations create retained UI docs, add text
nodes, add/update retained UI widget nodes, set centered layout and promoted
style fields, bind UI resources, create/update material color, roughness,
metalness, emissive, alpha, promoted texture-slot, clearcoat,
and transmission fields, declare primitive mesh source docs, create prefab docs
and component values, add input actions and axes from key lists, set input
controls-settings rows and persisted binding overrides, add asset catalog
entries, create audio docs, add audio sound declarations, add zero-field ECS tag
components and `SceneContainer` group entities to scene source, and create
systems with module/export script references. Systems source commands and editor
metadata rows now set promoted access lists, ordering, query metadata, service
declarations, and command declarations, and bundle import preserves those fields
back into `content/systems/*.systems.json` source documents. Environment source commands
now create environment docs and set promoted skybox, environment-map, terrain,
path, walkability, light-probe, and source-asset LOD fields.
Project metadata source commands now create or update `content/project.authoring.json`
for project id, authoring version, source roots, and build targets, with matching
editor rows.
Runtime config source commands now create runtime docs and set promoted primary
window plus renderer quality fields that lower into `runtime.config.json`.

Portable script helper imports now have a first supported bundle path:
`src/scripts/**/*.ts` may use named imports from
`@threenative/script-stdlib` for pure `NumberEx`, `Vec3`, `Quat`, and
`TransformMath` helpers. The compiler injects those deterministic helpers into
`scripts.bundle.js`, records helper import metadata in `scripts.manifest.json`,
and rejects unsupported helper packages/import shapes with
`TN_SCRIPT_UNSUPPORTED_IMPORT`. Current evidence is
`pnpm --filter @threenative/script-stdlib test`,
`pnpm --filter @threenative/compiler build`, direct
`packages/compiler/dist/scripts/{sourceRefs,bundle}.test.js` execution, and
`pnpm check:docs`. Lifecycle facade, optional domain kits, and aggregate
web/Bevy helper-driven conformance remain in the active PRD scope.

The first core script context ergonomics are now implemented in the SDK types,
web runtime context, and Bevy QuickJS bridge: `ctx.entity`,
`ctx.entities.byId`, `ctx.state`, `ctx.time.fixedDelta(...)`,
`ctx.input.axis1(...)`, and entity `transform()` helpers for position/yaw reads
plus pose/position/rotation writes. Helper writes lower to existing
component/resource effects, so undeclared `Transform` and resource writes still
fail through the same runtime validators. Current focused evidence is
`pnpm --filter @threenative/sdk typecheck`,
`pnpm --filter @threenative/runtime-web-three typecheck`, direct web
`context`/`runner` test execution, and
`cargo test -p threenative_runtime systems_host_should_expose_context_ergonomics_helpers`.
Lifecycle facade, optional domain kits, and aggregate conformance/release-gate
promotion remain open PRD work.
Target profile source commands now create/update `content/targets/*.target.json`
for targets, budgets, and performance JSON, and compiler lowering uses those
documents for `target.profile.json`.
Structured prefab source documents with entity templates now lower into
standalone bundle `prefabs.ir.json` catalogs with manifest entries and
authoring provenance ownership.
Mesh primitive source rows in the editor now dispatch registry-backed
`mesh.create_primitive` with document-file targeting, so existing
`content/meshes/*.meshes.json` primitive declarations can be edited in place
instead of remaining create-only rows.
Scene lifecycle source commands now set
scene kind, activation policy, and initial-scene metadata through
`tn scene lifecycle add`, with matching editor rows and `scenes.ir.json` bundle
lowering from structured `.scene.json` entries. Scene-local input maps, system
schedules, and UI roots now lower into scoped scene references plus merged
`input.ir.json`, `systems.ir.json`, and `ui.ir.json` bundle documents; companion
structured systems documents merge into the emitted system declarations for
source-authored query/access/service/command metadata. Structured scene source
also lowers `tn scene add-tag` marker components and `tn scene add-group`
container entities into `world.ir.json` component data and schemas, and
web/Bevy scene managers expose active runtime scope snapshots. Material bundle
import also
preserves those promoted portable material fields back into
`content/materials/*.materials.json` source documents, and the editor project
API exposes matching editable `material.set` rows. `tn scene add-component` now gives agents a
typed scene-component path for camera, light, mesh-renderer, render-layers,
visibility, rigid-body, collider, and character-controller payloads without hand-written component
JSON, while `tn physics add-rigid-body`, `tn physics add-collider`, and
`tn nav add-agent` provide discoverable aliases for the promoted
physics/navigation source components; camera operations now preserve promoted projection/frustum fields
(`fovY`, `near`, `far`, and orthographic `size`) through source builds, and the
shared registry exposes the matching `scene.set_*` operations.
Structured input documents now lower controls-settings metadata and persisted
binding overrides into `input.ir.json` through `tn input set-controls`,
`tn input set-override`, and registry-backed `input.set_controls` /
`input.set_override`, alongside the existing action and axis source rows.
Reusable `threenative.resources` source documents now give shared gameplay
state/defaults their own durable source family through `tn resources
create|add|set` and registry-backed `resources.*` operations. Reusable
`threenative.schema` documents under `content/schemas/*.schema.json` now cover
component/resource schema source through `tn schema create|set`,
registry-backed `schema.*` operations, validation, and compiler lowering into
canonical bundle schema files; broader editor schema controls remain residual.
Structured asset source documents now also carry promoted model animation
metadata through `tn animation add-clip`, `tn animation graph add-state`, and
bounded particle metadata through `tn particle add-emitter`, and compiler
lowering preserves those fields in `assets.manifest.json`. Render-target asset
source declarations now have a first-class CLI/editor path through
`tn asset add --type render-target --width <n> --height <n>` and editable
asset rows for width, height, usage, and format; compiler lowering emits those
structured declarations as `assets.manifest.json` render-target entries.
Commands support `--json`, return the shared `ok`/`changed`/`filesWritten`/
`diagnostics` shape, and fail before writing on invalid JSON or validation
errors. Broader asset import settings, material sampler/import policy, input
controls-settings/rebinding metadata, advanced UI input/rich-layout behavior,
audio playback defaults and host window policy fields, plus project-level
scene ordering/build orchestration, remain later
source-operation work.
The Phase 5 compiler provenance slice extends `authoring.provenance.json` with
structured source ownership entries when source documents are available during
normal build. The report maps scene entities/components to source JSON
pointers, resolves scene `MeshRenderer.material` references to material source
documents, maps UI nodes and system script refs with module/export metadata,
classifies generated bundle files as non-durable output, and emits
`TN_AUTHORING_DUPLICATE_EMITTED_OWNER` for obvious conflicting source owners.
Generated `scripts.bundle.js` remains `rejected/not-source`; script source is
the referenced TypeScript module/export.
The Phase 6 template proof adds `structured-source-starter` to `tn create`.
The template builds directly from `content/scenes/arena.scene.json`, keeps
scene/UI/material/asset/input/system/mesh/prefab declarations under `content/`,
and keeps TypeScript limited to `src/scripts/player.ts` behavior. `tn authoring
inspect|validate --json` is now registered as the project-level source-document
wrapper, and the template proof mutates the countdown UI through
`tn ui set-layout` without touching TypeScript.
The Phase 7 MCP adapter-contract slice keeps `@threenative/mcp-server` as a
thin optional wrapper over the same `tn ... --json`/`@threenative/authoring`
behavior. MCP now exposes representative structured operations for retained UI
layout/binding, recoverable bundle import, material updates, and system script
attachment. Parity tests compare MCP and CLI/core JSON results and source
output, including the rule that `scripts.bundle.js` is reported as
unrecoverable generated script body rather than persisted as source. The
`docs/contracts/authoring-mcp.md` contract defines the same operation result,
diagnostic, path guardrail, and persistence policy for future editor adapters.

The first editor package slice adds `@threenative/editor` as a workspace
package with a typed React shell, static Vite fixture, ThreeNative-shaped
adapter model, generated/runtime row guard tests, and project launch wiring via
`tn editor dev --project <path> [--port <n>] [--json]` plus `tn editor open`.
This is a read-only shell over structured authoring/IR inspection data: it
does not adopt Vibe Coder ECS/runtime state, persist source edits, or claim a
runtime preview loop yet.

The editor source bridge now classifies supported `content/**` structured
documents and `threenative.authoring.json` as source-persistable in the IR
editor contract while keeping generated bundle/cache/runtime paths rejected.
`@threenative/authoring` exports a shared promoted operation registry for names
such as `scene.set_transform`, `scene.set_component`, `ui.add_text`,
`ui.set_layout`, `material.create`, `material.set`, `mesh.create_primitive`,
`mesh.create_custom`,
`ui.add_node`, `ui.set_style`, `prefab.add_component`, `input.add_action`,
`asset.add`, `audio.create`,
`audio.add_sound`, `scene.set_light` for kind/intensity/color/range/angle and
shadow bias fields, `scene.set_mesh_renderer`,
`scene.set_rigid_body`, `scene.set_collider`,
`scene.set_character_controller`, `scene.set_lifecycle`, `scene.set_prefab`,
`environment.set_path`, `environment.set_walkability`,
`environment.set_source_asset_lod`, `system.create`, and
`system.attach_script`; MCP derives its registry-backed tool names from that
catalog while preserving CLI JSON transport behavior.
The editor workbench slice adds server-side project load/validate and operation
dispatch APIs in `@threenative/editor`, source-document inventory state, scene
hierarchy, material, catalog, UI/input/system models, and guarded panel
components. Workbench operations persist scene transforms, material values, UI
text/layout, input actions, primitive/custom mesh, prefab, asset catalog
primitive/color/asset rows, asset catalog type/path rows, scene resource
path/value rows, and system edits through
`@threenative/authoring`; generated script bundle paths are rejected before
source writes.
The editor runtime preview slice adds build/status APIs, preview host state,
source-to-runtime selection correlation helpers, read-only overlay models,
catalog preview rows, and a focused Playwright-backed `verify:editor-package`
gate. Browser self-verification now launches the editor against
`structured-source-starter`, selects a primitive kind and color, adds it through
the UI, builds the bundle, and confirms the new entity is persisted in
`content/scenes/arena.scene.json` and emitted into `world.ir.json`. The visible
editor shell now follows the `jonit-dev/vibe-coder-3d` editor layout pattern:
menu strip, neon top bar, dense hierarchy/inspector rail, viewport overlays,
collapsed right rail, and bottom status bar. The center viewport renders actual
Three.js objects derived from ThreeNative structured scene source, keeps
hierarchy selection, 3D picking, selected-object inspector rows, visual
selection bounds, and gizmo cues wired to the same source-backed scene object
model, and exposes drag/drop hierarchy nesting as an editor-view affordance
without treating Vibe Coder ECS state as authoritative source data. The
Playwright editor package gate now exercises a Vibe-like source scene fixture,
real hierarchy icons, typed inspector controls for primitive/color/transform
fields, drag/drop hierarchy interaction, viewport picking, and source/IR
persistence proof at the reference desktop viewport size. The shell chrome now
uses ThreeNative branding, icon playback controls, editor action icons, a
right-side AI chat channel rail, and denser footer runtime details.
The latest visual-fidelity pass keeps the editor proof primitive source-backed
but moves it out of the main reference composition, restores visible viewport
grid lines, and adds more detailed generated tree/house presentation meshes for
the Vibe-like verification scene.
The editor scene lifecycle slice adds source-backed new-scene creation seeded
with `main-camera`, `directional-light`, and `ambient-light`, save/reload proof
through the editor project API, and footer LOD/triangle status derived from the
same structured scene object model. The editor package gate now verifies those
default entities, scene source persistence, and LOD footer readiness alongside
primitive creation, hierarchy selection, viewport picking, and bundle emission.
The editor model-loading slice now serves project-local GLB/GLTF assets through
guarded editor routes, configures Three.js `GLTFLoader` with the local Draco
decoder, and proves Vibe Coder FarmHouse plus GreenTree GLBs load in the
source-backed viewport before the e2e gate proceeds. Inspector component panels
are now attached-component driven: Transform, MeshRenderer, Camera, and Light
sections appear from source entity/prefab data instead of being unconditional.
The inspector field-mapping slice adds an explicit source-schema-backed
inventory for promoted editor-visible fields, typed inspector row metadata
including JSON pointers, field kinds, defaults, source family, read-only
reasons, and operation payload hints, and field-kind controls for vector3,
number, color, enum, asset, script reference, string-list, generated, and
nested JSON payloads. The editor project API now emits source-backed rows for
scene object components plus material, input, systems, UI/resource, asset, and
mesh catalog documents; unsupported or unpromoted mutations remain visible as
read-only rows instead of being silently omitted. Add Component now reads shared
definition/default/incompatibility/pack metadata, while Add Object,
AssetLoader-style flows, Save/New/Build, and ScenePersistence modal-shell
behavior remain separate. The `verify:editor-package` Playwright proof now
checks representative Transform/MeshRenderer/Camera/Light fields, input
bindings, system script references, Add Component compatibility/default
metadata, and the existing source/IR persistence evidence.
Environment scene source documents are now classified by `@threenative/authoring`
as `environment`, and the editor surfaces environment-owned skybox data under
the selected Camera inspector as editable `Skybox` and `Skybox Mode` rows backed
by promoted environment mutation operations. The editor package gate writes
`content/environment/arena.environment.json` and verifies the Main Camera skybox
row from the running browser editor.
The current modal shell covers Add Object, Add Component, Save Scene, New Scene,
Build Preview, Settings/Delete placeholders, and the AI chat entry point while
future slices port the richer Vibe Coder modal data and mutation flows.
Add Object now routes enabled Primitive Sphere, Empty Entity, Camera, and Light
choices through action metadata into source-backed editor operations, while
Terrain and Custom GLB remain disabled with explicit reasons until their source
operations exist. Add Component defaults for Camera and Light now have
project-API persistence coverage, and the focused editor package gate still
passes with source scene, world IR, and screenshot evidence.
The editor package gate now proves the functional modal flow end to end by
opening unsupported placeholders, adding Primitive/Empty/Camera/Light variants,
building the preview bundle, and validating the added source scene entities plus
emitted world/material IR evidence.
The viewport selection contract now lives in shared editor preview helpers:
loaded GLB children and placeholder meshes resolve to their owning hierarchy row,
nearest row ownership wins, and helper geometry can be marked non-selectable so
viewport picking does not desynchronize hierarchy, inspector, and gizmo state.
Viewport gizmo mode is now real editor state: Move/Rotate/Scale buttons update
the Three.js `TransformControls` mode, W/E/R shortcuts change modes outside text
inputs, and the focused editor gate asserts visible mode changes alongside
source-backed transform persistence.
Viewport cues now cover camera, light, terrain, and loaded model selection
classes: lights render an explicit icon/core glyph instead of an empty group,
and the editor package gate selects Camera/Light/Terrain rows before screenshot
capture to prove inspector sync and cue stability.
The scene lifecycle model now exposes deterministic source scene entries and an
active scene selection helper for editor workbench flows. `/api/project` now
returns that lifecycle metadata, including saved, dirty, build-ready, empty, and
diagnostic scene states. The editor footer surfaces active scene/state values,
New Scene remains source-backed with the default camera and light entities, Save
continues to reload structured source from disk, and selecting a scene source
row switches the active scene through the Zustand store without generating or
rewriting source code.
The functional editor operation-coverage audit now exposes a shared coverage
matrix for inspector fields and modal actions. Focused editor tests fail if an
editable inspector row lacks an operation payload or if a read-only row/action
lacks an explicit reason, and the Add Object modal reads the same metadata for
disabled action explanations. `scene.set_camera` and `scene.attach_script` are
also included in the editor operation name surface to match the authoring
registry.
The editor operation workflow now has a repo-local Codex skill,
`threenative-editor-operations`, plus `verify:editor-required-operations` as a
focused smoke that applies the required editor operations through
`applyEditorOperationApi`, rebuilds the copied structured-source starter, and
asserts that both durable source JSON and emitted `world.ir.json` reflect the
edit. Script references remain supported through `system.attach_script` and
`scene.attach_script`; an in-editor TypeScript body editor is tracked separately
by `docs/PRDs/other/editor-script-body-code-mode.md`.
The editor AI chat ECS-control slice now has a bounded local planner and
approval/apply API. Chat planning returns registered source-document operation
steps only, approved plans dispatch through the editor operation API and shared
authoring registry, generated IR remains untouched until build proof, and
unsupported chat intents produce stable diagnostics without source writes.
`pnpm verify:focused verify:editor-ai-chat` writes durable evidence under
`tools/verify/artifacts/editor-ai-chat/`: the chat plan, apply result, changed
source scene, final `world.ir.json`, and `editor-ai-chat-report.json` proving a
dynamic physics cube was chat-authored, hot-patchable, validated, rebuilt, and
lowered into emitted IR.
The editor GLB authoring slice now promotes project-local model assets from
`content/assets/*.assets.json` into concrete editor asset rows and Add Object
Custom GLB choices. Selecting a model asset creates source-backed scene prefab,
entity, and transform operations with the GLB/GLTF path persisted on the prefab;
`/api/project` exposes the resulting `assetPath`, MeshRenderer inspector asset
row, and info/error diagnostics for `/project-assets` viewport routing while
remote model paths remain unsupported.
The editor environment/terrain slice now exposes source-derived environment
summary metadata to the viewport and inspector. `/api/project` emits editable
operation-backed rows for skybox, environment map, and terrain
id/height mode/heightmap plus path, walkability, light-probe, and source-asset LOD data. The editor
viewport uses environment metadata for a visible sky/background and terrain
cue, and the footer distinguishes estimated LOD triangle counts from exact
loaded counts.
Add Object Terrain is now promoted through source-backed editor operations: the
store updates flat environment terrain and walkability metadata, creates a
scene-local plane prefab/entity, and persists the transform without touching
generated bundle output. The browser editor package gate exercises the Terrain
modal action and verifies the resulting source scene, emitted `world.ir.json`,
and emitted `environment.scene.json` evidence.
The functional editor scene/assets/environment PRD is now complete. The
compiler lowers companion structured environment source documents into emitted
environment bundle evidence for terrain, path, and walkability, while simple
source skybox/environment-map IDs remain editor-visible until texture asset
source lowering is promoted. The focused editor package gate writes
`arena.scene.after-edit.json`, `world.after-edit.ir.json`,
`environment.after-edit.scene.json`, `assets.after-edit.manifest.json`, and
smoke/edited screenshots after adding primitive, empty, camera, light, and
project GLB objects, building preview, creating a default scene, and confirming
GLB loading without unexpected browser console errors.
The follow-up component mutation audit keeps Transform, Camera, Light,
material, input, system script/metadata/schedule, UI binding, and custom
component JSON payload rows source-editable while preserving explicit read-only
reasons for remaining unpromoted generated/provenance, stable identifier, and
advanced inspector rows. Editor-only
operation fallbacks now return stable
`TN_EDITOR_OPERATION_ARG_INVALID` diagnostics for malformed payloads before any
source write.
The editor functional gap closure now promotes Add Component entries for
MeshRenderer, RenderLayers, Visibility, RigidBody, Collider, and
CharacterController through registry-backed source operations instead of generic
status-only placeholders. `/api/project` exposes typed, editable inspector rows
for those attached components, and `verify:editor-required-operations` now
authors RigidBody and Collider from editor operations and proves the source JSON
and emitted `world.ir.json` contain the physics data.
The remaining visible editor gap controls now have explicit honesty contracts:
modal actions and Add Component definitions carry `featureStatus`, Delete and
Settings toolbar buttons expose the same tracked disabled reasons as their
dialogs, hierarchy drag/drop reports view-only nesting instead of durable source
persistence, and Play/Pause/Stop are disabled until a promoted preview runtime
state operation exists. Script reference editing is limited to module/export
fields backed by `system.attach_script`; inline script body editing remains in
the separate code-mode PRD. Runtime physics evidence for the promoted physics
surface is covered by the focused animation/physics residual gate, which emits
matching web/native reports for character grounding behavior.
Generator provenance has a structured one-way source surface:
`content/generators/*.generator.json` validates module/export, generated output
paths, optional input/output hashes, and overwrite policy. The registry-backed
`generator.record` operation and `tn generator record` CLI command create or
update those documents, while editor project rows expose generator provenance as
read-only evidence because generated outputs do not receive automatic reverse
patches from editor edits.
`tn generator run <generator-id> --json` now executes only project-local
modules under `src/generators/**`, passes the `@threenative/authoring-client`
project facade to the generator, records `lastRun` provenance with operation
trace, files written, diagnostics, run timing, and input/output hashes, and
reports `TN_GENERATOR_OUTPUT_CONFLICT` when a previously generated output was
manually edited under a non-replace overwrite policy.
The P0 editor state refactor has started by adding Zustand to
`@threenative/editor` and moving modal/session primitives into a typed
editor-session store. `EditorApp` now reads modal state from the store while
keeping its public props stable; store tests cover modal, selection, status, and
reset behavior before the larger dev-fixture project/operation state migration.
The second Zustand slice moves the dev fixture's project payload, selected row,
status text, hierarchy parent map, and viewport transform overrides into the
same store. Store tests now cover project/selection coupling, recursive nesting
rejection, and transform override apply/clear behavior while preserving the
existing editor package render and server tests.
The third Zustand slice centralizes editor dev async workflows behind store
actions: project refresh, add primitive, build preview, create scene, save,
property edit, add component, transform commit, and viewport transform
dispatch. The dev fixture now delegates mutation callbacks to the store, and
mock-fetch tests verify refresh selection, operation sequencing, and failure
status behavior.
The P0 Zustand refactor is now browser-gated by
`pnpm verify:focused verify:editor-package`, which passes after the store
migration and continues to prove editor selection, modal/source mutation,
save/build, source scene, world IR, and screenshot artifacts. Zustand remains an
editor-session state boundary only; durable source documents and generated
bundles remain owned by the existing editor/project APIs.

Structured `.scene.json` documents can now be used as a normal project build
entry for the first runtime-backed CLI authoring slice. The compiler validates
the source scene, lowers primitive prefab entities, promoted camera
projection/frustum fields, transforms, and attached script module references
into the existing SDK scene/world/system bundle path, and emits authoring provenance for the scene
document. A CLI-authored proof project at
`/home/joao/projects/threenative-cli-authoring-proof` validates and builds from
`content/scenes/cli-proof.scene.json`, proves the emitted bundle is connected to
the scene/script source, passes web `tn verify --expect-motion`, and captures a
nonblank Bevy screenshot. Proof log:
`/home/joao/projects/threenative-cli-authoring-proof/artifacts/final-proof/cli-authored-scene-proof.md`.

Compiler authoring graph source has started under
`packages/compiler/src/authoring`: Phase 1 defines graph/provenance node types,
deterministic normalization, and duplicate declaration diagnostics before IR
flattening. `captureEntry()` now also returns `{ graph, diagnostics }` alongside
the existing root and summary fields, preserving compatibility for existing
callers while exposing source modules and compatibility provenance for modular
authoring. Build now fails on graph conflict diagnostics before emitting IR, so
duplicate source declarations surface as structured compiler errors. Provenance
emission now writes `authoring.provenance.json` as a compiler/debug sidecar when
the bundle is built from captured source; the runtime manifest and IR contract
remain unchanged.

Modular SDK authoring has started with `defineSceneModule()`, `defineEntity()`, `definePrefabModule()`, `defineResourceModule()`, `defineInputModule()`, `defineUiModule()`, `defineAudioModule()`, `defineAssetModule()`, and `defineWorldModule()`. These source-metadata-aware wrappers validate logical source IDs and source-owned paths, reject runtime-handle-shaped authored data, keep asset refs bundle-local or embedded, lower to existing scene/world/prefab/input/UI/audio/asset declarations, and are visible to compiler authoring graph provenance capture.
Bundle roots now accept standalone SDK asset refs/modules through an `assets`
field, and structured asset source documents lower supported model, texture,
audio, and buffer file-backed declarations into `assets.manifest.json` with
source ownership. Custom/generated mesh asset source remains later work because
the current IR mesh asset contract is not a path-backed catalog entry.
Existing one-file `Scene`, `World`, and `defineGame` authoring remains supported; modular declarations are optional authoring/provenance helpers.

`tn create`/`tn init` now scaffold only `structured-source-starter`. Fresh
projects start from `content/**/*.json` structured source documents with
behavior modules under `src/scripts/**/*.ts`; legacy `src/game.ts` templates
have been removed from the template registry and wiped from `templates/`.
Source-checkout scaffolds install through a generated local `.threenative/cli`
wrapper package instead of depending directly on the workspace CLI package, so
fresh projects outside the repo can run `pnpm install`, `pnpm run build`,
`pnpm run validate`, and `pnpm run verify`.

Script module references are implemented for SDK-authored systems. Systems can
name a project-relative TypeScript module and named export instead of carrying
inline function source; the compiler resolves the module, computes a source
hash, emits `scripts.bundle.js`, and writes `scripts.manifest.json` mapping the
source module/export/hash to the generated bundle/export. The compiler rejects
missing exports, stale hashes, generated export-name collisions, helper imports
until real script helper bundling exists, async/dynamic code, timer/network/DOM/
Node/platform globals, and top-level mutable module state with `TN_SCRIPT_*`
diagnostics that include source path and export context.

Scripting host conformance now has a documented source-of-truth service matrix
in [contracts/scripting-host-matrix.md](contracts/scripting-host-matrix.md).
The IR package exports the promoted service list and tests it against SDK
`SystemService`, IR `IrSystemService`, web queued service calls, the Bevy native
host service anchor, and docs so drift is caught by conformance and docs gates.
Web and Bevy also now have focused effect-validation parity tests proving
undeclared component writes, resource writes, events, commands, and service calls
are rejected before any world mutation, with canonical effect-log ordering kept
aligned across runtimes. The same contract now documents module-local state
lifetime policy: mutable module state is rejected for source-referenced scripts,
portable state belongs in declared resources/components/services, and native
QuickJS tests prove forbidden ambient APIs such as DOM, network, timers, Node,
and workers are not exposed by the Bevy bridge.

Native Bevy UI now installs a dedicated overlay UI camera above authored scene
cameras so retained UI stays visible over multi-camera/viewport scenes. The
native `Minimap` widget preserves authored bounds/paths/static markers and syncs
live resource-bound markers; future proof should move through structured source
fixtures or focused verifier-owned artifacts rather than a standalone
`src/game.ts` example.

`tn asset inspect <path> [--json]` is available for local glTF/GLB triage. It
reports accessor-derived bounds with node transforms, external/embedded image
and buffer dependencies, missing-file diagnostics, and gameplay-scale
calibration hints before a model is placed in a scene. `tn model-test` now turns
those inspection hints into a one-model proof project with copied dependencies,
ruler/grid/bounds reference, camera frustum metadata, `1x`/`fit-target`/
`gameplay-recommended` scale presets, projected screen occupancy, scale verdict,
the isolated-proof caveat, optional build/validation, and optional screenshot
capture from a supplied preview URL or a stable unavailable state. `tn screenshot`
and `tn record`
provide direct Playwright still/video proof capture; MP4 conversion requires
`ffmpeg`, while WebM is captured directly by Chromium. Their JSON reports now
include timestamp, viewport, URL, and the web runtime ready payload when
available. Web preview readiness includes active camera ID, visible mesh count,
final visible world bounds, declared/model asset counts, resource-failure
diagnostics, and camera distance/clip-range hints. `tn verify --json` also
reports projected nonblank bounds/occupancy for the first captured frame.

SDK object transforms now have chainable `setPosition`, `setRotation`,
`setScale`, and `patchTransform` helpers. Runtime component patches remain
field-merge operations: patching only `Transform.position` preserves existing
rotation and scale, while explicit component `set` replaces the whole component.
The web runtime also emits `TN_WEB_TRANSFORM_PARTIAL_PATCH_MERGED` when a
lower-level system effect carries only part of a `Transform`, so scale-preserving
merge behavior is visible in machine-readable diagnostics instead of silently
looking like a replace operation.
Portable follow/chase cameras should use Camera `follow` metadata applied by
runtime post-update systems instead of direct runtime camera rotation mutation.

`tn help scaffold` and `tn help examples` now point at
`structured-source-starter`; legacy template aliases are no longer project
creation paths.

```bash
pnpm check:names
pnpm check:docs
pnpm verify
pnpm verify:smoke
pnpm verify:changed
pnpm verify:focused <gate>
pnpm verify:conformance
pnpm verify:release
pnpm verify:full
pnpm verify:parity:push
```

Cross-runtime web↔Bevy visual parity is now guarded by
`pnpm verify:parity:push`. The gate now builds the structured-source
`examples/stylized-nature-component` checkpoint from `content/**`, captures
matched web and Bevy screenshots, and fails on exposure drift,
under/over-exposure, and checkpoint pixel thresholds. Evidence:
`tools/verify/artifacts/baseline-visual-parity/baseline-visual-parity-report.json`.
The native runtime now explicitly disables Bevy default ambient fill when an IR
bundle has no authored ambient light, and applies a calibrated world-ambient
scale for non-atmosphere scenes so structured visual checkpoints stay within
visual parity thresholds.

Git hooks (via [husky](https://typicode.github.io/husky/)) run layered parity
checks after `pnpm install`:

- **pre-commit** — `pnpm verify:smoke`: naming gate and docs drift check.
- **pre-push** — `pnpm verify:pre-push`: one orchestrated gate (~2–3 min) that
  builds once, runs typecheck/lint/tests in parallel, then conformance and
  structured-source baseline visual parity without repeating setup.

Skip hooks temporarily with `git commit --no-verify` or `git push --no-verify`
when needed.

Aggregate parity evidence runs through the canonical release gate:

```bash
pnpm verify:release
```

Focused capability gates now route through the typed `tools/verify` CLI
dispatcher, so root `package.json` keeps stable public names while build
composition lives under `tools/verify/src`. Legacy milestone aliases remain
compatibility commands with deprecation diagnostics during the cleanup.
Verification gate ownership is now classified in
`docs/status/verification-script-classification.md`: package-local assertions
belong in tests, focused gates must document their owner, profile, verifier
reason, and protected quality requirement, `verify:conformance` owns shared IR
runtime parity, and `verify:release` owns evidence aggregation. The release gate
builds shared packages once, invokes typed focused gates in no-setup mode where
available, runs independent focused/conformance/visual proof concurrently after
setup, keeps focused artifact checks after each gate, and writes step timing
categories plus non-failing budget warnings into the release report. The current
`pnpm verify:release` report passes in 59.3 seconds, down from the previous
about-200-second checked-in baseline.

IR contract hardening is now part of the release path: `@threenative/ir`
exports canonical document metadata for schema IDs, manifest keys, and bundle
file names; `pnpm --filter @threenative/ir test` runs the contract drift gate;
and `pnpm verify:release` runs the IR package tests before release evidence is
accepted. The focused `pnpm --filter @threenative/ir test -- --run
contractDrift` slice now executes the drift subtests directly, verifies
schema/version literals from parsed JSON Schema files, covers schema-backed
`scenes.ir.json` and `overlays.ir.json` across TypeScript and Bevy DTOs, and
keeps the native manifest loader aligned with required `requiredCapabilities`.
See [contracts/ir-contract.md](contracts/ir-contract.md) for the contract update
checklist.

Bundle safety hardening now rejects unsafe manifest-controlled paths before web,
CLI/editor/package, or Bevy filesystem reads; the compiler emits bundles through
a staged directory and preserves the previous bundle on copy/write failures;
environment scatter generation rejects unbounded instance counts before
expansion; web render loops expose a disposal handle and report rejected frame
work as runtime diagnostics; and both runtimes reject malformed generated-mesh
binary payload lengths with asset path context instead of decoding partial data.
Run `pnpm verify:bundle-safety-hardening` for the focused evidence gate.

Compiler capture now mirrors source-relative project modules into the temporary
capture directory, so configured source entries and `src/scripts/**/*.ts`
behavior modules can import local `.ts`/`.tsx` modules through NodeNext `.js`
specifiers while transitive portable-boundary diagnostics still point at the
source module. Capture output is staged in package-local
`.tn-capture-*` directories that are removed after success or failure, and
CommonJS `require()` calls now fail with the same unsupported-import diagnostic
as non-portable ESM imports.

Scene lifecycle authoring is implemented as a first portable slice:
`defineScene()`, `sceneTransition.*`, and
`defineGame({ scenes, initialScene })` validate named scene declarations,
duplicate IDs, missing initial scenes, bounded transition durations, and
unsupported lifecycle hooks before emit. The bundle contract reserves
`scenes.ir.json` as `threenative.scenes` and validates initial scene IDs, unique
scene IDs, scene-owned entity/input/UI/audio/asset/system references,
activation values, transition bounds, loading scene references, and duplicate
exclusive entity ownership. The compiler emits `scenes.ir.json`, includes the
canonical manifest entry, merges scene-local visual/world entities into
`world.ir.json`, lowers scene-local input/system/UI scopes into scoped scene
references, derives scene lifecycle and transition capabilities, and supports
modular scene imports through NodeNext `.js` specifiers. Web and Bevy now expose
matching deterministic scene lifecycle traces, active scene scope snapshots,
scene service effects, and transition/readiness traces; visible rendered
transition overlays and full live entity activation remain future runtime depth.

Packaging, performance, and desktop distribution evidence still runs through
`pnpm verify:v7`. Legacy milestone aliases such as `verify:v9` forward to
`verify:release` with a deprecation diagnostic.

`verify:v7` runs docs gates, selected TypeScript tests, the maintained
functional scene/template proof, rendered web evidence, shared conformance,
Bevy native test evidence, desktop packaging checks, performance budget
reports, and release-artifact presence checks. It writes the aggregate report
under `tools/verify/artifacts/milestones/v7/verification-report.json`.

Capability planning and historical milestone PRDs live under `docs/PRDs/v9/`
and earlier numbered folders. Those folders are historical archive context, not
the current release front door.

V10 planning now exists under `docs/PRDs/v10/README.md`. V10 is the current
final-gap triage batch for remaining runtime/platform parity rows after the V9
push: advanced renderer/material/physics features, production platform/audio/
asset extension policy, packaging, cross-runtime visual calibration, and
explicit non-portable diagnostics. `V10-03` is implemented as the
`pnpm verify:v10:visual-calibration` gate with promoted color, material,
lighting, atmosphere, post, geometry, dense-content, and combined-scene fixtures;
the current passing evidence is indexed under
`docs/pr-evidence/v10-visual-calibration/`.
V10-05 ECS tags, scene groups, and scene containers are implemented as the
recommended grouping model: `defineTag()` serializes queryable zero-field marker
components, `Group` lowers as a transform hierarchy container with
`SceneContainer` metadata and no renderer/camera/light components, and the shared
`v10-ecs-tags-groups` conformance fixture verifies matching web/Bevy tag-query
observations across a viewable multi-lane moving-cube scene plus hierarchy
observations through `pnpm verify:conformance`.
The upstream Bevy catalog watchlist residuals now have a focused diagnostic and
report evidence surface: `@threenative/ir` exposes
`BEVY_CATALOG_RESIDUAL_ROWS` plus diagnostics for callback permissions, IME
target-profile support, artifact-root bounded asset export, custom UI shaders,
UI viewport/drag-drop routing, window policy requests, and executable glTF extension processors; the compiler, web runtime, and Bevy runtime report
generated asset bundle-artifact policy; the web and Bevy runtimes report
deterministic query combinations with entity-id ordering and explicit limits,
disabled entity query participation separate from renderer visibility, bounded
delayed-command scheduling through fixed-trace tasks/channels, and
window resize/scale observations; the web runtime reports ordered text-input
value/action events, web and Bevy report virtual-keyboard diagnostic state,
and the Bevy runtime reports stable glTF executable
processor diagnostics. Window resize/scale observations, portable entity
participation, and schema-backed generated asset artifacts are now promoted
catalog rows, while callback components/callable handles, cursor, power/background, clear-color mutation, and
multi-window policies, IME-on-unsupported-target, UI viewport routing,
UI drag/drop routing, runtime asset export outside declared artifact roots,
arbitrary deferred closures, native italic rich text, and platform virtual keyboards are stable diagnostic-only
boundaries. These checks keep
the remaining rows triaged and protected without marking broad catalog parity
complete.
Broader authoring-tool UX remains outside this V10 batch except for bounded
visual panel evidence explicitly promoted in the status entries below. `pnpm
check:docs` is the canonical docs and drift gate. Temporary V10 planning
evidence may still run through `pnpm verify:v10`, but maintained release
verification should move toward capability/release gates instead of new
versioned command families.

Distribution packaging is published and verified for the
TypeScript packages: `@threenative/sdk`, `@threenative/ir`,
`@threenative/ui`, `@threenative/r3f`, `@threenative/compiler`,
`@threenative/runtime-web-three`, and `@threenative/cli` are public on npm at
`0.1.0`. The published package metadata resolves from the registry, and a clean
external npm project installed `@threenative/cli@0.1.0`, ran `tn create`, installed
the generated game dependencies, built `dist/game.bundle`, served the web preview,
and passed `tn verify` with nonblank 1280x720 frames. The CLI tarball now also
ships the Bevy runtime source under `dist/runtime-bevy`, and
`pnpm verify:distribution` confirms a generated project installed from packed
tarballs can compile the bundled native runtime with Cargo before packaging a
desktop bundle. Run `pnpm verify:distribution` to reproduce the local
packed-tarball proof from a clean temporary npm consumer project. Run `pnpm run
deploy -- --dry-run` to execute the guarded release path: full repo
verification, distribution proof, ordered pack, local desktop distributable
creation/validation, installed native runtime build, and npm publish dry-run.
`pnpm run deploy -- --skip-tests` is available only as an explicit fast publish
retry path.
The AI-consumable distribution contract now promotes package-local IR metadata:
`@threenative/ir/capabilities/threenative.capabilities.json` describes
supported, partial, diagnostic-only, and non-portable feature states with
web/Bevy runtime support fields, while
`@threenative/ir/diagnostics/diagnostics.catalog.json` documents exact
high-value diagnostics plus public `TN_IR_*` diagnostic families. The IR test
suite validates catalog shape, current diagnostic coverage, and every exported
schema's `$id`, version, and package path.
The AI docs front door now adds `llms.txt`, `llms-full.txt`,
`docs/workflows/ai-distribution.md`, and `examples/ai-reference/README.md` for
installed-package consumers and coding agents. The CLI package build copies
those docs into `@threenative/cli` `dist/ai/`, and
`pnpm verify:distribution` checks the packed CLI install can read the AI docs
alongside exported capability and diagnostic metadata. The
`structured-source-starter` template now also generates `AGENTS.md` and
`CLAUDE.md` so coding agents inside a created project receive local instructions
to use `tn ... --json` for deterministic scene/source edits, keep durable source
under `content/**` and `src/scripts/**`, and avoid repairing generated bundles
directly.
The distribution release gate now treats those AI-consumable artifacts as
publish blockers: every public packed package must include root declarations,
declaration maps, and runtime entrypoint JavaScript; `@threenative/ir` must
ship every exported schema plus capability and diagnostic JSON metadata; and
`@threenative/cli` must ship the AI docs/examples under `dist/ai`. The clean
consumer fixture imports the public TypeScript APIs and reads capabilities and
diagnostics through package subpaths, and the distribution report records
`aiDocsPath`, `capabilitiesPath`, and `diagnosticsCatalogPath` evidence paths.

V10 planning now exists under `docs/PRDs/v10/README.md`. V10 is the current
final-gap triage batch for remaining runtime/platform parity rows after the V9
push: advanced renderer/material/physics features, production platform/audio/
asset extension policy, packaging, cross-runtime visual calibration, and
explicit non-portable diagnostics.
Retained editor UI and visual inspector UX are intentionally outside this V10
batch until a dedicated editor/UI planning pass is requested. V10-01 adds a
temporary planning aggregate, `pnpm verify:v10`, while docs drift remains under
the canonical `pnpm check:docs` gate. These checks prove ownership, boundary
diagnostics, and report wiring; they do not mark V10-02, V10-03, or V10-04
feature work complete.

V9-01 animation and particles runtime parity is implemented with focused
stateful animation, blending, and rendered particle evidence:
`pnpm verify:v9:animation-state` compares web/native `animation.play/query/stop`
runtime service traces under `tools/verify/artifacts/animation-state/` using the
`animation-state` conformance fixture;
`pnpm verify:v9:animation-blending` compares bounded crossfade blend weights and
event ordering under `tools/verify/artifacts/animation-blending/` using the
`animation-blending` fixture;
Portable script audio facade evidence is validated through the
`script-audio-facade` conformance fixture (`pnpm verify:conformance`), which
checks declared `audio.play/query/stop` service contracts and bundle validation
for script audio metadata;
`pnpm verify:v9:animation-particles` compares rendered bounded CPU particle
emitter counts plus web/native SVG evidence under
`tools/verify/artifacts/animation-particles/`. The later animation/physics/
navigation residual gate promotes bounded animation masks, morph-target
animation, and UI/property transform-animation evidence; IK, retargeting, and
arbitrary blend trees remain explicitly unsupported with stable diagnostics.

Focused V8 evidence exists for the optional React webview overlay slice:
`pnpm verify:v8:overlay` validates the shared
`packages/ir/fixtures/conformance/v8-overlay-webview/game.bundle` fixture with
bundle-local overlay HTML/CSS and item sprites, validates `overlays.ir.json` and
`requiredCapabilities.overlay`, exercises typed `inventory:use-item` bridge
messages, verifies non-pointer overlay modes do not capture game clicks, runs
native overlay bridge/input diagnostics tests, checks the default native
unsupported-host diagnostic path, and writes
`tools/verify/artifacts/overlay-webview/verification-report.json`. Retained `ui.ir.json`
remains the portable game UI contract; overlays are explicit, bundle-local,
capability-gated, and optional. The desktop native webview host is
adapter-private behind `runtime-bevy`'s optional `native-webview` feature, which
selects the `wry` backend; default builds fail fast with
`TN_OVERLAY_TARGET_UNSUPPORTED` when desktop overlays are declared without that
host.

V8-06 camera helpers, multi-view rendering, render targets, custom projections,
and screenshot export are implemented with shared conformance and visual evidence.
Runtime render-target allocation now covers declared color targets and write-only
depth targets in both web and Bevy adapters; depth target material sampling
remains rejected by IR validation until a portable sampling/writeback contract is
promoted. Structured asset source documents, `tn asset add --type render-target`,
and editor asset rows now author those target declarations without hand-editing
generated manifests. The camera-view gate `pnpm verify:v8:camera-views`
validates `packages/ir/fixtures/conformance/camera-multi-view/game.bundle`,
captures web/native screenshots with viewport-region checks, and writes
artifacts under `tools/verify/artifacts/camera-views/`.

V8-07 material parity is implemented with focused material/texture evidence:
`pnpm verify:v8:material-parity` uses the shared rendering residual fixture,
runs conformance, captures web/native screenshots, and writes
`tools/verify/artifacts/material-parity/verification-report.json`.

V8 color, lighting, and tone parity evidence is implemented with screenshot
diff metrics and calibrated sample regions:
`pnpm verify:v8:color-parity` validates
`packages/ir/fixtures/conformance/color-parity/game.bundle` and
`packages/ir/fixtures/conformance/lighting-tone/game.bundle`, captures
web/native screenshots, compares unlit swatch colors plus lit PBR sphere probes,
and writes `tools/verify/artifacts/color-parity/verification-report.json` plus
`tools/verify/artifacts/lighting-tone/lighting-tone-report.json`. Unlit swatch
parity is near-exact (full-frame changed pixel ratio `0`, max channel delta
`~1/255`); lit scenes gate on full-frame average color/brightness deltas (`~1%`)
with probe regions tolerating localized PBR gradient differences. Fast
regression harness: `pnpm test:color-parity` locks thresholds, fixture presence,
sample regions, and verifier orchestration without rerunning Playwright/Bevy
captures.

V8-08 has started with a transform animation contract slice:
`animations.ir.json` now carries validated entity transform clips with
position/rotation/scale tracks, monotonic finite keyframes, `linear`/`step`
sampling, and `none`/`repeat` loop policy. The SDK can author
`defineAnimations()` / `transformAnimationClip()` declarations, compiler output
emits `animation:transform-*` capabilities, web and Bevy loaders consume the
same bundle document, and `pnpm verify:v8:animation-transform` compares web and
native transform samples through
`packages/ir/fixtures/conformance/v8-transform-animation/game.bundle`, writing
trace evidence under `tools/verify/artifacts/animation-transform/`. The same slice now
also exposes `animation.query` and `animation.stop` as declared portable system
services in SDK/IR, web, and Bevy QuickJS contexts; `pnpm
verify:v8:animation-controls` compares their web/native command-shape and
service-payload effect logs through
`packages/ir/fixtures/conformance/v8-animation-controls/game.bundle` and writes
evidence under `tools/verify/artifacts/animation-controls/`. Stateful runtime playback
control semantics, broader blending, and rendered particles remain open V8-08
work.

V8-09 has a narrow rigid-body primitive solver parity slice: `RigidBody`
metadata now carries portable `gravityScale` and `damping`, `Collider` metadata
now carries portable `restitution` and `friction`, and the web/native primitive
trace proves a dynamic box falling under gravity onto a static floor with
deterministic position, velocity, material, and contact observations. Run
`pnpm verify:v8:rigid-body-primitive` after building the web runtime; it writes
`packages/ir/artifacts/conformance/rigid-body-primitive/web-rigid-body.json`,
`native-rigid-body.json`, and `rigid-body-diff.json`. This does not complete
full V8-09 rigid-body, character navigation, object pushing, or pathfinding
acceptance.

V9-02 physics-character parity is implemented for the promoted P1 surface:
SDK/IR/compiler contracts and web/native runtime traces now cover bounded
primitive solver v2 declarations, deterministic multi-body primitive contact
traces, broad primitive sensors, character object pushing, static navigation
path queries, and backend-boundary diagnostics. The accepted fixture is
`packages/ir/fixtures/conformance/physics-character/game.bundle`; rejected
fixtures cover mesh sensors and backend/dynamic navigation handles. Run
`pnpm verify:v9:physics-character` to validate the bundle, emit web/native
solver/sensor/push/navigation traces, compare drift, and write
`packages/ir/artifacts/conformance/physics-character/verification-report.json`.
Dynamic mesh colliders, joints/constraints, dynamic navmesh rebakes, crowd
steering, off-mesh links, and public backend physics/navmesh handles remained
deferred at V9 scope with promotion criteria in the V9-02 PRD. The later
animation/physics/navigation residual gate promotes bounded sloped mesh
grounding, dynamic navmesh rebake policy observations, off-mesh link
traversal, small crowd steering reports, and stable diagnostics for raw backend
physics/navigation handles; full constraint solving, arbitrary triangle narrow
phase, vehicle drivetrains, soft bodies, and ragdolls remain deferred.

Post-V10 animation, physics, and navigation residuals are implemented through
`pnpm verify:animation-physics-residuals`. The focused gate validates
`packages/ir/fixtures/conformance/animation-physics-residuals/game.bundle`,
compares matching web/Bevy residual reports for animation masks, morph target
weights, UI/property transform samples, sloped character grounding, bounded
dynamic navmesh rebakes, off-mesh links, and crowd steering, and writes JSON
reports plus a visual contact sheet under
`tools/verify/artifacts/animation-physics-residuals/`. The same gate is part of
`pnpm verify:release`.

Post-V10 input/UI/platform polish now has a focused evidence gate:
`pnpm verify:input-ui-polish`. The gate validates
`packages/ir/fixtures/conformance/input-ui-polish/game.bundle`, compares
matching web/Bevy reports for platform touch stream snapshots, deterministic
settings-screen input coverage, gamepad diagnostics with repair hints, disabled
runtime reconciliation, nested and axis-specific scroll observations, spatial
navigation, and focus narration, and writes JSON reports plus a contact sheet
under `tools/verify/artifacts/input-ui-polish/`. Virtual keyboard behavior,
native italic rendering, 3D/world UI, render-to-texture UI, and the broad
packaged webview host behavior remain diagnostic/deferred rather than promoted
runtime behavior; `tn package --runtime webview` now emits
`desktop-web/webview.inspection.json` so local-server browser/webview-opener
packages retain the manual host checklist. The same gate is part of
`pnpm verify:release`.

The V10 advanced-physics pass now promotes a bounded racing-useful physics
slice: SDK/IR/compiler contracts accept explicit `Collider.mesh.bounds` and
`triangleCount` metadata for static and dynamic mesh colliders, `RigidBody.ccd`
with `swept-aabb` mode, and portable `PhysicsJoint` metadata for hinge, slider,
and suspension joints. Web and Bevy deterministic traces use mesh AABB bounds
for high-speed track contact, preserve CCD observations, and report suspension
joint metadata. `pnpm verify:v10:advanced-physics` writes sequential web/native
frame PNGs, a contact sheet, JSON traces, and per-frame comparison metrics under
`tools/verify/artifacts/advanced-physics/`. Full constraint solving, arbitrary
triangle narrow phase, tire/friction models, vehicle drivetrains, soft bodies,
ragdolls, and public backend handles remain deferred or diagnostic-only
boundaries rather than promoted runtime parity.

The physics self-verification plan has an initial focused gate at
`pnpm verify:physics-self-verification`. It generates fixture-backed bundles for
`physics-gravity-collision-lab`, `physics-material-lab`,
`physics-mass-stack-lab`, `physics-character-obstacles`,
`physics-query-lab`, `physics-mesh-ccd-track`, and
`physics-joint-metadata`; validates each bundle; emits per-example web,
native Bevy, and diff JSON under
`examples/<scene>/artifacts/physics-self-verification/`; runs the existing
promoted physics gates plus conformance; writes selected P1 visual contact
sheets for bounded mesh CCD and joint metadata as trace diagrams generated from
JSON trace output; and writes aggregate evidence under
`tools/verify/artifacts/physics-self-verification/`. The current conclusion is
`PASS`: all P0/P1 scene assertions, web/native trace diffs,
unsupported-boundary diagnostics, selected trace-diagram contact sheets,
promoted physics gates, and conformance pass within the focused gate. This gate
does not currently emit runtime camera screenshots or videos.

The V10 emissive-bloom pass promotes HDR bloom contribution metadata for
emissive materials. `MeshStandardMaterial.emissiveBloom` now validates through
SDK/IR/schema checks, emits from scene capture, contributes a manifest
capability, maps to web material user data and Bevy `StandardMaterial.emissive`
without the unlit color-card shortcut, and exposes deterministic web/native
contribution observations. `pnpm verify:v10:emissive-bloom` writes sequential
web/native frame PNGs, a contact sheet, JSON traces, and per-frame comparison
metrics under `tools/verify/artifacts/emissive-bloom/`. This does not claim full GPU
bloom pixel identity beyond the promoted contribution trace.

The V10 native-instancing pass promotes renderer-level repeated-prop batching
evidence for environment scatter instances. Bevy now records
`NativeEnvironmentInstancingReport` resources, tags grouped instances with
`NativeInstancedMember`, reuses shared mesh/material handles for repeated
placeholder scatter props, and reports model-scene handle grouping for
bundle-local glTF/GLB source assets. `pnpm verify:v10:native-instancing` writes
sequential web/native trace-frame PNGs, a contact sheet, JSON traces, and
per-frame comparison metrics under `tools/verify/artifacts/native-instancing/`. This is
not a broad custom GPU instance-attribute API, and visual runtime LOD mesh
swapping remains future work.

Post-V10 rendering residuals now have a focused report-backed gate:
`pnpm verify:rendering-residuals` validates the `rendering-residuals`
conformance fixture and compares web/Bevy reports for runtime LOD selection,
chunked terrain asset-group policy, optional streamed chunk timeout handling,
bounded instancing policy, native specular texture proof, extended material
preset proof, compressed environment texture diagnostics, and advanced renderer
boundary diagnostics. The gate writes `web-report.json`, `native-report.json`,
`diff.json`, `contact-sheet.png`, and `verification-report.json` under
`tools/verify/artifacts/rendering-residuals/` and is part of release
verification. Runtime vertex mutation, custom shaders, bindless resources, CSG,
storage-buffer geometry, custom executable asset loaders, and arbitrary
file/network streaming remain diagnostic-only boundaries.

The V10 native-UI-effects pass promotes portable retained UI shadows and linear
gradients beyond metadata preservation. Bevy now materializes authored shadow
and gradient style entries as native rendered-effect components, exposes a
deterministic native visual-effect trace, and stops reporting those style fields
as unsupported. `pnpm verify:v10:native-ui-effects`
writes sequential web/native trace-frame PNGs, a contact sheet, JSON traces, and
per-frame comparison metrics under `tools/verify/artifacts/native-ui-effects/`. This is a
bounded retained UI effect slice, not a full CSS filter/shader parity claim.

The V10 native-rich-text pass promotes bounded rich text style observations for
the native Bevy UI adapter. Bevy now materializes retained font-family,
font-weight, text-decoration, and per-span rich text style metadata as
`NativeUiRenderedTextStyle` components, exposes deterministic
`trace_native_ui_text_styles` observations, and stops reporting native
weight/decoration diagnostics while retaining the explicit per-span italic
diagnostic. `pnpm verify:v10:native-rich-text` writes sequential web/native
trace-frame PNGs, a contact sheet, JSON traces, and per-frame comparison metrics
under `tools/verify/artifacts/native-rich-text/`. This is a metadata/render-style
promotion for retained UI text, not a claim that Bevy synthesizes missing font
faces for every portable weight.

The V10 native-UI-images pass promotes retained UI texture atlas, nine-slice,
flip, tile, tint, scale-mode, and source-size metadata into explicit native
image render-plan observations. Bevy continues to preserve the authored
`NativeUiImageMetadata` component and now exposes deterministic
`trace_native_ui_image_rendering` observations for atlas/nine-slice panels and
tiled image fills. `pnpm verify:v10:native-ui-images` writes sequential
web/native trace-frame PNGs, a contact sheet, JSON traces, and per-frame
comparison metrics under `tools/verify/artifacts/native-ui-images/`. This is a bounded
retained-image metadata/render-plan proof, not a full custom Bevy nine-slice
mesh or tiled-material renderer implementation.

The V10 post-antialiasing pass promotes runtime `fxaa`, `taa`, and `smaa`
antialias modes. SDK/runtime config types, IR validation/schema, and compiler
capability derivation now accept and report those modes; web conformance reports
post-antialiasing as applied without enabling canvas MSAA, and Bevy attaches the
matching FXAA, TAA, or SMAA camera component while leaving the MSAA resource off.
`pnpm verify:v10:post-antialiasing` writes sequential web/native trace-frame
PNGs, a contact sheet, JSON traces, and per-frame comparison metrics under
`tools/verify/artifacts/post-antialiasing/`. This is not a full temporal history quality
or exact shader-output parity claim.

The V10 editor-panels pass promotes a bounded visual editor/inspector panel
model on top of the structured editor snapshot track. `@threenative/ir` now
builds a deterministic `threenative.editor-visual-panels` snapshot with scene
hierarchy, property inspector, assets, diagnostics, and reload-policy panels;
`tn editor inspect --json` returns the same panel model alongside existing
inspector metadata; and `pnpm verify:v10:editor-panels` writes sequential
web/native trace-frame PNGs, a contact sheet, JSON traces, and per-frame
comparison metrics under `tools/verify/artifacts/editor-panels/`. This is a portable
panel-data and visual evidence slice, not a full native desktop editor shell.

The V10 editor-property-editing pass promotes bounded scene hierarchy property
editing evidence. `tn editor inspect --json` exposes selectable hierarchy and
editable property paths, `tn editor set` now has focused coverage for applying a
validated `Transform.position` JSON-pointer edit back to `world.ir.json`, and
`pnpm verify:v10:editor-property-editing` writes sequential web/native
trace-frame PNGs, a contact sheet, JSON traces, and per-frame comparison
metrics under `tools/verify/artifacts/editor-property-editing/`. This remains structured
bundle editing rather than live runtime scene mutation.

The V10 editor-tools pass promotes bounded scene viewer, asset preview, and
gamepad viewer metadata. `@threenative/ir` now builds deterministic
`threenative.editor-tools` snapshots that derive scene cameras, renderables, and
bounds from `world.ir.json`, asset preview rows from `assets.manifest.json`, and
declared gamepad controls from `input.ir.json`; `tn editor inspect --json`
returns that payload beside inspector and visual panel data. The editor shell
now also keeps connected browser gamepad devices in the Zustand session store
from `navigator.getGamepads()` and renders device id, mapping, button count, and
axis count alongside declared controls. `pnpm
verify:v10:editor-tools` writes sequential web/native trace-frame PNGs, a
contact sheet, JSON traces, and per-frame comparison metrics under
`tools/verify/artifacts/editor-tools/`. This remains an editor-shell/browser
gamepad inspection slice rather than a full native desktop editor shell. The
full native desktop editor shell is an explicit deferred boundary; current
editor support is browser-based `@threenative/editor`, CLI inspect/apply/diff,
and desktop-web package inspection.

V8-10 has a narrow asset/glTF inspection evidence slice: web and Bevy now emit a
deterministic `threenative.asset-load-sync-trace` for bundle-local path assets
and environment model scene references. The trace records sorted asset load
order, a `bundle.requiredAssets` ready barrier, and bundle-declared glTF source
asset to instance/LOD relationships, with focused comparison artifacts written
by `pnpm verify:v8:asset-load-gltf-inspection` under
`packages/ir/artifacts/conformance/asset-load-gltf-inspection/`. This does not promote
the rest of V8-10: public asset-group declarations, spawned glTF node
query/update handles, material override handles, editor inspection commands,
watch diagnostics, and state-preserving hot reload remain future work.

V9-03 assets/glTF scene workflow is implemented as a promoted V9 proof:
SDK declarations and compiler emission now cover bundle-local, bounded
embedded, and HTTPS network asset source modes plus deterministic asset groups;
IR validation rejects oversized embedded payloads, unsupported network target
profiles, unsafe bundle paths, duplicate groups, and group references to unknown
assets; compiler output can include deterministic glTF scene metadata for named
nodes, selected extras, and custom vertex attributes; spawned glTF scene handles
support portable transform, visibility, material, and extras lookup operations
with web and Bevy runtime observations; `tn editor inspect` emits structured
scene inspection JSON; and dev reload classification reports reloadable,
state-preserving, rebuild-required, and unsupported changes. The aggregate
proof is `pnpm verify:v9:assets-gltf-scene-workflow`, which writes
`inspection.json`, `web-report.json`, `native-report.json`,
`reload-report.json`, and `diff.json` under
`tools/verify/artifacts/assets-gltf-scene-workflow/`. Custom asset loaders/custom asset
types, arbitrary runtime file/network access from scripts, and custom shader
consumption of glTF custom attributes remain deferred.

V8-11 now has a focused rendering-quality slice for fog and sky visual parity:
`pnpm verify:v8:rendering-quality` uses the shared drift-surface fixture,
captures web/native screenshots, checks nonblank output, compares
sky/foreground/fog-depth regions, verifies far fog convergence toward the
authored fog color, and writes artifacts under
`tools/verify/artifacts/rendering-quality/`. This is not the full V8-11 post-processing
surface; skybox/cubemap contracts, instancing/batching evidence, and broader
post-processing controls remain tracked as open parity work.

V9-04 adds the portable/reportable rendering-lights contract slice for
bundle-local skyboxes, environment maps, bounded light probes, dynamic light
budgets, PCF shadow-filter metadata, visibility ranges, HLOD fade metadata,
debug gizmo observations, forward render-path metadata, and color-grading
tone-mapping/exposure. Validation rejects missing or malformed environment
texture/probe refs, invalid budgets/fades/filters, over-budget hard-error light
policies, and explicitly deferred advanced renderer requests before runtime. Web
and Bevy conformance reports now expose matching observations through
`packages/ir/fixtures/conformance/rendering-lights/game.bundle`, and
`pnpm verify:v9:rendering-lights` writes evidence under
`tools/verify/artifacts/rendering-lights/`, including web/native/diff/contact-sheet
screenshots plus sampled skybox, reflection-probe, point-shadow PCF, dense/HLOD,
and debug-gizmo regions. Depth-of-field runtime config is preserved in matching
web/native reports as a report-level boundary; screenshot-calibrated visual blur
remains deferred. Visual FXAA/TAA/SMAA, deferred rendering, motion vectors,
screen-space reflections, volumetrics, virtual geometry, custom post passes,
compressed skybox formats, and broader editor debug overlay systems remain
deferred until separately proven.

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
  `tools/verify/artifacts/milestones/v4/web-effects.json`, `native-effects.json`, and
  `effects-diff.json`.
- V4 fixture-backed scripting evidence covers rotation, movement,
  spawn/despawn, event handoff, `physics.raycast`, and `animation.play`; it
  passes web visual verification with expected motion, writes a web
  patch/event/command/service effect-log artifact, and captures a native Bevy
  frame artifact at `tools/verify/artifacts/milestones/v4/native-bevy-frame-01.png`.
- Legacy V4 scripting template scaffolding has been removed from current
  project creation paths; V4 behavior remains historical example/gate evidence
  until those gates are retargeted.

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
inspectable native summary at `packages/ir/artifacts/conformance/basic-scene/bevy.report.json`.
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
under `tools/verify/artifacts/procedural-mesh/`. This promotes static procedural mesh
authoring only; runtime deformation, CSG, chunk streaming, and shader/storage
buffer procedural geometry remain future work.

The stylized nature component slice promotes a bounded source-authored scenic
effect surface: SDK helpers emit `StylizedNature`, `RippleWater`, and
`StylizedSparkles` components, the shared authoring registry exposes matching
scene operations, and web/Bevy runtime adapters map those components into
portable terrain, foliage, water, and sparkle visuals with deterministic motion.
This is a curated component slice, not a general custom shader or arbitrary
post-processing contract.
Native capture now waits for recursive glTF scene dependencies before advancing
visual frames, so Bevy proof screenshots do not race material/texture loads.
The source-backed stylized grass path also uses the same seeded placement and
authored grass color policy in web and Bevy. The
`examples/stylized-nature-component` example is retained as a structured-source
scene driven by `threenative.config.json` and `content/**`; durable comparison
evidence should live under verifier-owned artifacts or structured fixtures, not
beside the example source.
Residual stylized drift remains around native path embellishment and renderer
lighting/shadow treatment, so this evidence is a parity checkpoint rather than
a pixel-close release baseline.

V5-06 has landed the textured standard-material parity slice: supported material
texture slots now serialize through SDK/compiler output, validate against
texture assets and target formats, appear in shared conformance fixtures and
observations, map to Three.js material texture slots, and map to Bevy
`StandardMaterial` image handles for native regression coverage. The
maintained V5 fixture bundles validate and visually verify with bundle-local
textured environment assets.
WebP texture assets are now accepted alongside PNG/JPEG through SDK asset refs,
IR/schema validation, compiler/environment asset inference, target profile
validation, web texture loading, and Bevy `AssetServer` texture loading.

Post-V7 material gap closure has started on the high-value transparency slice:
`MeshStandardMaterial` now carries authored `alphaMode` (`opaque`, `mask`,
`blend`), `opacity`, and `alphaCutoff`; compiler emission serializes non-default
alpha metadata; IR validation rejects invalid alpha values with stable material
diagnostics; web maps alpha to Three.js material transparency and alpha-test
fields; Bevy maps alpha to `StandardMaterial` `AlphaMode` and base-color alpha;
and web/native material conformance reports preserve the promoted alpha
metadata. Renderer-level transparency sorting and richer blend operations remain
partially promoted: portable `blendMode`, `renderOrder`, and depth policy now
validate and map in web with Bevy observations/diagnostics, but only `normal`
blend is natively supported today.

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
texture maps are now promoted through SDK/IR validation, compiler emission,
web physical material mapping, and conformance observations; Bevy preserves the
IR slot and reports it even though `StandardMaterial` has no native specular
texture field in Bevy 0.14.

Post-V7 texture-control coverage now promotes portable texture asset sampler and
UV transform metadata: `textureAsset` accepts wrap, min/mag filter, repeat,
offset, center, and rotation options; compiler emission preserves those fields
in `assets.manifest.json`; IR/schema validation allows the promoted metadata;
web maps it to Three.js texture wrapping, filtering, and transform properties;
Bevy now applies sampler wrap/filter controls on loaded images and maps
repeat/offset/center/rotation through `StandardMaterial.uv_transform`, with
focused material-parity screenshot evidence under
`tools/verify/artifacts/material-parity/`.

V8-07 material parity now promotes transparency policy fields (`blendMode`,
`renderOrder`, `depthWrite`, `depthTest`), `specularTexture`, constrained
extended material presets (`unlitMasked`, `foliage`), and the
shared rendering residual fixture. SDK/IR/compiler/web/Bevy/conformance
coverage validates and reports the new fields; Bevy emits stable diagnostics for
unsupported native blend modes beyond `normal`; raw shader payloads remain
rejected; and `pnpm verify:v8:material-parity` aggregates IR/compiler tests,
`pnpm verify:conformance`, and web/native screenshot evidence.

The V10 shader-diagnostics pass tightens that rejection path for unsupported
shader features without promoting custom shaders. Material-owned `shader`,
`vertexShader`, `fragmentShader`, `nodeGraph`, `shaderDefs`, storage-buffer,
render-phase, bindless, and material postprocess requests now fail validation
with stable `TN_IR_SHADER_*_UNSUPPORTED` diagnostics. Each diagnostic includes
the path, `error` severity, and promotion criteria requiring a constrained
portable shader model, deterministic web/native resource binding, rejected
fixtures, and visual evidence before support can be promoted.

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

V8-13 has a narrow advanced renderer feature-gate slice: authored volumetrics,
atmospheric scattering/fog, deferred rendering, SSR/GI/lightmaps, storage
buffers, and raw render phases are rejected through the
`TN_IR_ADVANCED_RENDERER_*` diagnostic family instead of being silently ignored.
The gate is contract/diagnostic-only for now; promotion requires portable
SDK/IR/runtime semantics plus web and Bevy verification evidence.

V9-07 is now the implemented engine quality-control hardening slice. Run the
aggregate gate with:

```bash
pnpm verify:v9
```

`pnpm check:quality:v9` guards PRD/script/fixture/sample/docs drift.
`pnpm verify:v9` orchestrates focused V9-01..V9-04 gates, shared conformance,
TypeScript-authored sample scenes under `examples/v9-*`, the visual matrix under
`tools/verify/artifacts/visual-matrix/`, and writes the aggregate report to
`tools/verify/artifacts/release/verification-report.json`.

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
arbitrary CSS track strings are diagnostic-only with
`TN_IR_UI_LAYOUT_GRID_ADVANCED_UNSUPPORTED` until matching web/native layout
evidence exists.

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
Letter spacing, generic/system font family fallback, OpenType font variation
settings, and font stretch remain outside the portable text contract and now
fail with stable diagnostics (`TN_IR_UI_TYPOGRAPHY_UNSUPPORTED` or
`TN_IR_UI_FONT_FAMILY_UNSUPPORTED`). Portable font families must be declared in
`ui.fonts` and referenced by family id.

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
V9-05 Phase 4 adds promoted image metadata for atlas rects, 9-slice insets,
scale mode, horizontal/vertical flip, tile size, tint, and source pixel size.
The IR validator reports stable diagnostics for invalid image metadata,
incompatible 9-slice/tile modes, atlas bounds, and non-overlapping 9-slice
constraints; the web DOM overlay exposes deterministic atlas/9-slice/tile/flip
observations and CSS mapping where the browser can render them, while Bevy
preserves the same metadata on `NativeUiImageMetadata` for native mapping.
Renderer-native 9-slice and tiled image rendering remain future polish.

Basic UI accessibility semantics are now promoted for common HUD/menu controls.
UI nodes accept portable `role` and `accessibilityLabel` metadata, validation
rejects invalid roles, missing accessible names for image/button/bar/focusable
controls, unnamed explicit progressbars, and malformed list/listitem structure,
bundle capabilities report `ui:accessibility` with label/role granularity, the
web DOM overlay maps metadata to ARIA roles and labels, web/native conformance
reports preserve the fields, and the Bevy UI adapter inserts AccessKit
`AccessibilityNode` components. V9-05 Phase 5 adds a target-oriented retained UI
accessibility audit with stable repair hints, plus web/native UI debug reports
that expose node IDs, roles, accessible names, focus index, bounds, clipping,
z-index, disabled state, action binding, image source, font/widget state, and
gizmo observations. The `pnpm verify:v9:input-ui-accessibility` gate writes the
combined evidence under `tools/verify/artifacts/input-ui-accessibility/`. Focus narration
and manually inspected target accessibility audits remain future work.

V5-07 has landed the lighting, atmosphere, shadow, and color parity-evidence
slice: shared fixtures now cover visible/hidden meshes plus ranged point and
spot lights, SDK/compiler output preserves point-light range and spot-light
range/angle, web and Bevy map those fields with runtime-normalized conformance
observations, and atmosphere observations expose promoted fog, sky, color
management, and shadow fields. Native fog/sky/color rendering remains
target-drift rather than full visual parity, but the promoted fields are now
validated, observable, and exercised by the maintained V5 fixture set. The
`v5-drift-surface` fixture now also reports web and Bevy runtime orthographic
camera projection observations for the active camera.

V5-08 has landed the dense content, LOD metadata, and budget-evidence slice:
environment source assets now carry validated bounded LOD metadata, compiler
emission copies LOD target models without treating them as extra source assets,
web performance reports expose source asset, instance, group, draw, triangle,
texture, texture-byte, and bundle-byte estimates, and Bevy observations
distinguish repeated model-backed groups from placeholders. The
maintained V5 fixture set now exercises repeated grass scatter, source asset
LOD metadata, and environment-asset budget reports.

V5-09 has landed the maintained visual-quality fixture gate: V5 fixture bundles
cover promoted visual contracts, and `pnpm verify:v5` validates and visually
verifies them in web, writes dense-content budget evidence under
`tools/verify/artifacts/milestones/v5`, and records artifact links in
`tools/verify/artifacts/milestones/v5/verification-report.json`. This is the
current V5 visual scene gate, not the final aggregate release gate planned for
V5-10.

V5-11 has landed the game-authoring ergonomics slice: `defineGame`,
`defineControls`, `definePrefab`, `primitiveActorPrefab`, and
`modelActorPrefab` are exported from `@threenative/sdk` as authoring sugar over
existing bundle root, scene, world, input, mesh, ECS component, and model asset
metadata shapes. Current scaffold proof uses `structured-source-starter`;
`pnpm verify:v5` creates, builds, and validates that structured starter under
`tools/verify/artifacts/milestones/v5/starter-smoke`. This does not add a new runtime contract, editor
workflow, networking, raw Three.js compatibility, plugin API, custom renderer
support, or runtime model loading.

V5-10 has landed the aggregate V5 release gate: `pnpm verify:v5` now produces a
schema/versioned machine-readable report with ordered steps, diagnostics,
startedAt/durationMs, first-failing-step diagnostics, conformance artifacts,
Rust native test evidence at `tools/verify/artifacts/milestones/v5/rust-test-report.json`, visual scene
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
SDK ergonomics, structured-source starter proof, stable diagnostics, and release
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
`resources-events` fixture, and `pnpm verify:conformance` writes a native
V6 observation artifact at
`packages/ir/artifacts/conformance/resources-events/bevy.report.json`. The same fixture
now runs an executable fixed trace in web and native, compares canonical event
and resource effect logs, and writes
`packages/ir/artifacts/conformance/resources-events/web-effects.json`,
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
`stay`, `exit`) for fixed traces, and the shared `physics-events` fixture
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
retargeting/particle fields, and the `animation-clips` conformance fixture
tracks the contract. The fixture now also runs a fixed web/native
`animation.play` service trace and both web and Bevy conformance observations
report model clip metadata. Real model animation mixer/AnimationPlayer visual
playback, stop/state queries, and graph behavior remain later work.

V6-06 has started with the retained UI contract and observation layer: duplicate
UI node IDs are rejected, the `retained-ui` conformance fixture carries HUD
text, a resource-bound bar, and a focusable action button, and web/Bevy
conformance reports now expose the portable UI tree. The web runtime now mounts
that retained tree as a DOM overlay whose resource bindings update with the
game loop and whose button/touch clicks enqueue UI actions. The Bevy runtime now
spawns retained UI entities with stable `ThreeNativeId` metadata, hierarchy,
buttons, bars, and text. Native click-to-event delivery is now covered by a
Bevy UI action queue that records `Interaction::Pressed` on buttons and touch
controls. Broader focus heuristics and advanced widgets remain later UI work.

V6-07 has started with bundle-local audio playback evidence: the shared
`audio-playback` conformance fixture declares local OGG/WAV assets,
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

V6-09 has started with fixture-backed functional evidence and the initial
aggregate gate: maintained conformance bundles combine V6 ECS resources, events,
startup/update systems, primitive physics, a character controller, animation
clip metadata, retained UI, input, audio, and runtime config. `pnpm verify:v6`
now runs the V6 docs gate, V6 gate-script tests, CLI build, fixture
build/validation, web visual smoke verification, and shared conformance, then
writes `tools/verify/artifacts/milestones/v6/verification-report.json`. Web
screenshots and the web effect log are mirrored under
`tools/verify/artifacts/milestones/v6/web-visual/`, and the aggregate report marks
`visualEvidenceStatus` as `web-captured` when that smoke passes. Native frame
capture, richer playable traces, and final visual parity observations remain
later V6-09 work before the scene can serve as final visual parity evidence.

V7 is now planned as the deep engine gap-closure milestone. It should continue
parity work that is too large or risky for V6, such as deeper physics,
animation graphs, richer UI/audio, renderer/content parity, scripting/runtime
determinism, packaging, and performance gaps. Remaining gaps should be
explicitly deferred or marked never portable with stable diagnostics.

The V7 ticket slice is tracked in [V7 PRDs](PRDs/v7/README.md). V7 starts from
the [post-V6 gap triage](status/feature-maturity.md#post-v6-gap-triage) table and
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
`advanced-physics-character` conformance fixture and fixed web/native trace
for primitive overlap and swept box shape-cast queries with portable collider
layer filters, writing web/native effect logs and a diff under
`packages/ir/artifacts/conformance/advanced-physics-character`. The fixture now carries
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
capability manifest derivation, and `animation-graphs-particles`
conformance fixture cover the accepted portable shape, while IK, retargeting,
engine-specific controllers, and unbounded particle behavior remain rejected or
unsupported. `pnpm verify:conformance` now compares a fixed web/native V7
animation trace for parameter-driven graph transitions, active clip
selection, queued animation event payloads, and bounded particle spawn counts,
writing web/native trace artifacts and a diff under
`packages/ir/artifacts/conformance/animation-graphs-particles`. Full visual mixer
playback, stop/state query APIs, richer event scheduling, and rendered particle
systems remain later V7 work.

V7-04 has landed the first rich UI navigation parity slice: `ui.ir.json` now
accepts portable `focusOrder`, per-node `navigation` links, `safeArea`
metadata, and UI `inputActions`, with validation for duplicate or invalid focus
targets, bad navigation links, invalid safe-area edges, and malformed action
refs. The `rich-ui-navigation` conformance fixture covers a small menu, and
`pnpm verify:conformance` compares a fixed web/native Tab focus and activation
trace under `packages/ir/artifacts/conformance/rich-ui-navigation`. The web DOM overlay
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
native Bevy observation path, and `spatial-audio-buses` conformance fixture
preserve the deterministic routed/spatial command shape. `pnpm
verify:conformance` now compares a fixed web/native audio lifecycle trace for
loop start/stop cleanup and writes web/native trace artifacts and a diff under
`packages/ir/artifacts/conformance/spatial-audio-buses`. Real spatial attenuation, mixer
effects, streaming/network audio, and platform audio handles remain unsupported
or later work.

V7-06 has landed the first renderer/dense-content parity evidence slice: the
`renderer-dense-content` conformance fixture carries bounded environment LOD
metadata, imported transform edge cases, and repeated model-backed scatter
instances. The IR validator now rejects backend-specific renderer/content
fields such as ad hoc post-processing, native instancing flags, and material
overrides with `TN_IR_ENVIRONMENT_FIELD_UNSUPPORTED`. `pnpm
verify:conformance` compares a fixed web/native environment content trace for
runtime LOD selection and instancing observations, writing web/native trace
artifacts and a diff under `packages/ir/artifacts/conformance/renderer-dense-content`.
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
`scripting-lifecycle` fixture runs a script-heavy multi-schedule trace
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
offset/limit windows, fixed-trace changed-component filters backed by
structured change metadata, and hidden runtime changed-query diffing from
schedule-stage component snapshots when explicit metadata is absent. The
`runtime-query-diffing` fixture and `pnpm verify:runtime-query-diffing` compare
web and Bevy changed-query results after command-buffer mutation and before
ordering/pagination windows. The `ui-persistence-settings-facades` fixture and
`pnpm verify:ui-persistence-settings-facades` compare bounded `ctx.ui`,
`ctx.persistence`, and `ctx.settings` behavior over retained UI and local-data
IR without exposing DOM, filesystem, cloud, or platform handles. The
`runtime-prefabs-hierarchy` fixture and `pnpm verify:runtime-prefabs-hierarchy`
compare bundle-local prefab instantiation, deterministic instance prefixes, and
`setParent`/`clearParent` hierarchy mutation across web and Bevy. Systems can
now declare same-stage
`before`/`after` ordering constraints; SDK/IR/compiler, web, and Bevy QuickJS
resolve them with deterministic topological ordering and system-name tie
breaks, while validation rejects missing, cross-stage, self-referential, and
cyclic constraints.
It also records portable plugin/plugin-group composition metadata in the shared
trace without exposing renderer or native runtime extension points.
`pnpm verify:conformance`
compares the canonical
web/native effect logs and writes artifacts under
`packages/ir/artifacts/conformance/scripting-lifecycle`. Follow-up focused runtime tests
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
`tools/verify/artifacts/milestones/v7/packaging` and fails with stable `TN_PACKAGE_*` /
`TN_VERIFY_V7_*` diagnostics for unsupported targets or broken artifact checks.
Signed installers, mobile app stores, online publishing, and hosted services
remain out of V7 scope.

The package target-profile path now preserves a specific
`TN_PACKAGE_TARGET_PROFILE_UNSUPPORTED` diagnostic when a bundle profile cannot
produce a desktop package. The Bevy catalog residual registry also exposes
`TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED` for web, offline, native, and
package outputs, with web and Bevy report helpers preserving the output target,
profile path, and authored target value.

The Bevy catalog residual pass now makes glTF metadata-transform import policy
explicit: `AnimationGraph` metadata transforms are the promoted schema-backed
path, while executable/custom processors and unknown metadata transforms produce
stable diagnostics. Web and Bevy residual reports preserve the same
`gltf-metadata-transform` policy shape for the promoted path.

V7-09 has landed the first target-profile-aware performance evidence slice: the
`performance-budgets` conformance fixture declares frame, load, draw,
instance, entity, texture, triangle, and package-size thresholds in
`target.profile.json`. `scripts/verify-performance-budgets.mjs` writes fixed
web and Bevy-style metric reports plus a comparison report under
`packages/ir/artifacts/conformance/performance-budgets`, and `pnpm verify:v7` mirrors the
current performance evidence under `tools/verify/artifacts/milestones/v7/performance`. Budget failures
use `TN_PERF_*` diagnostics with metric, measured value, threshold, and artifact
path fields. These reports are deterministic budget evidence, not live browser
or native profiler captures; richer frame capture and platform profilers remain
later work.

V7-10 landed the first maintained functional V7 fixture slice: fixture bundles
keep placeholder model/audio assets local and combine the currently
SDK-authored V7-facing gameplay surface: primitive 3D scene content, physics
colliders, a character controller declaration, input, retained UI, audio,
resources/events, scripted event writes, and `animation.play` service effects.
`pnpm verify:v7` now validates the fixture, captures web visual artifacts,
packages its desktop bundle under
`tools/verify/artifacts/milestones/v7/functional-package`, and
create/build/validates the structured-source template under
`tools/verify/artifacts/milestones/v7/template-smoke/structured-source-starter`.
Deeper V7 feature parity is
still proven by the focused conformance fixtures rather than by direct SDK
authoring for every promoted IR shape.

V7-11 has landed the aggregate release gate and docs consistency slice:
`pnpm verify:v7` now runs the V7 docs gate, docs/gate script tests, selected
TypeScript checks, conformance, the functional scene/template smoke, Bevy
workspace tests, desktop packaging checks, performance reports, diagnostics
checks, and final artifact presence checks. The gate writes
`tools/verify/artifacts/milestones/v7/verification-report.json` with links to docs/diagnostics inputs,
rendered web evidence, packaged desktop artifacts, template smoke output,
`packages/ir/artifacts/conformance/verification-report.json`,
`tools/verify/artifacts/milestones/v7/rust-test-report.json`, packaging, and performance reports. V7 is
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
The editor snapshot bridge now also classifies documents as `source`,
`generated`, `runtime`, or `derived`, with explicit access policies. Generated
bundle documents are inspectable-only, runtime documents stay runtime-only, and
kind-transition validation rejects silently promoting generated or runtime state
into persisted source without an explicit source bridge.
Structured editor source patches are now part of the IR editor contract. Patches
carry stable patch/declaration IDs, durable source document paths, JSON pointer
targets, operations, values, and reload policies; validation rejects generated
bundle/cache paths, runtime handles, computed transform data, and generated
script code so editor persistence routes through source-owned documents.
Live preview edits are classified deterministically as source-persistable,
runtime-only, full-reload-required, or rejected. When authoring provenance is
present, generated/IR entities can map back to source module paths and
declaration IDs for patch creation; unsupported live edit cases are documented
in `docs/contracts/editor-snapshot-source-bridge.md`.

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
`picking.mesh`. V9-05 Phase 2 adds a promoted drag-picking metadata/schema
slice, deterministic drag phases (`dragStart`, `dragMove`, `dragEnter`,
`dragLeave`, `drop`, `dragCancel`, and `dragEnd`), UI-over-mesh ordering with
`pointerEvents: "pass-through"`, web/native recognizer tests, and structured
picking overlay observations for rays, target bounds, capture owner, hovered
target, drag path, event log, and observed pointer devices. Basic UI Tab/arrow
keyboard navigation now works through the web DOM overlay and matching web/native
fixed traces, and basic UI control picking now dispatches portable action events
from web clicks and Bevy button/touch interactions. Touch platform event stream
wiring and richer navigation diagnostics remain future input work.

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
payloads. Authored richer gesture recognizer declarations and binding-level
long-press, rotate, chord, combo, hold, double-tap, or sequence options are
diagnostic-only with `TN_IR_INPUT_GESTURE_UNSUPPORTED`; direct platform event
stream wiring remains future input work.

The input/UI polish fixture now carries broad interaction coverage evidence for
the promoted touch/gamepad UI scope. Web and Bevy reports include matching
`interactionCoverage` rows for focus movement, activation, directional
menu-style navigation, scroll observations, and combined touch-stream plus
gamepad capability reporting.

Advanced lighting and material-depth fields are now locked as explicit
diagnostic-only boundaries. IR validation rejects spherical/area light kinds,
lightmap and mixed-lighting material fields, parallax/depth map fields,
anisotropy, specular tint/color, sheen, and iridescence with stable
`TN_IR_LIGHT_ADVANCED_UNSUPPORTED`, `TN_IR_MATERIAL_LIGHTMAP_UNSUPPORTED`,
`TN_IR_MATERIAL_PARALLAX_UNSUPPORTED`, or
`TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED` diagnostics. The promoted material
surface remains normal/occlusion/specular/clearcoat/transmission texture slots
and scalar factors with report-backed web/native behavior.

Input rebinding now has matching deterministic helpers in web and Bevy. The
helpers clone an `input.ir.json` map, replace an action binding or axis slot, and
return stable diagnostics for missing actions/axes, invalid binding indexes,
duplicate bindings, and required gamepad bindings that should remain optional
for portable projects. V9-05 Phase 1 adds controls settings metadata for
retained UI rebind rows, persisted logical binding override records with
deterministic sorting and validation, web local storage helpers, and Bevy local
JSON reload/apply before the first input snapshot. Full visual settings-screen
UX polish, broader local settings APIs, and richer repair-oriented device
overlays remain future work.

Playable game authoring hardening now makes keyboard binding spelling explicit
before runtime. Structured source accepts transitional aliases such as
`keyboard.w` and `keyboard.arrow-up` but emits
`TN_INPUT_KEYBOARD_CODE_NORMALIZED` warnings with source JSON pointers, while
the compiler lowers them to canonical `KeyboardEvent.code` values such as
`KeyW` and `ArrowUp`. Emitted `input.ir.json` is strict: action bindings, axis
bindings, controls-setting defaults, and persisted keyboard overrides reject
unknown or non-canonical codes with `TN_INPUT_KEYBOARD_CODE_INVALID`. The input
binding contract is documented in `docs/contracts/input.md`, and the structured
starter now ships canonical keyboard controls by default.

The same hardening slice adds a web-runtime `tn playtest` proof command for
small playable games. It builds the project, starts a web preview, injects a
canonical keyboard code, samples target-entity `Transform` patches from the web
effect log, reports before/after positions and movement distance, and writes a
project-local screenshot artifact under `examples/<name>/artifacts/playtest/`.
`examples/racing-kit-rally` was reset to source plus preserved assets and now
passes `tn playtest --project examples/racing-kit-rally --entity player.car
--press KeyW --frames 60 --expect-moved --json` with nonzero player movement.
Native/Bevy playtest injection remains pending and is explicitly documented as
web-only in `docs/workflows/playtest-proof.md`.

The retained UI style surface now accepts portable `shadow` and linear
`gradient` metadata with validation and capability flags. The web DOM overlay
renders those as CSS `box-shadow` and `linear-gradient`; Bevy currently preserves
the metadata in `NativeUiStyle` for native mapping, but native visual rendering
of shadows/gradients remains incomplete.

Common rich-text styling has also moved one step forward: UI style now accepts
portable `fontWeight` (`normal`/`bold`) and `textDecoration`
(`none`/`underline`/`lineThrough`) metadata. The web DOM overlay renders these
through CSS font weight and text decoration, while Bevy preserves the metadata
for future native text rendering. V9-05 Phase 3 adds bundle-local `ui.fonts`
declarations plus rich inline text spans with per-span color, font family, font
size, weight, italic, decoration, and accessibility text overrides. Web maps
spans to DOM children with CSS text styles; Bevy maps spans to native
`TextSection`s and font handles when an `AssetServer` is available, and emits
stable diagnostics for unsupported native text weight, italic, and decoration
rendering instead of silently dropping those requests.

V9-05 Phase 4 also promotes retained `Slider`, `Scrollbar`, and `ContextMenu`
nodes through SDK/UI authoring types, IR validation, compiler capability tags,
web DOM overlay widgets, and Bevy UI components. Slider and scrollbar inputs
dispatch value-bearing portable UI action events through the existing action
queue, context-menu items dispatch regular button actions, disabled items are
suppressed, and unsupported virtual keyboard requests fail with a stable SDK
diagnostic instead of being silently ignored.

V9-05 now also promotes retained `textInput` widgets across the portable UI
contract. Source/CLI UI documents accept `textInput` nodes with actions, IR
validation treats them as focusable widgets, compiler capability reports expose
`widget.textInput`, the web DOM overlay dispatches ordered string value events,
and the Bevy runtime preserves native text input widget state plus queued
value/action events. IME composition support remains an explicit diagnostic
boundary when the target cannot support it.

V9-05 Phase 5 adds retained UI debug reports and gate artifacts for promoted
input/UI/accessibility parity. Web reports are generated from rendered UI trees,
native reports preserve AccessKit-facing role/name/disabled/widget state from
`ui.ir.json`, and the V9 gate now rejects missing accessibility repair hints,
missing debug reports, and missing picking overlay evidence before release.

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

V9-06 Phase 1 has landed a focused audio support slice. `audio.ir.json` now
accepts bounded `linear` / `inverse` / `exponential` attenuation metadata,
listener bindings to the active camera or an entity, routed bus gain/mute/solo
and parent metadata, one portable ducking rule shape, pitch scalars, generated
`sine` / `square` / `noise` tone descriptors, and state-driven music transition
rules with deterministic playback ids. The SDK captures those declarations, the
compiler emits stable audio JSON, web and Bevy expose matching deterministic
support observations for listener movement attenuation, ducking, tones, and
music transitions, and IR diagnostics now reject streaming/network audio,
platform-native handles, decoder plugins, and unsupported effect chains with
specific `TN_IR_AUDIO_*` codes. This is still deterministic observation support,
not a claim of full live mixer/effects/audio-device parity.

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
through `packages/ir/fixtures/conformance/animation-blending/game.bundle`, web
motion screenshots, and native Bevy dual-frame capture evidence under
`tools/verify/artifacts/skeletal-animation/`.
V8 transform animation also has exact trace parity for authored entity
position/rotation/scale tracks through `pnpm verify:v8:animation-transform`,
plus declared `animation.query` / `animation.stop` command-shape/service-payload
parity through `pnpm verify:v8:animation-controls`. V9-01 promotes stateful
`animation.play/query/stop` runtime state through
`pnpm verify:v9:animation-state`, bounded crossfade state through
`pnpm verify:v9:animation-blending`, and rendered bounded CPU particle
emitters through `pnpm verify:v9:animation-particles`; evidence is written
under `tools/verify/artifacts/animation-state/`, `tools/verify/artifacts/animation-blending/`,
and `tools/verify/artifacts/animation-particles/`. Animation masks/layers, morph-target
animation, retargeting, IK, UI/property animation, arbitrary blend trees, and
GPU/external-shader particle systems remain deferred with explicit diagnostics.

V9-06 local data now has a schema-backed Phase 2 slice: SDK persistence
declarations lower through the compiler into `local-data.ir.json`, bundle
manifests carry the optional local-data entry, IR validation rejects non-portable
runtime/native/renderer/platform handles and missing migration metadata, the web
runtime exposes deterministic save-slot/settings helpers that restore only
declared resources/components, and Bevy loads the local-data document and reports
native migration diagnostics for missing or forward-incompatible save versions.
This proves local-only save/settings contracts and autosave checkpoint metadata;
durable platform storage backends and cloud/account-bound saves remain later
work.

Post-V10 persistence/reload now promotes the durable native slice through
`pnpm verify:persistence-reload`: the `persistence-reload` conformance fixture
emits matching web and Bevy reports for declared resource/component save
records, native JSON storage policy, settings persistence, autosave checkpoint
restore, forward-incompatible migration diagnostics, and state-preserving reload
classification. The gate writes `web-report.json`, `native-report.json`,
`diff.json`, `contact-sheet.png`, and `verification-report.json` under
`tools/verify/artifacts/persistence-reload/` and is part of release
verification. Cloud/account-bound save storage and arbitrary portable
filesystem/worker/timer/platform APIs remain diagnostic-only boundaries.

V9-06 diagnostics/debug draw now has a Phase 3 evidence slice:
`packages/sdk/src/debug.ts` captures lines, rays, bounds, spheres, boxes, labels,
transform axes, camera frustums, light volumes, UI node rectangles, FPS overlay
settings, custom counters, platform-audio diagnostics, unsupported-feature
diagnostics, and unsupported-networking diagnostics. `runtimeDiagnostics`
validates report shape and emits stable networking/feature rejection diagnostics,
web exposes a deterministic debug overlay model for FPS/counters/diagnostic
rows and draw primitives, Bevy exposes a matching native debug overlay
observation report, and `pnpm verify:v9:diagnostics-support` writes the focused
artifact set under `tools/verify/artifacts/diagnostics-support/`. Runtime networking
services remain explicitly out of scope.

The V10 debug-draw pass promotes that gameplay helper catalog with sequential
visual evidence. The SDK test now covers all promoted primitive helpers, web and
native overlay tests preserve deterministic primitive ordering, and `pnpm
verify:v10:debug-draw` writes matching web/native trace JSON, three sequential
PNG frame pairs, a contact sheet, and zero-drift comparison metrics under
`tools/verify/artifacts/debug-draw/`. This remains a bounded overlay/report helper path,
not a claim of arbitrary live engine-integrated debug rendering.

V9-06 editor tooling now has a Phase 4 slice on top of the V8 structured editor
track: `tn editor inspect` emits deterministic hierarchy, editable property
paths, asset references, diagnostics, and hot-reload policy metadata from bundle
JSON; `tn editor set` applies a single JSON-pointer edit through the same
structured bundle documents and validates the temp bundle before writing;
`editorProject` rejects runtime-only property edits; the web runtime exposes
local inspector panel models for hierarchy, properties, scene viewer, asset
preview, and gamepad viewer, with connected browser gamepad device inspection
added to the editor shell; editor gizmo overlays compose existing
debug/editor-only line geometry for transforms, lights, bounds, cameras, and UI
nodes; and `pnpm verify:v9:editor-support` writes the focused inspector,
structured-diff, panel, scene-viewer, asset-preview, and gamepad-viewer evidence
under `tools/verify/artifacts/editor-support/`. A full visual editor app and
state-preserving hot reload remain later work.

V9-06 target profiles and stress/profiler evidence now have a Phase 5 slice:
performance profiles can declare support target categories, required
capabilities, repair hints, and profiler metadata for local data, audio,
desktop web/native, diagnostics overlays, and local editor support. The CLI has
a stable package repair-hint diagnostic shape, web performance summaries can
carry support metrics for audio voices, debug draw, local-data slots, UI nodes,
save latency, and memory estimate, and native conformance reports now include a
deterministic support profiler summary plus a GPU timing unavailable warning
when that capability is not present. `pnpm verify:v9:stress-support` writes the
focused large-scene metrics, profiler summary, and repair-hint artifacts under
`tools/verify/artifacts/stress-support/`. This does not claim full live browser or native
platform profiler capture parity.

Post-V10 production hardening now has focused release evidence through
`pnpm verify:production-hardening`. The `production-hardening` conformance
fixture declares mixer buses, bounded gain/ducking effect behavior, UI-triggered
audio, device routing diagnostics, profiler metadata, GPU timing unavailable
state, debug-render overlay primitives, and signed/mobile package preflight
metadata. The gate compares matching web and Bevy production reports, runs
`tn package --preflight --target mobile`, writes `web-report.json`,
`native-report.json`, `package-preflight.json`, `diff.json`, `contact-sheet.png`,
and `verification-report.json` under
`tools/verify/artifacts/production-hardening/`, and is part of release
verification. Raw native audio handles, custom executable decoders,
streaming/network audio, online services, and signed artifact generation without
release credentials remain diagnostic-only or external release boundaries.

Post-V10 runtime gameplay host semantics now have focused release evidence
through `pnpm verify:runtime-gameplay-host`. The `runtime-gameplay-host`
conformance fixture declares live rendered gameplay entity spawn/despawn,
event-window policy, state handoff, command-time/removal hook ordering,
system-local state evidence, stoppable observer propagation, and bounded
timer/channel semantics. The gate validates the fixture, compares matching web
and Bevy reports, writes `web-report.json`, `native-report.json`, `diff.json`,
and `verification-report.json` under
`tools/verify/artifacts/runtime-gameplay-host/`, and is part of release
verification. Dynamic runtime plugin loading, raw Bevy/renderer handles,
arbitrary workers, unbounded promises, and arbitrary timer/platform APIs remain
stable diagnostic boundaries rather than portable gameplay APIs.

V9-06 aggregate support gate evidence now ties the support slices together.
`packages/ir/fixtures/conformance/support-stress/game.bundle` anchors the large
support fixture, `check:docs:v9` guards the PRD/status/parity support claims and
explicit deferrals, `pnpm verify:v9:support` runs the audio, local-data,
diagnostics, editor, stress, and shared conformance checks, and the aggregate
report is written to `tools/verify/artifacts/support/verification-report.json`.
Cloud save, streaming/network audio, runtime networking, signed installers,
online publishing, collaboration, raw Three.js authoring, and direct Bevy
authoring remain explicitly deferred.

## V3 Proves

The V3 evidence loop is `pnpm verify:v3`, which regenerates the environment
bundle, web screenshots, Bevy GLTF smoke captures, and side-by-side contact
sheet under `tools/verify/artifacts/milestones/v3`.

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
- asserted V3 lighting/color bounds for the forest screenshots, including the
  terrain vertex-color linearization path that keeps Bevy ground color aligned
  with the Three.js dark olive terrain
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
- [Bevy Feature Parity Drift](bevy-feature-parity.md)
- [Feature Maturity Matrix](status/feature-maturity.md)
- [verify:v7](verification/verify-v7.md)
- [verify:v6](verification/verify-v6.md)
- [verify:v4](verification/verify-v4.md)
- [verify:v5](verification/verify-v5.md)
- [verify:v3](verification/verify-v3.md)
- [Coordinate, Units, Rotation, and Color Conventions](conventions.md)

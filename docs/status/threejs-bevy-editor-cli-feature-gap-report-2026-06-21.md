# Three.js x Bevy x Editor x CLI Feature Integration Gap Report

Date: 2026-06-21

## Resolution Notes

- ✅ 2026-06-21: The shared `AUTHORING_OPERATION_REGISTRY` now includes the
  existing structured CLI/editor mutation operations for input, material, mesh,
  prefab, scene components/resources/UI nodes, systems, and UI text/document
  creation, reducing operation-registry drift.
- ✅ 2026-06-21: Asset source mutation now has `tn asset add <asset-id> --type
  <model|texture|audio|mesh> --path <source-path> --json` plus registry-backed
  `asset.add`, writing `content/assets/*.assets.json`.
- ✅ 2026-06-21: Audio source mutation now has `tn audio create <audio-doc-id>`
  and `tn audio add-sound <audio-doc-id> <sound-id> --asset ... --json` plus
  registry-backed `audio.create` and `audio.add_sound`, writing
  `content/audio/*.audio.json`.
- ✅ 2026-06-21: Typed ECS component mutation now has `tn scene add-component`
  for `camera`, `light`, `mesh-renderer`, `rigid-body`, `collider`, and
  `character-controller`, plus registry-backed `scene.set_*` operations and
  source validators for the corresponding component payloads. Promoted Light
  fields are editor-editable through `scene.set_light`; broader custom
  component inspector controls remain partial.
- ✅ 2026-06-21: Material texture/PBR mutation now extends `tn material set`,
  registry-backed `material.set`, source validation, bundle import recovery,
  and editor material rows for promoted fields: metalness, emissive,
  emissiveIntensity, alphaMode/alphaCutoff/opacity, base-color/normal/
  metallic-roughness/emissive/occlusion texture slots, clearcoat, clearcoat roughness,
  clearcoat maps, transmission, and transmission maps. Sampler/import policy
  remains a separate material source gap.
- ✅ 2026-06-21: Input axis mutation now has `tn input add-axis <input-doc-id>
  <axis-id> --negative-keys ... --positive-keys ... --json`, registry-backed
  `input.add_axis`, source validation for axis bindings, recoverable bundle
  import for `input.ir.json` axes, and editor rows for negative/positive/value
  axis fields. Controls-settings/rebinding rows and touch/gamepad gesture
  commands remain separate input source gaps.
- ✅ 2026-06-21: Scene lifecycle source mutation now has
  `tn scene lifecycle add <scene-id> --kind ... --activation ... --initial`,
  registry-backed `scene.set_lifecycle`, source validation for lifecycle
  kind/activation/initial metadata, editor scene-document rows, and structured
  `.scene.json` bundle lowering into `scenes.ir.json`. Transition graphs,
  stack operations, and project-level scene ordering remain separate lifecycle
  gaps.
- ✅ 2026-06-21: Scene-scoped lifecycle fields now lower scene-local input maps,
  system schedules, and UI roots into `input.ir.json`, `systems.ir.json`,
  `ui.ir.json`, and scoped `scenes.ir.json` references. Web and Bevy scene
  managers expose matching `activeScopes` snapshots for active/additive scenes.
- ✅ 2026-06-21: Retained UI source mutation now has
  `tn ui add-node <ui-doc-id> <node-id> --type ...` and
  `tn ui set-style <ui-doc-id> <node-id> ...`, registry-backed
  `ui.add_node` and `ui.set_style`, validation for promoted widget/style fields,
  and editor rows for UI node type, label, color, background, and font size.
  Editable text input, IME, virtual keyboard, world/viewport UI, arbitrary grid
  placement, drag/drop, custom UI materials, and broad touch/gamepad UI remain
  separate residual gaps.
- ✅ 2026-06-21: System source mutation now has
  `tn system set-metadata <system-id>` plus registry-backed
  `system.set_metadata`, source validation/import for access lists, ordering,
  queries, service declarations, and command declarations, and structured
  `.systems.json` lowering into `systems.ir.json`. Callback components/callable
  handles and delayed commands beyond bounded timers remain residual runtime
  gaps.
- ✅ 2026-06-21: Tags and group containers now have typed scene source
  operations: `tn scene add-tag <scene-id> <entity-id> <tag>` writes zero-field
  ECS marker components, and `tn scene add-group <scene-id> <group-id>` writes
  `SceneContainer` group entities with optional name and position. The shared
  operation registry exposes matching `scene.add_tag` and `scene.add_group`
  operations, and structured scene builds lower them into `world.ir.json` plus
  component schemas.
- ✅ 2026-06-22: Typed ECS component source mutation now also covers
  `RenderLayers` and `Visibility`: `tn scene add-component ... render-layers
  --layers ...` and `tn scene add-component ... visibility --visible ...` write
  validated source components, and the shared operation registry exposes
  `scene.set_render_layers` and `scene.set_visibility`.
- ✅ 2026-06-22: Intentional non-portable boundaries are marked complete in the
  integration matrix where the expected state is "no command": platform online
  services and direct Bevy/raw Three.js/2D authoring remain explicit non-goals,
  not parity backlog.
- ✅ 2026-06-23: A read-only editor row slice is now source-persistable:
  asset catalog type/path rows dispatch `asset.add`, and scene resource
  path/value rows dispatch `scene.set_resource`, with editor API persistence
  coverage for durable source JSON writes.
- ✅ 2026-06-23: Scene-local prefab primitive/color/asset rows now dispatch
  registry-backed `scene.set_prefab`, and `tn scene set-prefab <scene-id>
  <prefab-id> [--primitive ...] [--color ...] [--asset ...] --json` provides
  the matching typed CLI mutation surface while preserving `set-prefab-color`
  as a compatibility shortcut.
- ✅ 2026-06-23: Environment path, walkability, and source-asset LOD rows now
  dispatch registry-backed `environment.set_path`,
  `environment.set_walkability`, and `environment.set_source_asset_lod`.
  Matching `tn environment set-path`, `set-walkability`, and
  `set-source-asset-lod` commands persist the same structured JSON metadata.
- ✅ 2026-06-23: Environment light probe rows now dispatch registry-backed
  `environment.set_light_probe`, and `tn environment set-light-probe
  <environment-id> <probe-id> --probe '<json-object>'` persists light-probe
  metadata in structured environment source documents.
- ✅ 2026-06-23: Light color/range/angle plus shadow bias rows now dispatch
  registry-backed `scene.set_light`. The typed CLI light command accepts
  `--range`, `--angle`, `--shadow-bias`, and `--shadow-normal-bias`, so
  promoted light metadata no longer requires raw component JSON.
- ✅ 2026-06-23: Custom component JSON payload rows now dispatch the existing
  registry-backed `scene.set_component` operation from the editor inspector,
  so source-authored custom object component data can round trip without a
  typed component-specific operation.
- ✅ 2026-06-23: Web and Bevy runtime render-target allocation now covers
  declared color and write-only depth render targets. Depth cameras resolve to
  native/web offscreen targets, while depth target material sampling remains an
  explicit IR validation error.
- ✅ 2026-06-23: Render-target source/editor/CLI authoring now has first-class
  structured asset declarations. `tn asset add <asset-id> --type render-target
  --width <n> --height <n>` writes durable source, editor asset rows dispatch
  `asset.add` for width/height/usage/format, and compiler lowering emits
  manifest render-target entries.
- ✅ 2026-06-23: Existing mesh source primitive rows now dispatch
  registry-backed `mesh.create_primitive` with document-file targeting, so the
  editor can mutate primitive mesh declarations in place instead of treating
  them as create-only rows.
- ✅ 2026-06-23: System metadata inspector rows now dispatch registry-backed
  `system.set_metadata` for access lists, ordering, services, queries, and
  commands. The richer source metadata no longer requires CLI-only mutation.
- ✅ 2026-06-23: System schedule rows now dispatch registry-backed
  `system.set_metadata`, and `tn system set-metadata <system-id> --schedule
  <schedule>` updates schedules after creation without recreating the system
  source document.
- ✅ 2026-06-23: Reusable component/resource schema documents now use
  `threenative.schema` source files under `content/schemas/*.schema.json`.
  `tn schema create|set` and registry-backed `schema.*` operations validate
  schema entries and compiler lowering emits them into canonical
  `schemas/components.schema.json` and `schemas/resources.schema.json`
  bundle artifacts.
- ✅ 2026-06-23: Input controls metadata now persists through structured input
  source documents. `tn input set-controls` and `tn input set-override` plus
  registry-backed `input.set_controls` / `input.set_override` validate
  controls-settings rows and persisted binding overrides, and compiler
  lowering emits them into `input.ir.json`.
- ✅ 2026-06-23: Generator provenance now has a structured
  `content/generators/*.generator.json` source document and registry-backed
  `generator.record` / `tn generator record` command for module/export,
  outputs, hashes, and overwrite policy. Editor rows inspect generator
  provenance as read-only one-way metadata; generated outputs still do not
  receive reverse editor patches.

## Final Status for 2026-06-22

The original report is now the current progress ledger: rows with ✅ have either
implemented source/editor/CLI support or a documented intentional non-goal or
diagnostic boundary. The remaining residual matrix/subagent rows are still open
for later work and should not be treated as complete:

- Advanced rendering and advanced light/material residuals remain explicit
  diagnostic-only boundaries backed by rendering residual evidence.
- Remaining read-only editor rows that still need safe source-persistable
  operations, excluding asset catalog type/path and scene resource path/value
  rows, scene-local prefab primitive/color/asset rows, environment
  path/walkability/light-probe/source-asset LOD rows, promoted Light and custom
  component payload rows, mesh source primitive rows, system metadata/schedule rows,
  and reusable schema document CLI/build lowering,
  which are now editable through registry-backed operations.

## Scope

This report compares the implemented feature surfaces across:

- ThreeNative SDK / Three.js-style authoring and emitted IR.
- Web Three.js runtime adapter.
- Native Bevy runtime adapter.
- Structured editor source documents and editor operation registry.
- CLI commands for adding or mutating ECS/source features.

The main integration risk is not the web/native runtime layer. The larger gap is
that the generated IR/runtime surface is much broader than the structured
authoring/editor/CLI mutation surface. A feature can be runtime-supported and
still not be first-class in the editor or CLI.

## Gap Flags

| Flag | Meaning |
| --- | --- |
| ECS-CMD | Feature lacks a typed CLI command to add or configure it as ECS/source data. |
| EDITOR | Feature lacks full structured editor/source round-trip support. |
| WEB-BEVY | Web and Bevy behavior is partial, diagnostic-only, or not claimed as parity. |
| SOURCE | Durable source documents are missing or incomplete. |
| INTENTIONAL | Product boundary says this should stay unsupported or diagnostic-only. |

## Current CLI ECS Mutation Surface

The CLI can add arbitrary ECS components through generic JSON commands:

| Purpose | Command |
| --- | --- |
| Add scene entity | `tn scene add-entity <scene-id> <entity-id> [--prefab <prefab-id>] --json` |
| Set entity transform | `tn scene set-transform <scene-id> <entity-id> [--position x,y,z] [--rotation x,y,z] [--scale x,y,z] --json` |
| Set entity component | `tn scene set-component <scene-id> <entity-id> <component-kind> --value <json-object> --json` |
| Remove entity component | `tn scene remove-component <scene-id> <entity-id> <component-kind> --json` |
| Add prefab component | `tn prefab add-component <prefab-id> <component> --value <json-object> --json` |
| Add resource | `tn scene add-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] --json` |
| Add system script | `tn scene attach-script <scene-id> <system-id> --module <path> --export <name> --json` |

That generic component command is useful, but it is not equivalent to a typed,
discoverable, validated feature command. For example, `Camera`, `Light`,
`RigidBody`, `Collider`, `CharacterController`, `MeshRenderer`, `RenderLayers`,
`PhysicsJoint`, `Visibility`, `SceneContainer`, and tags can be represented in
IR/runtime surfaces, but only some have typed editor/CLI helpers.

## Integration Matrix

| Feature family | Three.js-style SDK / IR / web | Bevy runtime | Editor structured source | CLI / ECS add command | Gap flags | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ Entities, transforms, resources | Supported | Supported | Partial | Typed commands exist: `scene add-entity`, `scene set-transform`, `scene add-resource`, `scene set-resource`, `resources create/add/set`, `schema create/set` | EDITOR | Core scene mutation exists, reusable `threenative.resources` source docs persist resource declarations/defaults, and reusable `threenative.schema` docs lower component/resource schemas into canonical bundle schema files; broader editor schema controls remain residual. |
| ✅ Generic ECS components | IR supports arbitrary component records plus typed known components | Bevy maps known components; script host can read component values | Partial | Generic `scene set-component` and `prefab add-component`, plus typed scene operations for promoted components | ECS-CMD, EDITOR | Typed source/CLI/default coverage now includes camera, light, mesh-renderer, render-layers, visibility, rigid-body, collider, character-controller, tags, and groups; raw JSON remains for custom or unpromoted components. |
| ✅ Tags and group containers | Supported in parity docs / compiler path | Supported as marker/query and hierarchy containers | Partial | `tn scene add-tag`, `tn scene add-group` plus registry `scene.add_tag` / `scene.add_group` | EDITOR | Typed source/CLI operations now write zero-field tag components and `SceneContainer` group entities that lower through structured scene builds; broader editor hierarchy/group controls remain partial. |
| ✅ MeshRenderer and primitive meshes | Supported | Supported | Partial | `mesh primitive`, `mesh custom`, `scene add-prefab`, `scene set-prefab`, generic `set-component` | ECS-CMD, EDITOR | Source mesh docs now cover primitive and custom attribute/index declarations, scene-local prefab primitive/color/asset edits, and compiler lowering emits generated mesh assets/binary payloads; import settings and richer editor mesh controls remain partial. |
| ✅ Materials and textures | Broad IR/runtime support for PBR fields and texture slots | Broad promoted support | Partial | `material create`, `material set` with promoted PBR/texture flags | EDITOR | CLI/editor now cover promoted texture slots, alpha, emissive, clearcoat, and transmission fields; sampler/import policy and broader material inspector UX remain partial. |
| ✅ Cameras and views | Broad camera IR/runtime support | Broad promoted support | Partial | `scene set-camera`, `scene add-component ... camera`, registry `scene.set_camera_component` | EDITOR | Typed source/CLI camera operations now persist promoted projection/frustum fields (`fovY`, `near`, `far`, `size`) and structured scene builds lower them into IR `Camera` components; multi-view ordering, render targets, helpers, and richer editor controls remain residual. |
| ✅ Lights and shadows | Broad IR/runtime support for ambient/directional/point/spot and shadow metadata | Broad promoted support | Partial via default scene/editor UI | `tn scene add-component <scene> <entity> light ...`, registry `scene.set_light`; `tn environment set-light-probe` | EDITOR | Typed light command and editor rows now cover kind, intensity, color, range, angle, shadowBias, and shadowNormalBias; environment light probes have JSON-backed source/editor/CLI mutation, while broader lighting UX remains partial. |
| ✅ Physics: rigid bodies, colliders, joints | Broad IR/runtime support for rigid bodies, colliders, sensors, character traces, joints metadata | Broad promoted support with residual limits | Partial | `tn scene add-component <scene> <entity> rigid-body|collider|character-controller ...`, generic `set-component` | EDITOR, WEB-BEVY | Typed rigid body/collider/character-controller commands exist; `PhysicsJoint` and remaining runtime parity gaps include full constraints, arbitrary triangle narrow phase, vehicle drivetrain, soft bodies/ragdolls. |
| ✅ Character controller and navigation | IR/runtime support for character movement, pathfinding, dynamic navmesh, steering | Promoted for current scope | Partial | `tn scene add-component <scene> <entity> character-controller ...` plus scripts/services | EDITOR | Typed character-controller command exists; broader nav setup commands remain partial. |
| ✅ Input maps | Runtime supports keyboard/mouse/gamepad/touch snapshots and rebinding metadata | Promoted for current scope | Partial | `tn input add-action <input-doc-id> <action-id> --keys ...`; `tn input add-axis <input-doc-id> <axis-id> --negative-keys ... --positive-keys ...`; `tn input set-controls`; `tn input set-override` | EDITOR | Keyboard actions, axes, controls-settings rows, and persisted binding overrides now have source/CLI validation and bundle lowering; touch/gamepad gesture command breadth remains a gap. |
| ✅ UI tree and widgets | Broad retained UI IR/runtime support | Broad promoted Bevy UI support | Partial | `ui create`, `ui add-text`, `ui add-node`, `ui set-layout`, `ui set-style`, `ui bind`, plus scene UI helpers | EDITOR, WEB-BEVY | CLI/editor now cover promoted retained node type/label/style fields; editable text, IME, virtual keyboard, world/viewport UI, arbitrary grid placement, drag/drop UI nodes remain gaps. |
| ✅ Audio | Broad audio IR/runtime services and Bevy/web playback support | Promoted for current scope | Partial source discovery/validation | `tn audio create`, `tn audio add-sound` | EDITOR | Audio source mutation exists for documents and sound declarations. Custom decoder, streaming/network audio, and broader editor controls remain deferred. |
| ✅ Assets and glTF | Bundle-local assets, GLB/GLTF, dependency bundling, inspection, hot reload | Promoted for current scope | Partial | `tn asset add`, `tn asset inspect`, `tn model-test` | EDITOR | Durable asset catalog source mutation exists for id/type/path declarations, and supported standalone source/SDK asset declarations now emit into `assets.manifest.json`. Import settings, custom/generated mesh asset source, runtime asset saving/export, and generated runtime asset persistence remain gaps. |
| ✅ Environment scene data | Environment IR supports atmosphere, terrain, path, skybox, environment maps, light probes, LOD, walkability | Promoted for selected runtime slices | Partial | `environment create`, `environment set-skybox`, `environment set-map`, `environment set-terrain`, `environment set-path`, `environment set-walkability`, `environment set-light-probe`, `environment set-source-asset-lod` | SOURCE, EDITOR | CLI/editor now cover promoted environment doc creation plus skybox, environment map, terrain, path, walkability, light-probe, and source-asset LOD fields. |
| ✅ Animation and particles | Broad animation metadata/playback/services and rendered particles | Promoted for current scope | Partial through assets/scripts | `tn animation add-clip`, `tn animation graph add-state`, `tn particle add-emitter` | EDITOR, WEB-BEVY | Source asset docs now carry promoted model clip, graph-state, and bounded particle emitter metadata that lowers into `assets.manifest.json`; retargeting/IK, arbitrary blend trees, and broader editor controls remain open. |
| ✅ Systems and scripts | Portable system metadata, script refs, effect validation | Web/Bevy host parity for promoted services | Partial | `system create`, `system attach-script`, `system set-metadata`, `scene attach-script` | EDITOR | Structured systems docs now persist/import/lower schedules, access lists, ordering, query metadata, service declarations, and command declarations, with matching editor metadata rows; callback components/callable handles and delayed commands beyond bounded timers remain residual gaps. |
| ✅ Prefab catalogs | IR/runtime can load prefab catalogs | Web/Bevy can consume bundle prefabs | Partial | `prefab create`, `prefab add-component`, scene-local `add-prefab` | SOURCE, ECS-CMD, EDITOR | Structured prefab source documents now emit standalone `prefabs.ir.json` bundle catalogs; instance overrides and broader prefab editor/runtime breadth remain residual. |
| ✅ Render targets | IR has color/depth render targets and camera targets | Color and write-only depth target allocation now have runtime proof | Partial | `tn asset add --type render-target` plus registry `asset.add` | EDITOR | Web/Bevy runtime allocation now covers declared color targets and write-only depth targets, and source/editor/CLI creation now persists width/height/usage/format render-target declarations into `assets.manifest.json`; depth target material sampling remains rejected by IR validation. |
| ✅ Runtime config / target profile / window policy | Runtime config IR exists | Partial policy support | Partial | `runtime create`, `runtime set-window`, `runtime set-rendering`, `target set` | SOURCE, EDITOR, WEB-BEVY | CLI/editor now cover source-backed runtime config creation, primary window size/title, promoted renderer quality fields, and target profile source documents for targets/budgets/performance JSON that lower to `runtime.config.json` and `target.profile.json`; resize/scale-factor observations, cursor/present/background policy, clear-color updates, and multi-window diagnostics remain residual. |
| ✅ Scene lifecycle | IR/docs claim named scenes, transitions, stack traces | Runtime traces exist | Partial | `tn scene lifecycle add <scene-id> --kind ... --activation ... --initial` | SOURCE, EDITOR | Scene docs now persist kind, activation, and initial metadata through CLI/editor operations and bundle lowering; scene-scoped input/system/UI references now emit and surface as active runtime scopes. Transition graph commands, stack operations, and project-level scene ordering remain partial. |
| ✅ Editor project metadata | Authoring source matrix defines need | Not runtime-specific | Partial | `tn project init-source` / registry `project.create` | SOURCE, ECS-CMD, EDITOR | Project metadata docs are now classified, validated, and editable for id, authoring version, source roots, and build targets; project-level scene ordering/build orchestration remains residual. |
| ✅ Generator provenance | Structured generator provenance document exists | Not runtime-specific | Partial one-way source metadata | `tn generator record` / registry `generator.record` | SOURCE, ECS-CMD, EDITOR | Generator source docs capture module/export, outputs, hashes, and overwrite policy, and editor rows inspect them as read-only. Reverse patching generated outputs remains intentionally unsupported. |
| ✅ Advanced rendering: volumetrics, DOF, SSR, decals, deferred, meshlets, custom post passes | Diagnostic/deferred boundary | Diagnostic/deferred boundary | Diagnostic-only | No command | INTENTIONAL | `pnpm verify:rendering-residuals` plus IR validation keep these as stable unsupported-feature diagnostics until a future promotion slice. |
| ✅ Advanced lights/materials | Spherical/area lights, lightmaps, parallax, anisotropy/specular tint are open | Not promoted | Diagnostic-only | No command | INTENTIONAL | Custom shaders, bindless resources, raw render phases, and broader advanced material/light requests remain portable diagnostic boundaries, not current CLI/editor source features. |
| ✅ Platform services: cloud saves, online/networking/replication/collaboration | Deferred/non-portable | Deferred/non-portable | Missing | No command | INTENTIONAL | Product boundary keeps these out of portable IR/runtime for now; no command is the intended state. |
| ✅ Direct Bevy authoring / raw Three.js source of truth / 2D workflows | Non-goal | Non-goal | Non-goal | No command | INTENTIONAL | Explicitly outside the current ThreeNative product boundary; no command is the intended state. |

## Highest Priority Gaps

| Priority | Gap | Why it matters | Candidate command surface |
| --- | --- | --- | --- |
| ✅ P0 | Typed component commands for common ECS features | Resolved for camera, light, mesh-renderer, render-layers, visibility, rigid-body, collider, and character-controller; other runtime components remain backlog. | `tn scene add-component <scene> <entity> camera|light|mesh-renderer|render-layers|visibility|rigid-body|collider|character-controller ...` |
| ✅ P0 | Asset source document mutation | Resolved for durable file-backed asset id/type/path declarations and structured render-target declarations. | `tn asset add <asset-id> --type model|texture|audio|mesh --path ... --json`; `tn asset add <asset-id> --type render-target --width <n> --height <n> --json` |
| ✅ P0 | Audio source mutation | Resolved for audio documents and sound declarations. | `tn audio create <audio-doc-id>`, `tn audio add-sound <audio-doc-id> <sound-id> --asset ...` |
| ✅ P1 | Material texture/PBR commands | Resolved for promoted PBR and texture-slot fields; sampler/import policy remains outside this slice. | `tn material set <id> --base-color-texture ... --normal-texture ... --emissive ... --alpha-mode ...` |
| ✅ P1 | Scene lifecycle commands | Resolved for source-backed kind, activation, initial-scene metadata, and scene-local input/system/UI scope emission; transitions, stack operations, and project-level scene ordering remain open. | `tn scene lifecycle add <scene-id> --kind level --activation exclusive --initial` |
| ✅ P1 | UI widget/style commands | Resolved for promoted retained UI node type/label/style fields; advanced widgets, text input, rich layout, and broad interaction support remain open. | `tn ui add-node`, `tn ui set-style` |
| ✅ P1 | Input axes/rebinding metadata | Resolved for keyboard action bindings, axes, controls-settings rows, and persisted binding overrides; touch/gamepad gesture command breadth remains open. | `tn input add-axis`, `tn input set-controls`, `tn input set-override`; future `tn input add-gamepad-binding` |
| ✅ P1 | Environment skybox/map/terrain/source metadata commands | Resolved for environment document creation plus promoted skybox, environment-map, terrain, path, walkability, light-probe, and source-asset LOD fields. | `tn environment create`, `tn environment set-skybox`, `tn environment set-map`, `tn environment set-terrain`, `tn environment set-path`, `tn environment set-walkability`, `tn environment set-light-probe`, `tn environment set-source-asset-lod` |
| ✅ P1 | Runtime/window/target source docs | Resolved for source-backed runtime config creation, primary window metadata, promoted renderer fields, and target profile documents for targets/budgets/performance JSON; host window policies remain open. | `tn runtime create`, `tn runtime set-window`, `tn runtime set-rendering`, `tn target set` |
| ✅ P1 | System query/effect metadata commands | Resolved for source-backed system access lists, ordering, queries, service declarations, command declarations, bundle import, and structured `.systems.json` lowering. | `tn system set-metadata <system-id> --reads ... --writes ... --queries ... --commands ... --services ...` |
| ✅ P2 | Animation graph and particle authoring commands | Resolved for promoted model clip metadata, graph states, and bounded particle emitters on structured asset source documents; retargeting/IK and arbitrary blend trees remain residual. | `tn animation add-clip`, `tn animation graph add-state`, `tn particle add-emitter` |
| ✅ P2 | Physics/nav typed commands | Resolved for discoverable CLI aliases over the existing typed source validators for rigid bodies, colliders, and character controllers; broader nav setup and physics runtime residuals remain tracked separately. | `tn physics add-rigid-body`, `tn physics add-collider`, `tn nav add-agent` |

## Subagent Findings

Three focused explorer agents reviewed authoring/editor/CLI code, runtime code,
and docs/contracts. Their additional findings sharpen the gaps above:

| Area | Finding | Impact |
| --- | --- | --- |
| ✅ Operation registry drift | `AUTHORING_OPERATION_REGISTRY` now includes existing structured source operations for asset/audio/input/material/mesh/prefab/scene/system/UI plus typed common ECS component setters. | Keep using the registry as the shared source for new promoted operations. |
| ✅ Generic vs typed ECS writes | Typed common ECS setters and validators now cover `camera`, `Light`, `MeshRenderer`, `RenderLayers`, `Visibility`, `RigidBody`, `Collider`, and `CharacterController`, while custom component JSON rows can persist whole payloads through `scene.set_component`. | Other runtime components still need typed promotion before they are first-class. |
| Read-only editor rows | Asset catalog type/path, scene resource path/value, scene-local prefab primitive/color/asset, environment path/walkability/light-probe/source-asset LOD, promoted Light rows, custom component payload rows, mesh source primitive rows, and system metadata/schedule rows now persist through registry-backed editor operations. Remaining read-only families are stable identifiers and broader advanced/generated inspector data. | Users can still inspect more than the editor UI can safely persist back to durable source, but the rows that already have shared operations no longer drift from the editor surface. |
| ✅ Asset and audio source gaps | Asset and audio source schemas now have durable mutation commands and registry operations for asset declarations, audio docs, and sound declarations. | Broader import/playback policy remains separate backlog. |
| ✅ Environment mutation gap | Environment documents are classified/validated, and typed editor/CLI operations now cover skybox, environment map, terrain, path, walkability, light probes, and source-asset LOD fields. | Broader lighting UX remains separate backlog. |
| ✅ Prefab catalog emission | Structured prefab source documents now lower into bundle `prefabs.ir.json` with manifest `entry.prefabs`/`files.prefabs` entries and provenance ownership. | Web/Bevy prefab runtime support no longer requires hand-authored catalog bundle entries for source-authored prefabs. |
| ✅ Scene-scoped lifecycle fields | SDK scene definitions with scene-local `input`, `systems`, and `ui` now emit merged bundle documents plus scoped `scenes.ir.json` references. | Web and Bevy lifecycle managers expose matching active/additive `activeScopes` snapshots for scene-local input maps, UI roots, and system scopes. |
| ✅ Standalone asset modules | SDK bundle roots now accept standalone asset refs/modules, and structured asset source docs lower supported model/texture/audio/buffer entries into `assets.manifest.json` with provenance ownership. | Rich catalog entries no longer need scene refs, environment, or audio paths for supported file-backed assets; custom/generated mesh asset source remains residual. |
| ✅ Camera source projection fields | Typed camera source operations now cover promoted projection/frustum fields on top of mode/target. | Advanced camera view stacks, render targets, helpers, and editor UI affordances remain tracked as residual camera/editing work. |
| ✅ Render target depth path | IR supports depth render targets and camera targets, web/Bevy render-target allocation handles color and write-only depth usage, and source/editor/CLI authoring can create structured render-target declarations. | Depth material sampling/writeback remains explicitly unsupported by IR validation. |
| ✅ Docs drift | `docs/status/feature-maturity.md` now reconciles UI/audio/general gameplay rows with later promoted slices and marks custom shaders/render graph as a diagnostic-only boundary instead of stale future-only work. | Current status, parity, and maturity docs now agree on promoted scope versus residual/deferred work. |
| ✅ Physics contract conflict | ECS and scripting contracts now match the parity claim: bounded static/dynamic mesh collider AABB metadata is promoted, while unbounded mesh colliders, mesh triggers, cylinder solver bodies, full constraint solving, and arbitrary triangle narrow phase remain rejected or deferred. | The physics docs now describe the same bounded collider scope instead of mixing static-only and dynamic-mesh claims. |
| ✅ Non-portable boundaries | Raw Three.js/Bevy authoring, online services/networking/replication/collaboration, 2D workflows, backend-only features, arbitrary npm/filesystem/worker/timer/platform APIs, and renderer/runtime escape hatches are explicitly classified as intentional boundaries. | These remain diagnostics/non-goals rather than backlog items for Bevy parity. |

## Detailed Residual Gaps

| Family | Residual gaps to keep flagged |
| --- | --- |
| ECS/gameplay host | ECS callback components/callable system handles, delayed commands beyond bounded timers/channels, query combination/pairwise helpers, and entity disabling separate from renderer visibility. |
| UI | Editable text input, IME composition, virtual keyboard behavior, UI transforms/render-to-texture/world UI, viewport nodes with picking, italic rich text, letter spacing/font variation policy, arbitrary grid placement, UI drag/drop, custom UI materials, broad gamepad/touch UI, and desktop webview packaging. |
| Rendering/materials | Area lights, lightmaps, parallax/depth maps, anisotropy/specular tint, atmospheric/volumetric effects, auto exposure, depth of field, motion blur, SSR/mirrors, decals, deferred rendering, virtual geometry, and custom post-processing. |
| Assets/animation | glTF extension processing, runtime asset saving/export, generated runtime assets that persist/reload, retargeting/IK, and arbitrary blend trees. |
| Physics/input/platform | Full constraint solving, arbitrary triangle narrow phase, vehicle drivetrain/tire models, soft bodies/ragdolls, richer gestures beyond tap/swipe/pinch, window resize/scale-factor observations, cursor/present/background/window background policies, and multi-window diagnostics. |
| Tooling/editor | Full native desktop visual editor shell and connected-device gamepad inspection. |

## Source Evidence

| Evidence | What it shows |
| --- | --- |
| `docs/bevy-feature-parity.md` | Current parity backlog and residual web/Bevy feature claims. |
| `docs/status/feature-maturity.md` | Older but explicit rule: support requires API, IR, validation, runtime, and gate agreement. |
| `packages/ir/src/types.ts` | Typed IR components/resources/assets/UI/audio/system contracts. |
| `packages/authoring/src/sourceKinds.ts` | Structured source support matrix, including missing/partial CLI operation support. |
| `packages/authoring/src/schemas.ts` | Current durable authoring document shapes and narrow supported source keys. |
| `packages/authoring/src/operations.ts` | Actual source mutation operations and validation limits. |
| `packages/authoring/src/operationRegistry.ts` | Shared operation registry used by authoring adapters. |
| `packages/editor/src/workbench/operations.ts` | Editor operation names currently exposed. |
| `packages/editor/src/server/projectApi.ts` | Read-only editor field inventory and editable field coverage. |
| `packages/editor/src/server/operationApi.ts` | Editor operation dispatch and special-cased operations beyond the shared registry. |
| `packages/cli/src/commands/scene.ts` | Scene-level CLI ECS mutation commands. |
| `packages/cli/src/commands/sourceDocuments.ts` | UI/material/mesh/prefab/input/system source-document commands. |
| `packages/compiler/src/emit/bundle.ts` | Bundle root emission and scene lifecycle field emission behavior. |
| `packages/runtime-web-three/src/*` and `runtime-bevy/crates/threenative_runtime/src/*` | Runtime adapters have many feature-specific modules beyond the current source command surface. |

## Summary

The broad runtime contract is in better shape than the authoring command layer.
The biggest actionable gap is to promote commonly used runtime/IR features into
typed structured-source operations shared by CLI, editor, and MCP. Until then,
agents can technically add many features through `tn scene set-component ...`
with raw JSON, but that path is weak for discoverability, validation, defaults,
editor round-trip, and repair diagnostics.

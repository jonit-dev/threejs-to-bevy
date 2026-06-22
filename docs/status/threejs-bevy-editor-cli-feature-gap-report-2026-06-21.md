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
  source validators for the corresponding component payloads. Light kind and
  intensity are editor-editable through `scene.set_light`; broader component
  inspector controls remain partial.
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
| Entities, transforms, resources | Supported | Supported | Partial | Typed commands exist: `scene add-entity`, `scene set-transform`, `scene add-resource`, `scene set-resource` | EDITOR | Core mutation exists, but reusable resource/schema source docs are incomplete. |
| Generic ECS components | IR supports arbitrary component records plus typed known components | Bevy maps known components; script host can read component values | Partial | Generic `scene set-component` and `prefab add-component` | ECS-CMD, EDITOR | No typed per-component command/defaults for most runtime components. |
| Tags and group containers | Supported in parity docs / compiler path | Supported as marker/query and hierarchy containers | Partial | No typed `scene add-tag` or `scene add-group`; generic component/source edit only | ECS-CMD, EDITOR | V10 grouping is implemented, but the CLI command surface does not expose it cleanly. |
| MeshRenderer and primitive meshes | Supported | Supported | Partial | `mesh primitive`, `scene add-prefab`, generic `set-component` | ECS-CMD, EDITOR | Source mesh docs only cover primitive basics; generated/custom mesh source is partial. |
| ✅ Materials and textures | Broad IR/runtime support for PBR fields and texture slots | Broad promoted support | Partial | `material create`, `material set` with promoted PBR/texture flags | EDITOR | CLI/editor now cover promoted texture slots, alpha, emissive, clearcoat, and transmission fields; sampler/import policy and broader material inspector UX remain partial. |
| Cameras and views | Broad camera IR/runtime support | Broad promoted support | Partial | `scene set-camera`, generic `set-component` | ECS-CMD, EDITOR | `scene set-camera` writes a small lower-case `camera` source shape, while IR typed `Camera` has many fields. |
| ✅ Lights and shadows | Broad IR/runtime support for ambient/directional/point/spot and shadow metadata | Broad promoted support | Partial via default scene/editor UI | `tn scene add-component <scene> <entity> light ...`, registry `scene.set_light` | EDITOR | Typed light command and editor kind/intensity rows exist; broader shadow metadata controls remain partial. |
| ✅ Physics: rigid bodies, colliders, joints | Broad IR/runtime support for rigid bodies, colliders, sensors, character traces, joints metadata | Broad promoted support with residual limits | Partial | `tn scene add-component <scene> <entity> rigid-body|collider|character-controller ...`, generic `set-component` | EDITOR, WEB-BEVY | Typed rigid body/collider/character-controller commands exist; `PhysicsJoint` and remaining runtime parity gaps include full constraints, arbitrary triangle narrow phase, vehicle drivetrain, soft bodies/ragdolls. |
| ✅ Character controller and navigation | IR/runtime support for character movement, pathfinding, dynamic navmesh, steering | Promoted for current scope | Partial | `tn scene add-component <scene> <entity> character-controller ...` plus scripts/services | EDITOR | Typed character-controller command exists; broader nav setup commands remain partial. |
| ✅ Input maps | Runtime supports keyboard/mouse/gamepad/touch snapshots and rebinding metadata | Promoted for current scope | Partial | `tn input add-action <input-doc-id> <action-id> --keys ...`; `tn input add-axis <input-doc-id> <axis-id> --negative-keys ... --positive-keys ...` | EDITOR | Keyboard actions and axes now have typed commands/editor rows; richer controls-settings/rebinding metadata and touch/gamepad gesture commands remain gaps. |
| UI tree and widgets | Broad retained UI IR/runtime support | Broad promoted Bevy UI support | Partial | `ui create`, `ui add-text`, `ui set-layout`, `ui bind`, plus scene UI helpers | ECS-CMD, EDITOR, WEB-BEVY | CLI supports text/layout/bind only; editable text, IME, virtual keyboard, world/viewport UI, arbitrary grid placement, drag/drop UI nodes remain gaps. |
| ✅ Audio | Broad audio IR/runtime services and Bevy/web playback support | Promoted for current scope | Partial source discovery/validation | `tn audio create`, `tn audio add-sound` | EDITOR | Audio source mutation exists for documents and sound declarations. Custom decoder, streaming/network audio, and broader editor controls remain deferred. |
| ✅ Assets and glTF | Bundle-local assets, GLB/GLTF, dependency bundling, inspection, hot reload | Promoted for current scope | Partial | `tn asset add`, `tn asset inspect`, `tn model-test` | EDITOR | Durable asset catalog source mutation exists for id/type/path declarations. Import settings, runtime asset saving/export, and generated runtime asset persistence remain gaps. |
| Environment scene data | Environment IR supports atmosphere, terrain, path, skybox, environment maps, light probes, LOD, walkability | Promoted for selected runtime slices | Read-only/partial | No typed environment mutation command | SOURCE, ECS-CMD, EDITOR | Source schemas accept environment documents, but editor rows are inspection-oriented and CLI has no skybox/environment/terrain/path mutation commands. |
| Animation and particles | Broad animation metadata/playback/services and rendered particles | Promoted for current scope | Partial through assets/scripts | No typed animation/particle authoring command | ECS-CMD, EDITOR, WEB-BEVY | Retargeting/IK and arbitrary blend trees remain open; source/CLI has no first-class animation graph or particle emitter operations. |
| Systems and scripts | Portable system metadata, script refs, effect validation | Web/Bevy host parity for promoted services | Partial | `system create`, `system attach-script`, `scene attach-script` | ECS-CMD, EDITOR | Query/effect metadata and command declarations are not complete in source operations. Callback components/callable handles and delayed commands beyond bounded timers remain gaps. |
| Prefab catalogs | IR/runtime can load prefab catalogs | Web/Bevy can consume bundle prefabs | Partial | `prefab create`, `prefab add-component`, scene-local `add-prefab` | SOURCE, ECS-CMD, EDITOR | Runtime support exists, but compiler root emission for standalone prefab catalogs is not first-class; bundles may need hand-authored prefabs. |
| Render targets | IR has color/depth render targets and camera targets | Color target support only observed | Missing | No typed command | WEB-BEVY, ECS-CMD, EDITOR | Depth render targets/camera depth sampling are represented in IR but runtime allocation paths are color-only. |
| Runtime config / target profile / window policy | Runtime config IR exists | Partial policy support | Missing | No source mutation command | SOURCE, ECS-CMD, EDITOR, WEB-BEVY | Resize/scale-factor observations, custom cursor policy, present/background policy, clear-color updates, and multi-window diagnostics are not integrated as authoring commands. |
| Scene lifecycle | IR/docs claim named scenes, transitions, stack traces | Runtime traces exist | Missing/partial | No lifecycle-specific source command | SOURCE, ECS-CMD, EDITOR | Source matrix marks lifecycle policy missing despite scene documents existing. |
| Editor project metadata | Authoring source matrix defines need | Not runtime-specific | Missing | No command | SOURCE, ECS-CMD, EDITOR | `content/project.authoring.json` / `threenative.authoring.json` are identified but not implemented beyond discovery. |
| Generator provenance | Concept exists in source matrix | Not runtime-specific | Missing | No command | SOURCE, ECS-CMD, EDITOR | One-way generators are identified, but reverse editor patching is not supported. |
| Advanced rendering: volumetrics, DOF, SSR, decals, deferred, meshlets, custom post passes | Mostly diagnostic/deferred | Mostly diagnostic/deferred | Missing | No command | WEB-BEVY, EDITOR, ECS-CMD | Tracked as P2/P3 residuals in parity docs, not integrated end-to-end. |
| Advanced lights/materials | Spherical/area lights, lightmaps, parallax, anisotropy/specular tint are open | Not promoted | Missing | No command | WEB-BEVY, EDITOR, ECS-CMD | Custom shaders/bindless/render phases are diagnostic boundaries, not portable authoring features. |
| Platform services: cloud saves, online/networking/replication/collaboration | Deferred/non-portable | Deferred/non-portable | Missing | No command | INTENTIONAL | Product boundary keeps these out of portable IR/runtime for now. |
| Direct Bevy authoring / raw Three.js source of truth / 2D workflows | Non-goal | Non-goal | Non-goal | No command | INTENTIONAL | Explicitly outside the current ThreeNative product boundary. |

## Highest Priority Gaps

| Priority | Gap | Why it matters | Candidate command surface |
| --- | --- | --- | --- |
| ✅ P0 | Typed component commands for common ECS features | Resolved for camera, light, mesh-renderer, rigid-body, collider, and character-controller; other runtime components remain backlog. | `tn scene add-component <scene> <entity> camera|light|mesh-renderer|rigid-body|collider|character-controller ...` |
| ✅ P0 | Asset source document mutation | Resolved for durable asset id/type/path declarations. | `tn asset add <asset-id> --type model|texture|audio|mesh --path ... --json` |
| ✅ P0 | Audio source mutation | Resolved for audio documents and sound declarations. | `tn audio create <audio-doc-id>`, `tn audio add-sound <audio-doc-id> <sound-id> --asset ...` |
| ✅ P1 | Material texture/PBR commands | Resolved for promoted PBR and texture-slot fields; sampler/import policy remains outside this slice. | `tn material set <id> --base-color-texture ... --normal-texture ... --emissive ... --alpha-mode ...` |
| P1 | Scene lifecycle commands | Scene lifecycle support is not first-class in source documents/CLI. | `tn scene lifecycle add <scene-id> --kind level --activation exclusive --initial` |
| P1 | UI widget/style commands | UI runtime is broad, but source commands only cover text/layout/bind basics. | `tn ui add-node`, `tn ui set-style`, `tn ui add-widget slider|button|image|bar` |
| ✅ P1 | Input axes/rebinding metadata | Resolved for keyboard action bindings and axes; controls-settings/rebinding metadata remains open. | `tn input add-axis`; future `tn input set-rebinding`, `tn input add-gamepad-binding` |
| P1 | Runtime/window/target source docs | Target/profile policy is runtime-visible but not editor-owned. | `tn target set`, `tn runtime set-window`, `tn runtime set-rendering` |
| P2 | Animation graph and particle authoring commands | Runtime support exists, but authoring is not first-class. | `tn animation add-clip`, `tn animation graph add-state`, `tn particle add-emitter` |
| P2 | Physics/nav typed commands | Physics runtime support is broad; authoring remains raw component JSON. | `tn physics add-rigid-body`, `tn physics add-collider`, `tn nav add-agent` |

## Subagent Findings

Three focused explorer agents reviewed authoring/editor/CLI code, runtime code,
and docs/contracts. Their additional findings sharpen the gaps above:

| Area | Finding | Impact |
| --- | --- | --- |
| ✅ Operation registry drift | `AUTHORING_OPERATION_REGISTRY` now includes existing structured source operations for asset/audio/input/material/mesh/prefab/scene/system/UI plus typed common ECS component setters. | Keep using the registry as the shared source for new promoted operations. |
| ✅ Generic vs typed ECS writes | Typed common ECS setters and validators now cover `camera`, `Light`, `MeshRenderer`, `RigidBody`, `Collider`, and `CharacterController`. | Raw JSON remains available for unsupported/custom components; other runtime components still need promotion before they are first-class. |
| Read-only editor rows | Editor/server model code exposes several runtime-supported families as read-only, including asset catalog fields, environment rows, existing mesh primitive details, system schedule/query/effect metadata, light/custom component rows, and scene-local prefab primitive/color/asset edits. | Users can inspect more than they can safely persist back to durable source. |
| ✅ Asset and audio source gaps | Asset and audio source schemas now have durable mutation commands and registry operations for asset declarations, audio docs, and sound declarations. | Broader import/playback policy remains separate backlog. |
| Environment mutation gap | Environment documents are classified/validated, but there are no typed editor/CLI operations for skybox, environment map, terrain, path, walkability, light probes, or LOD. | Environment parity cannot be driven cleanly by automation without direct JSON editing. |
| Prefab catalog emission | IR and runtimes can consume `prefabs`, but compiler bundle root emission does not obviously accept standalone prefab catalogs as a first-class root. | Web/Bevy prefab runtime support may require hand-authored or externally produced bundle entries. |
| Scene-scoped lifecycle fields | `ISceneLifecycleIr` includes scene-local `input`, `systems`, and `ui`, and SDK scene definitions accept some of this shape, but lifecycle emission/runtime activation focus on lifecycle state, assets, audio, entities, persistence, and transitions. | Scene transitions exist, but scene-local input maps, UI roots, and system scopes are not fully operational. |
| Standalone asset modules | SDK authoring includes asset module declarations, while `defineGame`/bundle roots do not obviously expose a standalone `assets` root. | Rich asset catalog entries are mostly emitted through scene refs, environment, or audio paths rather than durable catalog authoring. |
| Render target depth path | IR supports depth render targets and camera targets, but web and Bevy render-target allocation paths handle color usage. | Depth sampling/writeback should remain flagged partial until runtime allocation and proof exist. |
| Docs drift | `docs/status/feature-maturity.md` still marks UI/audio/general gameplay/custom shaders as older partial or future states while `docs/bevy-feature-parity.md` claims many later promoted slices. | The report should treat old status docs as drift indicators, not authoritative current parity without reconciliation. |
| Physics contract conflict | Parity docs mark dynamic mesh collider work checked, while ECS/scripting contracts still describe mesh colliders as static-only or dynamic mesh/cylinder solver bodies as rejected. | This needs contract reconciliation before claiming a clean physics authoring surface. |
| Non-portable boundaries | Raw Three.js/Bevy authoring, online services/networking/replication/collaboration, 2D workflows, backend-only features, arbitrary npm/filesystem/worker/timer/platform APIs, and renderer/runtime escape hatches are intentional boundaries. | These should remain diagnostics/non-goals, not backlog items for Bevy parity. |

## Detailed Residual Gaps

| Family | Residual gaps to keep flagged |
| --- | --- |
| ECS/gameplay host | ECS callback components/callable system handles, delayed commands beyond bounded timers/channels, query combination/pairwise helpers, and entity disabling separate from renderer visibility. |
| UI | Editable text input, IME composition, virtual keyboard behavior, UI transforms/render-to-texture/world UI, viewport nodes with picking, italic rich text, letter spacing/font variation policy, arbitrary grid placement, UI drag/drop, custom UI materials, broad gamepad/touch UI, and desktop webview packaging. |
| Rendering/materials | Area lights, lightmaps, parallax/depth maps, anisotropy/specular tint, atmospheric/volumetric effects, auto exposure, depth of field, motion blur, SSR/mirrors, decals, deferred rendering, virtual geometry, and custom post-processing. |
| Assets/animation | glTF extension processing, runtime asset saving/export, generated runtime assets that persist/reload, retargeting/IK, and arbitrary blend trees. |
| Physics/input/platform | Full constraint solving, arbitrary triangle narrow phase, vehicle drivetrain/tire models, soft bodies/ragdolls, richer gestures beyond tap/swipe/pinch, window resize/scale-factor observations, cursor/present/background/window background policies, and multi-window diagnostics. |
| Tooling/editor | Full native desktop visual editor shell, connected-device gamepad inspection, project metadata source documents, generator provenance, and runtime target/profile source documents. |

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

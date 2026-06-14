# Three.js Game Engine x Bevy Parity

| Scope | Value |
| --- | --- |
| Contract | Three.js-style TypeScript game engine -> validated IR bundle -> web Three.js + native Bevy |
| Native baseline | Bevy and `bevy_ecs` pinned to `=0.14.2` |
| Evidence anchors | native test, visual scene, game-authoring ergonomics, V6 PRDs, verify:v6, V7 PRDs, verify:v7 |

## Status

| Status | Meaning |
| --- | --- |
| ✅ | Works across the Three.js-style API, IR, web runtime, and Bevy where claimed. |
| ⚠️ | Partly works, but web and Bevy are not fully aligned yet. |
| ❌ | Not implemented in this repo. |
| ⏭️ | Intentionally deferred or never portable. |

## Parity Table

| Feature | Status | Done | Missing / gap |
| --- | --- | --- | --- |
| ECS entities/components | ⚠️ | Stable entity IDs, transforms, hierarchy, component schemas, V4/V6 system declarations. | Full gameplay host, dynamic reconciliation, system-local persisted state, and richer lifecycle remain incomplete. |
| Resources/events | ⚠️ | V6 resource schemas, resource reads/writes, event schemas, queued event payloads, web/native effect logs, `v6-resources-events` conformance. | Full resource/event runtime parity and broader gameplay scene proof are still incomplete. |
| Schedules/states | ⚠️ | `startup`, `fixedUpdate`, `update`, `postUpdate`; deterministic same-stage system ordering; shared startup-before-update trace. | Broader lifecycle/state transitions and hot state handoff are still V7 work. |
| 3D transforms/hierarchy | ✅ | V1 contract across IR, web, Bevy, and conformance. | Keep conformance green. |
| Mesh primitives | ✅ | Box, sphere, plane, capsule, and cylinder are proven; `basic-scene` now exercises capsule/cylinder generated mesh assets and mesh-renderer entities in shared web/native conformance. | Keep conformance green as additional primitive parameters are promoted. |
| Cameras | ⚠️ | Perspective camera and active camera path are usable; orthographic camera projection maps in web and Bevy and is now exposed as a runtime conformance observation in `v5-drift-surface`. | General camera resource model and full orthographic visual parity are not complete. |
| Lights | ✅ | Ambient, directional, point range, spot range/angle in SDK/compiler/IR, web, Bevy, and conformance observations. | Advanced lighting parity beyond promoted fields remains renderer-specific. |
| Materials | ⚠️ | Standard color, metalness, roughness, and validated texture refs; web maps texture slots; Bevy maps refs to `StandardMaterial` image handles. | Full native texture image loading and visual texture parity remain adapter-dependent. |
| Shadows/color/fog/sky | ⚠️ | Promoted fields for shadows, fog, sky/horizon color, tone mapping, exposure, and color spaces are serialized and observed. | Native fog/sky/color rendering parity is still limited. |
| Assets/glTF/scenes | ✅ | Bundle-local glTF/GLB, `.bin`, and texture dependencies; V3 environment instances resolve to real model scenes in web and Bevy. | Asset diagnostics still need more stable domain codes in some paths. |
| Instancing/dense content | ⚠️ | Web instancing plan, concrete dense-content budget estimates, repeated group observations, source asset LOD metadata. | Native renderer-level instancing and runtime mesh LOD swapping are not claimed. |
| Animation | ⚠️ | V6 model clip metadata, validation, conformance reporting, and `animation.play` service-call trace. | Visual playback state, stop/state queries, animation graphs, blends, IK, retargeting, events, and particles are deferred. |
| Physics/collision | ⚠️ | V6 box/sphere/capsule collider validation, rigid-body fields, deterministic collision/trigger event phases for fixed traces; V7 contract metadata validates portable collider `layer`/`mask` filters and declares `physics.overlap` / `physics.shapeCast` service permissions; `v7-advanced-physics-character` now compares fixed web/native primitive overlap and swept box shape-cast service traces with portable layer filters; web/native runtime tests pin deterministic ordering for simultaneous contacts. | Full solver behavior, dynamic mesh colliders, broader sensors, and stronger character-controller movement/blocking parity are not claimed yet. |
| Character controller | ⚠️ | V6 character controller metadata, input references, movement axes, speed, grounding/blocking/interaction declarations. | Runtime movement/interaction parity, slopes, steps, and navmesh behavior are incomplete. |
| UI | ⚠️ | Retained UI IR, validation, web DOM overlay, Bevy entity spawning, conformance UI tree, resource-bound bar, focusable button. | Focus navigation, native interaction events, safe-area behavior, and richer UI/audio UX are incomplete. |
| Audio | ⚠️ | Local OGG/WAV validation, web HTML-audio sink, Bevy autoplay loop spawning, deterministic audio command observations. | Stop, volume, spatial audio, buses/mixer routing, listener/emitters, and richer UI/audio services are deferred. |
| Input | ⚠️ | First-person config, pointer-lock expectations, movement update, input references, UI action queue metadata. | Native input capture and richer gamepad/touch navigation remain smoke-level or deferred. |
| Scripting | ✅ | V4 portable scripts, deterministic bundle output, web runner, Bevy QuickJS host, declared effect validation, patch/event/command/service logs. | Larger lifecycle fixtures, async/hot-reload behavior, and dynamic spawn/despawn reconciliation remain future work. |
| Diagnostics | ⚠️ | Stable IR/compiler/CLI/native diagnostic shapes, severity, suggestions, metadata preservation, V5/V6 ranges. | Some asset/runtime failures still need better domain-specific codes and target-specific repair hints. |
| Packaging/platforms | ❌ | Templates and verify gates build local bundles and web evidence. | Desktop packaging, target profiles, packaged bundle loading, platform diagnostics, and mobile packaging are not implemented. |
| Performance/profiling | ⚠️ | V3/V5 dense-content budget artifacts and release-gate reports. | Frame/entity/draw/asset-load/script/UI/audio/package budgets for larger scenes remain V7 work. |
| Editor/online/plugins/raw renderer | ⏭️ | Product boundary keeps Bevy as an internal adapter. | Scene editor, online services, networking, replication, collaboration, public plugins, raw Three.js authoring, direct Bevy authoring, and broad shader graphs are deferred or never portable. |

## Sources

| Source | Link |
| --- | --- |
| Bevy feature overview | https://bevy.org/ |
| Bevy examples catalog | https://bevy.org/examples/ |
| Bevy 0.14 release notes | https://bevy.org/news/bevy-0-14/ |
| Bevy crate documentation | https://docs.rs/bevy |

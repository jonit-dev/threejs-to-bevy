# Bevy Feature Parity Checklist

This checklist compares ThreeNative against Bevy's current public feature
surface so the roadmap can decide what to build, what to defer, and what to
leave to runtime adapters.

Baseline: Bevy 0.18, released January 13, 2026. This is a planning document,
not a promise to expose Bevy APIs in the TypeScript SDK.

## Parity Principle

ThreeNative should not clone Bevy's Rust API. It should reach feature parity at
the product-contract level:

```txt
TypeScript SDK capability
  -> validated portable IR
  -> matching behavior in web-three and native Bevy runtimes
```

Parity means a game author can express the same class of game feature portably.
It does not mean every Bevy component, plugin, render graph node, or ECS API is
available from TypeScript.

## Status Legend

| Status | Meaning |
| --- | --- |
| Done | Implemented in the current repo and covered by tests or verification. |
| Partial | Some vertical slice exists, but important authoring, IR, runtime, or validation pieces are missing. |
| Planned | Needed for V2 or V3, but not yet implemented. |
| Deferred | Useful later, but not needed for the next playable-game milestone. |
| Out of scope | Intentionally not part of the public ThreeNative contract. |

## Roadmap Priority

| Priority | Meaning |
| --- | --- |
| P0 | Required for the end-to-end proof and should remain stable. |
| P1 | Required for a small playable V2 game. |
| P2 | Required for production-grade V3 projects. |
| P3 | Nice-to-have or advanced capability after V3 foundations. |

## Executive Summary

ThreeNative currently has a small V1 render-only parity slice:

- scene graph capture
- entity IDs
- transforms and hierarchy
- primitive meshes: box, sphere, plane
- perspective camera
- ambient and directional lights
- standard material color, metalness, and roughness
- bundle schemas, validation, web-three mapping, and Bevy mapping
- visual smoke verification for web and native screenshots

The next roadmap should prioritize gameplay parity before advanced renderer
parity:

1. ECS gameplay model: components, resources, queries, schedules, commands,
   events, and deterministic fixed update.
2. Input and time: keyboard, pointer/touch, gamepad, action maps, fixed and
   variable timestep.
3. Asset pipeline: glTF/GLB, textures, audio, asset references, import
   diagnostics, and hot-reload-friendly bundle structure.
4. UI: HUD/menu IR with bindings, layout, text, buttons, bars, focus, and
   gamepad/keyboard navigation.
5. Animation: glTF clips first, then state machines and blending.
6. Physics: portable collider/rigid-body IR backed by a Bevy ecosystem physics
   plugin or a chosen native crate.

Advanced rendering, editor tooling, networking, custom shaders, and render graph
extensibility should follow only after a real small game runs consistently on
web and native.

## Checklist

### App, Plugins, and Runtime Loop

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| App lifecycle and plugin composition | Internal runtime adapter boot sequence | Partial | P0 | CLI can run web/native paths, but there is no public plugin model. |
| Startup, update, post-update schedules | Portable schedule IR and script lifecycle | Planned | P1 | Needed before real gameplay systems. |
| Fixed timestep | `fixedUpdate` schedule and fixed `dt` | Planned | P1 | Required for physics and deterministic movement. |
| Resources | Resource IR and SDK resource API | Partial | P1 | `ActiveCamera` exists as a resource; general resources are not implemented. |
| Events | Event schemas and runtime queues | Planned | P1 | Needed for UI, gameplay, audio triggers, and decoupled systems. |
| States | Game state/resource pattern | Planned | P1 | Needed for menu, loading, playing, paused, game-over flows. |
| Diagnostics/logging | Structured compiler/runtime diagnostics | Partial | P0 | Validator and runtime diagnostics exist; needs unified codes across domains. |
| Async tasks | Explicit async capability model | Deferred | P3 | Useful for loading/networking later, not required for V2 arena game. |

### ECS and World Model

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Entities | Stable string IDs mapped to runtime handles | Done | P0 | Current IR and Bevy runtime map IDs into native entities. |
| Components | Typed component schemas | Partial | P1 | Built-in render components exist; custom/gameplay components are not done. |
| Queries | SDK query declarations and runtime query host | Planned | P1 | Core blocker for TypeScript systems. |
| Change detection | Dirty flags or changed-query semantics | Planned | P2 | Important for performance and UI bindings. |
| Commands | Spawn/despawn/add/remove component command buffers | Planned | P1 | Should match ECS structural-change discipline. |
| Hierarchy | Parent-child relationships and local transforms | Done | P0 | Current IR uses `Hierarchy.parent`; web and Bevy map it. |
| Prefabs/scenes | Prefab IR and scene instancing | Planned | P1 | Required for reusable enemies, pickups, projectiles, and levels. |
| Reflection/type registry | Schema registry for components/resources/events | Planned | P2 | Needed for tooling, editor, save/load, and validation. |

### Transforms, Coordinates, and Visibility

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Local transform | Position, quaternion rotation, scale | Done | P0 | Implemented across SDK, IR, web, and Bevy. |
| Global transform propagation | Runtime-derived world transforms | Partial | P0 | Native Bevy handles this; web relies on Three.js hierarchy. Need tests. |
| Look-at helpers | SDK `lookAt` capture | Partial | P0 | Supported in docs/SDK shape; verify implementation before marking done. |
| Visibility | `visible`/layers/culling metadata | Partial | P1 | `MeshRenderer.visible` is typed but not consistently enforced. |
| Coordinate conventions | Documented world axes, units, handedness | Planned | P0 | Must be explicit before physics, animation, and imported assets expand. |

### 3D Rendering

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Mesh rendering | `MeshRenderer` component | Done | P0 | Primitive meshes render in both runtimes. |
| Primitive 3D shapes | Box, sphere, plane; add capsule/cylinder | Partial | P1 | Current code supports box/sphere/plane only. |
| Cameras | Perspective first, orthographic later | Partial | P1 | SDK/IR mention orthographic; runtimes mainly implement perspective. |
| Lights | Ambient, directional, point, spot | Partial | P1 | Current runtime supports ambient/directional; add point/spot parity. |
| PBR material | Standard material with color/metal/roughness | Partial | P1 | Current subset lacks textures, emissive, alpha, normal maps, occlusion. |
| Textures | Texture assets and material slots | Planned | P1 | Needed for V2 visual quality and asset parity. |
| glTF/GLB meshes | Static model asset references | Planned | P1 | Key parity item because Bevy advertises glTF loading. |
| Shadows | Directional/point light shadows | Planned | P2 | Not needed for first V2 loop, but important for native visual quality. |
| Render layers/cameras | Camera layer filtering | Deferred | P3 | Useful for UI/world separation and minimaps later. |
| Post-processing | Bloom, tonemapping, fullscreen effects | Deferred | P3 | Bevy 0.18 improved fullscreen materials; keep after gameplay foundations. |
| Atmosphere/fog/sky | Portable environment settings | Deferred | P3 | Bevy has strong atmosphere features; avoid early complexity. |
| Custom shaders/materials | Shader/material IR with target restrictions | Deferred | P3 | Requires serious portability design across Three.js and Bevy/wgpu. |
| Render graph | Public custom render graph API | Out of scope | P3 | Keep Bevy render graph internal to adapter. |
| Raytracing/Solari | Native-only experimental renderer option | Out of scope | P3 | Not portable to web-three; do not expose as core SDK contract. |

### 2D Rendering

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Sprites | Sprite/image component and texture atlas | Planned | P2 | Needed if the product expands beyond 3D-first games. |
| Sprite sheets | Atlas asset and animation metadata | Deferred | P2 | Useful for effects and UI, but not core to the current 3D roadmap. |
| 2D cameras | Orthographic camera and pixel scaling | Planned | P2 | Needed for menus, overlays, and possible 2D game templates. |
| 2D materials/shapes | Basic colored/textured quads | Deferred | P2 | Can follow texture support. |
| Tilemaps | Chunk/tilemap IR | Deferred | P3 | Not a V2 arena-game requirement. |

### Assets and Loading

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Asset manifest | Bundle-relative asset manifest | Done | P0 | Current manifest supports generated mesh assets. |
| Asset validation | Missing references and schema checks | Partial | P0 | Current validator covers V1; needs domain-specific asset diagnostics. |
| glTF/GLB | Model, scene, material, animation import | Planned | P1 | Biggest asset-pipeline parity gap. |
| Textures | PNG/JPEG/WebP source assets | Planned | P1 | Required for PBR material parity. |
| Audio assets | Audio manifest and playback references | Planned | P1 | Needed for playable V2 game feel. |
| Asset preprocessing | Import cache and target variants | Planned | P2 | Required for mobile packaging and production builds. |
| Hot reload | Dev-server file watching and runtime patching | Planned | P2 | Bevy supports asset hot reload; start with web dev loop then native. |
| Save/load scenes | Serialized world/prefab instances | Deferred | P3 | Useful after prefab and resource model stabilizes. |

### Input and Interaction

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Keyboard input | Action/axis map | Planned | P1 | Must be first input milestone. |
| Pointer/mouse input | Pointer position/buttons and ray picking | Planned | P1 | Needed for menus, camera control, and web parity. |
| Touch input | Touch actions and virtual controls | Planned | P1 | Mobile direction makes this first-class. |
| Gamepad input | Gamepad actions and axes | Planned | P2 | Required for production-feeling desktop games. |
| Picking | Entity picking events | Planned | P2 | Bevy includes picking in high-level feature sets; useful for UI/editor. |
| Cursor lock/custom cursors | Explicit platform capability | Deferred | P3 | Keep outside core until camera-controller work. |
| Camera controllers | Built-in orbit/fly/third-person controllers | Planned | P1 | Bevy 0.18 has first-party basic fly/pan controllers; ThreeNative should expose game-friendly controller presets. |

### Scripting and Gameplay Systems

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Rust systems | Internal Bevy runtime systems | Partial | P0 | Bevy adapter uses Rust systems/bootstrap, not public authoring. |
| TypeScript systems | Bundled JS systems with ECS host API | Planned | P1 | Central V2 feature. |
| System ordering | Schedule stages and before/after constraints | Planned | P1 | Needed for predictable gameplay. |
| Read/write access declaration | Validator-enforced system metadata | Planned | P1 | Important for AI repair and future parallelism. |
| Command buffers | Deferred structural mutations | Planned | P1 | Needed for spawning/despawning bullets, enemies, effects. |
| Determinism controls | Fixed update, seeded RNG, stable ordering | Planned | P2 | Needed before networking/replay/save ambitions. |
| Native gameplay extensions | Rust plugin escape hatch | Deferred | P3 | Useful later, but public contract remains TypeScript + IR. |

### UI, Text, and Menus

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| ECS-driven UI | Portable retained UI IR | Planned | P1 | Docs describe React-style authoring; implementation not present. |
| Flex layout | Stack/row/column constraints | Planned | P1 | Bevy UI uses flexbox-like layout; mirror at semantic level. |
| Text rendering | Text nodes with font assets | Planned | P1 | Needed for HUD and menus. |
| Buttons/sliders/bars | Basic interactive widgets | Planned | P1 | V2 needs menus, HUD, and touch controls. |
| Focus/navigation | Keyboard/gamepad directional navigation | Planned | P2 | Bevy 0.18 added automatic directional navigation; match after basic UI. |
| Rich text/font features | Font weights, underline, OpenType features | Deferred | P3 | Useful but not early-game critical. |
| Tooling widgets | Feathers-like editor widgets | Deferred | P3 | Relevant only when editor/tooling work begins. |

### Audio

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Load audio assets | Audio asset manifest entries | Planned | P1 | Required for playable game feedback. |
| One-shot sounds | Event-triggered sound playback | Planned | P1 | First useful audio slice. |
| Music/loops | Looping audio sources | Planned | P1 | Needed for demo polish. |
| Spatial audio | 3D positional emitters/listeners | Deferred | P2 | Good parity target after basic audio. |
| Mixing/buses | Groups, volume, pause/mute | Deferred | P2 | Production feature, not V2 blocker. |

### Animation

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Transform animation | Clip tracks targeting transforms | Planned | P1 | Can support simple doors, pickups, moving hazards. |
| glTF animation clips | Imported clips by name | Planned | P1 | Necessary for character/prop asset parity. |
| Skeletal animation | Skinned mesh playback | Planned | P2 | Bevy supports skeletal animation; needs careful asset pipeline design. |
| Animation blending | State machine and blend parameters | Deferred | P2 | Important for real characters, not first asset milestone. |
| Morph targets | Blend shape animation | Deferred | P3 | Advanced imported-asset support. |
| Animation events | Clip event markers into gameplay events | Deferred | P2 | Useful after events and animation playback exist. |

### Physics and Collision

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Core physics | Portable physics IR backed by chosen plugin | Planned | P1 | Bevy itself does not advertise first-party physics on the main feature page; choose Rapier or Avian deliberately. |
| Colliders | Box, sphere, capsule, cylinder, trimesh metadata | Planned | P1 | Start with simple colliders. |
| Rigid bodies | Static, kinematic, dynamic body types | Planned | P1 | Needed for arena gameplay. |
| Triggers/sensors | Trigger events | Planned | P1 | Needed for pickups, hitboxes, zones. |
| Raycasts/shape casts | Query API | Planned | P2 | Useful for weapons, selection, AI, and ground checks. |
| Character controller | Kinematic movement helper | Planned | P2 | Avoid hand-rolling per game. |
| Physics debug draw | Runtime debug overlay | Deferred | P2 | Valuable for AI/human repair loops. |

### Networking and Multiplayer

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Networking | Explicit networking capability and SDK APIs | Deferred | P3 | Not in Bevy's advertised core feature list and not required for V2. |
| Replication | State sync model | Deferred | P3 | Requires deterministic ECS and authority model first. |
| Matchmaking/services | External service integration | Out of scope | P3 | Product layer, not engine parity. |

### Platforms, Packaging, and Performance

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| Desktop native | Bevy runtime build/run | Partial | P0 | Native screenshot path exists; packaging/distribution still later. |
| Web | Three.js web preview/runtime | Done | P0 | Current web render path is the reference V1 visual loop. |
| Android/iOS | Mobile target profiles and packaging | Planned | P2 | Explicit V3 target in existing roadmap. |
| Window/resolution config | Target profile settings | Planned | P1 | Needed for desktop/mobile UX. |
| Performance profiling | CLI profiling/reporting | Planned | P2 | Required before production claims. |
| Feature collections | Target capability profiles | Planned | P2 | Bevy 0.18 added feature collections; ThreeNative should mirror this concept in bundle validation. |
| Asset budgets | Texture/model/audio limits by target | Planned | P2 | Important for mobile and AI-generated assets. |

### Tooling, Editor, and AI Workflow

| Bevy capability | ThreeNative target | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| CLI | Create/validate/build/dev/verify commands | Partial | P0 | V1 CLI exists; needs more game-domain commands. |
| Examples | Canonical example and templates | Partial | P0 | Current V1 example exists; add playable V2 template. |
| Visual verification | Screenshot and motion checks | Done | P0 | Current repo has web/native visual artifacts and verification scripts. |
| Inspector/editor | Entity/resource inspector and scene editor | Deferred | P3 | Bevy editor is still evolving; do not block V2 on editor work. |
| Hot repair loop | Structured diagnostics plus rerunnable verification | Partial | P1 | Continue improving error locality and suggested repairs. |
| Docs and tutorials | Capability-led docs | Partial | P1 | Keep docs synchronized with implemented parity status. |

## Recommended Build Order

### V1 Stabilization

- [x] Keep primitive rendering parity green across SDK, IR, web-three, and Bevy.
- [x] Keep screenshot verification nonblank for web and native paths.
- [ ] Document coordinate conventions, color-space assumptions, and default
      units.
- [ ] Tighten status labels in docs so aspirational support does not look
      implemented.

### V2 Playable Game

- [ ] Add ECS gameplay components, custom component schemas, resources, and
      events.
- [ ] Add TypeScript system registration, schedule stages, queries, and command
      buffers.
- [ ] Add keyboard and pointer input action maps.
- [ ] Add fixed timestep and time resource.
- [ ] Add point/spot lights, orthographic camera, and visibility handling.
- [ ] Add glTF/GLB static mesh loading.
- [ ] Add texture assets and standard material texture slots.
- [ ] Add basic audio: one-shots and looping music.
- [ ] Add UI IR for HUD text, bars, buttons, and simple menus.
- [ ] Add simple physics: colliders, rigid bodies, triggers, and collision
      events.
- [ ] Ship one playable arena template that uses all of the above.

### V3 Production Platform

- [ ] Add mobile target profiles, packaging, safe areas, touch controls, and
      lifecycle handling.
- [ ] Add animation clips, glTF animation playback, and simple animation state
      machines.
- [ ] Add hot reload for assets and bundle patches.
- [ ] Add performance profiling and target budgets.
- [ ] Add save/load or scene/prefab instancing.
- [ ] Add gamepad support and directional UI navigation.
- [ ] Add spatial audio and audio mixing.
- [ ] Add stronger AI repair reports that map runtime failures back to SDK,
      compiler, IR, or adapter domains.

### Later Advanced Parity

- [ ] Custom shader/material IR.
- [ ] Render-to-texture and post-processing chains.
- [ ] Atmosphere, fog, skybox, and environment probes.
- [ ] Advanced animation blending, masks, IK, and morph targets.
- [ ] Networking and replication.
- [ ] Visual editor and inspector.
- [ ] Native extension/plugin API.

## Sources Checked

- Bevy homepage feature overview: https://bevy.org/
- Bevy 0.18 release notes: https://bevy.org/news/bevy-0-18/
- Bevy official examples catalog: https://bevy.org/examples/
- Bevy crate documentation: https://docs.rs/bevy
- Rapier Bevy plugin documentation for physics ecosystem context:
  https://rapier.rs/docs/user_guides/bevy_plugin/getting_started_bevy/


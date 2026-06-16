# Conformance Fixtures

Conformance fixtures are shared IR bundles consumed by both the Three.js web
runtime and the Bevy native runtime. They are source fixtures, not generated
runtime artifacts.

Each fixture directory contains:

- `game.bundle/manifest.json`
- `game.bundle/world.ir.json`
- `game.bundle/materials.ir.json`
- `game.bundle/assets.manifest.json`
- `game.bundle/target.profile.json`

Expected runtime reports should be written outside this fixture tree. The
top-level gate writes:

```txt
artifacts/conformance/<fixture>/<runtime>.report.json
artifacts/conformance/<fixture>/comparison.report.json
```

Package-local tests may write equivalent temporary reports under their own
test artifact directories, but committed fixture source directories must contain
only authored IR inputs and catalog documentation.

## Catalog

| Fixture | Capability tags | Purpose |
| --- | --- | --- |
| `basic-scene` | `rendering:mesh.primitive.box`, `rendering:mesh.primitive.capsule`, `rendering:mesh.primitive.cylinder`, `rendering:material.standard`, `rendering:light.directional`, `rendering:camera.perspective`, `transform:hierarchy` | Baseline scene for transform hierarchy, generated meshes, standard material, camera, and light mapping. |
| `primitive-mapping` | `rendering:mesh.primitive.annulus`, `rendering:mesh.primitive.box`, `rendering:mesh.primitive.capsule`, `rendering:mesh.primitive.circle`, `rendering:mesh.primitive.cone`, `rendering:mesh.primitive.conicalFrustum`, `rendering:mesh.primitive.cylinder`, `rendering:mesh.primitive.extrudedRectangle`, `rendering:mesh.primitive.plane`, `rendering:mesh.primitive.regularPolygon`, `rendering:mesh.primitive.sphere`, `rendering:mesh.primitive.torus`, `rendering:material.standard`, `rendering:light.directional`, `rendering:camera.perspective`, `transform:hierarchy` | Shared generated primitive mapping fixture for all promoted primitive shapes consumed by the web Three.js and native Bevy adapters. |
| `procedural-mesh` | `asset:mesh.generated`, `ecs:resources`, `rendering:camera.active`, `rendering:camera.orthographic`, `rendering:light.ambient`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh-renderer`, `rendering:mesh.primitive.custom` | V8 procedural mesh fixture for MeshBuilder-authored mushroom/tree props emitted as binary generated mesh payloads with bounds, topology, usage, budget, generation metadata, and matching web/native conformance observations. |
| `v8-overlay-webview` | `overlay:bridge`, `overlay:input.none`, `overlay:target.desktop`, `overlay:target.web`, `overlay:transparent`, `overlay:webview` | V8 optional webview overlay fixture for bundle-local overlay entry assets, typed inventory bridge messages, transparent mounting, and pass-through input semantics that keep Bevy/canvas clicks available. |
| `v8-input-drag-picking` | `input:drag-picking`, `scripting:service.picking.mesh`, `scripting:service.picking.pointerRay` | V8 input fixture for a deterministic pointer-ray mesh-picking drag trace over ordered web/native JSON events. |
| `v6-animation-clips` | `animation:clip-metadata`, `animation:playback-service`, `asset:model.glb`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:systems` | V6 animation clip contract fixture for deterministic model asset clip metadata, `animation.play` service trace evidence, and V7 animation graph deferrals. |
| `v6-physics-events` | `physics:collider.box`, `physics:collider.sphere`, `physics:collision-events`, `physics:rigid-body.kinematic`, `physics:rigid-body.static`, `physics:trigger-collider` | V6 physics event fixture for deterministic collision and trigger enter observations in web and Bevy conformance reports. |
| `v6-retained-ui` | `ui:action`, `ui:binding.resource`, `ui:focusable`, `ui:node.bar`, `ui:node.button`, `ui:node.column`, `ui:node.stack`, `ui:node.text`, `ui:runtime` | V6 retained UI fixture for portable HUD text, bar, button, resource binding metadata, and focus/action observations. |
| `v6-audio-playback` | `asset:audio.ogg`, `asset:audio.wav`, `audio:autoplay`, `audio:loop`, `audio:one-shot`, `audio:volume`, `ecs:events` | V6 audio fixture for bundle-local OGG/WAV assets, autoplay loop music, event-triggered one-shot commands, and portable volume observations in web and Bevy conformance reports. |
| `v6-resources-events` | `ecs:event-schemas`, `ecs:events`, `ecs:resource-schemas`, `ecs:resources`, `scripting:event-reads`, `scripting:event-writes`, `scripting:resource-reads`, `scripting:resource-writes`, `scripting:schedule.startup`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:systems` | V6 resource/event conformance fixture for serialized resource values, queued event values, startup/update schedule ordering, system access declarations, and fixed trace effect-log parity. |
| `v7-advanced-physics-character` | `character:blocking`, `character:controller`, `character:grounding`, `input:axes`, `physics:collider.box`, `physics:collider.sphere`, `physics:contact-filtering`, `physics:query.overlap`, `physics:query.shape-cast`, `physics:rigid-body.kinematic`, `physics:rigid-body.static`, `scripting:schedule.fixedUpdate`, `scripting:script-bundle`, `scripting:service.physics.overlap`, `scripting:service.physics.shapeCast`, `scripting:systems` | V7 physics/character fixture for portable collider filters, primitive overlap and swept box shape-cast service traces, plus a deterministic grounded/blocking character movement trace. |
| `v7-animation-graphs-particles` | `animation:clip-metadata`, `animation:events`, `animation:graph`, `animation:state-machine`, `asset:model.glb`, `particles:bounded-emitter` | V7 animation fixture for constrained graph/state-machine metadata, event markers, and bounded particle emitters on a model asset. |
| `v7-rich-ui-navigation` | `ui:action`, `ui:focus-order`, `ui:input-actions`, `ui:navigation`, `ui:node.button`, `ui:node.column`, `ui:node.stack`, `ui:runtime`, `ui:safe-area` | V7 UI fixture for portable focus order, navigation links, input action refs, safe-area metadata, and deterministic focus/activation trace evidence. |
| `v7-spatial-audio-buses` | `asset:audio.ogg`, `asset:audio.wav`, `audio:autoplay`, `audio:bus`, `audio:listener`, `audio:loop`, `audio:music`, `audio:one-shot`, `audio:spatial-emitter`, `audio:volume`, `audio:volume-routing`, `ecs:events` | V7 audio fixture for portable bus routing, listener/emitter metadata, autoplay looping music, and event-triggered spatial one-shot observations. |
| `v7-renderer-dense-content` | `asset:imported-transform`, `asset:model.gltf`, `environment:camera-bookmarks`, `environment:instances`, `environment:lod`, `environment:path`, `environment:scatter-instances`, `environment:scene`, `environment:source-assets`, `environment:terrain`, `rendering:instancing-observation`, `rendering:runtime-lod` | V7 renderer/content fixture for fixed runtime LOD selection, imported transform metadata, and model-backed repeated-instance observations. |
| `v7-scripting-lifecycle` | `ecs:component-hooks`, `ecs:component-reflection`, `ecs:component-schemas`, `ecs:event-schemas`, `ecs:events`, `ecs:observer-propagation`, `ecs:resource-schemas`, `ecs:resources`, `scripting:command.despawn`, `scripting:command.spawn`, `scripting:component-hooks`, `scripting:component-reflection`, `scripting:event-reads`, `scripting:event-writes`, `scripting:hot-reload.invalidate`, `scripting:larger-fixtures`, `scripting:observer-propagation`, `scripting:replay.fixed-trace`, `scripting:resource-reads`, `scripting:resource-writes`, `scripting:schedule.fixedUpdate`, `scripting:schedule.postUpdate`, `scripting:schedule.startup`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:service.animation.play`, `scripting:state.app`, `scripting:state.computed`, `scripting:state.substate`, `scripting:state.system-local-disallowed`, `scripting:systems` | V7 scripting fixture for deterministic lifecycle metadata, resource-derived app/computed/substate reads, component hook observations, component reflection reads, target-to-ancestor observer propagation, multi-schedule resource handoff, queued events, command/service effects, and fixed web/native lifecycle effect-log parity. |
| `v7-packaging-target-profiles` | `diagnostics:platform`, `packaging:bundle-loading`, `packaging:desktop`, `packaging:target-profile`, `rendering:camera.perspective`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh.primitive.box`, `rendering:mesh.primitive.capsule`, `rendering:mesh.primitive.cylinder`, `transform:hierarchy` | V7 packaging fixture for desktop target profile validation, stable local package artifacts, packaged bundle loading metadata, and explicit non-desktop target diagnostics. |
| `v7-performance-budgets` | `performance:asset-load-budget`, `performance:draw-instance-budget`, `performance:entity-budget`, `performance:frame-budget`, `performance:package-size-budget`, `rendering:camera.perspective`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh.primitive.box`, `transform:hierarchy` | V7 performance fixture for target-profile frame/load/draw/entity/package-size budget thresholds and fixed web/native-style metric reports. |
| `v5-drift-surface` | `asset:model.gltf`, `asset:texture.png`, `environment:atmosphere`, `environment:camera-bookmarks`, `environment:instances`, `environment:path`, `environment:scene`, `environment:source-assets`, `environment:terrain`, `rendering:camera.active`, `rendering:camera.orthographic`, `rendering:fog.exponential`, `rendering:light.ambient`, `rendering:light.angle`, `rendering:light.point`, `rendering:light.range`, `rendering:light.spot`, `rendering:material.texture.base-color`, `rendering:material.texture.emissive`, `rendering:material.texture.metallic-roughness`, `rendering:material.texture.normal`, `rendering:material.texture.occlusion`, `rendering:shadows`, `rendering:visibility`, `scripting:script-bundle`, `transform:hierarchy` | V5 drift catalog fixture for visibility, active orthographic camera, point/spot lights, texture slots, atmosphere metadata, source environment assets, and compact V4 scripting metadata. |

## V7 Fixture Catalog

`v7-fixture-catalog.json` is the pre-runtime V7 evidence catalog. It does not
claim V7 runtime support. Instead, each category maps a V7 ticket to:

- an existing V5/V6 baseline bundle path,
- planned accepted and rejected V7 fixture bundle paths,
- target capability expectations,
- report artifact paths under `artifacts/conformance/<fixture>/`, and
- diagnostic codes that rejected fixtures must surface instead of silently
  dropping backend-specific behavior.

This lets V7 feature tickets point at shared fixture and report paths before
runtime support is promoted.

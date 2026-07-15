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
packages/ir/artifacts/conformance/<fixture>/<runtime>.report.json
packages/ir/artifacts/conformance/<fixture>/comparison.report.json
```

Package-local tests may write equivalent temporary reports under their own
test artifact directories, but committed fixture source directories must contain
only authored IR inputs and catalog documentation.

## Catalog

| Fixture | Capability tags | Purpose |
| --- | --- | --- |
| `contact-shadows-grounding` | `environment:atmosphere`, `rendering:camera.perspective`, `rendering:contact-shadows`, `rendering:material.standard`, `rendering:mesh.primitive.box` | Lumen Lite paired-opacity grounding fixture for monotonic web/native contact-pool luminance, static capture-cost observations, and nonblank screenshot proof through `pnpm verify:focused verify:contact-shadows`. |
| `shadow-cascade-stability` | `environment:atmosphere`, `rendering:camera.perspective`, `rendering:material.standard`, `rendering:mesh.primitive.box`, `rendering:shadow-cascade-profile`, `rendering:shadows` | Lumen Lite two-cascade practical-split fixture for exact shared web/native cascade-profile reports and objective sub-texel camera-motion stability proof through `pnpm verify:focused verify:shadow-cascade-stability`. |
| `basic-scene` | `rendering:mesh.primitive.box`, `rendering:mesh.primitive.capsule`, `rendering:mesh.primitive.cylinder`, `rendering:material.standard`, `rendering:light.directional`, `rendering:camera.perspective`, `transform:hierarchy` | Baseline scene for transform hierarchy, generated meshes, standard material, camera, and light mapping. |
| `primitive-mapping` | `rendering:mesh.primitive.annulus`, `rendering:mesh.primitive.box`, `rendering:mesh.primitive.capsule`, `rendering:mesh.primitive.circle`, `rendering:mesh.primitive.cone`, `rendering:mesh.primitive.conicalFrustum`, `rendering:mesh.primitive.cylinder`, `rendering:mesh.primitive.extrudedRectangle`, `rendering:mesh.primitive.plane`, `rendering:mesh.primitive.regularPolygon`, `rendering:mesh.primitive.sphere`, `rendering:mesh.primitive.torus`, `rendering:material.standard`, `rendering:light.directional`, `rendering:camera.perspective`, `transform:hierarchy` | Shared generated primitive mapping fixture for all promoted primitive shapes consumed by the web Three.js and native Bevy adapters. |
| `procedural-mesh` | `asset:mesh.generated`, `ecs:resources`, `physics:collider`, `physics:rigid-body`, `rendering:camera.active`, `rendering:camera.perspective`, `rendering:light.ambient`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh-renderer`, `rendering:mesh.primitive.custom` | Registry-derived V8 procedural fixture for the visual pine, coherent-noise bush, and CSG arch helpers, emitted as binary generated meshes; the bush and arch also prove compiler-owned derived collider IR. |
| `v8-overlay-webview` | `overlay:bridge`, `overlay:input.none`, `overlay:target.desktop`, `overlay:target.web`, `overlay:transparent`, `overlay:webview` | V8 optional webview overlay fixture for bundle-local overlay entry assets, typed inventory bridge messages, transparent mounting, and pass-through input semantics that keep Bevy/canvas clicks available. |
| `animation-clips` | `animation:clip-metadata`, `animation:playback-service`, `asset:model.glb`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:systems` | V6 animation clip contract fixture for deterministic model asset clip metadata, `animation.play` service trace evidence, and V7 animation graph deferrals. |
| `physics-events` | `physics:collider.box`, `physics:collider.sphere`, `physics:collision-events`, `physics:rigid-body.kinematic`, `physics:rigid-body.static`, `physics:trigger-collider` | V6 physics event fixture for deterministic collision and trigger enter observations in web and Bevy conformance reports. |
| `retained-ui` | `ui:action`, `ui:binding.resource`, `ui:focusable`, `ui:node.bar`, `ui:node.button`, `ui:node.column`, `ui:node.stack`, `ui:node.text`, `ui:runtime` | V6 retained UI fixture for portable HUD text, bar, button, resource binding metadata, and focus/action observations. |
| `audio-playback` | `asset:audio.ogg`, `asset:audio.wav`, `audio:autoplay`, `audio:loop`, `audio:one-shot`, `audio:volume`, `ecs:events` | V6 audio fixture for bundle-local OGG/WAV assets, autoplay loop music, event-triggered one-shot commands, and portable volume observations in web and Bevy conformance reports. |
| `resources-events` | `ecs:event-schemas`, `ecs:events`, `ecs:resource-schemas`, `ecs:resources`, `scripting:event-reads`, `scripting:event-writes`, `scripting:resource-reads`, `scripting:resource-writes`, `scripting:schedule.startup`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:systems` | V6 resource/event conformance fixture for serialized resource values, queued event values, startup/update schedule ordering, system access declarations, and fixed trace effect-log parity. |
| `advanced-physics-character` | `character:blocking`, `character:controller`, `character:grounding`, `character:move-override`, `input:axes`, `physics:collider.box`, `physics:collider.sphere`, `physics:contact-filtering`, `physics:query.overlap`, `physics:query.shape-cast`, `physics:rigid-body.kinematic`, `physics:rigid-body.static`, `scripting:schedule.fixedUpdate`, `scripting:script-bundle`, `scripting:service.physics.overlap`, `scripting:service.physics.shapeCast`, `scripting:systems` | V7 physics/character fixture for portable collider filters, primitive overlap and swept box shape-cast service traces, plus deterministic grounded/blocking character movement and direction/speed override traces. |
| `animation-graphs-particles` | `animation:clip-metadata`, `animation:events`, `animation:graph`, `animation:state-machine`, `asset:model.glb`, `particles:bounded-emitter` | V7 animation fixture for constrained graph/state-machine metadata, event markers, and bounded particle emitters on a model asset. |
| `v8-transform-animation` | `animation:transform-tracks`, `animation:transform.position`, `animation:transform.scale`, `animation:easing.linear`, `animation:easing.step`, `animation:loop-repeat` | V8 transform animation fixture for deterministic entity transform track sampling across web and Bevy traces. |
| `v8-animation-controls` | `scripting:schedule.update`, `scripting:script-bundle`, `scripting:service.animation.query`, `scripting:service.animation.stop`, `scripting:systems` | V8 animation controls fixture for deterministic `animation.query` and `animation.stop` service effect-log parity across web and Bevy. |
| `animation-state` | `scripting:schedule.update`, `scripting:script-bundle`, `scripting:service.animation.play`, `scripting:service.animation.query`, `scripting:service.animation.stop`, `scripting:systems` | V9 animation state fixture for runtime-derived play, query, stop, and post-stop query service state parity across web and Bevy. |
| `animation-blending` | `animation:blend.crossfade`, `animation:clip-metadata`, `animation:graph`, `asset:model.glb`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:service.animation.play`, `scripting:service.animation.query`, `scripting:systems` | V9 animation blending fixture for service-triggered bounded crossfade state with portable source/target clips, weights, and elapsed blend time. |
| `physics-character` | `character:push-policy`, `navigation:static-regions`, `physics:broad-sensors`, `physics:primitive-solver-v2` | V9 physics/character fixture for primitive solver traces, broad sensors, character push policy, and static navigation queries. |
| `physics-character-solver` | `physics:collider.box`, `physics:collider.capsule`, `physics:primitive-solver-v2`, `physics:rigid-body.dynamic`, `physics:rigid-body.kinematic`, `physics:rigid-body.static` | V9 primitive solver fixture for bounded box/sphere/capsule rigid-body declarations. |
| `photoreal-ao-corner-test` | `rendering:ambient-occlusion.screen-space`, `rendering:camera.perspective`, `rendering:mesh.primitive.box` | PRD-015 photoreal AO fixture for a matte corner/contact scene with web and Bevy screenshot/report proof through `pnpm verify:rendering-photoreal`. |
| `photoreal-ao-sweep-low` | `rendering:ambient-occlusion.screen-space`, `rendering:camera.perspective`, `rendering:mesh.primitive.box` | Low-radius/intensity AO sweep endpoint derived from the calibrated corner scene for adapter-local monotonicity proof. |
| `photoreal-ao-sweep-high` | `rendering:ambient-occlusion.screen-space`, `rendering:camera.perspective`, `rendering:mesh.primitive.box` | High-radius/intensity AO sweep endpoint derived from the calibrated corner scene for adapter-local monotonicity proof. |
| `photoreal-lighting-units-probe` | `rendering:camera.perspective`, `rendering:light.ambient`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh.primitive.box` | PRD-015 neutral lighting fixture for directional/ambient unit parity before effect-specific tuning. |
| `photoreal-bloom-emissive-test` | `rendering:camera.perspective`, `rendering:material.emissive`, `rendering:material.emissive-bloom`, `rendering:material.extended.unlitMasked`, `rendering:mesh.primitive.box`, `rendering:postprocess.bloom` | PRD-015 photoreal bloom fixture for emissive strip lights in a dim room with blue unlit background panels and web/Bevy screenshot/report proof through `pnpm verify:rendering-photoreal`. |
| `photoreal-dof-depth-test` | `rendering:camera.perspective`, `rendering:depth-of-field`, `rendering:mesh.primitive.box`, `rendering:mesh.primitive.sphere` | PRD-015 photoreal depth-of-field fixture for near/focus/far depth separation with web and Bevy screenshot/report proof through `pnpm verify:rendering-photoreal`. |
| `photoreal-motion-blur-moving-test` | `rendering:camera.perspective`, `rendering:material.emissive`, `rendering:mesh.primitive.box`, `rendering:postprocess.motion-blur`, `scripting:schedule.update`, `scripting:script-bundle` | PRD-015 photoreal motion-blur fixture for a scripted moving emissive marker with aligned web/native temporal-accumulation traces and exterior-trail screenshot proof through `pnpm verify:rendering-photoreal`. |
| `photoreal-reflective-wet-floor` | `rendering:camera.perspective`, `rendering:material.emissive`, `rendering:mesh.primitive.box`, `rendering:postprocess.screen-space-reflections` | PRD-015 photoreal SSR fixture for wet-floor reflection proof with web planar baseline and Bevy native screen-space reflection screenshot/report proof through `pnpm verify:rendering-photoreal`. |
| `rendering-lights` | `environment:light-probes`, `environment:skybox`, `rendering:debug-gizmos`, `rendering:hlod-fades` | V9 rendering/lights fixture for skybox, probes, dense content budget metadata, and visual evidence. |
| `rich-ui-navigation` | `ui:action`, `ui:focus-order`, `ui:input-actions`, `ui:navigation`, `ui:node.button`, `ui:node.column`, `ui:node.stack`, `ui:runtime`, `ui:safe-area` | V7 UI fixture for portable focus order, navigation links, input action refs, safe-area metadata, and deterministic focus/activation trace evidence. |
| `spatial-audio-buses` | `asset:audio.ogg`, `asset:audio.wav`, `audio:autoplay`, `audio:bus`, `audio:listener`, `audio:loop`, `audio:music`, `audio:one-shot`, `audio:spatial-emitter`, `audio:volume`, `audio:volume-routing`, `ecs:events` | V7 audio fixture for portable bus routing, listener/emitter metadata, autoplay looping music, and event-triggered spatial one-shot observations. |
| `renderer-dense-content` | `asset:imported-transform`, `asset:model.gltf`, `environment:camera-bookmarks`, `environment:instances`, `environment:lod`, `environment:path`, `environment:scatter-instances`, `environment:scene`, `environment:source-assets`, `environment:terrain`, `rendering:instancing-observation`, `rendering:runtime-lod` | V7 renderer/content fixture for fixed runtime LOD selection, imported transform metadata, and model-backed repeated-instance observations. |
| `scripting-lifecycle` | `ecs:component-hooks`, `ecs:component-reflection`, `ecs:component-schemas`, `ecs:event-schemas`, `ecs:events`, `ecs:observer-propagation`, `ecs:resource-schemas`, `ecs:resources`, `scripting:command.despawn`, `scripting:command.spawn`, `scripting:component-hooks`, `scripting:component-reflection`, `scripting:event-reads`, `scripting:event-writes`, `scripting:hot-reload.invalidate`, `scripting:larger-fixtures`, `scripting:observer-propagation`, `scripting:replay.fixed-trace`, `scripting:resource-reads`, `scripting:resource-writes`, `scripting:schedule.fixedUpdate`, `scripting:schedule.postUpdate`, `scripting:schedule.startup`, `scripting:schedule.update`, `scripting:script-bundle`, `scripting:service.animation.play`, `scripting:state.app`, `scripting:state.computed`, `scripting:state.substate`, `scripting:state.system-local-disallowed`, `scripting:systems` | V7 scripting fixture for deterministic lifecycle metadata, resource-derived app/computed/substate reads, component hook observations, component reflection reads, target-to-ancestor observer propagation, multi-schedule resource handoff, queued events, command/service effects, and fixed web/native lifecycle effect-log parity. |
| `packaging-target-profiles` | `diagnostics:platform`, `packaging:bundle-loading`, `packaging:desktop`, `packaging:target-profile`, `rendering:camera.perspective`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh.primitive.box`, `rendering:mesh.primitive.capsule`, `rendering:mesh.primitive.cylinder`, `transform:hierarchy` | V7 packaging fixture for desktop target profile validation, stable local package artifacts, packaged bundle loading metadata, and explicit non-desktop target diagnostics. |
| `performance-budgets` | `performance:asset-load-budget`, `performance:draw-instance-budget`, `performance:entity-budget`, `performance:frame-budget`, `performance:package-size-budget`, `rendering:camera.perspective`, `rendering:light.directional`, `rendering:material.standard`, `rendering:mesh.primitive.box`, `transform:hierarchy` | V7 performance fixture for target-profile frame/load/draw/entity/package-size budget thresholds and fixed web/native-style metric reports. |
| `v5-drift-surface` | `asset:model.gltf`, `asset:texture.png`, `environment:atmosphere`, `environment:camera-bookmarks`, `environment:instances`, `environment:path`, `environment:scene`, `environment:source-assets`, `environment:terrain`, `rendering:camera.active`, `rendering:camera.orthographic`, `rendering:fog.exponential`, `rendering:light.ambient`, `rendering:light.angle`, `rendering:light.point`, `rendering:light.range`, `rendering:light.spot`, `rendering:material.texture.base-color`, `rendering:material.texture.emissive`, `rendering:material.texture.metallic-roughness`, `rendering:material.texture.normal`, `rendering:material.texture.occlusion`, `rendering:shadows`, `rendering:visibility`, `scripting:script-bundle`, `transform:hierarchy` | V5 drift catalog fixture for visibility, active orthographic camera, point/spot lights, texture slots, atmosphere metadata, source environment assets, and compact V4 scripting metadata. |

## V7 Fixture Catalog

`v7-fixture-catalog.json` is the pre-runtime V7 evidence catalog. It does not
claim V7 runtime support. Instead, each category maps a V7 ticket to:

- an existing V5/V6 baseline bundle path,
- planned accepted and rejected V7 fixture bundle paths,
- target capability expectations,
- report artifact paths under `packages/ir/artifacts/conformance/<fixture>/`, and
- diagnostic codes that rejected fixtures must surface instead of silently
  dropping backend-specific behavior.

This lets V7 feature tickets point at shared fixture and report paths before
runtime support is promoted.

## V9 Fixture Catalog

`v9-fixture-catalog.json` is the machine-readable owner catalog for latest V9
merge fixtures. Each entry records:

- owner PRD path,
- bundle path under `packages/ir/fixtures/conformance/`,
- promoted capability tags,
- expected report artifact paths,
- whether visual evidence is required,
- aggregate gate registration (`verify:v9`).

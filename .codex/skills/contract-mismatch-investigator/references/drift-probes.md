# Drift Probe Matrix

Use this matrix to choose contract mismatch probes. Keep evidence anchored to
structured IR/bundle data first, then runtime mapping code, then visual or
behavioral output.

## Core Bundle Probes

| Probe | Bundle Evidence | Three.js Consumer | Bevy Consumer | Typical Drift |
| --- | --- | --- | --- | --- |
| manifest paths | `manifest.json` | bundle loader | runtime asset loading | runtime reads stale or missing file |
| entity identity | `world.ir.json` ids | scene graph/object map | ECS entity map | lost parent, duplicated entity, unstable id |
| transforms | position/rotation/scale/matrix | Object3D transform mapping | Transform component mapping | axis, units, handedness, Euler order |
| hierarchy | parent/children order | Object3D nesting | parent-child components | child offset or visibility differs |
| target profile | `target.profile.json` | feature gates/defaults | native feature gates/defaults | unsupported feature silently ignored |

## Rendering Probes

| Probe | Bundle Evidence | Runtime Fields To Compare | Typical Drift |
| --- | --- | --- | --- |
| camera projection | active camera, fov, aspect, near/far, ortho bounds | Three camera vs Bevy camera/projection | framing, clipping, zoom mismatch |
| color space | material color, texture color metadata, renderer output | renderer encoding, texture color interpretation | washed out or oversaturated output |
| material base | baseColor, alpha, opacity, side, visibility | MeshBasic/Standard/PBR mapping | wrong color, transparency, culling |
| PBR response | roughness, metalness, emissive, normal map | material parameter mapping | lighting intensity or highlights differ |
| lights | type, color, intensity, range, angle, shadows | light object/component mapping | brightness, falloff, shadow direction |
| environment | fog, haze, sky, ambient, shadow policy | scene/environment setup | atmosphere or shadow mismatch |
| primitive geometry | shape dimensions and segments | geometry constructors | size, orientation, tessellation |
| glTF assets | asset URI, transform, scale, scene node | loader options and post-load transforms | imported model offset or scale |
| instancing | instance transforms/material refs | instanced mesh vs native batching | missing or reordered instances |
| render layers | layer masks, visibility flags | layer and culling setup | object visible only in one runtime |

## Non-Rendering Probes

| Probe | Bundle Evidence | Runtime Fields To Compare | Typical Drift |
| --- | --- | --- | --- |
| ECS components | component schemas and entity attachments | SDK/compiler output vs Bevy component insertion | behavior runs on different entity set |
| systems | schedule/order metadata | web loop vs native schedule | frame-order or initialization drift |
| physics | collider, body, mass, friction, restitution | physics adapter mapping | collision or movement differences |
| input | action map, pointer/keyboard/gamepad bindings | DOM input vs native input bridge | action fires only in one target |
| audio | clip refs, spatial flags, volume, loop | web audio vs Bevy audio mapping | missing, too loud, no spatialization |
| UI | layout, anchors, text, images | DOM/canvas UI vs Bevy UI | alignment, sizing, font behavior |

## Test Placement

Add tests at the earliest reliable layer:

| Drift Source | Preferred Test |
| --- | --- |
| SDK authoring API emits wrong intent | `packages/sdk` or compiler extraction test |
| bundle shape is wrong | `packages/compiler/src/emit` test |
| schema accepts/rejects wrong data | `packages/ir` validation test |
| Three.js mapping is wrong | `packages/runtime-web-three` test |
| Bevy mapping is wrong | `runtime-bevy` Rust test |
| shared fixture diverges | conformance fixture and `pnpm verify:conformance` |
| verifier missed a mismatch | `packages/cli/src/verify` test |

## Reporting Template

Use this concise structure:

```txt
Finding: <one sentence>
Contract field: <bundle path and JSON pointer>
Three.js mapping: <file:line>
Bevy mapping: <file:line>
Evidence: <artifact/test/command output>
Likely source: authoring | compiler | schema | web runtime | Bevy runtime | verifier
Recommended guard: <test or verifier assertion>
```

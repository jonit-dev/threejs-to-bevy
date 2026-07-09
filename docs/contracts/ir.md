# Intermediate Representation

The intermediate representation (IR) is the stable contract between the TypeScript SDK/compiler and every runtime. The SDK may evolve and runtimes may change internally, but a valid IR bundle for a supported version must load consistently on all compatible targets.

The IR is data, not executable engine code.

## Goals

The IR must:

- Represent scenes, ECS worlds, assets, materials, animations, input maps, systems, and target profiles.
- Be deterministic for equivalent source input.
- Be validated before runtime loading.
- Be runtime-neutral.
- Be friendly to AI tools, schemas, diffs, and diagnostics.
- Preserve enough semantic information for native and web runtimes to produce comparable behavior.

The IR must not:

- Contain arbitrary JavaScript functions except references to compiled system bundle exports.
- Depend on Three.js classes or Bevy types.
- Store browser, renderer, GPU, filesystem, or native handles.
- Encode side effects from unsupported JavaScript execution.

## Bundle Layout

V2 emits a directory bundle:

```txt
game.bundle/
  manifest.json
  world.ir.json
  ui.ir.json
  assets.manifest.json
  materials.ir.json
  animations.ir.json
  input.ir.json
  systems.ir.json
  target.profile.json
  scripts.bundle.js
  schemas/
    components.schema.json
    resources.schema.json
    events.schema.json
    ui.schema.json
```

Rules:

- JSON is canonical UTF-8.
- Binary formats may be added later, but JSON remains the reference format for V1.
- Bundle-relative paths use `/`.
- Runtimes load through `manifest.json`, not by guessing file names.

## Versioning

Every IR file includes a schema version.

```json
{
  "schema": "threenative.world",
  "version": "0.1.0"
}
```

Rules:

- Versions use semantic versioning.
- Patch versions may add optional fields with declared defaults.
- Minor versions may add new schema types or capabilities.
- Major versions may break compatibility.
- Runtimes must reject unsupported major versions.
- Runtimes may accept older minor versions through declared migrations.

## Manifest

`manifest.json` is the bundle entry point.

```json
{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "arena-demo",
  "requiredCapabilities": {
    "rendering": ["mesh.primitive.box", "material.standard", "light.directional"],
    "input": ["keyboard"],
    "scripting": ["builtin.rotation"]
  },
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "materials": "materials.ir.json",
    "animations": "animations.ir.json",
    "input": "input.ir.json",
    "targetProfile": "target.profile.json"
  }
}
```

Rules:

- All referenced files must exist.
- File references are bundle-relative.
- V2 declares bundle-level runtime requirements in `manifest.json` under
  `requiredCapabilities`; individual IR files remain focused on their own data
  domains.
- Unknown required sections are validation errors.
- Unknown optional sections may be ignored only if marked as optional capabilities.

## World IR

`world.ir.json` contains entities, resources, event schemas, prefabs, tags, and
scene hierarchy.

```json
{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "player",
      "components": {
        "Name": { "value": "Player" },
        "Transform": {
          "position": [0, 1, 0],
          "rotation": [0, 0, 0, 1],
          "scale": [1, 1, 1]
        },
        "MeshRenderer": {
          "mesh": "mesh.player.box",
          "material": "mat.player",
          "castShadow": true,
          "receiveShadow": true
        },
        "PlayerController": {
          "speed": 5
        }
      },
      "tags": ["Player"]
    },
    {
      "id": "camera.main",
      "components": {
        "Transform": { "position": [0, 4, 8] },
        "Camera": { "kind": "perspective", "fovY": 60, "near": 0.1, "far": 200 }
      }
    }
  ],
  "resources": {
    "ActiveCamera": { "entity": "camera.main" }
  },
  "events": {
    "DamageEvent": {
      "fields": {
        "target": { "type": "entity", "required": true },
        "amount": { "type": "number", "required": true }
      }
    }
  },
  "prefabs": []
}
```

Entity rules:

- `id` is required and unique.
- `components` is an object keyed by component name.
- Component values must match component schemas.
- `tags` is an optional array of zero-field marker component names.
- Entity references use IDs.
- Entities may be ordered for deterministic diffs, but runtime behavior must not depend on array order.
- Runtime adapters must map entity IDs to native handles during load. Native
  handles are never serialized in portable IR.
- `MeshRenderer.castShadow` and `MeshRenderer.receiveShadow` are optional
  booleans. When omitted, runtimes use their established mesh/model defaults.
- `Light.shadowBias` and `Light.shadowNormalBias` are optional finite numbers
  for directional, point, and spot light shadow tuning.

Resource rules:

- Resource keys are resource type names.
- Resource values must match resource schemas.
- Runtime-owned resources are omitted unless the schema allows initial values.

Event rules:

- Event schemas use the same field system as components.
- Event payloads should use stable IDs for entity references.
- Event queues are transient runtime data and are not serialized as initial world
  state unless explicitly modeled as persistent resources.

Prefab rules:

- Prefabs are post-V2. V2 validators should reject prefab requirements unless a
  later target profile explicitly marks them optional.
- When prefab support is promoted later, prefab instances should reference the
  prefab ID plus validated overrides against existing component fields.

## Component Schemas

Component schemas are emitted under `schemas/components.schema.json`.

```json
{
  "schema": "threenative.component-schemas",
  "version": "0.1.0",
  "components": {
    "PlayerController": {
      "fields": {
        "speed": { "type": "number", "required": true },
        "jumpImpulse": { "type": "number", "default": 8 }
      }
    }
  }
}
```

Supported scalar types:

- `boolean`
- `number`
- `integer`
- `string`

Supported semantic types:

- `entity`
- `asset`
- `prefab`
- `system`
- `color`
- `vec2`
- `vec3`
- `vec4`
- `quat`

Supported compound types:

- `array`
- `object`
- `enum`
- `nullable`

Rules:

- Every custom component must have a schema.
- Every custom tag must have either a zero-field component schema or a tag entry
  in the schema file.
- Built-in schemas may be referenced by version instead of repeated.
- Required fields must be present.
- Optional fields without values use schema defaults.
- Unknown component fields are validation errors unless the schema explicitly permits extension fields.

## Assets Manifest

`assets.manifest.json` declares all external and generated assets.

```json
{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    {
      "id": "mesh.enemy",
      "kind": "model",
      "source": "assets/enemy.glb",
      "format": "glb"
    },
    {
      "id": "tex.player.albedo",
      "kind": "texture",
      "path": "assets/player-albedo.png",
      "format": "png",
      "wrapS": "repeat",
      "wrapT": "repeat",
      "minFilter": "linearMipmapLinear",
      "magFilter": "linear",
      "repeat": [2, 2],
      "offset": [0, 0],
      "center": [0.5, 0.5],
      "rotation": 0
    },
    {
      "id": "mesh.player.box",
      "kind": "generated-mesh",
      "generator": "box",
      "params": { "size": [1, 2, 1] }
    }
  ]
}
```

Rules:

- Asset IDs are unique across the bundle.
- Asset paths are bundle-relative unless marked as external and allowed by the target profile.
- Generated assets must include deterministic generator parameters.
- Custom generated mesh attributes may use promoted names `position`, `normal`,
  `uv`, `uv1`, and `color`; `uv1` is the secondary UV channel and `color` is
  per-vertex RGBA color.
- Texture assets may include portable sampler and UV transform metadata:
  `wrapS`, `wrapT`, `minFilter`, `magFilter`, `repeat`, `offset`, `center`,
  and `rotation`.
- Runtime loaders may preprocess assets, but logical IDs must remain stable.

## Materials IR

`materials.ir.json` declares material assets.

```json
{
  "schema": "threenative.materials",
  "version": "0.1.0",
  "materials": [
    {
      "id": "mat.player",
      "kind": "standard",
      "color": "#ff3b30",
      "emissive": "#33ccff",
      "emissiveIntensity": 2,
      "clearcoat": 0.8,
      "clearcoatRoughness": 0.25,
      "metalness": 0,
      "roughness": 0.7,
      "specularIntensity": 0.7,
      "transmission": 0.45,
      "alphaMode": "mask",
      "alphaCutoff": 0.4,
      "opacity": 0.85
    }
  ]
}
```

Rules:

- Material IDs share the asset ID namespace.
- Material type determines valid fields.
- Numeric material factors must be finite.
- `alphaMode` is optional and must be `opaque`, `mask`, or `blend`; `opacity`
  and `alphaCutoff` are normalized values from 0 to 1.
- `emissive` uses the same color representation as `color`; `emissiveIntensity`
  must be non-negative and may exceed 1 for HDR-style material output.
- `specularIntensity`, `clearcoat`, `clearcoatRoughness`, and `transmission`
  are optional normalized physical factors from 0 to 1.
- Texture fields reference texture asset IDs. Promoted physical texture fields
  are `clearcoatTexture`, `clearcoatRoughnessTexture`, and
  `transmissionTexture`.
- `kind: "shader"` declares a portable shader material, not a raw backend
  shader. It must use `program.language: "threenative-shader-v1"` with declared
  uniforms, texture bindings, promoted inputs, and fragment outputs.
- Shader uniforms support `bool`, `color`, `float`, `int`, `vec2`, `vec3`, and
  `vec4` defaults. Shader textures reference texture asset IDs through
  `textures[].asset`.
- Shader program expressions are limited to literal values, declared uniforms,
  declared texture samples, and promoted builtins. Fragment outputs are
  `baseColor`, `emissive`, `alpha`, and `discard`; optional vertex displacement
  is bounded to axis `normal`, `x`, `y`, or `z`.
- Raw GLSL, raw WGSL, shader definitions/macros, node graphs, storage buffers,
  bindless resources, custom render phases, material-owned postprocess, and
  renderer handles are rejected during validation.

V1 material types:

- `standard`
- `basic`
- `unlit`
- `shader` with `program.language: "threenative-shader-v1"`

## Animation IR

`animations.ir.json` declares animation clips and state machines.

```json
{
  "schema": "threenative.animations",
  "version": "0.1.0",
  "clips": [
    {
      "id": "anim.player.run",
      "source": "mesh.player",
      "clip": "Run"
    }
  ],
  "stateMachines": [
    {
      "id": "anim.player.controller",
      "states": {
        "idle": { "clip": "anim.player.idle", "loop": true },
        "run": { "clip": "anim.player.run", "loop": true }
      },
      "initial": "idle"
    }
  ]
}
```

Rules:

- Clip references must resolve to imported animation data.
- State transitions must reference known states.
- Runtime-specific animation graph features are not part of V1.

## Input IR

`input.ir.json` declares logical actions.

```json
{
  "schema": "threenative.input",
  "version": "0.1.0",
  "axes": {
    "moveX": {
      "keys": { "negative": "KeyA", "positive": "KeyD" },
      "touch": "leftStick.x"
    }
  },
  "actions": {
    "jump": {
      "keys": ["Space"],
      "touch": ["jumpButton"]
    }
  }
}
```

Rules:

- Gameplay code reads logical action names.
- Physical bindings are target-adapted by the runtime.
- Unknown action reads return neutral values unless strict input validation is enabled.
- V2 requires keyboard, pointer, and touch-ready logical controls.
- Gamepad bindings are V3 unless declared as optional, non-blocking capability
  data.

## UI IR

`ui.ir.json` declares portable game UI as a retained tree with bindings and
events. It is generated from React-style UI authoring, but it is not React DOM.

```json
{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "roots": [
    {
      "id": "hud.root",
      "type": "Stack",
      "props": {
        "anchor": "top-left",
        "padding": 16,
        "gap": 8
      },
      "children": [
        {
          "id": "hud.health",
          "type": "Text",
          "props": {
            "text": {
              "binding": "template",
              "parts": ["HP ", { "resource": "PlayerStats.health" }]
            }
          }
        },
        {
          "id": "touch.jump",
          "type": "TouchButton",
          "props": {
            "anchor": "bottom-right",
            "action": "jump"
          }
        }
      ]
    }
  ]
}
```

Rules:

- UI node IDs are stable diagnostics and hot reload identifiers.
- UI components must come from the supported portable UI primitive set.
- Bindings must reference known resources, components, entities, input actions,
  or target-profile fields.
- UI interactions emit events, commands, or input actions; they do not mutate ECS
  state directly.
- Web adapters may render UI with React DOM.
- Native adapters recreate UI from `ui.ir.json` with Bevy UI or another native
  UI renderer.
- Browser-only DOM, CSS, or event APIs are not portable UI behavior.

## Systems IR

`systems.ir.json` declares TypeScript system exports, schedule placement,
component/event access, command permissions, and V4 service permissions.

```json
{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "movePlayer",
      "schedule": "update",
      "queries": [
        {
          "with": ["PlayerController", "Transform"],
          "without": ["Disabled"]
        }
      ],
      "reads": ["PlayerController", "Transform"],
      "writes": ["Transform"],
      "eventReads": [],
      "eventWrites": ["HitEvent"],
      "commands": [
        { "kind": "setComponent", "entity": "player", "component": "Transform" },
        { "kind": "emitEvent", "event": "HitEvent" }
      ],
      "services": ["physics.raycast"],
      "script": {
        "bundle": "scripts.bundle.js",
        "exportName": "system_movePlayer"
      }
    }
  ]
}
```

Rules:

- `script.exportName` must exist in `scripts.bundle.js`.
- `schedule` must be one of `startup`, `fixedUpdate`, `update`, or `postUpdate`.
- Read and write sets must be declared for ordering and parallelism.
- Query component names must be known.
- `commands` declares allowed structural mutation kinds and referenced
  component/event names.
- `eventReads` and `eventWrites` must reference known event schemas.
- `services` is limited to approved service IDs such as `physics.raycast`,
  `physics.overlap`, `physics.shapeCast`, `picking.pointerRay`, `picking.mesh`,
  and `animation.play`.
- System names are stable diagnostics and scheduling identifiers.

The IR references system code by export name. It does not inline arbitrary function bodies into JSON.

## Target Profile

`target.profile.json` declares runtime capabilities and constraints.

```json
{
  "schema": "threenative.target-profile",
  "version": "0.1.0",
  "targets": {
    "web": {
      "runtime": "three-webgpu",
      "features": ["rendering", "input", "audio"],
      "limits": {
        "maxTextureSize": 4096,
        "preferredTextureFormats": ["webp", "png"]
      }
    },
    "native": {
      "runtime": "bevy",
      "features": ["rendering", "input", "audio", "physics"],
      "limits": {
        "maxTextureSize": 8192,
        "mobileDrawCallBudget": 500
      }
    }
  }
}
```

Rules:

- Validators must check requested features against selected targets.
- Runtimes must reject required features they do not implement.
- Performance budgets are advisory unless marked `required`.

## Serialization Rules

Canonical serialization is required for reproducible bundles.

Rules:

- JSON object keys should be emitted in deterministic order.
- Floating point values must be finite.
- `NaN`, `Infinity`, and `-Infinity` are invalid.
- Undefined fields are omitted.
- Null is allowed only when the schema marks a field nullable.
- Vectors and quaternions serialize as fixed-length arrays.
- Colors serialize as `#rrggbb`, `#rrggbbaa`, or linear RGBA arrays where schema permits.
- Dates serialize as strings only when explicitly modeled; simulation should not depend on wall-clock dates.
- IDs are strings matching `^[A-Za-z0-9_.:-]+$`.

## Validation Pipeline

Validation runs before runtime loading.

Required stages:

1. Parse JSON files.
2. Check schema and version headers.
3. Validate manifest references.
4. Validate component, resource, event, and material schemas.
5. Validate entity, asset, prefab, animation, system, and input references.
6. Validate target capabilities.
7. Validate deterministic serialization constraints.
8. Emit diagnostics with stable codes.

Diagnostic shape:

```json
{
  "code": "TN-IR-2104",
  "severity": "error",
  "message": "Entity references missing material asset.",
  "path": "world.ir.json/entities/0/components/MeshRenderer/material",
  "value": "mat.missing",
  "suggestion": "Declare material 'mat.missing' in materials.ir.json or update the MeshRenderer reference."
}
```

## Runtime Loading Contract

A runtime must:

- Load `manifest.json`.
- Verify supported IR versions.
- Validate or trust a signed validation artifact.
- Resolve all assets by logical ID.
- Create entities and components.
- Register resources.
- Register systems and schedules.
- Apply target profile settings.
- Report unsupported required features before starting the game loop.

A runtime may:

- Convert IR into native runtime data structures.
- Preload or stream assets.
- Optimize materials and meshes.
- Batch renderable entities.
- Cache converted assets.

A runtime must not:

- Require game code to import runtime-specific APIs.
- Interpret unknown required fields silently.
- Change public component semantics.
- Depend on array order where the schema says order is not semantic.

## Boundary Against Arbitrary Three.js

The IR represents the ThreeNative SDK subset. It is not an AST for all JavaScript or all Three.js.

Unsupported source patterns must fail before IR emission:

- Direct `import * as THREE from "three"` as the runtime contract.
- Renderer access such as `new WebGLRenderer()`.
- DOM, canvas, or WebGL context manipulation.
- Custom shader chunks or raw GLSL materials.
- Mutation of geometry buffers after capture.
- Side-effectful asset loading outside the asset manifest.
- Runtime reflection over private SDK internals.

Converters may translate simple Three.js snippets into SDK code, but the emitted IR is valid only when it satisfies the schemas above.

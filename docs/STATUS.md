# ThreeNative Status

This file is the current implementation front door. Read it before the
conceptual docs when deciding what is supported, partial, or future-facing.

## Current Active Gate

V4: native gameplay scripting proof for a primitive scene.

Current release command:

```bash
pnpm check:docs:v4
```

`verify:v4` is not implemented yet. Until the V4 release gate exists, V4 work
must keep `pnpm check:docs:v4`, `pnpm verify:v3`, and
`pnpm verify:conformance` green as the relevant regression gates.

## V4 Proves

V4 is in progress and has not proven runtime scripting yet. Its target proof is
one constrained TypeScript system bundle running as the same
`scripts.bundle.js` in web JavaScript and embedded QuickJS, with equivalent
patch, event, command, and service-call logs for a primitive demo.

Current implemented V4 slice:

- `systems.ir.json` carries V4 stage, query, read/write, event, command, and
  service metadata for portable systems.
- `scripts.bundle.js` is emitted only when systems exist, includes stable
  system ID metadata, and can serialize declared component/event handles used by
  portable system functions.
- portable script diagnostics reject unsupported DOM, Node, timer, worker,
  arbitrary runtime import, undeclared write, command, event, and service
  usage before runtime.
- compiler tests run an ESM loadability probe for the emitted script bundle;
  native QuickJS parse/load proof remains owned by the Bevy host work.
- the web runtime executes portable systems through cloned query snapshots,
  validates effects before applying them, and writes canonical web effect logs
  through `tn verify`.
- `examples/v4-scripting` builds a primitive scripted scene and passes web
  visual verification with expected motion and a web effect-log artifact.

## V4 Does Not Prove

- arbitrary npm dependencies inside portable scripts
- public Lua or Luau authoring
- async systems or state-preserving hot reload
- full physics, animation graphs, UI runtime parity, or editor tooling
- direct Three.js, Bevy, renderer, DOM, filesystem, network, or platform access
- native QuickJS execution or cross-runtime patch-log parity yet

## V3 Proves

- deterministic environment scene IR for the forest proof scene
- bundle-local glTF/GLB, `.bin`, and texture dependency copying
- web Three.js environment preview with first-person walkthrough checks
- Bevy native loading of the same environment bundle for scene load smoke and
  bookmarked screenshot artifacts
- V3 web performance budget reporting
- V3 web performance reports distinguish synthetic/placeholder instancing
  evidence from model-asset-backed instancing plans
- bookmarked visual verification artifacts
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

- [V3 Completion Checklist](releases/v3-completion.md)
- [Bevy Feature Parity Drift](bevy-feature-parity.md)
- [Feature Maturity Matrix](feature-maturity.md)
- [verify:v3](verify-v3.md)
- [Coordinate, Units, Rotation, and Color Conventions](conventions.md)

# ThreeNative Status

This file is the current implementation front door. Read it before the
conceptual docs when deciding what is supported, partial, or future-facing.

## Current Active Gate

V4: native gameplay scripting proof for a primitive scene.

Current release command:

```bash
pnpm verify:v4
```

`verify:v4` builds the primitive scripting demo, runs the web JavaScript and
native QuickJS hosts over the same fixed trace, compares canonical effect logs,
and writes the V4 report under `artifacts/v4`.

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
  `artifacts/v4/web-effects.json`, `native-effects.json`, and
  `effects-diff.json`.
- `examples/v4-scripting` builds a primitive scripted scene covering rotation,
  movement, spawn/despawn, event handoff, `physics.raycast`, and
  `animation.play`; it passes web visual verification with expected motion,
  writes a web patch/event/command/service effect-log artifact, and captures a
  native Bevy frame artifact at `artifacts/v4/native-bevy-frame-01.png`.
- `templates/v4-scripting` scaffolds the same primitive demo as a CLI template
  through `tn create --template v4-scripting`.

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
slot, visibility, mesh-renderer, environment-ID, diagnostic, and entity
observations, while report mismatches carry JSON-path-like locations plus
bundle/artifact paths. The Bevy runtime also provides a headless
`threenative_conformance` command, and `pnpm verify:conformance` writes an
inspectable native summary at `artifacts/conformance/basic-scene/bevy.report.json`.

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

V5-06 has landed the textured standard-material parity slice: supported material
texture slots now serialize through SDK/compiler output, validate against
texture assets and target formats, appear in shared conformance fixtures and
observations, map to Three.js material texture slots, and map to Bevy
`StandardMaterial` image handles for native regression coverage. The
`examples/v5-functional` scene seed builds, validates, and visually verifies
with bundle-local textured environment assets.

V5-07 has landed the lighting, atmosphere, shadow, and color parity-evidence
slice: shared fixtures now cover visible/hidden meshes plus ranged point and
spot lights, SDK/compiler output preserves point-light range and spot-light
range/angle, web and Bevy map those fields with runtime-normalized conformance
observations, and atmosphere observations expose promoted fog, sky, color
management, and shadow fields. Native fog/sky/color rendering remains
target-drift rather than full visual parity, but the promoted fields are now
validated, observable, and exercised by `examples/v5-functional`.

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
SDK ergonomics, a `v5-game-starter` template, stable diagnostics, and release
gate evidence. This is authoring sugar over portable contracts unless a V5 PRD
explicitly promotes a new SDK/IR/runtime contract.

V6 is the first planned online and scene-editor milestone. Online services,
networking, replication, scene editor workflows, collaboration, and editor
inspectors should not be treated as V5 support unless a V5 PRD explicitly
limits the work to internal preparation or harness cleanup.

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

- [V5 PRDs](PRDs/v5/README.md)
- [V3 Completion Checklist](releases/v3-completion.md)
- [Bevy Feature Parity Drift](bevy-feature-parity.md)
- [Feature Maturity Matrix](feature-maturity.md)
- [verify:v4](verify-v4.md)
- [verify:v3](verify-v3.md)
- [Coordinate, Units, Rotation, and Color Conventions](conventions.md)

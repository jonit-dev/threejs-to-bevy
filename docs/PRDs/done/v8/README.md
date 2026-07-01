# V8 PRDs

V8 introduces local editor and inspector foundations after V7 deep parity work.
The editor is an offline structured authoring surface over the same SDK/ECS/IR
project data that the compiler, CLI, web runtime, and Bevy adapter already
consume. It is not a second source of truth and must not bypass validation.

## Scope Rules

- V8 editor saves use structured project data that can round-trip into the
  existing portable bundle pipeline.
- Local save/load, structured diffs, entity/asset inspection, and bundle preview
  evidence are V8-promoted.
- Diagnostics must reject invalid editor data before runtime and should point to
  the same entity, asset, component, system, or bundle paths used by CLI flows.
- Offline SDK and CLI workflows must keep working without editor state.
- V8 does not claim online services, hosted workflows, networking, replication,
  collaboration, presence, conflict resolution, public plugin APIs, raw
  Three.js authoring, or direct Bevy authoring.

## Tickets

| Order | PRD | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V8-00 Local Editor Scope and Contract](./V8-00-local-editor-scope-and-contract.md) | V7 | V8 starts with local/offline editor boundaries, structured SDK/ECS/IR project data, save/load, structured diffs, diagnostics, and preview evidence requirements. |
| 1 | [V8-01 Editor Project Snapshot and Structured Diffs](./V8-01-editor-project-snapshot-and-structured-diffs.md) | V8-00 | IR helpers validate local editor project snapshots and produce deterministic structured diffs over bundle-relative JSON documents. |
| 4 | [V8-04 Portable Procedural Mesh Authoring](./V8-04-portable-procedural-mesh-authoring.md) | V8-00, V7 renderer parity | MeshBuilder, generated mesh asset payloads, organic prop helpers, compiler-only BufferGeometry snapshot import, and web/Bevy screenshot parity evidence for one authored procedural prop. |
| 5 | [V8-05 Optional React Webview Overlay](./V8-05-optional-react-webview-overlay.md) | V6 retained UI, V7 rich UI, V8-00 | Projects can opt into a capability-gated React/CSS webview overlay for rich desktop/editor-like surfaces while retained UI remains the portable game UI contract. |
| 6 | [V8-06 Camera Helpers, Multi-View Rendering, and Render Targets](./V8-06-camera-helpers-multi-view-and-render-targets.md) | V3 first-person camera, V5/V7 conformance, V8-00 | Bevy 0.14 camera parity for helpers, multiple ordered cameras, viewports, render layers, render-to-texture/depth targets, screenshot/export workflows, portable custom projections, and diagnostics for backend-only payloads. |
| 7 | [V8-07 Material, Texture, and Shader Parity](./V8-07-material-texture-shader-parity.md) | V5 textured materials, V7 renderer parity, V8-00 | Standard-material parity for transparent ordering/blending, specular maps, native sampler/UV application, constrained extended materials, and explicit gates before broader shader surfaces. |
| 8 | [V8-08 Animation Controls, Transform Animation, and Particles](./V8-08-animation-controls-transform-animation-and-particles.md) | V6 animation, V7 animation graphs/particles, V9 skeletal evidence, V8-07 | Transform animation, runtime stop/query controls, bounded blending, and rendered particles become portable or fail with explicit diagnostics. |
| 9 | [V8-09 Rigid Body, Character Interaction, and Navigation](./V8-09-rigid-body-character-interaction-and-navigation.md) | V6 physics/character, V7 advanced physics, slope/step closure | Common primitive rigid bodies, object pushing, richer sensors, interaction volumes, and narrow navigation/path traces behave portably or diagnose unsupported backends. |
| 10 | [V8-10 Asset Load Sync, glTF Scene Access, and Inspection](./V8-10-asset-load-sync-gltf-scene-access-and-inspection.md) | V3 assets/scenes, V6 diagnostics, V8-01, V8-05 optional overlay | Multi-asset barriers, spawned glTF node query/update handles, structured scene inspection, and dev-time asset watch diagnostics work through bundle data. |
| 11 | [V8-11 Rendering, Atmosphere, and Post-Processing Parity](./V8-11-rendering-atmosphere-post-processing-parity.md) | V8-06, V8-07, V5 lighting/atmosphere, V7 renderer parity | Native fog/sky visual parity, skybox/cubemap contracts, instancing/batching evidence, anti-aliasing policy, color grading, and focused visual reports. |
| 12 | [V8-12 Lights, Shadows, and Environment Probes](./V8-12-lights-shadows-environment-probes.md) | V8-11, V5 lighting, shadow bias/per-mesh shadow controls | Shadow filtering, point-light shadows, light budgets/culling diagnostics, environment maps, probes, and light debug visualization are promoted with evidence. |
| 13 | [V8-13 Advanced Renderer Feature Gate](./V8-13-advanced-renderer-feature-gate.md) | V8-11, V8-12 | Advanced renderer surfaces that are not yet portable fail loudly and have documented promotion criteria. |
| 14 | [V8-14 Input, Picking, and Controls Hardening](./V8-14-input-picking-controls-hardening.md) | V7 input, V8-06 cameras/views, existing picking services | Rebinding persistence, drag picking, device diagnostics, and debug overlays become user-testable across web and Bevy. |
| 15 | [V8-15 Rich UI, Text, and Accessibility Residuals](./V8-15-rich-ui-text-accessibility-residuals.md) | V7 rich UI, V8-05 overlay boundary, V8-14 input | Retained portable UI gains font/rich text, native visual parity, 9-slice/images, standard widgets, and stronger accessibility diagnostics. |
| 16 | [V8-16 Spatial Audio, Mixer, and Music Transitions](./V8-16-spatial-audio-mixer-and-music-transitions.md) | V7 audio, V8-14 input/settings patterns | Spatial attenuation, listener movement, routed mixer behavior, ducking/effects diagnostics, and state-driven music transitions become verifiable. |
| 17 | [V8-17 Portable Save Slots, Settings, and Local Data](./V8-17-portable-save-slots-settings-local-data.md) | V6 resources/components, V8-14 input settings, V8-16 audio settings | Declared resources/components, controls/audio/video/accessibility settings, and save-slot metadata persist through a portable local-data contract. |
| 18 | [V8-18 Editor, Debugging, Diagnostics, Packaging, and Performance Support](./V8-18-editor-debugging-diagnostics-packaging-performance-support.md) | V8-01, V8-06, V8-07, V8-14 through V8-17 preferred | Scene hierarchy/property inspection, asset preview, debug draw/FPS overlay, unsupported-feature diagnostics, stress fixtures, profiler evidence, and package repair hints are planned as support tracks. |

## Release Gate

V8 is not complete until an aggregate gate proves local editor workflows through
structured data fixtures, save/load round trips, structured diffs, bundle
preview artifacts, diagnostics, and docs consistency.

Initial docs guard:

```bash
pnpm check:docs:v8
```

Material parity proof:

```bash
pnpm verify:v8:material-parity
```

The material parity proof builds `examples/v8-material-parity`, validates the
bundle, runs conformance, captures web/native screenshots, and writes
`tools/verify/artifacts/material-parity/verification-report.json`.

Optional React webview overlay proof:

```bash
pnpm verify:v8:overlay
```

The overlay proof validates the shared V8 overlay conformance fixture with
bundle-local HTML/CSS inventory overlay assets and item sprites, validates
bridge messages, checks input capture pass-through for non-pointer modes, runs
native overlay diagnostics tests, and writes
`tools/verify/artifacts/overlay-webview/verification-report.json`.

Camera view proof:

```bash
pnpm verify:v8:camera-views
```

The camera proof validates the shared camera multi-view conformance fixture,
captures web/native screenshots with viewport-region checks, and writes
artifacts under `tools/verify/artifacts/camera-views/`.

Material parity proof:

```bash
pnpm verify:v8:material-parity
```

The material parity proof builds `examples/v8-material-parity`, validates the
bundle, runs conformance, captures web/native screenshots, and writes
`tools/verify/artifacts/material-parity/verification-report.json`.

Color, lighting, and tone parity proof:

```bash
pnpm verify:v8:color-parity
pnpm test:color-parity
```

The color parity proof validates the shared `color-parity` and `lighting-tone`
conformance fixture bundles, captures web/native screenshots, compares unlit
swatch colors plus lit PBR sphere probes, and writes artifacts under
`tools/verify/artifacts/color-parity/` and
`tools/verify/artifacts/lighting-tone/`. `pnpm test:color-parity` runs the fast
contract harness that locks thresholds, fixture presence, sample regions, and
verifier wiring.

Rendering-quality fog/sky proof:

```bash
pnpm verify:v8:rendering-quality
```

The rendering-quality proof builds `examples/v8-rendering-quality`, validates
the bundle, captures web/native screenshots, compares sky/foreground/fog-depth
regions, verifies fog convergence, and writes artifacts under
`tools/verify/artifacts/rendering-quality/`.

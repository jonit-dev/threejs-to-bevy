# V9 PRDs

V9 is a checklist-driven parity planning batch. It converts the unchecked
Bevy-feature backlog in `docs/bevy-feature-parity.md` into implementation PRDs
that maximize completed checks per category while keeping each PRD implementable
and verifiable.

## Scope Rules

- Each PRD must promote behavior through SDK/IR, validation, compiler output,
  web Three.js runtime, native Bevy runtime, conformance, diagnostics, and docs
  evidence where support is claimed.
- PRDs should cover as many unchecked checklist items in their category as
  practical, but must split or explicitly defer work when combining items would
  make phases unreviewable or unverifiable.
- Unsupported and deferred surfaces must fail with stable diagnostics instead
  of being ignored.
- Runtime adapters consume emitted bundle JSON and remain implementation
  details; user-facing authoring remains TypeScript SDK/ECS/IR data.
- Online services, public renderer/runtime plugin escape hatches, direct Bevy
  authoring, raw Three.js authoring, and arbitrary platform APIs remain outside
  the portable contract unless a PRD explicitly promotes a constrained
  diagnostic-only boundary.

## Tickets

| Order | PRD | Primary Checklist Coverage | Outcome |
| --- | --- | --- | --- |
| 1 | [V9-01 Animation and Particles Runtime Parity](./V9-01-animation-particles-runtime-parity.md) | Animation blending, stateful animation stop/query runtime semantics, rendered particle systems | Authors can rely on runtime-derived animation state, bounded blending, and rendered particles, while masks, morph targets, IK/retargeting, and UI/property animation remain diagnostic-gated. |
| 2 | [V9-02 Physics Character Runtime Parity](./V9-02-physics-character-runtime-parity.md) | Broader primitive rigid-body solver parity, broad sensors, character interaction volumes/object pushing, constrained pathfinding, backend strategy | Small-game physics interactions become portable beyond the falling-box trace, with dynamic mesh colliders and full navmesh/backend handles deferred behind promotion criteria. |
| 3 | [V9-03 Assets, glTF, and Scene Workflow](./V9-03-assets-gltf-scene-workflow.md) | Embedded/network asset policy, glTF metadata, spawned scene handles, scene inspection, watch/reload diagnostics, narrow hot reload | Asset-heavy scenes gain structured source policy, glTF scene access, editor inspection, and explicit reload behavior without turning raw runtime state into source of truth. |
| 4 | [V9-04 Rendering, Lights, and Post-Processing Parity](./V9-04-rendering-lights-post-processing-parity.md) | Skyboxes/cubemaps, probes/environment maps, light budgets, point-shadow filtering, light gizmos, AA policy, color grading, depth-of-field policy, HLOD fades, instancing/batching | Renderer and lighting parity advances through compact promoted surfaces plus explicit diagnostics for advanced renderer features not yet portable. |
| 5 | [V9-05 Input, UI, and Accessibility Parity](./V9-05-input-ui-accessibility-parity.md) | Rebinding UI/persistence, drag picking, picking/device overlays, native UI visual parity, rich text/fonts, atlas/9-slice images, widgets, UI debug tools | Menu/HUD/control workflows become portable through retained UI and input contracts rather than optional webview overlays. |
| 6 | [V9-06 Audio, Persistence, and Tooling Support](./V9-06-audio-persistence-tooling-support.md) | Spatial/mixer audio, save slots, settings, migration/autosave, profiler/FPS diagnostics, target repair hints, stress fixtures, editor inspector/debug tools | Support-track systems now have focused verifier entry points for audio, local data, diagnostics, editor, stress, and aggregate support evidence. |

## Release Gate

V9 is not complete until each promoted PRD phase has focused tests,
cross-runtime conformance or visual evidence where applicable, docs/status
updates, and an aggregate V9 verification command. The initial planning batch is
docs-only; the verifier names inside each PRD are future implementation gates.

Expected aggregate shape:

```bash
pnpm verify:v9
```

The aggregate should run the individual V9 gates, docs consistency checks,
shared conformance, focused web/runtime tests, native Bevy tests, and artifact
presence checks for the promoted V9 surfaces.

Implemented focused V9 gates:

```bash
pnpm verify:v9:physics-character
pnpm verify:v9:assets-gltf-scene-workflow
pnpm verify:v9:rendering-lights
pnpm verify:v9:audio-support
pnpm verify:v9:local-data-support
pnpm verify:v9:diagnostics-support
pnpm verify:v9:editor-support
pnpm verify:v9:stress-support
pnpm verify:v9:support
```

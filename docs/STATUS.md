# ThreeNative Status

This file is the current implementation front door. Keep it under 200 lines and
link to capability docs for detail. Historical evidence from the prior long
status page is preserved in
[docs/status/capabilities/full-status-archive.md](status/capabilities/full-status-archive.md).

## Product Goal

ThreeNative aims to reach practical game-engine feature parity between Bevy and
the Three.js-based game engine SDK/runtime we are building. Bevy is the
reference for common game-engine capabilities; Three.js is the web rendering
runtime those capabilities run on. Features should be promoted only when the
portable SDK/IR contract works across the web Three.js runtime and the native
Bevy runtime where support is claimed.

Native parity freeze policy: new Bevy/native promotions are frozen unless a
shipped-game need is documented with web evidence, native proof evidence, and a
focused gate. The current native path decision is recorded in
[docs/runtime/native-path.md](runtime/native-path.md).

Version labels such as `V7`, `V8`, and `V9` are legacy milestone names retained
in scripts, examples, and historical docs during a staged cleanup. The legacy
`verify:v8:color-parity` entry remains documented as a compatibility pointer
while color parity proof moves behind current focused gates. See
[PRDs/archive/cleanup-versioned-debt.md](PRDs/archive/cleanup-versioned-debt.md).

## Capability Index

| Area | Status | Current claim | Detail |
| --- | --- | --- | --- |
| Authoring | Active | Structured source, schema-aware CLI/MCP/client operations, transactional/idempotent adoption-aware recipes, descriptor-derived concrete game plans, compact project maps, bounded actor archetypes, registry-owned exact document presets, project type generation, cookbook with metadata-derived CLI search and MCP lookup, event/resource schema inference, reference-aware cleanup, tag/pattern selectors, batch placement, exact-match PlacementSet expansion/migration, multi-scenario iterate, playtest schema/scaffold/setup, starter API cards, prescriptive diagnostics, semantic proof gates, anti-proof-theater scoring, and an experimental typed game-spec slice are supported. | [authoring](status/capabilities/authoring.md) |
| Scripting | Active | Portable TypeScript scripts use typed/project-generated context APIs, `defineBehavior` metadata, convention-first helper aliases, deterministic project-local script modules, generated stdlib runtime source, derived literal resource and event payload declarations, same-tick composing resource patches, persistent sensor phases, bounded runtime write provenance, actionable transform conflict diagnostics, script audio, bounded particles, delayed commands, retained UI actions, reconciled tag/lifecycle observations, runtime-owned patrol/FSM/countdown primitives, bounded tween/camera-shake/feedback/world-text presentation, runtime observations, prescriptive diagnostics, and a bounded web/native Interaction objective contract. | [scripting](status/capabilities/scripting.md) |
| Rendering | Active | Authored rendering IR maps through adapter-private implementations, including web `unlit` materials with an explicit native freeze-gate diagnostic; iterate reports the resolved render-look profile and warns when grading is active over changed material or texture source; live reconciliation, stable cascades, contact shadows, calibrated forward-scattered god rays, independent analytic height fog, temporal web plus spatial native SSGI with bounded/jittered gather and gated ceiling/floor-bounce approximations, thin-surface native SSR calibration, forward-native SH2 irradiance volumes with an honest Bevy 0.14 deferred fallback, and private collider-independent scene-ray queries are covered. The fresh-bundle hero-interior gate now locks a 0.80..1.25 luminance ratio, 1.35 haze delta, 0.3..2.0 surface-detail ratio, 0.75..1.35 ceiling ratio, and 0.65..1.45 right-room ratio while documenting native thin-wet-patch approximation boundaries. | [rendering](status/capabilities/rendering.md) |
| Physics | Active | Portable physics and character-control contracts now have an aggregate native-depth gate for stable contact sidecars, leading-edge stair traversal, grounded kinematic jump, opt-in dynamic push velocity, mesh grounding, bounded navigation residuals, and explicit solver/backend boundaries. | [physics](status/capabilities/physics.md) |
| UI | Active | Retained structured UI is the portable path; one optional React overlay bundle can target web and Linux desktop through typed contracts, capability-checked native launch, input/visibility controls, snapshot delivery, and a CEF off-screen Bevy texture. NVIDIA/Xwayland chooser, hover, Black-side start, 300 modal transitions with settled memory, pointer/wheel/key/focus routing, modal game-input suppression, and mounted AppImage packaging are proved; multi-overlay lifecycle, full IME, other compositors, Windows/macOS, platform screen readers, native style effects, and rendered world attachment remain boundaries. | [ui](status/capabilities/ui.md) |
| Assets | Active | Bundle-local assets include mock-proved authoring-time SFX generation and registration; no live-provider or runtime-network claim is made. | [assets](status/capabilities/assets.md) |
| Audio/platform | Active | Web/native bundle-local startup, event, and script playback execute in their game loops with native entity-spawn proof; native sink controls execute except seek, while generated tones, device routing, and runtime network audio retain explicit boundaries. | [audio/platform](status/capabilities/audio-platform.md) |
| Native parity | Frozen for promotion | Bevy consumes emitted IR; the native playtest P0 is closed, headless desktop playtests now return a structured waived-headless warning instead of a winit crash (offscreen rendering remains unsupported), bounded gameplay parity pairs one humanoid smoke playtest plus a full-profile ball-push row across web/desktop, the closed Interaction subset has paired web/native trace and state conformance, trace/source-only rows are not broad promotions, and new native promotions require shipped-game evidence, native proof, and the native path decision. | [native parity](status/capabilities/native-parity.md) |
| Game production | Active | Generated instructions prefer bounded SFX generation after a successful provider probe, retain offline fallbacks, and release-scan provider secrets; evidence is mock-only. PlacementSet and bounded cross-adapter Interaction recipes are documented with exact-match and conformance boundaries. | [game production](status/capabilities/game-production.md) |
| Editor | In progress | Editor and MCP surfaces wrap authoring operations rather than owning a second source model; editor operation names, payload keys, and composite recipes now have metadata/drift coverage, and the viewport includes read-only retained UI source preview with deterministic binding placeholders/values. | [editor](status/capabilities/editor.md) |
| Tooling/proof | Active | Verification tools own docs checks, boundary and adapter drift gates, descriptor-owned focused gates, emitted-command acceptance/failure-rate measurement, clean JSON enforcement, split visual/gameplay iterate verdicts, bundle-grounded discovery, honest artifact paths, per-frame visual assertions, web-default/native-opt-in iterate, generated-game/template enrollment, agent IO/session-cost/retry budgets, runtime assertion diagnostics, gameplay and Interaction trace/state parity, performance proofs, aggregate artifacts, and equal-proof benchmark reporting. | [tooling/proof](status/capabilities/tooling-proof.md) |

## Current PRDs

- [Agent Ergonomics](PRDs/done/agent-ergonomics-2026-07-05/README.md): done
  execution bundle for measuring and improving agent game creation.
- [Proof-First Engine Loop](PRDs/proof-first-engine-loop-2026-07-05/): active
  runtime, native parity, gameplay, and proof-loop capability work.
- [UI System Remediation](PRDs/other/ui-system-remediation-2026-07-08/README.md):
  done execution bundle from the 2026-07-08 UI inspection covering web action
  delivery, parity truthing, authoring closure, behavioral conformance, editor
  preview, and native hygiene.
- [Adapter Surface Remediation](PRDs/other/adapter-surface-remediation-2026-07-08/README.md):
  active execution bundle from the 2026-07-08 adapter-surface diagnostic
  covering generated-game proof enrollment, adapter drift gates, CLI registry
  substrate, executable authoring descriptors, and editor operation recipes.
- [Leverage Points](PRDs/done/other/leverage-points-2026-07-09/README.md):
  done execution bundle from the 2026-07-09 system leverage report covering
  descriptor-owned surfaces, churn ratchets, runtime diagnostics, manifest
  ownership, a build-only forcing-function game, and visual metric bundles.
- [PRD index](PRDs/README.md): current and completed planning work.

## Current Gates

Use narrow proof first, then broaden:

```bash
pnpm check:docs
pnpm verify:smoke
pnpm verify:generated-games
pnpm verify:release
```

Focused capability gates include `pnpm verify:agent-io`, `pnpm verify:session-cost`, `pnpm verify:webview-package`, `pnpm verify:cookbook`,
`pnpm verify:template-production`, `pnpm verify:conformance`,
`pnpm verify:scripting-helpers-lifecycle`, `pnpm verify:particle-commands`,
`pnpm verify:gameplay-primitives`,
`pnpm verify:focused verify:portable-feedback`,
`pnpm verify:efficient-scale`, `pnpm verify:gameplay-parity`, and
`pnpm verify:parity:smoke`.
Photoreal rendering proof starts with `pnpm verify:rendering-photoreal`, which captures lighting, monotonic AO sweeps, bloom spill, Bokeh depth-of-field, motion trails, and wet-floor SSR web+Bevy region evidence.

## Artifact Policy

- Example evidence: `examples/<name>/artifacts/<gate>/`.
- Aggregate reports: `tools/verify/artifacts/<gate>/`.
- Bevy-only evidence: `runtime-bevy/artifacts/<gate>/`.
- Generated bundles and `dist/**` are outputs, not durable source.

Update the relevant capability doc plus the one-line index entry here when a
capability or release gate changes.

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
| Authoring | Active | Structured source now has project-aware inspection, portable-script preflight, descriptor-owned spatial composition, capability-selected custom prototypes, plan-derived proof, and current-run acceptance coverage; fresh ThreeNative pilots pass all three unfamiliar prompts under the cap, but the equal-proof vanilla control still lacks admissible proof, so the promotion matrix and spatial recipe remain experimental. | [authoring](status/capabilities/authoring.md) |
| Scripting | Active | Portable TypeScript scripts use a registry-checked complete public context with adapter-independent service DTOs and genuinely narrowed generated project IDs, deterministic project-local modules, generated stdlib runtime source, bounded runtime services and diagnostics, a shared web/native Interaction objective contract, and declared persistence/settings backed natively by bounded atomic target-profile storage with executable Local Data 0.2 migrations and two-process cold-restart proof. | [scripting](status/capabilities/scripting.md) |
| Rendering | Active | Authored rendering IR maps through adapter-private implementations, including web `unlit` materials with an explicit native freeze-gate diagnostic; compile-time Procedural Geometry V2 emits deterministic custom meshes for expanded primitives, coherent noise/topology operations, promoted BSP CSG, optional existing-contract collider derivation, and generated scene-mesh LOD variants with actual web geometry/native handle swaps proved by `verify:generated-mesh-lod`, while runtime CSG, runtime deformation/generation, environment HLOD/fades/impostors, and streaming remain boundaries; iterate reports the resolved render-look profile and warns when grading is active over changed material or texture source; live reconciliation, stable cascades, contact shadows, calibrated forward-scattered god rays, independent analytic height fog, temporal web plus spatial native SSGI with bounded/jittered gather and gated ceiling/floor-bounce approximations, thin-surface native SSR calibration, forward-native SH2 irradiance volumes with an honest Bevy 0.14 deferred fallback, and private collider-independent scene-ray queries are covered. The fresh-bundle hero-interior gate now locks a 0.80..1.25 luminance ratio, 1.35 haze delta, 0.3..2.0 surface-detail ratio, 0.75..1.35 ceiling ratio, and 0.65..1.45 right-room ratio while documenting native thin-wet-patch approximation boundaries. | [rendering](status/capabilities/rendering.md) |
| Physics | Active | Portable physics now preserves lossless body/collider data, configurable gravity, exact primitive mass/capsules, collider-only statics, native live contact phases, same-tick force/impulse services, solver-owned character push response, and live hinge/slider/suspension constraints across web and Bevy; conservative snapshot queries, arbitrary mesh narrow phase, and richer constraints remain explicit boundaries. | [physics](status/capabilities/physics.md) |
| UI | Active | Retained structured UI now has registry-owned evidence tiers, paired responsive captures at two viewports, causal idle/hover/selected and isolated shadow/gradient pixel proof, live web/native widget-state and action proof, bounded native visual effects, traced explicit bold-face selection, and normalized ARIA/AccessKit metadata; nested/horizontal scroll, spatial fallback, focus narration, full IME, platform screen readers, and rendered world attachment remain explicit partial or unsupported boundaries. Optional React overlays retain the proved Linux desktop CEF path. | [ui](status/capabilities/ui.md) |
| Assets | Active | Bundle-local assets include provider provenance, relocatable material-aware model-test projects with fail-closed web runtime proof, secret-isolated experimental model-provider jobs, and explicit-consent Linux x64 Blender recipes; other Blender hosts and credential-backed provider promotion remain explicit gaps. | [assets](status/capabilities/assets.md) |
| Audio/platform | Active | Web/native bundle-local startup, event, and script playback execute in their game loops with native entity-spawn proof; native sink controls execute except seek, while generated tones, device routing, and runtime network audio retain explicit boundaries. | [audio/platform](status/capabilities/audio-platform.md) |
| Native parity | Frozen for promotion | Bevy consumes emitted IR; the native playtest P0 is closed, headless desktop playtests now return a structured waived-headless warning instead of a winit crash (offscreen rendering remains unsupported), bounded gameplay parity pairs one humanoid smoke playtest plus a full-profile ball-push row across web/desktop, the closed Interaction subset has paired web/native trace and state conformance, trace/source-only rows are not broad promotions, and new native promotions require shipped-game evidence, native proof, and the native path decision. | [native parity](status/capabilities/native-parity.md) |
| Game production | Active | Generated instructions prefer bounded SFX generation after a successful provider probe, retain offline fallbacks, and release-scan provider secrets; evidence is mock-only. PlacementSet and bounded cross-adapter Interaction recipes are documented with exact-match and conformance boundaries. | [game production](status/capabilities/game-production.md) |
| Editor | In progress | Editor and MCP surfaces wrap authoring operations rather than owning a second source model; editor operation names, payload keys, and composite recipes now have metadata/drift coverage, and the viewport includes read-only retained UI source preview with deterministic binding placeholders/values. | [editor](status/capabilities/editor.md) |
| Tooling/proof | Active | Verification owns current-run acceptance coverage, prompt-hash preparation, real Three.js/WebGL compliance, authoritative usage capture, per-run token/command caps, raw and cost-weighted parity, churn/rubric matrix gates, and retained aggregate artifacts; the July 15 unfamiliar-game rerun is an explicit FAIL, not a smoothness promotion. | [tooling/proof](status/capabilities/tooling-proof.md) |
| Distribution | In progress | Versioned distribution source/IR, registry-derived planning, web static/ZIP/PWA, Linux x86-64 Bevy/embedded-webview, and Android x86-64/arm64 embedded-webview packaging are implemented. Android emulator resize, cold-relaunch persistence, non-silent audio output, and background/foreground audio lifecycle now pass; physical arm64 execution still fails closed, while promotion, other native hosts/runtimes, store credentials, and devices remain gated. | [distribution](status/capabilities/distribution.md) |

## Current PRDs

- [Agent Ergonomics](PRDs/done/agent-ergonomics-2026-07-05/README.md): done
  execution bundle for measuring and improving agent game creation.
- [Proof-First Engine Loop](PRDs/proof-first-engine-loop-2026-07-05/): active
  runtime, native parity, gameplay, and proof-loop capability work.
- [UI System Remediation](PRDs/other/ui-system-remediation-2026-07-08/README.md):
  done execution bundle from the 2026-07-08 UI inspection covering web action
  delivery, parity truthing, authoring closure, behavioral conformance, editor
  preview, and native hygiene.
- [Adapter Surface Remediation](PRDs/done/other/adapter-surface-remediation-2026-07-08/README.md):
  done execution bundle from the 2026-07-08 adapter-surface diagnostic
  covering generated-game proof enrollment, adapter drift gates, CLI registry
  substrate, executable authoring descriptors, and editor operation recipes.
- [Leverage Points](PRDs/done/other/leverage-points-2026-07-09/README.md):
  done execution bundle from the 2026-07-09 system leverage report covering
  descriptor-owned surfaces, churn ratchets, runtime diagnostics, manifest
  ownership, a build-only forcing-function game, and visual metric bundles.
- [Rust Static Analysis Quality Ratchet](PRDs/done/rust-static-analysis-quality-ratchet-2026-07-13.md):
  done; root rustfmt and metadata-derived all-target Clippy now enforce zero
  warnings in pre-push and CI.
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

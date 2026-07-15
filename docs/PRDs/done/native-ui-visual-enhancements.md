# PRD: Native UI Visual Enhancements (Shadows, Glow, Gradients, Effect Presets)

Status: completed
Date: 2026-07-12

Completed: 2026-07-14. Completion audit closed 2026-07-15 after replacing
generic screenshot claims with causal idle/hover/selected and isolated
with/without visual evidence.

## Completion audit

- Effect presets use the shared IR fallback resolver on both adapters. Web and
  native render live hover, focus, selected, disabled, and predicate states;
  pulse timing is activation-relative and tint intensity modulates color.
- Native shadow drawing consumes `NativeUiRenderedShadow`, uses a cached sliced
  soft-ring texture, and applies authored color, offset, blur, and spread.
  Native gradient drawing consumes `NativeUiRenderedGradient` and caches the
  generated linear image by endpoints and angle.
- Native bold requests resolve `boldAsset`; missing variants retain the regular
  face with `TN_BEVY_UI_FONT_WEIGHT_FALLBACK`. The native trace binds the proof
  fixture's bold request to `assets/fonts/ui-bold.ttf`.
- `verify:feature-parity-ui-native` now retains paired idle, hover, and selected
  screenshots, isolated shadow/gradient with/without captures, exact state
  contact sheets, and `visual-observations.json` with causal pixel bounds and
  mean colors. Aggregate conformance enrolls the combined styled-state sheet.
- Structured authoring preserves effect presets, the cookbook documents the
  reusable pattern, and chess authors a predicate-driven active-move glow with
  web iterate plus desktop playtest evidence under `examples/chess/artifacts/`.
- Final verification passed: IR tests (384), native UI tests (22), native rich
  text test, web effect test, UI registry/gate tests, focused UI-native gate,
  aggregate conformance, docs consistency, and cookbook verification.

## Problem

Reference-quality game UI (see `examples/chess/assets/chess-game.png`) relies
on a small set of visual treatments the native (Bevy) retained-UI renderer
cannot produce today: soft panel shadows, a glowing selection outline on the
active move entry, gradient fills, and animated highlight effects. The IR
already models most of these, and the web DOM overlay renders them, but on
native they are preserved as metadata/trace components with no pixel output.
One treatment (rendered effect presets, i.e. the glow) is missing on both
targets.

Mapping the reference screenshot to current support:

| Screenshot treatment | IR schema | Web overlay | Native (Bevy) |
| --- | --- | --- | --- |
| Rounded, semi-transparent dark panels | `borderRadius`, `backgroundColor` #RRGGBBAA, `opacity` | rendered | rendered |
| Border color/width (card frames) | `borderColor`, `borderWidth` | rendered | rendered |
| Panel drop shadows (depth vs. scene) | `shadow` {blur, offset, spread, color} | rendered (CSS `box-shadow`) | metadata-only |
| Glowing yellow outline on active move (`Nf3`) | effect presets: `glow`/`outline`/`focusRing`/`pulse`/`tint` | trace-only, NOT rendered | trace-only, NOT rendered |
| Gradient fills | `gradient` (linear) | rendered (CSS) | metadata-only |
| Bold text (names, "Your Turn") | `fontWeight` | rendered | metadata-only (single font face loaded) |
| Badge pill ("3" on Hint) | bg color + radius + text | rendered | rendered |
| Icons (clock, gear, lightbulb, undo) | image nodes + atlas/nine-slice metadata | partial (scale/flip/tile CSS; atlas/nine-slice data-attr only) | metadata-only |
| Green/yellow board-square glow | out of scope: chess implements these as 3D meshes + materials in the scene (`examples/chess/content/scenes/chess.scene.json:953`), not UI | n/a | n/a |

The practical consequence: a game that looks finished on web ships flat,
shadowless, glow-less panels on desktop. The chess UI already authors
`shadow` on its cards (`examples/chess/dist/chess.bundle/ui.ir.json`:
`opponent-card`, `player-card`, `turn-card`), so the gap is visible in any
side-by-side today. And the single most game-feel-critical treatment --
"this element is selected/active" glow -- cannot be expressed as rendered
pixels on either target, only authored as trigger metadata.

## Evidence

- IR style schema (`IUiStyleIr`): `packages/ir/src/uiTypes.ts:295-321` --
  `shadow`, `gradient`, `fontWeight`, `textDecoration`, `opacity` all
  modeled.
- Effect presets (`IUiEffectPresetIr`): `packages/ir/src/uiTypes.ts:57-81` --
  kinds `focusRing | glow | outline | pulse | tint`, triggers
  `disabled | focus | hover | predicate | selected`, plus a `fallback`
  strategy field (`none | outline | shadow | tint`) that nothing renders.
  Validation suggests these presets by name
  (`packages/ir/src/uiValidation.ts:882`).
- Native renders color/border/radius/opacity/text align+wrap:
  `runtime-bevy/crates/threenative_runtime/src/ui/interactions.rs:305-448`
  (styled_color, border helpers, `BorderRadius::all` at :325-331),
  `runtime-bevy/crates/threenative_runtime/src/ui/widgets.rs:1-171`.
- Native preserves-but-does-not-render: `NativeUiRenderedGradient` /
  `NativeUiRenderedShadow` / rendered-text-style metadata components
  (`runtime-bevy/crates/threenative_runtime/src/ui.rs:229-311`,
  `ui/widgets.rs:123-146`); effect presets become
  `NativeUiEffectPresetObservation` strategy traces only
  (`ui.rs:519-531`, `ui/traces.rs:335-367`).
- Web overlay renders shadow/gradient/weight/decoration via CSS
  (`packages/runtime-web-three/src/ui/domOverlay.ts:580-628`) but has no
  effect-preset rendering path either.
- Boundary is documented, not accidental:
  `docs/status/capabilities/ui.md:36-46` grades gradients/shadows and effect
  presets as metadata/trace boundaries; custom UI materials are an explicit
  unsupported boundary (`packages/ir/src/bevyCatalogResiduals.ts:240-243`).
- Bevy is pinned at `=0.14.2`
  (`runtime-bevy/crates/threenative_runtime/Cargo.toml:115`). Upstream
  `bevy_ui` gained `BoxShadow` in 0.15, text shadows in 0.16, and UI
  gradients in 0.17; on 0.14 none of these exist as engine primitives.

## Goals

1. Effect presets render real pixels on both targets, from the same IR,
   with the authored `fallback` strategy actually driving what is drawn.
2. Authored `shadow` produces a visible drop shadow on native panels.
3. Authored linear `gradient` produces a visible fill on native panels.
4. `fontWeight: "bold"` selects a bold font face on native.
5. Parity claims stay truth-graded: each promotion comes with a
   `verify:feature-parity-ui-native` capture extension, and
   `docs/status/capabilities/ui.md` + `docs/STATUS.md` are updated per row.

## Non-goals

- Board-square/world highlights (3D scene materials, already achievable;
  glow-bloom there is a rendering/post-effects concern, not UI).
- Blur/backdrop-filter, custom UI shaders/materials (explicit boundary),
  render-to-texture UI, per-span italic.
- Radial/conic gradients (IR only models `kind: "linear"`).
- DPI-aware scaling (separate boundary,
  `TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY`).

## Design

### Decision: Bevy upgrade vs. emulate on 0.14

Shadows and gradients as first-class engine features require Bevy >= 0.15
(shadows) and >= 0.17 (gradients). A Bevy upgrade is a large, risky change
that touches the whole runtime and should be its own PRD. This PRD therefore
emulates on 0.14 with techniques that survive an upgrade (the IR contract
does not change; only the native adapter's drawing strategy does), and
records the upgrade as the long-term simplification.

### Phase 1 -- rendered effect presets (both targets)

The highest-value, lowest-cost slice: every preset kind maps onto
primitives both renderers already have.

- `outline` / `focusRing`: native spawns a sibling/wrapper node with
  transparent fill, `BorderColor` + border width + matching
  `BorderRadius`; web maps to CSS `outline` or `box-shadow` ring.
- `tint`: modulate `BackgroundColor` toward the preset color by
  `intensity`; web equivalent via background blend.
- `glow`: render the authored `fallback` strategy honestly -- `outline`
  (default) or `shadow` (Phase 2 dependency) -- and record the chosen
  strategy in the existing trace so the strategy field finally reflects
  rendered truth. Web renders true glow via `box-shadow` blur.
- `pulse`: animate the effect node's alpha/intensity on
  `pulse.durationMs`/`iterations` -- a small native tween system and a CSS
  animation on web.
- Triggers: `hover`/`focus`/`selected`/`disabled` already exist as
  interaction state on both targets; `predicate` evaluates against bound
  values like existing binding updates.

This alone reproduces the screenshot's yellow active-move highlight.

### Phase 2 -- native shadows

Bevy 0.14 emulation: a shadow child quad behind the panel using a small
pre-generated radial-falloff texture stretched with nine-slice-style
insets (generated once at startup into an image asset, no per-node cost),
tinted by `shadow.color`, offset by `offsetX/offsetY`, sized by
`spread`/`blur`. Approximation is acceptable and must be graded as
"bounded native shadow rendering" -- the parity capture compares presence,
placement, and color, not blur-kernel equality. Keep the existing
`NativeUiRenderedShadow` component as the source the drawing system reads,
so trace output stays consistent.

### Phase 3 -- native gradients

Generate a 1xN (or Nx1, per `angle`) gradient strip texture from
`from`/`to` at document load, apply as `UiImage` with stretch. Cache by
(from, to, angle) so repeated styles share one texture. Runs behind the
same grading rule: promoted only with a parity capture.

### Phase 4 -- bold font face

Extend native font loading (`ui/interactions.rs:368-409`) to resolve a
bold variant per `UiFontAssetIr` (explicit bold asset path in the font
asset IR, falling back to the regular face plus a
`TN_BEVY_UI_FONT_WEIGHT_FALLBACK` diagnostic when absent). No synthetic
bolding.

### Explicitly deferred

Icon/atlas/nine-slice native rendering is left as-is (metadata + traces)
unless a game proves the need; the screenshot's icons can ship as plain
image nodes once image rendering is promoted, which is a separate row.

## Verification

- New IR/authoring unit tests for preset-to-strategy resolution:
  `pnpm --filter @threenative/ir test -- --run ui`.
- Native systems tests: `cargo test --manifest-path runtime-bevy/Cargo.toml
  -p threenative_runtime native_ui` extended with effect/shadow/gradient
  spawn assertions.
- `pnpm verify:focused verify:feature-parity-ui-native` extended per phase:
  effect-state screenshots (idle/hover/selected), shadow presence capture,
  gradient fill capture, adapter-matched strategy traces.
- `pnpm verify:conformance` UI visual contact sheet gains the styled
  fixture states.
- Chess proof: author the move-list highlight + panel shadows in
  `examples/chess/content/ui`, run `tn playtest` and rerun committed
  scenarios with `--target desktop` before any release claim.

## Documentation updates (required per work rules)

- `docs/status/capabilities/ui.md`: move each promoted row out of the
  metadata/trace table; state the bounded-approximation grading for
  native shadows/gradients.
- `docs/STATUS.md`: one-line index update.
- `docs/bevy-feature-parity.md`: upgrade the UI effect/shadow/gradient rows
  from partial/diagnostic with links to the new parity captures.

## Risks

- Emulated shadows/gradients add extra UI entities per styled node;
  mitigate by spawning effect/shadow children only when the style requests
  them and caching generated textures.
- Visual mismatch web vs. native (CSS blur vs. texture falloff) could be
  misread as a bug; the grading language and parity capture must state the
  bound explicitly.
- A future Bevy upgrade (>= 0.15) obsoletes the shadow emulation; keep the
  drawing strategy behind one module boundary so the swap is local.
- Effect-preset rendering touches interaction state on both renderers;
  regression risk on existing focus/hover traces -- covered by the existing
  conformance focus/action evidence categories.

# PRD: Portable UI Rendering Semantics Decision

## 1. Context

**Problem:** Several UI presentation features are present in IR or runtime
metadata but not consistently rendered or bounded. Native gradients and
shadows are traced but not drawn. Web effect presets are traced but not applied
as CSS. Web atlas/nine-slice metadata is written into datasets but not
rendered. `safeArea` is not applied on web. Native `textInput` spawns metadata
but does not provide editing/caret/IME behavior.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 5.1, 5.2, 6,
and 7.

**Files likely touched:**

- `packages/ir/src/uiTypes.ts`
- `packages/ir/src/uiValidation.ts`
- `packages/runtime-web-three/src/ui/domOverlay.ts`
- `packages/runtime-web-three/src/ui/effects.ts`
- `runtime-bevy/crates/threenative_runtime/src/ui.rs`
- `runtime-bevy/crates/threenative_runtime/src/ui/widgets.rs`
- `runtime-bevy/crates/threenative_runtime/src/ui/traces.rs`
- `docs/bevy-feature-parity.md`
- `docs/status/capabilities/ui.md`
- `docs/status/capabilities/native-parity.md`
- `docs/STATUS.md`

## 2. Solution

For each presentation feature, choose one contract state and make code, docs,
and tests agree:

- Rendered on both supported runtimes.
- Rendered on one runtime with explicit target-profile diagnostics elsewhere.
- Metadata-only/diagnostic boundary with no promoted rendering claim.
- Rejected at validation time with stable diagnostics.

The decision table must cover gradients, shadows, effect presets,
atlas/nine-slice image rendering, safe-area layout, context-menu viewport
clamping, sequential focus around disabled nodes, and native text input editing
semantics.

## 3. Acceptance Criteria

- [x] Each listed presentation feature has a documented contract state.
- [x] Runtime behavior matches that state on web and native.
- [x] Metadata-only features are not described as pixels or editing behavior.
- [x] Unsupported or target-limited features emit stable diagnostics where
      authors can act on them.
- [x] Web context menus clamp to the viewport if context menus remain a
      supported web behavior.
- [x] Sequential focus skips disabled nodes deterministically if sequential
      focus remains supported.
- [x] Capability docs and parity docs are updated for any changed claims.

## 4. Verification

- [x] Add focused runtime tests for every feature kept as supported behavior.
- [x] Add validation/diagnostic tests for every feature made unsupported or
      target-limited.
- [x] Run `pnpm verify:conformance` if IR/runtime behavior changes.
- [x] Run `pnpm check:docs`.

## 5. Dependencies

Depends on PRD-002 for the initial truthing baseline. PRD-005 should consume
the behavior decisions made here.

## 6. Non-Goals

- Broad visual redesign of UI components.
- Arbitrary CSS or raw Bevy UI escape hatches.
- World-space UI, render-to-texture UI, or virtual keyboard support unless a
  separate PRD changes those boundaries.

# PRD: Web UI Action Delivery and Live State

## 1. Context

**Problem:** Web runtime UI actions are queued by the DOM overlay but never
delivered to scripts. Native Bevy drains native UI actions into scripted input
each frame, so the same bundle can react to UI on native while silently doing
nothing on web. Script-facing `context.ui` state is also detached from the live
DOM overlay, so script mutations do not reliably affect rendered web UI.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 3 and 7.

**Files likely touched:**

- `packages/runtime-web-three/src/render.ts`
- `packages/runtime-web-three/src/ui/renderUi.ts`
- `packages/runtime-web-three/src/ui/domOverlay.ts`
- `packages/runtime-web-three/src/systems/contextUi.ts`
- `packages/runtime-web-three/src/input.ts` or the current script input channel
- `packages/runtime-web-three/src/**/*.test.ts`
- `packages/ir/fixtures/*` or a focused example fixture

## 2. Solution

Wire the web game loop so queued `IUiActionEvent` values are drained after
`uiOverlay.update()` and injected into the same script-observable action path
used by portable input. Replace the parallel in-memory `context.ui` model with
a live overlay-backed state adapter, or make the overlay consume the shared
state that `context.ui` mutates.

Explicitly preserve the adapter boundary: scripts observe portable action IDs
and values, not DOM events, elements, or browser handles.

## 3. Acceptance Criteria

- [x] A DOM button click on web produces one script-observable UI action with
      the authored node ID/action ID and deterministic value payload.
- [x] Slider/range changes on web produce script-observable value actions
      without duplicate delivery across frames.
- [x] `ctx.ui.setDisabled`, `ctx.ui.setValue`, and `ctx.ui.activate` either
      mutate the live overlay state or produce an explicit unsupported
      diagnostic; no silent detached state remains.
- [x] Native Bevy UI action delivery behavior remains unchanged.
- [x] Unsupported raw DOM access remains unavailable to scripts.

## 4. Verification

- [x] Add a web runtime test that renders a UI button, dispatches a click, ticks
      the game loop, and asserts the script receives the action.
- [x] Add a slider/value test covering value payload shape and de-duplication.
- [x] Add or update a fixture that can later run under PRD-005 behavioral
      conformance.
- [x] Run the narrow web runtime test package.
- [x] Run `pnpm verify:conformance` if shared UI/input contracts change.

## 5. Dependencies

None. This is the first implementation slice.

## 6. Non-Goals

- React or DOM app-shell integration.
- New UI widgets.
- Native Bevy UI feature promotion.

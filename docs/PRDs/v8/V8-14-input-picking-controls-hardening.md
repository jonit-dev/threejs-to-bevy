# V8-14 Input, Picking, and Controls Hardening

Complexity: 9 -> HIGH mode

## Context

**Problem:** Input covers keyboard/mouse, gamepad/touch metadata, basic picking,
UI action dispatch, and rebinding helpers, but not persisted rebinding UI, drag
picking, picking debug overlays, or richer device diagnostics.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v7/V7-04-rich-portable-ui-navigation-and-input-parity.md`, and
`docs/PRDs/v8/V8-06-camera-helpers-multi-view-and-render-targets.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: input declarations, settings/local storage,
  retained UI, pointer ray services, web/Bevy input runtime, conformance, and
  debug overlays.
- [x] Caller file identified: SDK input APIs, compiler emit, IR validation, web
  input capture, Bevy input capture, UI runtime, and verify scripts.
- [x] Registration/wiring needed: settings schema, UI actions, drag events,
  diagnostic reports, fixtures, docs, and gates.

**Is this user-facing?** Yes. Players need reliable input customization and
authors need debug visibility into picking/device state.

## Solution

**Approach:**

- Add persisted local rebinding contract and retained UI rebind flow.
- Promote drag picking phases for 3D meshes and UI targets.
- Add debug overlays for rays, hit bounds, and device state.
- Strengthen diagnostics for missing devices, duplicate bindings, and unknown
  controls.

**Data Changes:** Saved binding schema, drag-picking event metadata, debug
overlay observations, and richer `TN_INPUT_*` diagnostics.

## Execution Phases

#### Phase 1: Rebinding Persistence Contract - Bindings can round-trip locally

**Implementation:**

- [ ] Add settings schema for saved bindings.
- [ ] Validate duplicate/missing-device cases.
- [ ] Add CLI/local storage import/export tests.

**Verification Plan:** IR/settings tests and runtime storage round-trip tests.

#### Phase 2: Interactive Rebinding UI - Players can change controls

**Implementation:**

- [ ] Add retained UI panel/action flow for rebind requests.
- [ ] Apply updates in web and Bevy.
- [ ] Record final bindings in conformance.

**Verification Plan:** UI tests and web/native input trace comparison.

#### Phase 3: Drag Picking Events - 3D and UI targets emit drag phases

**Implementation:**

- [x] Add capture/start, move, drop, and cancel phases for the proven 3D mesh
  picking trace.
- [x] Use camera pointer rays from V8-06 for the proven 3D mesh picking trace.
- [x] Ensure deterministic ordering across web and Bevy for
  `v8-input-drag-picking` ordered JSON trace artifacts.
- [ ] Extend the same drag phases to UI targets.

**Verification Plan:** Shared fixture and focused runtime tests.

#### Phase 4: Debug Overlays and Device Diagnostics - Input state is inspectable

**Implementation:**

- [ ] Render/debug rays, hit bounds, and connected device panels.
- [ ] Emit stable diagnostics and visual/debug artifacts.

**Verification Plan:** Debug artifact gate and diagnostic assertions.

## Acceptance Criteria

- [ ] Rebinding persistence, drag picking, overlays, and diagnostics work across
  web and Bevy or fail with stable unsupported codes.

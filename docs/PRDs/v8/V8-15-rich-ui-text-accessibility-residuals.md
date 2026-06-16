# V8-15 Rich UI, Text, and Accessibility Residuals

Complexity: 10 -> HIGH mode

## Context

**Problem:** Retained UI supports layout, basic text, images, action dispatch,
and accessibility metadata, but font assets, rich inline spans, native visual
style parity, 9-slice images, standard widgets, and stronger accessibility
diagnostics remain incomplete.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v7/V7-04-rich-portable-ui-navigation-and-input-parity.md`,
`docs/PRDs/v8/V8-05-optional-react-webview-overlay.md`, and
`docs/PRDs/v8/V8-14-input-picking-controls-hardening.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: retained `ui.ir.json`, SDK UI declarations,
  bundle-local assets, web DOM overlay, Bevy UI, accessibility reports, and
  conformance.
- [x] Caller file identified: SDK UI APIs, compiler UI emit, IR validation, web
  UI renderer, Bevy UI renderer, AccessKit mapping, and verify scripts.
- [x] Registration/wiring needed: font/image assets, widgets, accessibility
  diagnostics, fixtures, docs, and gates.

**Is this user-facing?** Yes. This is the portable in-game UI track; React
webview overlays stay optional and separate.

## Solution

**Approach:**

- Promote bundle-local font assets and rich text spans.
- Close native visual gaps for shadows, gradients, weight, and decorations.
- Add atlases, 9-slice, flip, and tile metadata for common HUD assets.
- Add baseline widgets and stronger accessibility diagnostics.

**Data Changes:** Font asset refs, rich text spans, expanded image metadata,
widget declarations, disabled-state semantics, and target-specific accessibility
diagnostics.

## Execution Phases

#### Phase 1: Font Assets and Rich Text Contract - Text can use declared fonts/spans

**Implementation:**

- [ ] Add font asset declarations and rich inline spans.
- [ ] Validate missing fonts, unsupported weights, and span nesting limits.

**Verification Plan:** SDK/IR/compiler tests and web/native text observations.

#### Phase 2: Native UI Visual Parity - Bevy preserves promoted styles visually

**Implementation:**

- [ ] Map native shadows, gradients, weight, and decoration where supported.
- [ ] Add screenshot/conformance evidence.

**Verification Plan:** UI visual fixture and runtime mapping tests.

#### Phase 3: UI Image Expansion - HUD images scale predictably

**Implementation:**

- [ ] Add atlases, 9-slice, flip, and tile fields.
- [ ] Validate bundle-relative image refs and dimensions.

**Verification Plan:** UI image tests and screenshots.

#### Phase 4: Widgets and Accessibility Residuals - Standard controls are diagnosable

**Implementation:**

- [ ] Add sliders, scrollbars, and context menu baseline.
- [ ] Add disabled-state semantics and stronger focus/name/list diagnostics.
- [ ] Emit target-specific accessibility reports.

**Verification Plan:** UI action tests, accessibility diagnostics, and
conformance.

## Acceptance Criteria

- [ ] Portable retained UI covers the promoted rich text, visual style, image,
  widget, and accessibility surfaces without relying on optional overlays.

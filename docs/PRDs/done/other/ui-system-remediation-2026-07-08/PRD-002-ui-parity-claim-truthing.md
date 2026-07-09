# PRD: UI Parity Claim Truthing

## 1. Context

**Problem:** `docs/bevy-feature-parity.md` contains UI rows that read as P1
or native-rendered support even when the implementation is traced,
metadata-only, partial, or not behaviorally proved. The status front door says
native support is claimed only when web/native semantics are both proved, so
the UI parity wording must match current evidence.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 6 and 7.

**Files likely touched:**

- `docs/bevy-feature-parity.md`
- `docs/status/capabilities/ui.md`
- `docs/status/capabilities/native-parity.md`
- `docs/STATUS.md`
- Optional focused evidence notes under `docs/runtime/` or `docs/status/`

## 2. Solution

Re-grade UI parity rows into one of three states:

- **Promoted:** behavior has web and native proof, with a named gate or
  artifact.
- **Partial/diagnostic:** structure, metadata, tracing, or diagnostics exist
  but runtime behavior is not fully implemented or proved.
- **Unsupported boundary:** the contract rejects or explicitly defers the
  feature.

The first truthing pass must cover the inspection's named rows: disabled state
mutation, nested/axis scroll, spatial navigation, focus narration, editable
text input, native-rendered shadows/gradients, world-attached UI projection,
effect presets, desktop webview overlays, virtual keyboard, grid named areas,
and render-to-texture/world transforms.

## 3. Acceptance Criteria

- [x] Every UI row named in the inspection has wording that matches current
      implementation and proof evidence.
- [x] Rows with only trace metadata are not described as rendered or
      behaviorally supported.
- [x] Rows with only structural conformance are not described as full parity.
- [x] `docs/status/capabilities/ui.md` links or summarizes the corrected UI
      support boundaries.
- [x] `docs/status/capabilities/native-parity.md` keeps the native promotion
      freeze explicit for UI work.
- [x] The one-line UI and native parity entries in `docs/STATUS.md` remain
      accurate after capability wording changes.

## 4. Verification

- [x] Run `pnpm check:docs`.
- [x] For each promoted UI/native claim, identify the proof command or artifact
      path in the docs.
- [x] Confirm no inspection-named unproved row still uses promoted/P1 wording
      without evidence.

## 5. Dependencies

Can run in parallel with PRD-001. Must land before new UI/native parity
promotion PRDs are marked done.

## 6. Non-Goals

- Implementing missing runtime behavior.
- Removing historical evidence from archives.

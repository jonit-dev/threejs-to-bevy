# PRD: Native UI Runtime Hygiene

## 1. Context

**Problem:** Native UI support has several non-contract hygiene issues: per-frame
binding resolution re-walks the entity tree, font fallback probes a few Linux
paths, pixel values do not account for DPI/scale, and diagnostic trace modules
duplicate report boilerplate. These are not all user-facing bugs today, but
they make UI-heavy games and cross-platform native proof more fragile.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 5.1 and 7.

**Files likely touched:**

- `runtime-bevy/crates/threenative_runtime/src/ui.rs`
- `runtime-bevy/crates/threenative_runtime/src/ui/traces.rs`
- `runtime-bevy/crates/threenative_runtime/src/*_trace.rs`
- `runtime-bevy/crates/threenative_runtime/src/input_ui_polish.rs`
- `runtime-bevy/crates/threenative_runtime/Cargo.toml`
- `docs/status/capabilities/ui.md`
- `docs/status/capabilities/native-parity.md`

## 2. Solution

Keep the retained UI tree static, but cache resolved binding targets and entity
lookups after spawn so per-frame text sync does not scan the whole tree per
bound node. Replace hard-coded font fallback with a platform-aware discovery or
bundle-configured fallback path that reports stable diagnostics when no usable
font is found. Add DPI/scale handling or explicitly document and diagnose the
current absolute-pixel boundary. Consolidate trace/report modules behind a
small shared diagnostics report helper where that reduces duplication without
changing report shapes.

## 3. Acceptance Criteria

- [ ] Native bound text sync avoids O(bound nodes * tree size) lookup each
      frame for stable retained trees.
- [ ] Missing native font fallback produces a stable diagnostic instead of
      silently rendering no text.
- [ ] Font discovery works on the supported native target set or is explicitly
      bounded in docs.
- [ ] DPI/scale behavior is implemented or documented as an unsupported/partial
      boundary with diagnostics.
- [ ] Shared trace/report helper reduces duplicate report boilerplate while
      preserving existing artifact schemas or intentionally versioning them.
- [ ] No new native parity promotion is made without PRD-005 behavioral proof.

## 4. Verification

- [ ] Add or update native unit tests for binding cache construction and lookup.
- [ ] Add a diagnostic test for missing font fallback.
- [ ] Run `cargo test` for `threenative_runtime` or the narrow native crate
      tests that cover UI.
- [ ] Run `pnpm verify:conformance` if report schemas or UI behavior change.
- [ ] Run `pnpm check:docs` if capability boundaries are updated.

## 5. Dependencies

Independent. Must respect the PRD-002 parity truthing baseline and PRD-005
promotion evidence rules.

## 6. Non-Goals

- Dynamic UI tree add/remove at runtime.
- Native text editing parity.
- New Bevy UI rendering features.

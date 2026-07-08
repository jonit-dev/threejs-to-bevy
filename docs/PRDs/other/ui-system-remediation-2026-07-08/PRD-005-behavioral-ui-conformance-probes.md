# PRD: Behavioral UI Conformance Probes

## 1. Context

**Problem:** Current UI conformance compares node-tree structure rather than
runtime behavior or pixels. That lets unsupported, metadata-only, or divergent
behavior appear conformant. The inspection specifically calls for probes around
interaction delivery, focus navigation, disabled-state mutation, nested scroll,
and small screenshot/pixel fixtures.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 6.4 and 7.

**Files likely touched:**

- `packages/ir/fixtures/*`
- `packages/runtime-web-three/src/conformance.ts`
- `runtime-bevy/crates/threenative_runtime/src/conformance.rs`
- `tools/verify/src/**`
- `tools/verify/artifacts/conformance/*`
- `docs/verify-v6.md`
- `docs/status/capabilities/ui.md`
- `docs/status/capabilities/native-parity.md`

## 2. Solution

Extend UI conformance from shape-only reports to behavior probes with
target-specific evidence. Keep probes small and deterministic:

- Interaction: click/change a UI control and assert the script observes the
  action.
- Disabled mutation: script toggles disabled state and runtime evidence shows
  input is blocked/unblocked.
- Focus walk: declared navigation and spatial fallback, where supported, move
  focus to the same logical target.
- Scroll: nested and axis-specific scroll fixtures report deterministic offset
  behavior, or explicit unsupported diagnostics.
- Visual sample: a small fixture captures enough pixels or style samples to
  prove features that are claimed as rendered.

## 3. Acceptance Criteria

- [ ] Conformance output distinguishes structural, behavioral, and visual/style
      evidence.
- [ ] Web and native interaction probes pass for the supported UI action path.
- [ ] Disabled-state mutation is either behaviorally proved on each claimed
      target or downgraded to partial/diagnostic in docs.
- [ ] Focus navigation claims are backed by deterministic probes for declared
      links and any claimed spatial fallback.
- [ ] Nested/axis scroll claims are backed by probes or downgraded.
- [ ] Visual/style probes cover at least one fixture for any feature promoted
      from metadata-only to rendered behavior in PRD-004.
- [ ] Failing probes produce stable, actionable diagnostics.

## 4. Verification

- [ ] Run `pnpm verify:conformance`.
- [ ] Run focused web runtime conformance tests.
- [ ] Run focused native conformance tests or `pnpm verify:parity:smoke` if the
      native harness owns the probe.
- [ ] Confirm generated conformance artifacts include behavior evidence paths.

## 5. Dependencies

Depends on PRD-001 for web action delivery and PRD-004 for rendering semantics
decisions.

## 6. Non-Goals

- Full screenshot parity for every UI feature.
- General screen-reader automation beyond evidence needed for current claims.
- Large UI fixture galleries.

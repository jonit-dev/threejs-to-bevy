# V6-08 Asset and Diagnostic Hardening

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 adds new asset and runtime failure modes. Without stable
diagnostics, cross-feature failures will collapse into generic compiler or
runtime errors.

## Integration Points

- Entry point: validation, CLI JSON output, runtime mapping, conformance
  reports, docs gates.
- Caller files: compiler validators, IR validators, web and Bevy diagnostic
  adapters, `tn` commands.
- User-facing: authors receive stable codes, paths, severities, and suggestions.

## Solution

Harden diagnostics for V6 resources/events, schedules, physics, character,
animation, UI, audio, and asset failures.

## Execution Phases

#### Phase 1: Diagnostic Codes and Validation - V6 failures are actionable.

**Files (max 5):**

- `docs/diagnostics.md` - V6 diagnostic ranges.
- `packages/ir/src/validate.ts` - stable validation diagnostics.
- `packages/compiler/src/*` - normalized compiler diagnostics.
- `packages/cli/src/*` - JSON output preservation.
- `packages/ir/src/validate.test.ts` - diagnostic tests.

**Implementation:**

- [ ] Add V6 domain diagnostics for missing animation clips, unsupported audio,
  invalid UI refs, collider mistakes, and resource/event permission errors.
- [ ] Preserve severity, path, and suggestion in compiler and CLI JSON output.
- [ ] Avoid rewriting stable upstream codes.

#### Phase 2: Runtime Mapping Diagnostics - Target drift is explicit.

**Files (max 5):**

- `packages/runtime-web-three/src/*` - web diagnostics.
- `runtime-bevy/crates/threenative_runtime/src/*` - Bevy diagnostics.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native diagnostic tests.
- `packages/ir/fixtures/conformance/*` - rejected fixture expectations.
- `docs/bevy-feature-parity.md` - target drift notes.

**Implementation:**

- [ ] Map runtime failures to `TN_WEB_*`, `TN_BEVY_*`, or `TN_RUNTIME_*` codes.
- [ ] Include fixture, bundle path, target, and artifact path in conformance
  mismatch reports.
- [ ] Document target-specific downgrades instead of silently ignoring them.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/cli test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] V6 failures expose stable code, severity, path, and suggestion where
  enough context exists.
- [ ] Runtime target drift is reported, not hidden.

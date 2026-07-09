# PRD-003: Runtime Observation Diagnostic Expansion

## Status

Implemented

## Context

The highest-cost failures are validated authored behavior that does not change
runtime state. The repo already has resource observation diagnostics such as
`TN_RESOURCE_DECLARED_NOT_OBSERVED`, `TN_PLAYTEST_REPEATED_ASSERTION`, and
`TN_PLAYTEST_RESOURCE_STATE_STAGNATED`, but cross-runtime services still have
many places where agents must inspect artifacts manually.

## Goal

Expand source-linked runtime observations so silent or stagnant behavior
failures produce actionable diagnostics instead of artifact forensics.

## Non-Goals

- Do not broaden native/Bevy promotion claims.
- Do not expose runtime-private handles to scripts.
- Do not replace playtests with unit tests; this PRD improves playtest
  diagnosis.

## Requirements

1. Add service-by-service observation fixtures for the highest-friction script
   context APIs.
2. Attach owning source paths and system IDs to relevant runtime observations.
3. Emit first-likely-repair diagnostics for stagnant state, missing effects,
   missing events, and mismatched runtime observations.
4. Keep web and Bevy observation shapes comparable where parity is claimed.

## Execution Phases

### Phase 1: Observation Inventory

- [x] Inventory script-visible service APIs: resources, input, physics,
      contacts, UI actions, audio, particles, persistence, picking, and
      lifecycle.
- [x] Map each service to current web/Bevy observation paths and missing
      diagnostics.
- [x] Pick two high-friction services for the first slice.

### Phase 2: Source-Linked Diagnostics

- [x] Include owning source document path, system ID, module/export, and
      observed runtime path in diagnostics where available.
- [x] Add tests for missing observation, stale observation, and unsupported
      observation cases.
- [x] Preserve compact stdout; deep traces stay in artifacts.

### Phase 3: Cross-Runtime Fixture

- [x] Add one conformance or gameplay fixture per selected service.
- [x] Compare web/native observation shape only where native parity is already
      claimed or explicitly under calibration.
- [x] Update capability docs only for changed claims or new diagnostics.

## Files Likely Touched

- `packages/runtime-web-three/src/systems/*`
- `packages/runtime-web-three/src/playtest*`
- `runtime-bevy/crates/threenative_runtime/src/systems_context.rs`
- `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.rs`
- `packages/cli/src/commands/playtest.ts`
- `tools/verify/src/gameplayParity*.ts`
- `packages/ir/fixtures/conformance/*`

## Verification

- Relevant `pnpm --filter @threenative/runtime-web-three test` slices.
- Relevant `cargo test` under `runtime-bevy`.
- `pnpm verify:conformance`
- `pnpm verify:gameplay-parity` when parity evidence changes.

## Acceptance Criteria

- [x] At least two high-friction runtime services have source-linked
      observation diagnostics.
- [x] Repeated stale-state failures collapse to one actionable diagnostic.
- [x] Playtest compact reports identify the owning source and artifact paths.
- [x] Web/native observation differences are classified as enforced,
      calibrating, quarantined, or report-only.

## Implementation Notes

- Playtest/runtime observation reports now attach compact web/native resource
  observations, runtime observation sidecars, owning system evidence, and
  `TN_RESOURCE_DECLARED_NOT_OBSERVED`, `TN_PLAYTEST_RESOURCE_STATE_STAGNATED`,
  and `TN_PLAYTEST_REPEATED_ASSERTION` diagnostics for missing or stagnant
  runtime state.
- Gameplay parity summaries classify enforced, calibrating, quarantined, and
  report-only rows while keeping deep runtime traces in artifacts.
- Verification used focused CLI/playtest tests and gameplay parity verify-tools
  slices.

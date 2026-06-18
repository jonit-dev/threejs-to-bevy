# V8-17 Portable Save Slots, Settings, and Local Data

Complexity: 9 -> HIGH mode

## Context

**Problem:** ThreeNative has resources, components, events, input, audio, and
editor snapshots, but no portable save-slot, local settings, migration, or
checkpoint lifecycle contract.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v6/V6-01-gameplay-resources-and-event-contracts.md`,
`docs/PRDs/v8/V8-14-input-picking-controls-hardening.md`, and
`docs/PRDs/v8/V8-16-spatial-audio-mixer-and-music-transitions.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: declared resources/components, runtime services,
  local settings UI/services, CLI import/export, web local storage, native local
  files, diagnostics, and verification fixtures.
- [x] Caller file identified: SDK persistence APIs, compiler emit, IR
  validation, script service host, web runtime, Bevy runtime, CLI, and docs
  checks.
- [x] Registration/wiring needed: serialization whitelist, local backend
  adapters, migration diagnostics, fixtures, docs, and gates.

**Is this user-facing?** Yes. Save slots and settings are required for practical
game templates.

## Solution

**Approach:**

- Persist only declared, serializable resources/components and explicit
  settings keys.
- Add local settings for controls, audio, video, and accessibility.
- Add save/load runtime services with deterministic traces.
- Add version/migration diagnostics and checkpoint hooks without cloud storage.

**Data Changes:** Persistence schema, save-slot metadata, settings keys,
version/migration fields, checkpoint events, and corrupt-save diagnostics.

## Execution Phases

#### Phase 1: Persistence Schema - Only declared data can be saved

**Implementation:**

- [ ] Add serialization whitelist for resources/components.
- [ ] Add save-slot metadata and version fields.
- [ ] Reject raw runtime handles and unsupported types.

**Verification Plan:** IR validation tests and rejected fixtures.

#### Phase 2: Local Settings Store - Common settings persist portably

**Implementation:**

- [ ] Add controls/audio/video/accessibility settings keys.
- [ ] Support defaults, validation, import, and export.

**Verification Plan:** CLI/runtime settings round-trip tests.

#### Phase 3: Save/Load Runtime Services - Scripts can save and restore

**Implementation:**

- [ ] Add declared persistence service permissions.
- [ ] Implement web/native local backends.
- [ ] Emit deterministic service traces.

**Verification Plan:** Web/native service tests and conformance.

#### Phase 4: Migration and Checkpoint Hooks - Version changes are actionable

**Implementation:**

- [ ] Add version diagnostics and repair hints.
- [ ] Add autosave/checkpoint lifecycle events.
- [ ] Document local-only boundary.

**Verification Plan:** Migration fixtures and diagnostic assertions.

## Acceptance Criteria

- [ ] Save slots, settings, services, and migration diagnostics are portable and
  local-only until future cloud/account PRDs.

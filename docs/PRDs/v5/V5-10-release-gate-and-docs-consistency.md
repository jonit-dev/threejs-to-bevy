# V5-10 Release Gate and Docs Consistency

Complexity: 8 -> HIGH mode

## Context

**Problem:** V5 needs one repeatable release gate and docs check that prove the
hardening, native evidence, diagnostics, conformance, visual artifacts,
game-authoring ergonomics, and scope exclusions remain aligned.

## Solution

Add `check:docs:v5`, `verify:v5`, `docs/verify-v5.md`, and deterministic
artifact conventions under `artifacts/v5`.

## Execution Phases

#### Phase 1: Docs Gate

**Files:**

- `scripts/check-docs-v5.mjs`
- `scripts/check-docs-v5.test.mjs`
- `package.json`
- `docs/PRDs/v5/README.md`
- `docs/STATUS.md`
- `docs/bevy-feature-parity.md`
- `docs/diagnostics.md`

**Implementation:**

- [x] Require every `docs/PRDs/v5/V5-*.md` to be linked from the index.
- [x] Require status and parity docs to mention V5 native test, visual scene,
  and game-authoring ergonomics expectations.
- [x] Reject V5 acceptance claims for editor, online, networking, replication,
  public plugins, and custom renderer replacement.
- [x] Require diagnostics and artifact docs to mention V5.

#### Phase 2: Release Harness

**Files:**

- `scripts/verify-v5.mjs`
- `scripts/verify-v5.test.mjs`
- `package.json`
- `docs/verify-v5.md`
- `artifacts/v5/*`

**Implementation:**

- [x] Run docs V5, conformance, selected TypeScript tests, selected existing
  V3/V4 gates or documented sub-gates, focused Rust tests, V5 scene checks, and
  the required V5 game starter smoke.
- [x] Write `artifacts/v5/verification-report.json`.
- [x] Include `schema`, `version`, `status`, `code`, `steps`, `diagnostics`,
  `artifacts`, `startedAt`, and `durationMs`.
- [x] Capture Rust test evidence in `artifacts/v5/rust-test-report.json`.
- [x] Surface first failing step and stable `TN_VERIFY_V5_*` diagnostic codes.

## Verification Strategy

- `pnpm check:docs:v5`
- `node --test scripts/check-docs-v5.test.mjs`
- `node --test scripts/verify-v5.test.mjs`
- `pnpm verify:v5 -- --json`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] `pnpm verify:v5` is the V5 aggregate release gate.
- [x] The V5 report is machine-readable and links conformance, Rust, visual,
  SDK ergonomics/starter, diagnostics, and docs artifacts.
- [x] Docs checks catch missing V5 PRD links and forbidden V6 scope claims.
- [x] `docs/STATUS.md` and `docs/bevy-feature-parity.md` reflect the completed
  V5 gate state before V5 is marked complete.

## Implementation Evidence

- `scripts/check-docs-v5.mjs` verifies the full V5 PRD index, diagnostics
  ranges, status/parity V5 scope phrases, and unsupported V6-scope claims.
- `scripts/verify-v5.mjs` is the aggregate V5 gate and now runs docs checks,
  selected V5 script/SDK tests, CLI build, V5 scene build/validate/visual
  verify, dense-content budget verification, starter create/build/validate
  smoke, shared conformance, and Bevy native tests.
- `artifacts/v5/verification-report.json` includes `schema`, `version`,
  `status`, `code`, `steps`, `diagnostics`, `artifacts`, `startedAt`, and
  `durationMs`.
- `artifacts/v5/rust-test-report.json` captures the focused Rust test step, and
  failing aggregate steps produce `TN_VERIFY_V5_STEP_FAILED`.

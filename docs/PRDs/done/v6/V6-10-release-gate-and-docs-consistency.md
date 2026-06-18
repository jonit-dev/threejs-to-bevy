# V6-10 Release Gate and Docs Consistency

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 needs one repeatable gate proving feature contracts, runtime
evidence, diagnostics, docs, conformance, Rust tests, and scene artifacts agree.

## Integration Points

- Entry point: `pnpm verify:v6` and `pnpm check:docs:v6`.
- Caller files: top-level package scripts, docs gates, conformance scripts,
  runtime tests.
- User-facing: release candidates have one report that explains pass/fail state.

## Solution

Add V6 docs checks, aggregate verification, machine-readable reports under
`tools/verify/artifacts/milestones/v6`, example proof requirements, and status/parity completion
updates.

## Execution Phases

#### Phase 1: Docs Gate - V6 docs cannot drift from the ticket set.

**Files (max 5):**

- `scripts/check-docs-v6.mjs` - docs gate.
- `scripts/check-docs-v6.test.mjs` - docs tests.
- `package.json` - script registration.
- `docs/PRDs/v6/README.md` - index source.
- `docs/diagnostics.md` - V6 diagnostic docs.

**Implementation:**

- [ ] Require every V6 ticket to be linked from the index.
- [ ] Require V6 status/parity language for promoted and deferred features.
- [ ] Reject forbidden V6 acceptance claims.

#### Phase 2: Release Harness - One command proves V6.

**Files (max 5):**

- `scripts/verify-v6.mjs` - aggregate gate.
- `scripts/verify-v6.test.mjs` - report/step tests.
- `package.json` - script registration.
- `docs/verify-v6.md` - command and artifact docs.
- `tools/verify/artifacts/milestones/v6/*` - generated reports.

**Implementation:**

- [ ] Run docs checks, selected TypeScript tests, conformance, V6 scene build,
  web playable verification, focused Rust tests, and diagnostic checks.
- [ ] Require the V6 proof example under `examples/` to produce inspectable
  evidence under `tools/verify/artifacts/milestones/v6`, following existing folder conventions.
- [ ] Require real rendered visual evidence for visible promoted features where
  practical, including web screenshots and Bevy rendered evidence or documented
  native visual drift where native support is claimed.
- [ ] Write `tools/verify/artifacts/milestones/v6/verification-report.json` with schema, version,
  status, code, steps, diagnostics, artifacts, startedAt, and durationMs.
- [ ] Surface first failing step with stable `TN_VERIFY_V6_*` diagnostics.

## Verification Strategy

- `pnpm check:docs:v6`
- `node --test scripts/check-docs-v6.test.mjs`
- `node --test scripts/verify-v6.test.mjs`
- `pnpm verify:v6 -- --json`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] `pnpm verify:v6` is the V6 aggregate release gate.
- [ ] The V6 report links conformance, Rust, visual/playable, diagnostics, and
  docs artifacts.
- [ ] The V6 gate fails if the example proof or `tools/verify/artifacts/milestones/v6` evidence is
  missing.
- [ ] The V6 gate fails if visible promoted features have only build/log proof
  and no rendered artifact or explicit documented exception.
- [ ] `docs/STATUS.md` and `docs/bevy-feature-parity.md` reflect completed V6
  state before V6 is marked complete.

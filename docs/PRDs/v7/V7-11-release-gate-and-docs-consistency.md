# V7-11 Release Gate and Docs Consistency

Complexity: 8 -> HIGH mode

## Context

**Problem:** V7 needs one authoritative gate for deep parity claims, docs,
diagnostics, conformance, Rust tests, scene/template evidence, packaging, and
performance reports.

## Integration Points

- Entry point: `pnpm verify:v7` and `pnpm check:docs:v7`.
- Caller files: top-level package scripts, docs gates, conformance scripts,
  runtime tests, package/performance collectors.
- User-facing: release candidates have a single report with first-failure
  diagnostics.

## Solution

Add V7 docs checks, aggregate verification, report schema under `artifacts/v7`,
example/template proof requirements, and final status/parity/maturity updates.

## Execution Phases

#### Phase 1: Docs Gate - V7 claims stay aligned.

**Files (max 5):**

- `scripts/check-docs-v7.mjs` - docs gate.
- `scripts/check-docs-v7.test.mjs` - docs tests.
- `package.json` - script registration.
- `docs/PRDs/v7/README.md` - index source.
- `docs/diagnostics.md` - V7 diagnostic ranges.

**Implementation:**

- [x] Require every V7 ticket to be linked from the index.
- [x] Require promoted/deferred/never-portable language for deep parity gaps.
- [x] Reject forbidden editor, online, networking, collaboration, direct Bevy,
  raw Three.js, plugin, and broad shader graph claims.

#### Phase 2: Aggregate Gate - One command proves V7.

**Files (max 5):**

- `scripts/verify-v7.mjs` - aggregate gate.
- `scripts/verify-v7.test.mjs` - report/step tests.
- `package.json` - script registration.
- `docs/verify-v7.md` - command and artifact docs.
- `artifacts/v7/*` - generated reports.

**Implementation:**

- [x] Run docs checks, selected TypeScript tests, conformance, functional scene
  verification, focused Rust tests, packaging checks, performance reports, and
  diagnostic checks.
- [x] Require the V7 proof example/template to produce inspectable evidence
  under `artifacts/v7`, following existing folder conventions.
- [x] Require real rendered visual evidence for visible promoted features where
  practical, including web screenshots and Bevy rendered evidence or documented
  native visual drift where native support is claimed.
- [x] Write `artifacts/v7/verification-report.json` with schema, version,
  status, code, steps, diagnostics, artifacts, startedAt, and durationMs.
- [x] Surface first failing step with stable `TN_VERIFY_V7_*` diagnostics.

## Verification Strategy

- `pnpm check:docs:v7`
- `node --test scripts/check-docs-v7.test.mjs`
- `node --test scripts/verify-v7.test.mjs`
- `pnpm verify:v7 -- --json`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] `pnpm verify:v7` is the V7 aggregate release gate.
- [x] The V7 report links conformance, Rust, visual/runtime, packaging,
  performance, diagnostics, and docs artifacts.
- [x] The V7 gate fails if the example/template proof or `artifacts/v7`
  evidence is missing.
- [x] The V7 gate fails if visible promoted features have only build/log proof
  and no rendered artifact or explicit documented exception.
- [x] `docs/STATUS.md`, `docs/bevy-feature-parity.md`, and
  `docs/feature-maturity.md` reflect completed V7 state before V7 is marked
  complete.

# Verification Speed Audit - 2026-06-18

Complexity: 4 -> MEDIUM mode

## 1. Context

**Problem:** Verification is now broad enough that contributors cannot tell which
gate is necessary, and the release path repeats setup work that can be shared.

**Files Analyzed:**

- `package.json`
- `tools/verify/src/cli/run.ts`
- `tools/verify/src/release.ts`
- `tools/verify/src/runner.ts`
- `tools/verify/src/legacyAliases.ts`
- `tools/verify/src/conformance.ts`
- `scripts/legacy-script-alias.mjs`
- `docs/PRDs/done/other/verification-gates-and-package-scripts-reorg.md`
- `packages/ir/fixtures/conformance/fixture-catalog.json`
- `tools/verify/artifacts/release/verification-report.json`
- `packages/ir/artifacts/conformance/verification-report.json`

**Current Behavior:**

- Root `package.json` has 70 scripts; 63 are verification or check related.
- Of those 63 commands, 33 still call `scripts/*.mjs` directly, 16 route through
  `tools/verify`, 10 are legacy aliases, and 4 are other check/build helpers.
- `scripts/` still contains 139 top-level `verify-*` or `check-*` files and 55
  matching top-level tests.
- The latest checked-in release report passed in about 200 seconds with 40
  recorded steps.
- `verify:release` runs 13 focused gates serially, then conformance, sample
  scenes, and visual matrix checks.
- Several focused gates rebuild the same packages through
  `tools/verify/src/cli/run.ts` even though `verify:release` already built those
  packages earlier.
- The existing verification reorg PRD is about ownership and command cleanup; it
  does not address build reuse, gate profiles, or step-level timing budgets.

## 2. Findings

### Finding 1: Release Rebuilds Shared Packages

`tools/verify/src/release.ts` first builds core packages, then invokes focused
gates through `pnpm <script>`. Many focused gates in `tools/verify/src/cli/run.ts`
run package builds again before executing their final verifier.

This is avoidable waste. For example, `verify:bundle-safety-hardening`,
`verify:input-ui-polish`, `verify:persistence-reload`,
`verify:runtime-gameplay-host`, and `verify:v9:rendering-lights` all declare
their own package build steps. In release mode those build steps are mostly
setup duplication, not additional behavioral proof.

### Finding 2: The Release Gate Has No Profile Model

There is no first-class distinction between:

- a local smoke gate,
- a changed-package gate,
- a focused capability gate,
- a release gate,
- a full historical compatibility sweep.

Instead, contributors choose from a long flat script list. That makes it easy to
over-run broad gates locally or to under-run the gate that actually protects a
change.

### Finding 3: Timing Data Exists but Is Not Used for Budgets

`tools/verify/src/runner.ts` captures step duration, and release reports record
step summaries. The latest release report shows the slowest release steps:

| Step | Duration |
| --- | ---: |
| `verify bundle safety hardening` | 40s |
| `verify conformance gate` | 21s |
| `verify v9 rendering lights` | 15s |
| `verify production hardening` | 13s |
| `verify v9 assets gltf scene workflow` | 13s |
| `verify v9 sample scenes` | 11s |
| `verify v9 visual matrix` | 11s |

The reports do not currently enforce budgets, highlight regressions, or separate
setup time from actual verifier time.

### Finding 4: Script Bloat Is Still Real, but Not the Main Runtime Cost

The number of scripts is a maintenance problem, but the direct speed issue is
duplicated orchestration and missing profiles. Deleting wrappers without changing
the release runner would make the script table cleaner while leaving most runtime
cost untouched.

## 3. Recommendation

Create a small follow-up PRD for verification speed, separate from the existing
verification ownership reorg. The goal should be to reduce repeated setup and
make the narrowest useful verification path obvious.

Implementation plan: [Verification Strategy and Speed](../PRDs/other/verification-strategy-and-speed.md).
The Phase 1 command ownership inventory is tracked in
[Verification Script Classification](verification-script-classification.md).

**Approach:**

- Add a build-once release execution path that can call typed gate modules or
  focused gate final commands without repeating package builds.
- Add gate profiles: `smoke`, `changed`, `focused`, `release`, and `full`.
- Add structured timing reports that separate setup, execution, artifact checks,
  and visual/native runtime work.
- Keep legacy aliases during migration, but make the canonical command list
  short and documented.
- Defer script deletion until the faster runner exists; otherwise cleanup will
  be cosmetic.

**Key Decisions:**

- The first optimization target is `verify:release`, because it already has
  typed orchestration and a measured 200 second baseline.
- Focused gates should still be runnable standalone with their own setup.
- Release orchestration should pass a "setup already complete" mode or call
  shared typed gate functions directly.
- Timing budgets should warn at first, then fail only after baselines are stable.

**Data Changes:** None.

## 4. Test vs Verification Ownership

The cleanup should not treat every `verify-*` script as equally valid. Each
script should be classified by what it proves.

### Move or Keep in Package Tests

These checks should live in `*.test.ts`, `*.test.mjs`, or Rust tests owned by
the package that implements the behavior:

- Pure validation logic: schema acceptance/rejection, diagnostics, artifact path
  helpers, fixture catalog parsing, report serialization, and command selection.
- Compiler behavior: emitted bundle shape, unsupported API diagnostics,
  generated asset manifests, and stable IR serialization.
- Runtime-local behavior: web-only mapping, Bevy-only loader behavior, system
  scheduling, input handling, audio state, persistence state, and error paths.
- CLI unit behavior: argument parsing, exit codes, diagnostic formatting, and
  generated file layout for small synthetic fixtures.
- Verification-tool behavior: focused gate selection, legacy alias resolution,
  release report writing, timing metadata, and artifact contract checks.

Rule of thumb: if the assertion can run against in-memory data, a small fixture,
or one package boundary, it should be a normal test.

### Keep as Verification Gates

These checks should remain in `tools/verify` gates because they prove a product
contract across packages, runtimes, or release artifacts:

- Cross-runtime conformance where the same IR bundle is consumed by web Three.js
  and native Bevy and the reports are compared.
- Visual or sample-scene evidence that writes durable artifacts used by release
  status, docs, or parity tracking.
- Full SDK -> compiler -> bundle -> runtime flows that intentionally exercise
  the public authoring path and generated bundle contract.
- Release artifact presence checks, because they prove that required evidence
  was produced, not merely that implementation code passed.
- Current release gates that aggregate focused capability proof into one
  machine-readable release report.

Rule of thumb: if the proof requires multiple packages, both runtimes, durable
evidence, or release-policy aggregation, it belongs in a verifier gate.

### Convert or Delete

Each remaining root `scripts/verify-*.mjs` and `scripts/check-*.mjs` should be
classified into one of these outcomes:

| Script Type | Outcome |
| --- | --- |
| Thin compatibility wrapper | Keep temporarily, route to `tools/verify`, and mark with a replacement command. |
| Pure unit/integration assertion | Move into package tests and remove the script once covered. |
| Cross-runtime or release evidence gate | Move implementation into `tools/verify/src`, keep a stable package script entry point. |
| Milestone-only historical sweep | Keep only as a legacy alias or archive if current release gates cover the contract. |
| Duplicate focused gate | Merge with the canonical verifier and preserve only the public command if still useful. |

### Required Audit Output

Phase 1 should produce a classification table with at least:

- command name,
- current implementation file,
- owner package or verifier module,
- classification: `test`, `focused-gate`, `release-gate`, `legacy-alias`,
  `delete`,
- replacement command or test file,
- reason it cannot be a normal test, if kept as a verifier.

No script should stay in the release path without an explicit reason tied to
cross-runtime proof, release evidence, or product-flow coverage.

## 5. Proposed Execution Phases

#### Phase 1: Timing Baseline - Contributors can see where verification time goes.

**Files:**

- `tools/verify/src/runner.ts` - add optional step category metadata.
- `tools/verify/src/release.ts` - categorize setup, focused gate, conformance,
  visual, and artifact check steps.
- `tools/verify/src/release.test.ts` - assert timing metadata is serialized.
- `docs/workflows/developer-workflow.md` - document how to read release timing.
- `docs/status/verification-script-classification.md` - classify every current
  root verification/check script as test, focused gate, release gate, legacy
  alias, or deletion candidate.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `tools/verify/src/release.test.ts` | `should categorize release timing steps` | Release report includes category metadata for each step. |
| `tools/verify/src/cli/run.test.ts` | `should expose focused gate ownership metadata` | Every focused gate has owner, profile, and reason metadata. |

**Verification:**

- Run `pnpm --filter @threenative/verify-tools test`.
- Run `pnpm verify:release` once to capture the new baseline.

#### Phase 2: Build Reuse - Release no longer rebuilds packages inside focused gates.

**Files:**

- `tools/verify/src/cli/run.ts` - split focused gate setup commands from final
  verifier commands.
- `tools/verify/src/release.ts` - execute focused gates in no-setup mode after
  release setup builds complete.
- `tools/verify/src/cli/run.test.ts` - cover standalone and no-setup execution.
- `tools/verify/src/release.test.ts` - prove release uses no-setup focused gates.
- Package-owned test files identified by the classification table - absorb pure
  assertions that do not need cross-runtime/release evidence.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `tools/verify/src/cli/run.test.ts` | `should run setup for standalone focused gate` | Normal focused gate executes build commands before verifier. |
| `tools/verify/src/cli/run.test.ts` | `should skip setup when requested by release` | No-setup mode executes only final verifier commands. |
| `tools/verify/src/release.test.ts` | `should not rebuild focused gate packages after release setup` | Release step list contains shared builds once. |

**Verification:**

- Run `pnpm --filter @threenative/verify-tools test`.
- Run `pnpm verify:release` and compare duration against the Phase 1 baseline.

#### Phase 3: Gate Profiles - Developers get a smaller default loop.

**Files:**

- `tools/verify/src/cli/run.ts` - add profile-aware gate selection.
- `tools/verify/src/release.ts` - expose release/full profile metadata.
- `package.json` - add or adjust stable profile commands only if needed.
- `docs/workflows/developer-workflow.md` - document which profile to run for
  common change types.
- `docs/status/README.md` - link this audit or its resulting PRD.
- `docs/status/verification-script-classification.md` - update classifications
  after scripts are moved into tests, verifier modules, or aliases.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `tools/verify/src/cli/run.test.ts` | `should list gates by profile` | Smoke/focused/release/full profiles resolve deterministic gate sets. |
| `tools/verify/src/release.test.ts` | `should preserve release artifact contract` | Profile metadata does not remove required release artifacts. |

**Verification:**

- Run `pnpm --filter @threenative/verify-tools test`.
- Run the documented smoke command and `pnpm verify:release`.

## 6. Acceptance Criteria

- [ ] `verify:release` does not rebuild shared packages inside focused gate
  wrappers after the initial release setup.
- [ ] Release reports include enough timing metadata to identify setup,
  verifier, visual/native, and artifact-check cost.
- [ ] The developer workflow docs recommend the narrowest gate for common change
  categories.
- [ ] Every root verification/check script has a documented owner and outcome:
  package test, focused gate, release gate, legacy alias, or deletion.
- [ ] Pure logic assertions are covered by package tests instead of release
  scripts.
- [ ] Remaining verifier gates document why they cannot be ordinary tests.
- [ ] Existing focused gate commands continue to work standalone.
- [ ] Legacy milestone aliases remain compatible or print stable deprecation
  diagnostics with replacements.
- [ ] The release artifact contract remains unchanged.

## 7. Pushback

Do not spend the next pass deleting scripts as the primary optimization. The
script count is noisy, but the measured waste is in orchestration: serial focused
gates, repeated package builds, and no profile model. Cleanup should follow the
runner changes, not lead them.

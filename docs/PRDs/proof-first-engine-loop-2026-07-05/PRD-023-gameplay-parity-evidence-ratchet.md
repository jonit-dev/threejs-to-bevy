# PRD-023 Gameplay Parity Evidence Ratchet - Broaden Reliable Web/Bevy Proof

`Planning Mode: Principal Architect`
`Complexity: 7 -> HIGH mode`

Score basis: +3 touches 10+ files across verify tooling, CLI playtest
comparators, example scenarios, native/web observations, docs, and package
scripts; +2 spans multiple packages; +2 adds multi-profile parity ratcheting
logic and promotion rules.

## 1. Context

**Problem:** PRD-022 created a bounded gameplay parity harness, but the current
enforced proof is still a narrow smoke slice; we need a reliable ratchet that
expands behavioral, runtime-observation, and negative-control coverage without
turning the local command into a slow or flaky release gate.

**Files Analyzed:**

- `docs/PRDs/done/proof-first-engine-loop-2026-07-05/PRD-022-gameplay-parity-test-harness.md`
- `tools/verify/src/gameplayParity.ts`
- `tools/verify/src/gameplayParityManifest.ts`
- `tools/verify/src/gameplayParityCoverage.ts`
- `docs/status/capabilities/tooling-proof.md`
- `docs/status/capabilities/native-parity.md`
- `docs/PRDs/proof-first-engine-loop-2026-07-05/README.md`

**Current Behavior:**

- `pnpm test:gameplay` enforces one paired humanoid forward-movement scenario
  plus source-backed GLB, animation, texture, material, and scene coverage
  assertions.
- `pnpm verify:gameplay-parity` is enrolled for release and can run broader
  profile entries, but heavier ramp, stairs, hazard, and push scenarios remain
  report-only.
- Scene coverage is currently manifest-driven and proves named surfaces have
  assertion rows or explicit exclusions; it does not yet measure coverage
  against every high-value authored surface automatically.
- Resource probes are useful but source-backed; they do not prove broad native
  runtime resource parity unless paired target observations are captured and
  compared.
- The next reliability gain is not merely adding more objects to the smoke
  scene. It is adding promotion rules, calibrated tolerances, failure
  controls, target observation parity, and scenario breadth while preserving a
  fast local gate.

## 2. Solution

**Approach:**

- Keep `pnpm test:gameplay` as a fast smoke contract and promote only one or
  two additional assertions when timing evidence proves they fit.
- Use `pnpm verify:gameplay-parity -- --profile full` as the broader proof
  ladder for ramp, stairs, hazard, push, animation, contact, trigger, HUD, and
  resource-state parity.
- Replace report-only scenario sprawl with explicit promotion states:
  `report-only`, `calibrating`, `quarantined`, and `enforced`.
- Add deterministic negative controls that intentionally fail movement,
  resource, contact, asset, texture, material, and coverage comparisons in
  tests, proving the harness catches real drift.
- Add paired runtime observation sidecars for each target so probes compare
  actual web/desktop observations where available, not only source manifests.
- Add targeted humanoid course features only when they serve as test
  instruments for a known runtime risk and ship with pass/fail parity
  assertions, tolerances, artifacts, and promotion criteria.
- Add coverage debt reporting that distinguishes smoke coverage, full-profile
  coverage, source inventory coverage, and unsupported boundaries.

**Key Decisions:**

- [ ] Do not make one giant feature scene the default smoke test; broader scene
      coverage belongs in the full profile unless it stays within budget.
- [ ] Prefer promoting existing humanoid course scenarios before creating a
      brand-new parity scene, because those scenarios already exercise the
      known risky runtime surfaces.
- [ ] Add humanoid course features selectively: moving platforms,
      trigger-volume checkpoints, mass/friction pushables, animation state
      transitions, and runtime material/texture variants are acceptable only
      when each one maps to a parity assertion and a known engine-risk row.
- [ ] Use runtime observation sidecars when the engines can produce them; keep
      source-backed checks as fallback and label them as such in reports.
- [ ] Require each promoted scenario to have a bounded tolerance rationale and
      at least one historical timing sample in the report.
- [ ] Keep visual/pixel assertions out of this PRD except for optional links
      to existing visual parity artifacts.

**Data Changes:** Extend the gameplay parity manifest/report shape with
promotion state, observation source, calibration samples, and coverage debt
fields. No IR schema change is expected.

## 3. Integration Points

**How will this feature be reached?**

- [ ] Entry point identified: existing `pnpm test:gameplay` and
      `pnpm verify:gameplay-parity -- --profile full`.
- [ ] Caller file identified: `tools/verify/src/gameplayParity.ts` loads the
      manifest, executes paired scenarios/probes, and writes the aggregate
      report.
- [ ] Registration/wiring needed: extend manifest types, default humanoid
      enrollment, coverage audit, probe observations, docs/status references,
      and focused gate tests.

**Is this user-facing?**

- [ ] YES, for developers and CI. No in-game UI is required.

**Full user flow:**

1. Developer runs `pnpm test:gameplay` before runtime changes.
2. The smoke profile executes only the enforced fast subset and reports timing,
   coverage, assertion, and observation-source summaries.
3. CI or release runs `pnpm verify:gameplay-parity -- --profile full`.
4. The full report shows which scenarios are enforced, calibrating,
   report-only, or quarantined, and names the exact blocker before promotion.

## 4. Execution Phases

#### Phase 1: Promotion States - Report-only work becomes an explicit ladder

**Files (max 5):**

- `tools/verify/src/gameplayParityManifest.ts` - add promotion state fields.
- `tools/verify/src/gameplayParity.ts` - include promotion state in reports.
- `tools/verify/src/gameplayParity.test.ts` - assert state handling.
- `docs/workflows/playtest-proof.md` - document promotion semantics.
- `docs/status/capabilities/tooling-proof.md` - bound current claims.

**Implementation:**

- [ ] Add `state: "report-only" | "calibrating" | "quarantined" | "enforced"`
      while preserving existing `mode` compatibility during migration.
- [ ] Require `reason` for `report-only` and `quarantined` entries.
- [ ] Require `promotionCriteria` for `calibrating` entries.
- [ ] Report state counts and exclude non-enforced entries from pass claims.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParity.test.ts` | `should require reasons for non-passing parity states` | missing reason emits a manifest diagnostic |
| `tools/verify/src/gameplayParity.test.ts` | `should exclude calibrating cases from pass claims` | report passes only enforced assertions |

#### Phase 2: Observation Sidecars - Probes compare runtime facts where possible

**Files (max 5):**

- `tools/verify/src/gameplayParityProbes.ts` - read paired target observation
  sidecars before falling back to source-backed checks.
- `packages/cli/src/commands/playtestArtifacts.ts` - expose observation
  sidecar paths when present.
- `packages/runtime-web-three/src/bundleHydration.ts` - emit missing cheap
  asset/material/texture observations if absent.
- `runtime-bevy/crates/threenative_runtime/src/assets.rs` - expose matching
  cheap native observation rows if absent.
- `tools/verify/src/gameplayParityProbes.test.ts` - sidecar comparator tests.

**Implementation:**

- [ ] Record whether each assertion came from `runtime-observation`,
      `playtest-summary`, or `source-manifest`.
- [ ] Fail mismatched runtime observations with target values and artifact
      paths.
- [ ] Keep source-backed fallback visible as lower-confidence proof.
- [ ] Do not block Phase 2 on expensive screenshots or pixel analysis.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParityProbes.test.ts` | `should prefer runtime observation sidecars over source-backed probes` | assertion source is `runtime-observation` |
| `tools/verify/src/gameplayParityProbes.test.ts` | `should fail when desktop texture repeat differs from web observation` | emits `TN_RUNTIME_PARITY_TEXTURE_DRIFT` |

#### Phase 3: Negative Controls - The harness proves it can catch drift

**Files (max 5):**

- `tools/verify/src/gameplayParityNegativeControls.ts` - fixtures/helpers for
  intentional drift cases.
- `tools/verify/src/gameplayParityNegativeControls.test.ts` - failure-control
  tests.
- `tools/verify/src/gameplayParity.test.ts` - aggregate negative-control report
  assertions.
- `packages/cli/src/commands/parityPlaytestCompare.test.ts` - comparator drift
  controls.
- `docs/workflows/playtest-proof.md` - explain negative controls as harness
  proof, not product failures.

**Implementation:**

- [ ] Add synthetic report fixtures that fail movement, axis, resource,
      contact, animation, asset, texture, material, and coverage comparisons.
- [ ] Assert each intentional drift emits the expected stable diagnostic code.
- [ ] Ensure negative controls never run against real examples or pollute
      aggregate release artifacts.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParityNegativeControls.test.ts` | `should catch every intentional gameplay parity drift fixture` | all expected diagnostic codes appear |
| `tools/verify/src/gameplayParityNegativeControls.test.ts` | `should keep negative controls out of release artifacts` | no fixture paths in release report |

#### Phase 4: Full-Profile Scenario Promotion - Broaden behavior coverage

**Files (max 5):**

- `tools/verify/src/gameplayParity.ts` - default full-profile manifest entries.
- `examples/humanoid-physics-course/playtests/*.playtest.json` - add or refine
  parity blocks for selected scenarios.
- `tools/verify/src/gameplayParity.test.ts` - promotion/enrollment tests.
- `docs/status/capabilities/native-parity.md` - document bounded promoted rows.
- `docs/bevy-feature-parity.md` - update only if a Bevy parity claim changes.

**Implementation:**

- [ ] Promote ramp traversal when Y/Z axis tolerance and contact evidence are
      stable across web and desktop.
- [ ] Promote pushed-ball behavior when impulse/contact/resource observations
      are stable enough to fail CI.
- [ ] Keep stairs and hazard in `calibrating` or `quarantined` if runtime
      evidence is still noisy, with blocker diagnostics in the report.
- [ ] Require every promotion to include timing evidence and artifact links.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParity.test.ts` | `should include promoted humanoid scenarios in the full profile` | full profile includes enforced ramp/push when promoted |
| `tools/verify/src/gameplayParity.test.ts` | `should keep unpromoted humanoid scenarios non-passing` | calibrating/quarantined cases do not affect pass claims |

#### Phase 5: Humanoid Test-Instrument Features - Add only high-signal scene features

**Files (max 5):**

- `examples/humanoid-physics-course/content/**/*.json` - add targeted scene
  surfaces only when no existing course surface proves the same risk.
- `examples/humanoid-physics-course/src/scripts/**/*.ts` - add bounded
  behavior for new instrumented surfaces when required.
- `examples/humanoid-physics-course/playtests/*.playtest.json` - add scenario
  assertions for each new feature.
- `tools/verify/src/gameplayParity.ts` - enroll new feature scenarios/probes in
  full profile first.
- `tools/verify/src/gameplayParity.test.ts` - assert new feature enrollment and
  smoke/full separation.

**Implementation:**

- [ ] Add a moving platform only if it proves transform timing, contact
      stability, carried-body behavior, or parenting semantics not already
      covered by ramp/stairs.
- [ ] Add a trigger-volume checkpoint only if it proves sensor enter/exit,
      resource mutation, and HUD/resource observation parity.
- [ ] Add one mass/friction pushable variant only if it proves impulse/contact
      parity beyond the existing ball-push scenario.
- [ ] Add an animation state transition only if it proves runtime clip-state or
      event observations across both targets.
- [ ] Add a runtime material/texture variant only if it proves live material or
      texture binding parity through target observations.
- [ ] Each feature must include `whyThisFeature`, required surfaces, pass/fail
      assertions, tolerances, artifact links, and promotion criteria before it
      can move beyond `calibrating`.
- [ ] New feature scenarios start in the full profile. They may enter smoke
      only if timing evidence shows the warm smoke budget still passes.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParity.test.ts` | `should enroll humanoid test-instrument features only in the full profile by default` | smoke excludes new feature scenarios; full includes them |
| `tools/verify/src/gameplayParity.test.ts` | `should require assertion coverage for each new humanoid feature surface` | missing feature surface emits `TN_RUNTIME_PARITY_COVERAGE_GAP` |
| `tools/verify/src/gameplayParity.test.ts` | `should require a risk rationale before promoting a humanoid feature` | missing `whyThisFeature` emits a manifest diagnostic |

#### Phase 6: Coverage Debt Report - Know what is not proved

**Files (max 5):**

- `tools/verify/src/gameplayParityCoverage.ts` - add source inventory and debt
  summary fields.
- `tools/verify/src/gameplayParityCoverage.test.ts` - coverage debt tests.
- `tools/verify/src/gameplayParity.ts` - include smoke/full/source coverage
  summary.
- `docs/workflows/playtest-proof.md` - document coverage debt interpretation.
- `docs/status/capabilities/tooling-proof.md` - record the bounded coverage
  claim.

**Implementation:**

- [ ] Compare manifest-required surfaces with high-value authored surfaces
      where a structured source inventory is available.
- [ ] Report `smokeCoveragePercent`, `fullCoveragePercent`, and
      `sourceInventoryCoveragePercent`.
- [ ] Fail only missing required enforced surfaces; report source inventory
      coverage debt without over-claiming broad parity.
- [ ] Require stable reasons for intentionally unproved high-value surfaces.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParityCoverage.test.ts` | `should report source inventory coverage debt without passing it as proof` | debt appears as warning/non-passing summary |
| `tools/verify/src/gameplayParityCoverage.test.ts` | `should fail missing enforced required surfaces` | emits `TN_RUNTIME_PARITY_COVERAGE_GAP` |

#### Phase 7: Gate Budget Calibration - Stronger proof stays usable

**Files (max 5):**

- `tools/verify/src/gameplayParity.ts` - add timing sample summaries.
- `tools/verify/src/gameplayParity.test.ts` - budget behavior tests.
- `package.json` - adjust scripts only if profile arguments need wiring.
- `docs/status/capabilities/tooling-proof.md` - record current budgets.
- `docs/PRDs/proof-first-engine-loop-2026-07-05/README.md` - mark this PRD
  status when complete.

**Implementation:**

- [ ] Keep smoke warm budget at 60 seconds unless evidence justifies changing
      it.
- [ ] Move scenarios out of smoke automatically or diagnostically when they
      exceed the budget threshold.
- [ ] Record per-target duration, per-case duration, profile, state, and last
      timing sample in the report.
- [ ] Ensure `pnpm verify:release` uses the full profile only if the run time
      remains acceptable for release gates.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/gameplayParity.test.ts` | `should flag smoke entries that exceed the timing budget` | emits a budget diagnostic |
| `tools/verify/src/gameplayParity.test.ts` | `should include timing samples in the aggregate report` | report has per-target and per-case timing fields |

## 5. Checkpoint Protocol

After each phase:

1. Run the phase-specific tests listed above.
2. Run `pnpm --filter @threenative/verify-tools test -- --run gameplay`.
3. Run `pnpm test:gameplay` after phases that affect the smoke profile.
4. Run `pnpm verify:gameplay-parity -- --profile full --json` after scenario
   promotion or report-shape changes.
5. Run `pnpm check:docs` after docs/status changes.

Use the PRD work reviewer checkpoint process if executing this PRD under the
formal PRD implementation workflow.

## 6. Verification Strategy

**Unit Tests:**

- Manifest state validation and non-passing reason requirements.
- Observation sidecar preference and fallback labeling.
- Negative-control drift diagnostics.
- Scenario promotion and profile filtering.
- Humanoid test-instrument feature enrollment and risk-rationale validation.
- Coverage debt calculations.
- Budget diagnostics and timing sample report shape.

**Integration Tests:**

- Full-profile humanoid scenarios produce paired web/desktop artifacts.
- Runtime probes compare sidecar observations when present.
- Calibrating/quarantined/report-only failures stay visible but do not become
  pass claims.
- Promoted scenarios fail release when semantic parity drifts.
- New humanoid scene features prove a named runtime risk through paired
  web/desktop assertions before they count as parity evidence.

**Real Command Proof:**

```bash
pnpm test:gameplay
pnpm verify:gameplay-parity -- --profile full --json
pnpm check:docs
```

**Evidence Required:**

- `tools/verify/artifacts/gameplay-parity/verification-report.json`
- Per-target playtest summaries for every promoted scenario.
- Runtime observation sidecars or explicit source-backed fallback labels for
  every runtime probe.
- Negative-control test output showing expected diagnostic coverage.
- Coverage debt summary with smoke/full/source-inventory percentages.
- Timing evidence proving the smoke gate remains bounded.

## 7. Acceptance Criteria

- [ ] Gameplay parity reports classify every entry as enforced, calibrating,
      quarantined, or report-only.
- [ ] Non-passing entries require stable reasons and do not contribute to pass
      claims.
- [ ] Runtime probes compare paired target observations where available and
      label source-backed fallback assertions.
- [ ] Negative-control tests prove movement, resource, contact, animation,
      asset, texture, material, and coverage drift are caught.
- [ ] At least two additional humanoid full-profile behaviors are promoted or
      explicitly blocked with artifact-backed reasons.
- [ ] Any new humanoid course feature has a named runtime-risk rationale,
      required surfaces, parity assertions, tolerances, artifact links, and
      promotion criteria.
- [ ] New humanoid feature scenarios default to the full profile and are kept
      out of smoke unless timing evidence proves they fit.
- [ ] Coverage debt is visible separately from enforced smoke coverage.
- [ ] `pnpm test:gameplay` remains within its documented smoke budget or emits
      a budget diagnostic before promotion.
- [ ] `pnpm verify:gameplay-parity -- --profile full --json` gives a
      release-suitable picture of what is proved, what is calibrating, and what
      is unproved.
- [ ] Docs continue to distinguish behavioral parity proof from visual/pixel
      parity and broad native capability promotion.

## 8. Non-Goals

- Pixel-perfect visual parity.
- A new test framework separate from `tn playtest` and verify-tools.
- Promoting broad native runtime resource parity from source-backed probes.
- Making every humanoid scenario part of the local smoke gate.
- Adding humanoid scene content that has no direct parity assertion, runtime
  risk rationale, or promotion path.
- Creating a new mega-scene before existing high-signal humanoid scenarios and
  targeted test-instrument features are either promoted or explicitly blocked.

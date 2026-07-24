# PRD-001: Flight Viability and Realistic Proof

`Complexity: 8 -> HIGH mode` (`+3` 10+ files, `+2` complex harness state,
`+2` multi-package, `+1` release-gate change)

## 1. Context

**Problem:** Valid aerodynamic data can describe a vehicle that cannot sustain
flight, while short programmatic-input scenarios can still certify it.

**Files analyzed:** `packages/ir/src/physicsValidation.ts`,
`packages/authoring/src/operations/physics.ts`,
`packages/runtime-web-three/src/physicsAerodynamics.test.ts`,
`packages/runtime-web-three/src/browser/main.ts`,
`packages/cli/src/commands/playtestScenario.ts`,
`packages/cli/src/commands/playtestScaffold.ts`,
`packages/cli/src/game/intentContract.ts`,
`templates/_shared/skills/threenative-verify/SKILL.md`.

**Current behavior:**

- Aerodynamic validation checks structure and ranges, not force balance.
- The AoA sign bug has an independent physical-direction regression and is not
  part of this PRD.
- `holdTicks`/`waitTicks` provide exact simulation timing and are not part of
  this PRD.
- Browser playtests dispatch input on `window`, bypassing real iframe focus.
- The planner does not derive a scenario duration from the objective or enroll
  generic flight sign/force probes.

## 2. Solution

**Approach:**

- Add one pure, adapter-independent aerodynamic viability analyzer beside the
  owning IR validation contract.
- Project its findings through existing authoring validation and the
  descriptor-backed `tn physics aerodynamics validate` operation.
- Add an explicit focus-realistic web input mode that drives the focused
  browser surface with real DOM keyboard routing.
- Derive objective-duration and flight diagnostic scenarios from the plan
  intent/acceptance owner, using exact ticks.

```mermaid
flowchart LR
  Scene[Scene + spawn state] --> Analyzer[IR viability analyzer]
  Analyzer --> Validate[Authoring/physics validate diagnostics]
  Plan[Game intent + objective duration] --> Templates[Proof descriptors]
  Templates --> Scenario[Exact-tick scenarios]
  Scenario --> Focus[Focused DOM keyboard route]
  Focus --> Evidence[Web + desktop evidence]
```

**Key decisions:**

- The analyzer reports conservative diagnostics; it is not a full flight
  simulator.
- Curve sampling and force equations reuse the physical kernel or shared pure
  math extracted from it. Adapters must not own duplicate formulas.
- Focus realism is an explicit scenario/proof mode because native injection
  and deterministic headless tests still need direct input.
- Durations and proof roles live in intent/proof descriptors, not a second
  genre keyword list.

**Data changes:** Add versioned optional plan/scenario fields for objective
duration and input delivery mode. Existing scenarios retain current behavior.

## 3. Integration points

- [x] Entry points: `tn authoring validate`, `tn physics aerodynamics validate`,
  `tn playtest --scenario`, `tn game plan`, and plan-derived proof scaffolding.
- [x] Callers: authoring physics operation, CLI playtest driver, game intent
  contract, proof-template descriptor registry, iterate/release gates.
- [x] Registration: extend existing operation and proof descriptors.
- [x] User-facing: CLI diagnostics and generated proof; no editor UI required.

**Full user flow:** An author validates a flight scene, receives force-balance
diagnostics before build, generates plan-derived scenarios, and proves the
objective duration plus keyboard focus/control signs on web and behavior on
desktop.

## 4. Execution phases

### Phase 1: Aerodynamic spawn-state analysis

**Files (max 5):**

- `packages/ir/src/aerodynamicViability.ts` - pure owned analyzer.
- `packages/ir/src/aerodynamicViability.test.ts` - numeric fixtures.
- `packages/ir/src/physicsValidation.ts` - invoke and normalize diagnostics.
- `packages/authoring/src/operations/physics.ts` - supply entity/body/spawn data.
- `packages/authoring/src/aerodynamicsOperations.test.ts` - public boundary.

**Implementation:**

- [x] Compute weight, lift and drag at declared spawn velocity/orientation.
- [x] Compute available thrust versus drag at declared cruise speed.
- [x] Report rigid-body damping combined with authored aerodynamic drag.
- [x] Sum baseline surface force moments and flag materially untrimmed stowed
  controls.
- [x] Emit stable codes, paths, measured values, thresholds, and fixes.
- [x] Return `not-applicable` rather than guessing when required state is absent.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should reject lift below weight at spawn` | Diagnostic includes lift, weight, path, and fix. |
| `should reject thrust below cruise drag` | Diagnostic identifies the limiting budget. |
| `should warn on double-counted damping` | Warning is deterministic and bounded. |
| `should report stowed trim moment` | Surface IDs and moment axis are present. |
| `should accept the stable flight fixture` | No viability error is emitted. |

**Verification:** Run IR and authoring focused tests, then validate both a
known-stable and deliberately impossible scene.

### Phase 2: Focus-realistic input delivery

**Files (max 5):**

- `packages/cli/src/commands/playtestScenario.ts` - versioned delivery mode.
- `packages/cli/src/commands/playtestSchema.ts` - schema/help.
- `packages/cli/src/commands/playtest.ts` - route web focus mode.
- `packages/runtime-web-three/src/browser/main.ts` - focused-surface hook.
- `packages/cli/src/commands/playtest.test.ts` - positive/negative integration.

**Implementation:**

- [ ] Add `inputDelivery: "deterministic" | "focused-dom"` with deterministic
  default.
- [ ] In focused mode, focus the preview/overlay surface and send actual
  `KeyboardEvent.code` transitions through the browser path.
- [ ] Fail with an actionable diagnostic on desktop/headless targets that
  cannot provide this mode.
- [ ] Prove pointer and none overlays forward input; prove a deliberately
  keyboard-capturing overlay causes the negative control to fail.

**Verification:** Focused CLI tests plus one Playwright scenario with overlay
focus. Manual checkpoint: interact with the same scenario in a visible browser.

### Phase 3: Objective-duration and flight proof descriptors

**Files (max 5):**

- `packages/cli/src/game/intentContract.ts` - duration/proof responsibilities.
- `packages/cli/src/game/intentContract.test.ts` - genre and duration cases.
- `packages/cli/src/commands/playtestScaffold.ts` - descriptor-derived scenarios.
- `packages/cli/src/commands/playtestScaffold.test.ts` - generated proof.
- `docs/cookbook/flight-diagnostic-probes.md` - reusable author flow.

**Implementation:**

- [ ] Derive objective duration from explicit goal/plan data; ambiguity must
  produce a diagnostic, not an invented duration.
- [ ] Generate hands-off cruise for the full objective duration.
- [ ] Generate pitch and roll sign/safety probes and a stepped force-trace probe.
- [ ] Use `holdTicks`/`waitTicks`, real project IDs, and transition assertions.
- [ ] Emit unsupported diagnostics when flight metadata or observation support
  is missing.

**Verification:** Planner/scaffold tests, `pnpm verify:cookbook`, and generated
web/desktop scenarios for the aerodynamics reference project.

### Phase 4: Release-gate and documentation closure

**Files (max 5):**

- `tools/verify/src/generatedGameQualityGate.ts` - duration/focus enrollment.
- `tools/verify/src/generatedGameQualityGate.test.ts` - false-green controls.
- `docs/status/capabilities/physics.md` - viability boundary/evidence.
- `docs/status/capabilities/tooling-proof.md` - proof modes/evidence.
- `docs/STATUS.md` - one-line index updates.

**Implementation:**

- [ ] Require one objective-duration scenario for objective-driven games.
- [ ] Require one focus-realistic web proof when a web overlay accepts input.
- [ ] Keep direct deterministic input as the cross-target conformance lane.
- [ ] Add capability and quality-status notes if new systemic debt is found.

## 5. Checkpoints and acceptance

After every phase, spawn `prd-work-reviewer` with this PRD path and phase
number. Phases 2 and 3 also require manual visible-browser review.

- [ ] Impossible flight configurations fail at author time with measured fixes.
- [ ] A stable configuration passes without adapter-specific exceptions.
- [ ] A real focus failure is caught by a committed scenario.
- [ ] Objective duration, axis signs, and force trace are plan-derived.
- [ ] Web and desktop scenario evidence passes.
- [ ] `pnpm verify:conformance`, `pnpm verify:cookbook`, `pnpm check:docs`, and
  the generated-game quality gate pass.

## Verification evidence

Append per-phase commands, outputs, and artifact paths here during execution.

- Phase 1 (2026-07-24): `pnpm --filter @threenative/ir test` passed
  429/429; focused aerodynamic analyzer tests passed 14/14; authoring
  aerodynamic operation tests passed 3/3; runtime aerodynamic tests passed
  7/7. `tn authoring validate` passed for both
  `examples/aerodynamics-flight-course` and `examples/battle-of-pacific`.
  Full web-runtime verification reached 561/564 with three unrelated concurrent
  ocean-shader assertion mismatches. `pnpm verify:conformance` reached the V9
  rendering-lights comparison before failing on the concurrent rendering
  branch; the focused advanced-aerodynamics gate also reported integrated
  maneuver parity failures while all shared-kernel unit boundaries remained
  green. The required independent Phase 1 review completed clean after
  zero-density, force-cap, supported-launch, terminal-speed, and direction
  false-green controls were added.

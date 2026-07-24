# PRD-005: Safe Prototypes and Agent Authoring Contract

Status: Complete (2026-07-24)

`Complexity: 9 -> HIGH mode` (`+3` 10+ files, `+2` complex transactional and
process state, `+2` multi-package, `+2` new output/guidance contract)

## 1. Context

**Problem:** Planner-emitted prototype authoring can overwrite an authored
scene and leave discoverable prototype documents, while generated guidance is
inconsistent about focused loops, direct source edits, capability discovery,
and compact output.

**Files analyzed:** `packages/cli/src/game/prototypeAuthoring.ts`,
`packages/cli/src/commands/authoring.ts`,
`packages/cli/src/commands/game.ts`,
`packages/authoring/src/sourceKinds.ts`,
`templates/_shared/skills/threenative-authoring/SKILL.md`,
`templates/_shared/skills/threenative-verify/SKILL.md`,
`templates/structured-source-starter/CLAUDE.md`,
`docs/workflows/ai-workflows.md`.

**Current behavior:**

- Prototype apply owns `arena.scene.json` unconditionally and tests deletion of
  existing starter scenarios.
- All matching structured documents are discoverable, so leaked prototype docs
  enter production builds.
- `--run-proof` is awaited in-process, but interruption/failure cleanup lacks a
  process-tree regression.
- Generated guidance points to a missing `docs/API-CARD.md`, understates current
  scripted spawn support, and gives conflicting iterate-versus-focused-loop
  advice.
- Direct durable JSON editing is allowed in one skill but ambiguously
  discouraged elsewhere.
- A global `--summary` contract does not exist even though workflow prose
  advertises it for some commands.

## 2. Solution

- Make plan-derived prototype application an atomic, collision-aware authoring
  transaction with new-project provenance as the safe automatic lane.
- On existing authored projects, emit inspection and a staged diff; require an
  explicit reviewed replacement or isolated destination.
- Ensure proof child processes and watchers close on success, failure, signal,
  and startup rejection.
- Generate one descriptor/type-derived authoring capability card and consistent
  direct-edit policy.
- Route agents to the narrowest proof loop and add a registry-backed compact
  result projection rather than command-specific summaries.

## 3. Integration points

- [x] Entry: `tn game plan`, emitted `nextAuthoringCommand`,
  `tn authoring prototype`, CLI result rendering, generated AGENTS/CLAUDE/skills.
- [x] Callers: intent contract, authoring batch planner/publisher, source
  discovery, process runner, command registry, template generator.
- [x] User-facing: CLI and generated documentation; no visual UI.

**Flow:** Planner inspects project inventory -> safe new project applies
atomically, existing project receives staged plan -> author explicitly applies
or chooses isolated files -> proof runs under owned process lifecycle -> compact
result points to deep artifacts.

## 4. Execution phases

### Phase 1: Collision-aware prototype planning

**Files (max 5):**

- `packages/cli/src/game/prototypeAuthoring.ts` - inventory/preconditions.
- `packages/cli/src/game/prototypeAuthoring.test.ts` - collision matrix.
- `packages/cli/src/commands/game.ts` - safe next command.
- `packages/cli/src/game/intentContract.ts` - destination/ownership metadata.
- `packages/cli/src/game/intentContract.test.ts` - emitted-command drift.

**Implementation:**

- [x] Auto-apply only to a recognized untouched starter or empty destination.
- [x] Existing authored content yields a non-mutating plan/diff and stable
  `TN_AUTHORING_PROTOTYPE_COLLISION`.
- [x] Require explicit target files and reviewed replacement token/hash to
  replace authored owners.
- [x] Never instruct agents to mutate before inspecting project owners.

### Phase 2: Atomic publication and discovery isolation

**Files (max 5):**

- `packages/authoring/src/batches.ts` - use existing transaction owner.
- `packages/authoring/src/sourceKinds.ts` - production enrollment rule.
- `packages/cli/src/commands/authoring.ts` - stage/apply/rollback.
- `packages/cli/src/commands/authoring.test.ts` - exact rollback/collision.
- `tools/verify/src/emittedCommandGate.ts` - planner command proof.

**Implementation:**

- [x] Publish all prototype source and scenarios as one bounded batch.
- [x] A staged/abandoned prototype cannot be auto-discovered into production.
- [x] Remove/replace operates only on files and hashes owned by the transaction.
- [x] Negative controls prove no partial or stray `prototype.*` document remains.

### Phase 3: Proof process lifecycle

**Files (max 5):**

- `packages/cli/src/commands/authoring.ts` - owned child lifecycle.
- `packages/cli/src/process/runCommand.ts` - process-group cleanup.
- `packages/cli/src/process/runCommand.test.ts` - signal/failure tests.
- `packages/cli/src/commands/authoring.test.ts` - watcher/port cleanup.
- `packages/cli/src/commands/dev.test.ts` - no leaked preview.

**Implementation:**

- [x] Close proof, preview, Vite, and source watchers on every exit path.
- [x] Test startup failure, timeout, SIGTERM, proof failure, and success.
- [x] Assert no child later recreates rolled-back source.

### Phase 4: Canonical capability and direct-edit guidance

**Files (max 5):**

- `packages/compiler/src/scripts/authoringProfile.ts` - derived capability card.
- `packages/compiler/src/scripts/authoringProfile.test.ts` - facade/diagnostic drift.
- `templates/_shared/skills/threenative-authoring/SKILL.md` - canonical policy.
- `templates/structured-source-starter/CLAUDE.md` - generated-project wording.
- `docs/status/capabilities/scripting.md` - spawn/absence truth.

**Implementation:**

- [x] Generate or remove the missing API-card reference; one canonical artifact
  lists services, components, and explicit absences.
- [x] State: use bounded CLI when available; otherwise direct durable
  `content/**` editing plus validation is supported.
- [x] Include current spawn/instantiate/despawn truth and renderer/sub-node
  boundaries.

### Phase 5: Focused inner-loop routing and triage

**Files (max 5):**

- `templates/_shared/skills/threenative-verify/SKILL.md` - loop decision table.
- `templates/_shared/skills/threenative-workflow/SKILL.md` - inspection-first flow.
- `docs/workflows/ai-workflows.md` - public workflow.
- `docs/cookbook/debugging-feedback-loops.md` - failure smells.
- `tools/verify/src/templateProductionGate.ts` - generated-copy drift.

**Implementation:**

- [x] Route visuals to screenshot/parity against live dev, physics to one
  scenario plus runtime trace, scripts to typecheck/focused playtest, and
  milestones to iterate.
- [x] Add triage for identical traces, served/local freshness mismatch, and
  physically impossible tuning.
- [x] Template agent file ownership: one scene owner, independent content/script
  domains, no concurrent build/dev/iterate.

### Phase 6: Registry-backed compact CLI result

**Files (max 5):**

- `packages/cli/src/commands/registry.ts` - output capability metadata.
- `packages/cli/src/resultProjection.ts` - canonical compact projection.
- `packages/cli/src/resultProjection.test.ts` - required fields/size.
- `packages/cli/src/index.ts` - derived flag/help.
- `packages/cli/src/index.test.ts` - coverage/drift.

**Implementation:**

- [x] Define canonical `--summary` semantics: status, primary code, top three
  diagnostics/fixes, and artifact pointers while preserving exit behavior.
- [x] Commands declare support in the owning registry; help and dispatch derive
  from it.
- [x] Deep JSON remains available without duplicating computation.
- [x] Add representative stdout budgets and reject falsely advertised support.

### Phase 7: Status and completion gates

**Files (max 5):**

- `docs/status/capabilities/authoring.md` - safe prototype contract.
- `docs/status/capabilities/tooling-proof.md` - loop/output contract.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` - risk closure.
- `docs/STATUS.md` - one-line updates.
- `docs/PRDs/PRD-off-recipe-authoring-efficiency-2026-07-15.md` - link remediation.

## 5. Checkpoints and acceptance

Automated reviewer after every phase. Manual review of staged replacement UX is
additional after Phases 1 and 2.

- [x] Existing authored scenes are never overwritten without reviewed consent.
- [x] Failed/interrupted proof leaves no files, child processes, watchers, or
  ports.
- [x] Stray prototype docs cannot join production discovery.
- [x] Capability/direct-edit guidance is generated and truthful.
- [x] Inner-loop selection and failure-smell triage are consistent.
- [x] Summary output is registry-derived and bounded.
- [x] Adapter-surface, emitted-command, template, cookbook, docs, and CLI tests
  pass.

## Verification evidence

Completed 2026-07-24.

- Transaction and rollback coverage:
  `node --test packages/cli/dist/commands/authoring.test.js` passed 18/18,
  including starter recognition, whole-project collision detection, exact
  review token/target enforcement, failed-proof preimage restoration, and
  removal of only transaction-owned files.
- Process lifecycle coverage:
  `node --test packages/cli/dist/process/runCommand.test.js` passed 7/7,
  including startup failure, SIGTERM, timeout, resistant descendants,
  successful-leader inherited-stdio descendant drain, and listener-port
  release. Interruption/timeout now forces a nonzero proof result even when the
  group leader exited zero.
- Compact-output coverage: the combined focused CLI suite passed 50/50.
  `resultProjection.test.js` includes an adversarial multibyte/escaped stdout
  budget, while registry/index tests prove derived support and unchanged exit
  behavior.
- Generated guidance and template drift coverage:
  `templateProductionGate.test.js` and `emittedCommandGate.test.js` passed
  14/14; maintained-template production validation reported zero diagnostics.
- Aggregate emitted-command proof:
  `pnpm verify:emitted-commands` passed all 14 template/archetype cases and 204
  emitted commands with zero failures. The first aggregate run caught
  rendered-frame timing races in the wave and tactics prototypes; their
  scenarios now reset shared state and use exact `holdTicks`/`waitTicks`.
  Both failing cases then passed twice consecutively before the green aggregate
  rerun. Report:
  `tools/verify/artifacts/emitted-commands/verification-report.json`.
- Independent completion review found and closed two high-severity gaps:
  leader-exit cleanup no longer waits for descendant-held stdio, and retry no
  longer shadows `pointer.0`. The wave-defense and turn-based focused emitted
  cases both passed with their primary acceptance scenario issuing a real
  `pointer.0` event. The full aggregate was then rerun after those fixes and
  retained the canonical 14-case, 204-command, zero-failure report with 20
  explicit deferred prerequisites.
- Reusable workflow proof: `pnpm verify:cookbook` passed every entry with zero
  diagnostics. Report:
  `tools/verify/artifacts/cookbook/verification-report.json`.
- Adapter and documentation proof: `pnpm verify:adapter-surfaces` passed 2/2
  and `pnpm check:docs` passed.
- Battle of Pacific noninterference: a valid custom prototype request against
  the authored project returned `TN_AUTHORING_PROTOTYPE_COLLISION`, wrote no
  files, and left the durable-source aggregate SHA-256 unchanged
  (`48a9a0fa...e2e45a` before and after).
- Battle of Pacific regression proof: authoring validation, typecheck, and build
  passed. Web input/flap animation, objective progress, fail/retry, isolated
  30-second cruise, and the committed turn-radius probe passed. Desktop
  commands completed with the documented
  `TN_PLAYTEST_NATIVE_HEADLESS_UNSUPPORTED` waiver; they are not claimed as
  graphical native evidence. The final live preview at
  `http://127.0.0.1:5173` reported runtime ready, scene `pacific-flight`, 158
  entities, phase `CRUISE`, integrity 100, and the Samidare objective.

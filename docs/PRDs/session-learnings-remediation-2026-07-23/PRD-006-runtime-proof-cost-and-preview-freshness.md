# PRD-006: Runtime Proof Cost and Preview Freshness

`Complexity: 7 -> HIGH mode` (`+2` 6-10 files, `+2` complex observation
state, `+2` multi-package, `+1` performance-sensitive)

## 1. Context

**Problem:** Normal web runtime ticks pay for retained write-audit scanning and
serialization, while runtime package rebuilds can leave a running preview
executing stale `/dist/browser/main.js`.

**Files analyzed:** `packages/runtime-web-three/src/systems/context.ts`,
`packages/runtime-web-three/src/systems/effects.ts`,
`packages/runtime-web-three/src/systems/runner.ts`,
`packages/runtime-web-three/src/systems/writeAudit.ts`,
`packages/runtime-web-three/index.html`,
`packages/cli/src/commands/dev.ts`,
`packages/cli/src/dev/watch.ts`.

**Current behavior:**

- The ledger is always created and writes are always retained.
- Each tick scans retained observations for diagnostics; profiling attributed
  most CPU time to observation sorting/audit serialization.
- Full audit detail was intended to be cheap/opt-in but lacks a performance
  budget.
- Preview imports runtime `dist`; content watch reload does not watch or
  invalidate rebuilt runtime modules.

## 2. Solution

- Separate always-on O(1)/bounded conflict correctness from opt-in full
  observation retention and serialization.
- Keep diagnostics truthful in normal mode; do not disable correctness checks.
- Make repo-development runtime module freshness owned by the dev server:
  source entry when supported, otherwise explicit dist watcher/cache
  invalidation/full reload.
- Expose executed runtime identity in dev state and proof it alongside bundle
  freshness.

## 3. Integration points

- [x] Entry: runtime system loop, `tn performance trace`, `tn dev --watch`,
  `tn parity visual`.
- [x] Callers: context/effect runner, audit diagnostics, preview server module
  graph, dev-state endpoint, freshness checks.
- [x] User-facing: performance/freshness diagnostics; no UI.

## 4. Execution phases

### Phase 1: Measure and freeze the regression

**Files (max 5):**

- `packages/runtime-web-three/src/systems/writeAudit.bench.ts` - representative load.
- `packages/runtime-web-three/src/systems/writeAudit.test.ts` - correctness baseline.
- `tools/verify/src/runtimeObservationBudget.ts` - measured gate.
- `tools/verify/src/runtimeObservationBudget.test.ts` - threshold/negative control.
- `package.json` - derived verification command enrollment.

**Implementation:**

- [ ] Capture normal and full-audit CPU/alloc/serialized-byte baselines.
- [ ] Model the Battle-of-Pacific entity/system/observation scale.
- [ ] Gate normal-mode overhead and retain a full-audit functional lane.

### Phase 2: Tiered observation implementation

**Files (max 5):**

- `packages/runtime-web-three/src/systems/context.ts` - mode/state.
- `packages/runtime-web-three/src/systems/effects.ts` - bounded conflict data.
- `packages/runtime-web-three/src/systems/runner.ts` - no unconditional scan.
- `packages/runtime-web-three/src/systems/writeAudit.ts` - lazy detail.
- `packages/runtime-web-three/src/systems/writeAudit.test.ts` - parity of verdicts.

**Implementation:**

- [x] Keep the minimum last-writer/conflict state required for correctness.
- [x] Allocate/serialize detailed observations only when trace/audit asks.
- [x] Preserve stable diagnostics and deterministic full-audit ordering.
- [ ] Prove normal and full modes make the same accept/reject decisions.

### Phase 3: Preview runtime module ownership

**Files (max 5):**

- `packages/runtime-web-three/index.html` - development entry contract.
- `packages/runtime-web-three/src/devServer.ts` - runtime identity/reload.
- `packages/cli/src/dev/watch.ts` - source/dist watcher.
- `packages/cli/src/commands/dev.ts` - lifecycle/diagnostics.
- `packages/cli/src/commands/dev.test.ts` - rebuild/reload regression.

**Implementation:**

- [ ] Choose source-module Vite ownership or explicit dist watch based on
  package/distribution boundaries; production distribution remains dist-based.
- [ ] Runtime rebuild triggers cache invalidation and one full reload.
- [ ] Dev state reports executed runtime build hash/identity separately from
  game bundle hash.
- [ ] Watchers close on failed startup and shutdown.

### Phase 4: End-to-end freshness/performance proof

**Files (max 5):**

- `packages/cli/src/commands/parityVisual.ts` - runtime identity check.
- `packages/cli/src/commands/parityVisual.test.ts` - stale-runtime negative.
- `tools/verify/src/runtimeObservationBudget.ts` - final measured threshold.
- `docs/status/capabilities/tooling-proof.md` - evidence.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` - debt closure.

**Implementation:**

- [ ] Change an observable runtime behavior, rebuild while preview runs, and
  prove the next capture executes the new runtime without restart.
- [ ] Deliberately suppress reload and ensure parity refuses stale runtime.
- [ ] Compare same browser workflow before/after traces.

## 5. Checkpoints and acceptance

Automated reviewer after every phase. Performance trace comparison is a manual
checkpoint in addition to automation.

- [ ] Normal mode meets the recorded CPU/allocation/byte budget.
- [ ] Full audit retains deterministic evidence and identical verdicts.
- [ ] Runtime rebuild becomes visible in the running preview exactly once.
- [ ] Stale runtime and stale bundle have distinct actionable diagnostics.
- [ ] Failure paths leak no watcher or port.
- [ ] Focused tests, performance budget, parity, and docs checks pass.

## Verification evidence

Append before/after traces, runtime hashes, and failure-control artifacts.

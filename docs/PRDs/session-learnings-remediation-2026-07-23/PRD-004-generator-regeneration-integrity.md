# PRD-004: Generator Regeneration Integrity

`Complexity: 7 -> HIGH mode` (`+3` 10+ files, `+2` complex reconciliation,
`+2` multi-package)

## 1. Context

**Problem:** Re-running Blender asset generation can silently change provenance
policy, retain deleted clips, and select a different animation initial state;
duplicate glTF node paths fail later in `model-test`.

**Files analyzed:** `packages/cli/src/commands/asset.ts`,
`packages/cli/src/blender/runBlenderGenerator.ts`,
`packages/cli/src/commands/asset.test.ts`,
`packages/cli/src/commands/generator.test.ts`,
`packages/ir/src/gltfScene.ts`,
`docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`.

**Current behavior:**

- `tn asset generate` defaults omitted overwrite policy to `manual` and records
  it over existing provenance.
- Generated animation rows are additively merged; removed recipe clips remain.
- The lexicographically first recipe clip becomes initial state.
- Duplicate node paths are diagnosed too late or without an actionable import
  remedy.
- Source recipe primitive parts remain owned by the active Pacific mastery PRD.
  Scale tracks, the 16-clip budget, imported-node rotation handling, and bind
  pose restoration are already fixed.

## 2. Solution

- Treat generator provenance plus its accepted output hash as the owner of
  generator-owned asset metadata.
- Preserve existing overwrite policy unless an explicit flag changes it.
- Reconcile generator-owned animations exactly while preserving separately
  authored rows.
- Make initial state explicit and stable.
- Normalize duplicate paths consistently or fail at inspect/import with the
  exact repair command before `model-test`.

## 3. Integration points

- [x] Entry: `tn asset generate`, `tn generator run`, `tn asset inspect/import`,
  `tn model-test`.
- [x] Callers: provider registry, generator provenance operation, Blender
  runner result registration, asset document mutation, model-test loader.
- [x] User-facing: CLI diagnostics only; no UI.

**Flow:** First generation records ownership -> rerun reads prior provenance ->
stages exact metadata reconciliation -> validates/inspects -> atomically
publishes or rolls back without changing unrelated author edits.

## 4. Execution phases

### Phase 1: Preserve explicit provenance intent

**Files (max 5):**

- `packages/cli/src/commands/asset.ts` - omitted-versus-explicit policy.
- `packages/cli/src/commands/asset.test.ts` - repeat/override/rollback tests.
- `packages/authoring/src/generatorProvenance.ts` - resolution owner.
- `packages/authoring/src/generatorProvenance.test.ts` - truth table.
- `packages/authoring/src/operationRegistry.ts` - operation projection.

**Implementation:**

- [x] Omitted flag preserves existing policy; first run uses documented default.
- [x] Explicit flag is the only way to change policy.
- [ ] Dry run reports the resolved policy and owner.
- [x] Failed generation leaves provenance and outputs byte-identical.

### Phase 2: Exact animation reconciliation

**Files (max 5):**

- `packages/cli/src/blender/runBlenderGenerator.ts` - reconciliation plan.
- `packages/cli/src/commands/generator.test.ts` - stale/removal/ownership tests.
- `packages/authoring/src/operations/documents.ts` - atomic owned-row mutation.
- `packages/authoring/src/operations/documents.test.ts` - preservation tests.
- `packages/authoring/src/schemas.ts` - explicit initial-state field if needed.

**Implementation:**

- [ ] Tag/derive generator-owned animation rows from provenance; do not infer
  ownership from clip names alone.
- [ ] Add/update/delete those rows to exactly match current output.
- [ ] Preserve user-owned animations and unrelated asset entries.
- [ ] Require an explicit recipe initial state or preserve a still-valid prior
  state; otherwise fail with a choice, never lexicographically guess.
- [ ] Publish GLB, asset doc, and provenance atomically.

### Phase 3: Duplicate-path diagnosis at the first boundary

**Files (max 5):**

- `packages/ir/src/gltfScene.ts` - canonical path diagnostic.
- `packages/ir/src/gltfScene.test.ts` - duplicate fixtures.
- `packages/cli/src/commands/asset.ts` - inspect/import projection.
- `packages/cli/src/commands/modelTest.ts` - consume canonical result.
- `packages/cli/src/commands/modelTest.test.ts` - no late surprise.

**Implementation:**

- [ ] Choose one policy: deterministic normalization with stable mapping, or
  fail before registration. Document why it preserves animation/node targeting.
- [ ] Include conflicting paths/nodes and a bounded import/recipe repair.
- [ ] Ensure inspect and model-test agree exactly.

### Phase 4: Workflow/status closure

**Files (max 5):**

- `docs/cookbook/blender-generated-prop.md` - rerun/ownership contract.
- `docs/status/capabilities/assets.md` - claim/evidence.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` - close retained debt row.
- `docs/STATUS.md` - one-line update.
- `tools/verify/src/generatorRerunGate.ts` - real-project rerun gate.

## 5. Checkpoints and acceptance

Automated `prd-work-reviewer` after each phase; manual inspection of the
regenerated Pacific aircraft is additional after Phase 2.

- [ ] Omitted overwrite policy never changes existing provenance.
- [ ] Removed generated clips disappear; authored clips remain.
- [ ] Initial state is explicit or stably preserved.
- [ ] Failure rolls back GLB, docs, and provenance together.
- [ ] Duplicate paths are handled before model-test with one canonical policy.
- [ ] Focused tests, generator rerun gate, cookbook, and docs checks pass.

## Verification evidence

Append repeat-run hashes, diffs, commands, and artifact paths during execution.

### Phase 1

- The authoring-owned `resolveGeneratorOverwritePolicy` truth table resolves
  explicit intent first, then matching durable provenance, then the documented
  `manual` first-run default.
- The complete authoring suite passes 152 tests and the focused asset command
  suite passes 44 tests. The asset failure regression preserves prior recipe
  and `replace` provenance bytes when generation cannot start.

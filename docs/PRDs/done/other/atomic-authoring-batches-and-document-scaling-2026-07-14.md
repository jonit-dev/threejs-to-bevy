# Atomic Authoring Batches and Document Scaling

Complexity: 9 -> HIGH mode

Score basis: +2 cross-package public contract, +2 filesystem transaction and
crash-recovery semantics, +2 CLI/MCP/editor/client integration, +1 generated
source and concurrent-writer ownership, +1 descriptor/type derivation, +1
performance and migration gates.

Status: Proposed

Date: 2026-07-14

Owners: Authoring, CLI, Editor, MCP, Verification

## 1. Summary

ThreeNative needs one versioned, registry-backed batch primitive for applying
related authoring operations across multiple durable source files. The batch
must validate the complete result before publishing any change, detect
concurrent or generator-owned writes, and expose the same behavior through the
CLI, MCP server, editor, recipes, and `@threenative/authoring-client`.

The proposed user-facing entry point is:

```bash
tn authoring batch apply --file changes.authoring-batch.json --project . --json
```

It also accepts `--file -` for a JSON document on stdin. `plan` produces the
same touched-file, diagnostic, and diff report without publishing changes:

```bash
tn authoring batch plan --file changes.authoring-batch.json --project . --json
```

This is an operation batch, not a raw text-patch format. Operations continue
to use stable registry names and structured arguments, so schema validation,
source ownership, diagnostics, and future migrations remain available.

Large JSON files should be managed primarily through bounded documents,
compact authoring constructs, and targeted reads/writes. Streaming textual
edits are not part of this PRD: they would make whole-document validation,
referential checks, deterministic formatting, and rollback less reliable.
The implementation must avoid copying or parsing unrelated project files and
must collect scaling evidence before a streaming parser or scene-sharding
contract is considered.

## 2. Problem Statement

The authoring layer has registry-backed individual mutations and predefined
recipes, but no general public command that commits an arbitrary set of
operations spanning different source files as one validated unit.

The TypeScript client exposes a method named `transaction()`, but its current
`commit()` loop dispatches operations directly against the real project. A
later failure therefore leaves earlier changes on disk. On 2026-07-14, a
two-operation reproduction added `prefab.player`, then failed a
`scene.add_entity` missing `entityId`; the result was `ok: false`,
`stoppedAt: 1`, and `changed: true`, and the prefab remained in
`content/scenes/arena.scene.json`.

Recipes avoid this specific failure by copying the project into a temporary
directory, executing there, and promoting changed files. That implementation
is not shared by the TypeScript client, MCP, editor, or ordinary CLI commands.
The CLI recipe wrapper and overlay command also contain separate staging and
promotion implementations. Besides drift, copying a project is the wrong
scaling unit when a batch touches only a few structured documents.

The current adapter gate also demonstrates incomplete descriptor ownership:

- 96 registered authoring operations exist.
- 11 operations carry CLI adapter metadata.
- 3 operations carry editor adapter metadata and descriptor-owned editor
  smoke metadata.
- `adapterSurfaceDrift.test.ts` carries 58 editor-operation gaps and 84
  editor-smoke gaps.
- Only the `runtime` family is ratcheted as fully descriptor-migrated.

This makes it difficult to derive a typed batch contract, predict touched
documents, or guarantee that every adapter applies identical transaction and
ownership policy.

## 3. Evidence and Baseline

### 3.1 Chess Codex sessions

The 2026-07-12 Chess authoring trial is the best existing multi-agent,
multi-surface forcing function. Its three recorded Codex sessions used 62,
126, and 59 tool calls respectively (247 total), with at least 2 hours 47
minutes of observed work and approximately 49.8 MB of session logs.

The trial report identified a generator-versus-CLI ownership conflict as C2.
Unlike the other trial findings, C2 was explicitly deferred. A later session
also included the user constraint not to touch an overlay owned by another
agent. These are two forms of the same missing contract: a mutation can know
the path it intends to write, but it cannot assert the source owner or the
version it planned against before commit.

Sources:

- `docs/PRDs/done/chess-trial-remediation-2026-07-12/AUTHORING-TRIAL-CHESS-CODEX-2026-07-12.md`
- `docs/PRDs/done/chess-trial-remediation-2026-07-12/README.md`
- `/home/joao/.codex/sessions/2026/07/11/rollout-2026-07-11T23-52-33-019f5519-5d20-7261-8e6b-b62dbd739d62.jsonl`
- `/home/joao/.codex/sessions/2026/07/12/rollout-2026-07-12T09-58-07-019f5743-c7e5-7310-b8c2-1aafbfce157c.jsonl`
- `/home/joao/.codex/sessions/2026/07/12/rollout-2026-07-12T10-27-44-019f575e-e4b4-70f2-ac0f-b4a19346ade6.jsonl`

### 3.2 Current authoring source size

Checked-in example and template `content/**/*.json` files total approximately
279,550 bytes. The largest current source document is
`examples/chess/content/scenes/chess.scene.json` at 60,575 bytes, followed by
the rally starter scene at 34,314 bytes. No general source-document byte or
addressable-item budget is enforced.

These sizes do not justify a streaming text editor. They do justify preventing
the current whole-project copy strategy from becoming the default transaction
engine and adding measurements that warn before a single document becomes an
agent, parser, or merge-conflict bottleneck.

### 3.3 Current correctness reproduction

```json
{
  "ok": false,
  "stoppedAt": 1,
  "changed": true,
  "filesWritten": ["content/scenes/arena.scene.json"],
  "prefabsAfterFailure": ["prefab.player"],
  "diagnosticCodes": ["TN_AUTHORING_OPERATION_ARG_MISSING"]
}
```

The reproduction used the built public `@threenative/authoring-client`
against a temporary structured-source project. It is a confirmed correctness
bug, not only readiness debt.

## 4. Goals

- Provide one public batch format and one CLI command for related changes in
  different durable authoring files.
- Guarantee all-or-none API-visible publication when validation or an
  operation fails.
- Detect concurrent changes between planning and commit with content hashes.
- Reject writes to generator-owned or otherwise declared foreign-owned output
  unless the owning operation explicitly authorizes them.
- Share transaction planning, validation, promotion, rollback, and recovery
  across recipes, CLI, MCP, editor, and the TypeScript client.
- Load, stage, validate, and publish only documents affected by a batch plus
  the minimum reference context required to validate them.
- Derive batch argument typing, CLI parsing, editor forms, MCP schemas, target
  prediction, and smoke enrollment from the authoring operation descriptor.
- Measure document size, batch latency, peak memory, and bytes copied so a
  future sharding or streaming decision is evidence-based.

## 5. Non-Goals

- Raw RFC 6902/JSON Patch as the primary public authoring contract.
- In-place textual rewriting of a JSON token stream.
- Editing `dist/**`, emitted bundles, `scripts.bundle.js`, GLB internals, or
  other generated artifacts.
- A distributed lock service or collaborative CRDT editor.
- Automatically splitting existing scene files in the first release.
- Making multiple filesystem renames physically atomic across a process or
  machine crash. The product guarantee is journaled recovery to the complete
  old or complete new state.
- Replacing Git. Batch conflict diagnostics protect the authoring operation;
  Git remains the durable review and history layer.

## 6. User Stories

- As an agent, I can add a scene entity, input action, system declaration, and
  UI binding with one command and never leave half the change behind.
- As an editor user, I can preview every touched source document and commit the
  same batch the inspector planned.
- As a generator owner, I receive an actionable diagnostic when an ordinary
  mutation attempts to replace my generated output.
- As a second agent, I receive a conflict instead of silently overwriting a
  file changed after my plan was created.
- As a maintainer, I add an operation once in the registry and its typed batch,
  CLI/MCP/editor exposure, target prediction, and smoke expectations derive
  from that descriptor.
- As a large-project author, a mutation touching two documents does not copy
  or parse the entire workspace.

## 7. Product Contract

### 7.1 Versioned batch document

```json
{
  "schema": "threenative.authoring-batch",
  "version": "0.1.0",
  "id": "add-player-loop",
  "operations": [
    {
      "name": "input.add_action",
      "args": {
        "inputId": "gameplay",
        "actionId": "Jump",
        "bindings": ["Space"]
      }
    },
    {
      "name": "scene.add_entity",
      "args": {
        "sceneId": "arena",
        "entityId": "player",
        "prefabId": "prefab.player"
      }
    },
    {
      "name": "scene.attach_script",
      "args": {
        "sceneId": "arena",
        "systemId": "player-controller",
        "modulePath": "src/scripts/player.ts",
        "exportName": "updatePlayer"
      }
    }
  ],
  "preconditions": {
    "planHash": "sha256:optional-hash-from-plan"
  }
}
```

The registry owns the closed operation vocabulary and argument schemas. Batch
files may be ephemeral under `.tn/` or committed when they are useful as an
auditable migration. A batch cannot contain arbitrary filesystem writes.

### 7.2 Plan result

`tn authoring batch plan` returns:

- normalized ordered operations;
- operation and semantic diagnostics;
- predicted and actually observed touched source paths;
- base SHA-256 for every existing touched file;
- created/deleted/modified classification;
- bounded structural diff summaries and an optional diff artifact path;
- generated/source owner for each path;
- estimated input, output, and changed byte counts;
- a deterministic `planHash` covering operations, arguments, owners, base
  hashes, and tool/schema versions.

Planning performs the operations against an isolated copy-on-write document
workspace and validates the resulting project view. It writes no durable
source.

### 7.3 Apply result

`tn authoring batch apply` repeats planning unless supplied with a matching
`planHash`, acquires the project authoring lock, verifies base hashes and
owners, writes a recovery journal, stages changed documents, and promotes the
complete set. The JSON result includes:

- `ok`, `changed`, `committed`, and `recovered`;
- `transactionId` and `planHash`;
- ordered operation results and diagnostics;
- `filesCreated`, `filesModified`, and `filesDeleted`;
- input/output/changed bytes and elapsed timings by phase;
- conflict or ownership details without leaking full file contents.

If operation, validation, ownership, or precondition checks fail,
`committed` is false and no durable authoring source changes. If promotion is
interrupted, the journal lets the next authoring command restore the complete
old state or finish the complete new state before accepting another mutation.

### 7.4 Concurrency and ownership

- Use one project-scoped authoring lock only for the verify-and-publish phase;
  planning remains parallel.
- Fail closed when a touched file's hash differs from the planned base hash.
- Include the conflicting path, expected hash, actual hash, and suggested
  re-plan action in `TN_AUTHORING_BATCH_CONFLICT`.
- Operation descriptors declare their target resolver and permitted source
  owner. Observed writes outside predicted targets fail with
  `TN_AUTHORING_BATCH_UNDECLARED_WRITE`.
- Generator provenance is consulted before promotion. A non-owner write fails
  with `TN_AUTHORING_GENERATED_OUTPUT_OWNED` and names the generator input or
  owning command to edit.
- The editor and agents may attach a descriptive `actor` and `intent` for
  audit output, but correctness never depends on a human-readable actor name.

### 7.5 Large-document policy

The first release uses ordinary structured JSON parsing for affected
documents. It adds reporting, not an arbitrary hard compatibility limit:

- Record bytes and addressable-item counts per document in plan/apply output.
- Emit `TN_AUTHORING_DOCUMENT_GROWTH_WARNING` when a source document crosses a
  reviewed threshold owned by one constant and documented by the capability
  page. The initial threshold must be selected from benchmark evidence, not
  copied from the present 60 KB maximum.
- Suggest existing compact constructs such as prefabs, PlacementSets, sibling
  UI/system/resource documents, or a new scene rather than suggesting manual
  minification.
- Benchmark 64 KB, 1 MB, 10 MB, and 50 MB documents and batches touching 1,
  10, and 100 files. Record parse, clone, validation, promotion, peak RSS, and
  bytes copied.
- Require a follow-up PRD before introducing scene fragments, automatic
  sharding, a streaming parser, or a different on-disk format. Trigger that
  follow-up if the 10 MB fixture cannot meet the agreed latency/memory budget
  or real projects repeatedly cross the warning threshold.

Stable pretty-printed JSON remains the durable format. Minifying source to
reduce bytes is not an optimization because it degrades diffs and agent review.

## 8. Architecture and Integration Points

| Surface | Entry point | Caller | Shared path after this PRD |
| --- | --- | --- | --- |
| CLI | `tn authoring batch plan/apply` | `packages/cli/src/commands/authoring.ts` | core batch planner/committer |
| TypeScript | `openProject(...).transaction()` | `packages/authoring-client/src/index.ts` | core batch planner/committer |
| Recipe | `tn recipe apply` / `applyAuthoringRecipe` | CLI and authoring recipe planners | recipe emits operations into core batch |
| MCP | `authoring.batch.plan/apply` | `packages/mcp-server/src/index.ts` | descriptor-derived batch JSON schema |
| Editor | composite operation/AI edit | editor store and operation adapter | preview plan, then apply its `planHash` |
| Generator | generator-owned mutation | generator runner | same journal and owner preconditions |

Wiring requirements:

- `packages/authoring` owns the batch schema, planner, target resolution,
  journal state machine, commit result, recovery, and diagnostics.
- Operation descriptors own target prediction and adapter metadata. Do not add
  a separate batch operation list.
- `@threenative/authoring-client` owns ergonomic generated types and fluent
  helpers, but does not own dispatch or commit semantics.
- CLI, MCP, and editor serialize the same plan/apply result contract.
- Existing recipes and overlay staging migrate onto the shared committer before
  their private transaction implementations are deleted.

## 9. Functional Requirements

### FR-1: Closed batch validation

- Reject unknown schema versions, operation names, arguments, duplicate batch
  IDs where relevant, unsafe paths, generated artifact paths, and more than the
  reviewed operation/manifest byte budgets.
- Preserve stable diagnostic code, severity, path, message, suggestion, and
  structured fix fields where supported.

### FR-2: Atomic failure semantics

- Any failed operation or final semantic validation leaves durable source
  byte-for-byte unchanged.
- A promotion error restores all already-promoted paths before returning, and
  crash recovery converges to one complete state.
- `changed` describes the planned result; `committed` alone indicates durable
  publication. Failed results must never report committed files as successful
  writes.

### FR-3: Semantic dry run

- Dry run executes against staged documents, not only descriptor argument
  shapes.
- Cross-operation dependencies are visible: an operation may reference an ID
  created earlier in the same batch.
- Final project validation runs once after all operations, with an option for
  descriptor-declared focused validators during execution.

### FR-4: Predictable file scope

- Every mutating descriptor resolves zero or more candidate durable source
  paths from its arguments and project index.
- The engine detects and rejects writes outside that set.
- Reads may include reference-index documents, but metrics distinguish files
  read from files staged and written.

### FR-5: Typed clients and derived adapters

- Replace `AuthoringOperationName | string` with the closed registry union in
  the default TypeScript API. An explicitly named unsafe/extension API may
  remain for external registries.
- Generate or derive an operation-to-argument map from descriptor-owned types;
  common enums such as camera mode, light kind, rigid-body kind, and collider
  kind must not be broad `string` in the public facade.
- Ratchet descriptor migration by source family until manual editor and smoke
  gap maps contain only explicit product exclusions with owner and review date.

### FR-6: Idempotence and ordering

- Preserve declared operation order.
- A repeated successful batch against its already-produced state is either a
  no-op or returns a precise duplicate/conflict diagnostic according to each
  operation's descriptor policy.
- Recipe-specific adoption behavior must be descriptor/policy data, not a
  hidden alternate transaction engine.

## 10. Non-Functional Requirements and Success Metrics

| Metric | Baseline | Acceptance target |
| --- | ---: | ---: |
| Partial durable writes after a later operation fails | Reproduced: 1 file | 0 |
| Public arbitrary atomic multi-file command | None | 1 shared command/API |
| Transaction implementations | Recipe, CLI recipe, overlay, client variants | 1 shared core committer |
| Registry operations with CLI adapter metadata | 11 / 96 | 96 / 96 or explicit product exclusion |
| Registry operations with editor adapter metadata | 3 / 96 | All editor-eligible operations; exclusions descriptor-owned |
| Manual editor operation gaps | 58 | 0 migration gaps |
| Manual editor smoke gaps | 84 | 0 migration gaps |
| Whole-project bytes copied for a two-file batch | Current recipe copies project | 0 unrelated file bytes |
| Conflict overwrites after base hash changes | Not guarded generally | 0; deterministic conflict diagnostic |
| Generated-owner overwrites through ordinary batch | Deferred Chess C2 | 0; owner diagnostic |
| 10 MB affected document benchmark | No baseline | Budget recorded; no unrelated project copy |
| Batch output determinism | No public contract | Identical normalized plan/hash for identical input/base |

The performance gate must set machine-normalized budgets after recording the
first benchmark baseline. It must fail on relative regression (for example,
more than 20% median latency or peak-RSS growth across the committed fixtures)
rather than claiming universal wall-clock performance from one workstation.

## 11. Execution Phases

### Phase 1: Core planner and atomic failure regression

Checkpoint: no adapter migration starts until a later-operation failure is
proved byte-for-byte non-mutating through the core API.

Files (max 5):

- `packages/authoring/src/batches.ts` - batch schema, planning, staged result,
  and commit contract.
- `packages/authoring/src/operationRegistry.ts` - descriptor target resolver
  and mutation policy.
- `packages/authoring/src/index.ts` - public exports.
- `packages/authoring/src/batches.test.ts` - semantic and atomic regressions.
- `packages/authoring-client/src/index.ts` - route transactions through core.

Implementation:

- [x] Define the versioned operation batch and stable result types.
- [x] Execute operations against an isolated copy-on-write authoring document
  view and validate the final view.
- [x] Replace sequential client dispatch with core plan/apply.
- [x] Distinguish planned changes from committed changes in results.

Tests required:

| Test file | Test name | Assertion |
| --- | --- | --- |
| `packages/authoring/src/batches.test.ts` | `later operation failure leaves every source file byte-identical` | First operation succeeds in staging, second fails, no durable bytes change |
| `packages/authoring/src/batches.test.ts` | `batch resolves ids created by an earlier operation` | Cross-operation entity/component reference validates and commits |
| `packages/authoring/src/batches.test.ts` | `undeclared operation target fails closed` | Observed write outside descriptor targets is rejected |
| `packages/authoring-client/src/index.test.ts` | `transaction delegates to atomic authoring batch` | Client result shares transaction ID/plan hash and does not partially write |

User verification:

- Apply a two-operation batch whose second operation is invalid.
- Expected: nonzero result, `committed: false`, and `git diff -- content` is
  empty.

### Phase 2: Journaled multi-file publish and concurrency

Checkpoint: inject a failure after each publish-state transition and prove
recovery before migrating recipes or editor consumers.

Files (max 5):

- `packages/authoring/src/transactionJournal.ts` - lock, journal, promotion,
  rollback, and recovery state machine.
- `packages/authoring/src/transactionJournal.test.ts` - fault-injection matrix.
- `packages/authoring/src/batches.ts` - base hashes and commit integration.
- `packages/authoring/src/diagnostics.ts` - conflict/recovery diagnostics.
- `docs/contracts/authoring-source-documents.md` - publication guarantees.

Implementation:

- [x] Add project-scoped lock acquisition with bounded stale-lock recovery.
- [x] Hash touched base documents and verify them immediately before publish.
- [x] Journal old/new path state and use same-filesystem temporary files.
- [x] Roll back process errors and recover interrupted transactions on the next
  authoring mutation.
- [x] Keep transaction artifacts outside durable `content/**` source and
  exclude them from project discovery.

Tests required:

| Test file | Test name | Assertion |
| --- | --- | --- |
| `packages/authoring/src/transactionJournal.test.ts` | `changed base hash rejects stale plan` | No file is promoted and conflict reports expected/actual path hashes |
| `packages/authoring/src/transactionJournal.test.ts` | `promotion failure restores all old files` | Fault after every rename converges to old state |
| `packages/authoring/src/transactionJournal.test.ts` | `recovery completes one coherent state after interruption` | Restart simulation never leaves a mixed file set |
| `packages/authoring/src/transactionJournal.test.ts` | `parallel commits serialize verify and publish` | One conflicting writer succeeds and one deterministically replans/fails |

User verification:

- Plan a batch, edit one touched file manually, then apply with the plan hash.
- Expected: `TN_AUTHORING_BATCH_CONFLICT`, the manual edit remains, and no
  other batch file changes.

### Phase 3: CLI, MCP, and editor vertical slice

Checkpoint: one three-file batch must produce equivalent plan/apply results
through CLI, MCP, and editor adapter tests before broad operation enrollment.

Files (max 5):

- `packages/cli/src/commands/authoring.ts` - `batch plan/apply` and stdin/file
  handling.
- `packages/cli/src/commands/authoring.test.ts` - command contract tests.
- `packages/mcp-server/src/index.ts` - derived batch tools.
- `packages/editor/src/state/editorStore.ts` - plan preview and hash-bound
  apply.
- `packages/editor/src/adapters/editorModel.ts` - shared result mapping.

Implementation:

- [x] Add `tn authoring batch plan/apply --file <path|-> --project <path>
  --json`.
- [x] Keep stdout bounded; write full structural diffs to an artifact when
  they exceed the output budget.
- [x] Expose MCP plan/apply schemas from the same batch and operation
  descriptors.
- [x] Show touched paths, owners, conflicts, and diagnostics in the editor
  preview before apply.
- [x] Require apply to bind to the previewed `planHash` in the editor.

Tests required:

| Test file | Test name | Assertion |
| --- | --- | --- |
| `packages/cli/src/commands/authoring.test.ts` | `batch applies operations across scene input and systems files` | One command commits all three documents and validates |
| `packages/cli/src/commands/authoring.test.ts` | `batch reads one bounded JSON document from stdin` | JSON stdout remains clean and input budget is enforced |
| `packages/mcp-server/src/index.test.ts` | `batch tool schema derives registered operation names` | MCP rejects unknown names without a hand-maintained list |
| `packages/editor/src/state/editorStore.test.ts` | `editor refuses apply after previewed source changes` | Stale plan becomes a visible conflict, not an overwrite |

User verification:

- Apply a batch that changes input, scene, and systems source.
- Expected: one transaction ID, three classified files, successful authoring
  validation, and one undoable editor history item.

### Phase 4: Ownership and existing transaction migration

Checkpoint: Chess-style generator/CLI collision and overlay/recipe failure
fixtures must pass before private staging implementations are removed.

Files (max 5):

- `packages/authoring/src/generatorProvenance.ts` - output-owner lookup and
  policy.
- `packages/authoring/src/recipes.ts` - emit operations through core batch.
- `packages/cli/src/commands/recipe.ts` - remove duplicate staging/promotion.
- `packages/cli/src/commands/overlayAdd.ts` - use shared committer.
- `packages/authoring/src/batches.test.ts` - ownership and migration parity.

Implementation:

- [x] Resolve generator ownership for every predicted/observed output.
- [x] Reject ordinary writes to generator-owned output and link the owning
  recipe/module/command in the suggested fix.
- [x] Preserve recipe adoption/idempotence as explicit operation policy.
- [x] Migrate recipes and overlay writes to the journaled committer.
- [x] Delete private promotion/rollback implementations after parity tests.

Tests required:

| Test file | Test name | Assertion |
| --- | --- | --- |
| `packages/authoring/src/batches.test.ts` | `non-owner cannot overwrite generator output` | Failure names owner and leaves output hash unchanged |
| `packages/authoring/src/batches.test.ts` | `owning generator may publish declared output` | Owner-authorized batch commits and provenance hash advances |
| `packages/authoring/src/recipes.test.ts` | `recipe remains atomic and adoption-aware through batch engine` | Existing behavior passes without project copy |
| `packages/cli/src/commands/overlayAdd.test.ts` | `overlay publish rolls back through shared journal` | Existing injected failures retain old files |

User verification:

- Attempt a normal batch against a recorded generator output, then change the
  generator input and run the owner path.
- Expected: first command fails with an actionable owner diagnostic; second
  command succeeds and updates provenance.

### Phase 5: Descriptor/type closure and scaling gate

Checkpoint: remove migration allowlists only after every enrolled family has
derived CLI/editor/smoke coverage and the large-document fixtures publish
measured artifacts.

Files (max 5):

- `packages/authoring/src/operationRegistry.ts` - complete adapter, target, and
  typed-argument descriptor ownership.
- `packages/authoring-client/src/generatedOperations.ts` - generated/derived
  operation argument map and fluent enum types.
- `tools/verify/src/adapterSurfaceDrift.test.ts` - family ratchet and removal of
  migration gaps.
- `tools/verify/src/authoringBatchScaleGate.ts` - size/file-count fixtures and
  regression metrics.
- `docs/status/capabilities/authoring.md` - batch, ownership, and scaling truth.

Implementation:

- [x] Migrate operation families in bounded batches until CLI/editor metadata,
  target prediction, and smoke enrollment are descriptor-owned.
- [x] Close the default client name and argument types; keep any extension
  escape hatch explicit.
- [x] Generate fixtures at 64 KB, 1 MB, 10 MB, and 50 MB without committing
  bulky generated JSON.
- [x] Record read/staged/written files, bytes copied, timings, and peak RSS.
- [x] Add the reviewed growth warning threshold and document escalation to a
  sharding/streaming follow-up PRD.

Tests required:

| Test file | Test name | Assertion |
| --- | --- | --- |
| `tools/verify/src/adapterSurfaceDrift.test.ts` | `every batchable operation owns targets and adapter metadata` | No migration gap map substitutes for descriptor truth |
| `packages/authoring-client/src/generatedOperations.test.ts` | `operation arguments reject invalid enum and missing required fields at compile time` | Type fixtures fail/pass as expected |
| `tools/verify/src/authoringBatchScaleGate.test.ts` | `two-file batch copies no unrelated project bytes` | Copied-byte metric includes only transaction metadata and touched files |
| `tools/verify/src/authoringBatchScaleGate.test.ts` | `large document matrix emits deterministic bounded metrics` | Fixtures complete within ratcheted relative budgets |

User verification:

- Plan and apply a two-file batch in a synthetic project containing an
  unrelated 50 MB source document.
- Expected: the unrelated document is not parsed, cloned, staged, or written;
  metrics and hash confirm it remained untouched.

## 12. Verification Commands

Run the narrowest checks after each phase, then the cross-surface gates:

```bash
pnpm --filter @threenative/authoring test
pnpm --filter @threenative/authoring-client test
pnpm --filter @threenative/cli test -- --run authoring
pnpm --filter @threenative/mcp-server test
pnpm --filter @threenative/editor test
pnpm verify:adapter-surfaces
pnpm verify:emitted-commands
pnpm verify:cookbook
pnpm check:docs
```

If the batch schema becomes an IR/runtime contract, also run
`pnpm verify:conformance`; otherwise it remains an authoring-only source
contract and conformance is not required.

## 13. Rollout and Compatibility

1. Land the core batch engine behind the existing client transaction API.
2. Add CLI/MCP/editor batch entry points without removing individual commands.
3. Migrate recipes and overlay promotion, retaining result-shape compatibility
   for one release.
4. Ratchet descriptor families and remove only stale migration allowlists.
5. Promote batch apply in generated starter instructions and the cookbook
   after the scaling and recovery gates are green.

Individual operations remain supported for small edits. A batch is recommended
when changes are semantically coupled, span files, or must be protected by a
shared precondition. Existing recipe files remain recipes; they become batch
producers internally.

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cross-file rename is mistaken for physical filesystem atomicity | Corruption after crash | Journal old/new state and test restart recovery at every transition |
| Descriptor target resolver is incomplete | Hidden write escapes plan | Compare observed writes to predicted targets and fail closed |
| Project lock becomes stale | Authoring unavailable | Bounded owner/PID metadata and tested recovery; never silently break a live lock |
| Full semantic validation reads the whole project | Scaling target missed | Maintain a reference index and report files read separately from files written; allow explicit full validation gate afterward |
| Huge batch stdout consumes agent context | Token regression | Bounded summary plus artifact path for full diff/trace |
| Automatic sharding changes source semantics | Migration and merge risk | Keep sharding out of this PRD and require evidence-triggered design |
| Generated client code becomes another truth source | Drift | Generate from descriptors and verify clean regeneration in CI |
| Recipe behavior changes during migration | Existing projects break | Snapshot recipe plans/results and preserve adoption policies explicitly |

## 15. Acceptance Criteria

- [x] A documented single CLI command applies arbitrary registered operations
  across different authoring files.
- [x] Later-operation, semantic-validation, conflict, ownership, and injected
  promotion failures produce zero partial durable source changes.
- [x] Interrupted commits recover to a complete old or complete new state.
- [x] TypeScript client, recipes, CLI, MCP, and editor use one core planner and
  committer.
- [x] Plan output reports touched paths, base hashes, ownership, bounded diffs,
  byte counts, and deterministic plan hash.
- [x] Changed base files and generator-owned outputs fail with actionable
  diagnostics.
- [x] A two-file batch does not copy, parse, or write unrelated source files.
- [x] Descriptor migration gaps reach zero for batch-eligible surfaces or are
  converted to explicit descriptor-owned product exclusions.
- [x] Large-document benchmarks publish reproducible metrics and select a
  reviewed warning threshold without introducing stream editing by assumption.
- [x] Cookbook and authoring capability docs describe when to use an
  individual operation, recipe, batch, compact construct, or separate scene.
- [x] `pnpm check:docs` and all phase-specific tests pass.

## 16. Open Questions

- Should the durable batch suffix be `.authoring-batch.json` or should batch
  documents normally remain ephemeral under `.tn/`?
- Should apply require an explicit `planHash` in CI/editor contexts while
  retaining plan-and-apply in one CLI invocation for interactive agents?
- Which reference-index data is sufficient for focused semantic validation,
  and which mutations must still request a full project validation pass?
- After benchmark evidence, should the growth warning be based on bytes,
  addressable item count, operation latency, or a combination?
- If real scenes outgrow compact constructs, should the next contract use
  first-class scene fragments, spatial cells, or ownership-based subdocuments?


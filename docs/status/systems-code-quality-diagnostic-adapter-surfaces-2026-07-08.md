# Diagnostic Report: Urgent (Red) Adapter-Surface Risks

Date: 2026-07-08
Scope: the four current 🔴 rows in `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
covering authoring operations and mutation surfaces, the CLI command surface,
editor source operations, and generated-game verification. Evidence gathered by
four parallel code audits with file/line references against the working tree on
the date above. Companion to
`docs/status/systems-code-quality-diagnostic-2026-07-08.md`, which covered the
previous top four rows (now closed).

## Shared root cause

All four rows are the same disease in different organs: a descriptor or policy
source of truth exists (authoring operation registry, command metadata record,
gate project list), but it is metadata-only. Every adapter — CLI parsing/help,
MCP argv construction, editor payload builders and fallbacks, verify smoke
lists, release enrollment arrays — re-derives that truth by hand. Adding one
mutation, command, or example project means editing 3-7 files with no gate that
fails when one is missed.

Severity ordering (most urgent first):

1. Authoring operations and mutation surfaces — 84 operations, four adapter
   surfaces, and the coverage matrix all hand-synchronized; largest blast
   radius because the editor, MCP, and CLI rows all sit on top of it.
2. Editor source operations — a dependent of area 1, plus its own triple-copy
   of defaults and composite recipes; one confirmed unreachable fallback path.
3. CLI command surface — 49 commands with dispatch, metadata, and help
   duplicated four ways; the repo already contains the registry pattern that
   fixes it.
4. Generated-game verification — smallest surface and cheapest fix; includes
   one mild policy inconsistency (agent inventory checked for only one of the
   two enrolled games).

---

## 1. Authoring operations and mutation surfaces

### Diagnosis

The registry (`packages/authoring/src/operationRegistry.ts`, 1233 lines)
defines 84 operation descriptors with name, description, source family, path
policy, and typed argument list (`IAuthoringOperationDescriptor`,
`operationRegistry.ts:116-123`). That is enough to validate a payload
(`validateRegistryArguments`, `operationRegistry.ts:981-1022`) but not enough
to drive any adapter, so each adapter re-encodes the operation by hand:

- CLI: `packages/cli/src/commands/sourceDocuments.ts` (1211 lines) exports
  17 hand-written subcommand handlers, each with its own positional/flag
  parsing, numeric/boolean coercion, and hardcoded `renderUsage()` strings
  (100+ usage literals). None of it consults the registry descriptor.
- MCP: `packages/mcp-server/src/index.ts` builds its tool list from the
  registry (good) but then hand-maps tool args back to CLI argv in
  `toolToCliArgv()` (`index.ts:83-167`), hardcoding flag names like
  `--position`/`--rotation`/`--scale` for a dozen operations. Flag names live
  nowhere in the registry, so a CLI flag rename silently breaks MCP.
- Editor: `packages/editor/src/server/operationApi.ts:63-116` keeps a fallback
  `switch` with ~11 hand-written cases for operations that already exist in
  the registry, each with its own arg extraction (`operationApi.ts:190-217`).
- Coverage: `tools/verify/src/editorRequiredOperations.ts:103-155` hardcodes
  ~15 smoke operations (~18% of the registry). Registry unit tests cover
  roughly 20 operations. Nothing fails when a new operation lands in the
  registry but in no adapter or test.

Net effect: adding one operation touches 3-5 files across authoring, CLI,
editor, MCP, and verify, and the most likely omission (test coverage, editor
exposure) is exactly the one no gate detects.

### Recommendations

1. Extend the descriptor to be executable, incrementally. Add an optional
   `cli` block per descriptor: subcommand path, positional order, flag names,
   per-argument help; plus optional validation constraints (enum values,
   min/max) beyond the current type enum. Descriptors without the block keep
   current behavior — no big-bang migration.
2. Derive before you generate. First derive CLI usage/help text and MCP argv
   construction from the `cli` block (handlers stay hand-written); this alone
   removes the flag-name and usage-string drift. Only then replace hand-rolled
   arg parsing with a shared `parseArgsFromDescriptor()` used by CLI, MCP, and
   editor dispatch.
3. Add a coverage-matrix gate now, before any migration. A cheap test that
   diffs the 84 registry names against: CLI subcommand routing, MCP tool
   names, editor-enabled operation names, and the smoke list — failing with an
   explicit allowlist for intentional gaps. This converts silent drift into a
   red test even while adapters are still hand-written.
4. Migration order: start with the operations MCP already special-cases in
   `toolToCliArgv()` (they are the proven drift hot spots), then the editor
   fallback-switch cases, then the long tail.

Verification: `pnpm --filter @threenative/authoring test`, narrow CLI/editor
package tests, and the editor smoke gate.

---

## 2. Editor source operations

### Diagnosis

The editor exposes ~36 operations across five parallel definition paths:
store actions (`packages/editor/src/state/editorStore.ts`), payload builders
and server fallbacks (`packages/editor/src/server/operationApi.ts`), the model
inventory (`packages/editor/src/adapters/editorModel.ts`), the authoring
registry, and the verify smoke list. Concrete divergences found:

- Unreachable fallback: `operationApi.ts:64-65` defines a `ui.add_text`
  fallback, but the store never posts that operation — dead adapter code that
  still has to be maintained.
- Hand-coded payload transformation: the store's `addComponent` path
  (`editorStore.ts:140-157`) manually maps component defaults into
  `scene.set_transform` args, ignoring the registry descriptor for the same
  operation (`operationRegistry.ts:566-573`).
- Composite recipes exist twice in different shapes: `addFlatTerrain` is a
  5-operation sequence in `operationApi.ts:133-156` but a single wrapped
  operation in the store's `addObjectOperationPlan`
  (`editorStore.ts:983-994`). `createDefaultScene` similarly exists as an
  8-step sequence in `operationApi.ts:158-181` alongside the registry's atomic
  `scene.create`.
- Defaults are tripled: camera defaults appear in `editorStore.ts:950`,
  `editorModel.ts:272-278`, and the registry descriptor
  (`operationRegistry.ts:663-673`).

Existing tests check the model inventory's internal consistency
(`editorModel.test.ts:105-140`) and one operation's CLI/editor parity. There
is no test that editor-referenced operation names exist in the registry, that
payload builders agree with registry argument descriptors, or that composite
recipes are smoke-covered.

### Recommendations

1. Introduce a single `editorOperationMetadata` layer that looks up the
   authoring descriptor and decorates it with the only genuinely
   editor-specific things: an optional payload builder (arg prep/defaults),
   an optional named composite recipe (`ICompositeOperationRecipe`: label +
   ordered `{name, args}` steps), and an explicit fallback marker. Everything
   else comes from the registry.
2. Keep true composites as named recipes, not duplicated sequences:
   `add.light`, `add.terrain`, `scene.create_default`, and the
   primitive-plus-placement patterns are legitimate editor semantics; define
   each once and have both the store plan and the server API execute the same
   recipe.
3. Replace the store's per-component switch with a
   `buildAddComponentOperation()` helper driven by the metadata layer, and
   delete the fallback-switch cases that duplicate registry operations
   (keeping only marked genuine fallbacks like `ui.add_text` — or wire that
   one up and remove the dead path).
4. Add the two missing consistency tests first (they are cheap and catch
   drift immediately): every enabled inspector-field/modal-action
   `operationName` must exist in the registry; payload builder output keys
   must match registry argument names. Then extend the smoke gate to execute
   the composite recipes end-to-end, not just atomic operations.

Verification: `pnpm --filter @threenative/editor test` plus the editor
required-operations smoke gate.

---

## 3. CLI command surface

### Diagnosis

`packages/cli/src/index.ts` (593 lines) hand-maintains three parallel views of
49 commands: a metadata record with descriptions and usage strings
(`index.ts:44-300`), a ~237-line if-chain dispatcher (`index.ts:323-559`), and
top-level help rendering (`index.ts:304-321`). A fourth view lives in
`commands/help.ts:13-165` (task-oriented topics with embedded usage), and a
fifth inside each command file's own `renderHelp()`. The same usage string for
`tn scene create` appears in at least three of these plus test assertions.

Large command families (`game.ts` 2177 lines, `playtest.ts` 1532 lines,
`asset.ts` 1193 lines, `sourceDocuments.ts` 1211 lines, `scene.ts` 542 lines)
each re-implement subcommand routing, `--` normalization, flag reading, and
help rendering with small inconsistencies. Nothing verifies that the metadata
record matches the dispatcher or the real handler signatures; the only test is
that help output mentions each command name (`index.test.ts:9-40`). Adding one
subcommand touches 5-7 places.

The repo already contains the cure twice: `packages/cli/src/archetypes/
registry.ts:26-106` and `packages/cli/src/templates/registry.ts:10-39` are
typed descriptor arrays with lookup/list/format helpers. The status row's
requested `{ name, usage, handler }` registry is those patterns applied to
commands.

### Recommendations

1. Add `packages/cli/src/commands/registry.ts` with
   `ICommandDefinition { name, description, usage, handler, subcommands? }`
   and derive both top-level help and dispatch from it, replacing the if-chain
   with a registry lookup. Keep the old paths for unmigrated commands so
   migration is per-command.
2. Migrate in risk order: single-handler commands first (`build`, `validate`,
   `add`, `compare-images`), then simple subcommand families (`actor`,
   `doctor`, `dev`, `verify`), then the big families (`scene`, `game`,
   `asset`, `playtest`, `sourceDocuments`) using the `subcommands` array.
3. Pull the duplicated argv plumbing (`--` normalization, `readFlag`,
   numeric/boolean flag coercion currently copy-pasted across `gameShared.ts`
   / `sceneShared.ts` and command files) into one shared module as commands
   migrate — this is also the substrate area 1's descriptor-driven parsing
   will plug into, so the two migrations should share it.
4. Add a registry integrity check (unique names, every registry handler
   exported, every dispatched command present in the registry) as a unit test
   now, and delete the `index.ts:44-300` metadata record and per-file
   `renderHelp()` duplicates only after their family migrates.

Verification: `pnpm --filter @threenative/cli test`; `pnpm check:docs` for the
workflow docs that embed CLI usage.

---

## 4. Generated-game verification

### Diagnosis

Enrollment is compile-time constants:
`GENERATED_GAME_PROJECTS` (`tools/verify/src/gameProductionGate.ts:49-52`,
currently humanoid-physics-course and metro-surfer-heist) and
`GENERATED_GAME_BUILD_ONLY_PROJECTS` (`gameProductionGate.ts:54-56`,
stylized-nature-component). Proof policy is uniform except one string-equality
special case: `requireAgentInventory: projectPath ===
"examples/metro-surfer-heist"` (`gameProductionGate.ts:260`). That is a policy
inconsistency, not just debt — humanoid-physics-course has `production.agent`
metadata in its `threenative.config.json` but is never held to the agent
inventory requirement.

The gate already half-solves discovery: `discoverGeneratedGameCandidates`
(`gameProductionGate.ts:232-250`) scans `examples/*` for the
`artifacts/game-production/plan.json` marker, and inventory diagnostics
(`gameProductionGate.ts:176-203`) fail on overlap between the two arrays and
on discovered-but-unenrolled candidates. Gaps: no diagnostic for a hard-coded
entry whose marker artifact is missing, and adding a game still means editing
the constant array (release enrollment via `release.ts:43` reads it). Both
enrolled examples carry the same 13-artifact evidence set, but their
package.json proof scripts differ in shape (`pnpm run tn` vs `tn`; one
redirects `plan.json` manually), which is exactly the confusion the 🟡
"examples and benchmark projects" row predicts.

### Recommendations

1. Move enrollment and proof policy into the project's own
   `threenative.config.json` as a `production.releaseProof` block:
   `{ "enrolled": true, "requirements": ["cleanRelease", "qaProof", ...,
   "agentInventory"] }`, with the requirement keys matching the gate's
   existing `require*` fields one-to-one. Build-only projects declare
   `"enrolled": false` (or omit the block) so both constant arrays retire into
   one model. A root-level examples manifest is the fallback option, but the
   per-project config is preferred: the config file already exists, already
   carries production metadata, and travels with the example.
2. Migrate in three non-breaking steps: (a) add the config blocks and a
   `resolveProjectsFromConfig()` reader while keeping the constants as
   fallback; (b) add a drift diagnostic when config and constants disagree,
   and another when a hard-coded/enrolled project lacks its marker artifact;
   (c) delete the constants and the metro-surfer-heist string conditional.
3. Resolve the agent-inventory inconsistency explicitly during step (a):
   either enroll humanoid-physics-course in the requirement (it appears ready)
   or record in the config why it is exempt. Do not let the config migration
   silently freeze the current asymmetry.
4. Validate the new config block in the gate (unknown requirement keys are
   errors), so the manifest itself cannot drift from the gate's vocabulary.

Verification: `tools/verify` package tests plus a run of
`verify:generated-games`; `pnpm verify:smoke` unaffected.

---

## Cross-cutting observations

- Areas 1, 2, and 3 are one program of work, not three. The executable
  operation descriptor (area 1) is the metadata the editor layer (area 2)
  consumes and the argument-parsing substrate the CLI registry (area 3) hosts.
  Sequencing them independently would build three partial registries; the
  cheap shared first step is coverage/consistency gates (area 1 rec 3, area 2
  rec 4, area 3 rec 4), which are test-only, land in days, and make every
  later refactor safe.
- Area 4 is independent and the best first win: small surface, existing
  discovery machinery, and a real policy inconsistency to fix. It also sets
  the config-driven-enrollment precedent the 🟡 templates and examples rows
  already call for (template manifests, examples manifest).
- Suggested sequencing at fixed effort: (a) area 4 config-driven enrollment;
  (b) the three drift gates from areas 1-3; (c) CLI command registry skeleton
  plus first migrated commands (area 3), because it creates the shared parsing
  substrate; (d) executable operation descriptors driving MCP/CLI metadata
  (area 1); (e) editor metadata layer and composite recipes (area 2), which
  then falls out of (d) largely mechanically.
- The failure mode these rows share with the previous diagnostic's rows is
  overtrusted indirect evidence: there, traces stood in for live-world state;
  here, hand-maintained lists stand in for adapter coverage. The remedy is the
  same — make the claim executable and fail closed when a surface is missing.

## Verification

Docs-only change: no build or test run required per the status doc's
verification expectations. `pnpm check:docs` should pass; per-area
verification commands are listed inline above for when fixes land.

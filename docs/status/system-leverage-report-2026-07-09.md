# System Leverage Report

Date: 2026-07-09

## Scope

This exploration looked for high-leverage parts of ThreeNative: areas where
more engineering effort, verification compute, benchmark repetitions, or
automation is likely to produce outsized gains. It reviewed the status front
door, capability docs, active PRDs, system quality status, benchmark notes,
verification gates, and representative source hot spots across authoring, CLI,
editor, generated-game proof, runtime adapters, and verify tooling.

No behavior changes were made. The worktree already had uncommitted edits in
`docs/bevy-feature-parity.md`, `docs/status/ENGINE-READINESS-REPORT-2026-07-08.md`,
and `docs/PRDs/done/feature-parity-polishing/`; this report does not modify them.

## Overall Read

Current leverage score: 8/10.

The system already has unusually strong proof discipline. The leverage is no
longer "add tests" in the generic sense. The best returns come from turning
remaining hand-owned surfaces into descriptor-backed contracts, collapsing
agent and developer loops into single commands, and using benchmark artifacts
as a product steering signal instead of anecdotal feedback.

The main negative pattern is repeated truth across SDK, IR, compiler, web
runtime, Bevy runtime, CLI/editor/MCP adapters, examples, docs, and release
gates. The repo knows this: `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` rates
the system 7.2/10 and names split contract truth across those layers as the
primary risk.

## Highest-Leverage Areas

### 1. Adapter Surface Derivation

Leverage: very high. Risk: medium. Payoff horizon: immediate to medium-term.

Evidence:

- `tools/verify/src/adapterSurfaceDrift.test.ts` compares authoring operation
  names against CLI, MCP, editor, and smoke surfaces.
- The same file still has large explicit editor and smoke gap allowlists.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` says authoring operations, CLI
  commands, editor source operations, and generated-game verification are still
  broad or partially migrated.

Why this is a leverage point:

Every new operation or command currently risks producing more parallel adapter
work. Finishing descriptor-driven dispatch, help, argv construction, MCP tools,
editor metadata, and smoke enrollment converts future feature work from
multi-surface manual wiring into one registry update plus generated coverage.
That compounds across nearly every authoring and editor feature.

Best next moves:

- Continue shrinking `EDITOR_OPERATION_GAPS` and `EDITOR_SMOKE_GAPS` until
  gaps mean explicit product exclusions, not missing coverage.
- Move remaining large CLI command families behind the typed command registry
  or add drift tests with narrow, named allowlists.
- Make every new authoring descriptor carry enough metadata for CLI, MCP,
  editor operation metadata, and smoke planning to derive from it.

Suggested verification:

- `pnpm --filter @threenative/authoring test`
- `pnpm --filter @threenative/cli test`
- `pnpm --filter @threenative/editor test`
- `pnpm verify:editor-required-operations`

### 2. Off-Recipe Agent Loop Cost

Leverage: very high. Risk: low to medium. Payoff horizon: immediate.

Evidence:

- `docs/status/capabilities/game-production.md` reports scaffold-first evidence
  as very strong: collector at 0.124x vanilla tokens, lane-runner at 0.083x,
  3.5 median tool steps, and zero failed-command median.
- The same doc reports off-recipe checkpoint-race at 3.614x and
  physics-knockdown at 2.008x, with 47-53 median ThreeNative tool steps.
- `docs/status/capabilities/tooling-proof.md` shows `verify:session-cost`
  already gates steps, failed commands, compact iterate output, repeated
  diagnostics, and identical failed assertions.

Why this is a leverage point:

The scaffold path proves the engine can beat vanilla when the workflow is
rail-shaped. The off-recipe path is where mid-sized games will live. More
compute should be spent classifying and replaying the churn, not just running
broader benchmarks. Every removed step saves context replay cost in every
future agent run.

Best next moves:

- Treat engine-source searches, standalone verify commands, artifact forensics,
  missing `tn iterate`, and missing discovery as first-class failing churn
  classes for Round 5B.
- Add commands or API-card snippets only when benchmark transcripts show a
  repeated question or mistake.
- Keep using deterministic `verify:session-cost` as the cheap ratchet before
  launching expensive live-agent reruns.

Suggested verification:

- `pnpm verify:session-cost`
- `pnpm verify:agent-io`
- Fresh Round 5B benchmark only after churn budgets are green.

### 3. Runtime Observation And Diagnosis

Leverage: high. Risk: medium. Payoff horizon: medium-term.

Evidence:

- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` flags scripting host/services,
  physics, input, UI, and gameplay flow as cross-runtime areas where behavior
  spans several packages and needs fixture-first work.
- `docs/status/capabilities/tooling-proof.md` records resource observation
  diagnostics such as `TN_RESOURCE_DECLARED_NOT_OBSERVED`,
  `TN_PLAYTEST_REPEATED_ASSERTION`, and `TN_PLAYTEST_RESOURCE_STATE_STAGNATED`.
- Prior benchmark/status notes repeatedly describe runtime black-box behavior
  as expensive for agents to debug.

Why this is a leverage point:

When an authored behavior validates but runtime state does not change, agents
fall into artifact spelunking. A single precise diagnostic often replaces many
tool calls. This is especially valuable in physics, resource state, contacts,
input routing, UI actions, and declarative GameFlow because those systems cross
authoring, compiler, web runtime, Bevy runtime, and playtest artifacts.

Best next moves:

- Expand service-by-service parity fixtures for script context APIs:
  animation, audio, physics, picking, UI, persistence, resources, lifecycle.
- For every playtest assertion type, emit the owning source, runtime
  observation path, last-changing system, and first likely repair.
- Prioritize silent/stagnant-state failures above new feature breadth.

Suggested verification:

- Relevant runtime package tests.
- `pnpm verify:conformance`
- `pnpm verify:gameplay-parity`
- Focused playtest scenarios for the affected behavior.

### 4. Proof Gate Descriptors And Release Orchestration

Leverage: high. Risk: medium. Payoff horizon: medium-term.

Evidence:

- `tools/verify/src/cli/run.ts` owns a large `FOCUSED_GATES` map with command
  specs, metadata, and protection descriptions.
- `tools/verify/src/release.ts` owns a separate release-focused gate list with
  artifact paths, timing budgets, and conflict handling.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` calls out broad proof
  orchestration files and hard-coded registries as the main verification risk.

Why this is a leverage point:

Verification is already culturally strong, but adding gates still requires
multiple hand edits. A gate descriptor manifest that owns command, artifact,
profile, conflict policy, timing budget, release enrollment, and status-doc
metadata would make proof expansion cheaper and less drift-prone.

Best next moves:

- Introduce one gate descriptor shape and migrate a small family first.
- Generate focused gate dispatch, release gate enrollment, artifact checks, and
  docs/status summaries from the descriptor.
- Keep escape hatches explicit for gates with conformance artifact conflicts.

Suggested verification:

- `pnpm build:verify-tools`
- `pnpm verify:focused <migrated-gate>`
- `pnpm verify:release` after descriptor-backed release enrollment changes.

### 5. Generated-Game And Example Manifests

Leverage: high. Risk: low. Payoff horizon: immediate.

Evidence:

- Generated-game release proof now reads `production.releaseProof` from
  project-local config.
- `tools/verify/src/gameProductionGate.ts` still retains temporary fallback
  constants and drift diagnostics while migration completes.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` also flags templates, starters,
  examples, and benchmark projects as separate sources of truth.

Why this is a leverage point:

Representative games are the forcing function for product truth. If examples,
templates, proof commands, release proof requirements, dependency strategy, and
artifact policy are manifest-owned, adding a new maintained game becomes a
bounded operation instead of another local convention.

Best next moves:

- Retire generated-game fallback constants once config coverage is complete.
- Add an examples manifest that classifies release-enrolled, build-only,
  archived, benchmark-only, and fixture-only examples.
- Add a template manifest per starter and derive template registry,
  generated instructions, and template-production expectations from it.

Suggested verification:

- `pnpm verify:generated-games`
- `pnpm verify:example-build-sweep`
- `pnpm verify:template-production`

### 6. Mid-Size Game Forcing Function

Leverage: high. Risk: medium to high. Payoff horizon: medium-term.

Evidence:

- Current game-production support is strong for polished vertical slices.
- The readiness report and capability docs indicate mid-sized games remain
  less proven: multi-scene flow, sustained content volume, menus, progression,
  production packaging, and off-recipe deltas are not yet exercised together.
- GameFlow, Sequence, Spawner, archetypes, world generation, UI, proof, and
  release checks now exist as ingredients.

Why this is a leverage point:

One real mid-sized web-first game will reveal integration debt faster than
dozens of isolated capability slices. It will also prevent optimization around
toy prompts. The best candidate should include menus, settings, progression,
multiple scenes or phases, saved state, audio, UI, repeated assets, performance
budgeting, and release proof.

Best next moves:

- Build the game agent-first with a strict friction log.
- Require `tn iterate` and proof manifests as the inner loop.
- Convert repeated friction into commands, descriptors, diagnostics, or compact
  docs immediately after the run.
- Keep Bevy/native promotion frozen unless this game creates a documented
  shipped-game need.

Suggested verification:

- `pnpm verify:generated-games`
- `pnpm verify:game-production`
- `pnpm verify:gameplay-parity` only for claims that need runtime parity.

### 7. Visual And Rendering Parity Metrics

Leverage: medium-high. Risk: medium. Payoff horizon: medium-term.

Evidence:

- Rendering and materials are active, proof-gated, and visually sensitive.
- Photoreal and shader material proof already capture web/native evidence and
  region metrics.
- The status docs still classify advanced renderer rows as mostly diagnostics
  or visual-proof gated.

Why this is a leverage point:

Visual quality is a product multiplier, but only if evidence is cheap enough to
run repeatedly. Region metrics, contact sheets, nonblank checks, visual quality
scores, and artifact summaries can turn subjective polish work into
regression-safe iteration.

Best next moves:

- Prefer small deterministic visual matrices over broad screenshot dumps.
- Expand named-region metrics for materials, lighting, camera framing, UI fit,
  and effect-specific probes.
- Tie every visual promotion to a fixture, metrics JSON, and a compact contact
  sheet.

Suggested verification:

- `pnpm verify:render-look`
- `pnpm verify:rendering-photoreal`
- Capability-specific rendering gates when promoted claims change.

## Lower-Leverage Areas Right Now

- Broad new Bevy parity surface. The native freeze is a good constraint until a
  shipped-game need exists.
- More one-off examples without manifest ownership. They add evidence weight
  unless classified and enrolled.
- New authoring syntax experiments as a default path. Existing evidence says
  typed-spec remains experimental; direct scaffold-first rails are winning.
- Bigger docs. The front door is already compressed; new docs should be
  generated, artifact-backed, or compact enough to reduce tool steps.

## Recommended Investment Order

1. Shrink adapter drift allowlists and finish descriptor-backed adapter
   derivation.
2. Run the off-recipe churn program before Round 5B: classify, ratchet, then
   rerun.
3. Add runtime observation diagnostics for silent/stagnant state failures.
4. Convert proof gates and examples/templates into descriptor or manifest-owned
   systems.
5. Build one mid-sized web-first game as a forcing function.
6. Expand visual metrics only where they attach to promoted rendering or game
   quality claims.

## Commands And Scans Run

- `sed -n '1,220p' docs/STATUS.md`
- `sed -n '1,220p' package.json`
- `git status --short`
- Source-size scan over `packages`, `tools`, `runtime-bevy`, and `scripts`
  excluding `dist`, `node_modules`, and `target`.
- Keyword scan for debt, drift, fallback, unsupported, residual, manual, and
  regression signals.
- Targeted reads of:
  - `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
  - `docs/status/capabilities/game-production.md`
  - `docs/status/capabilities/tooling-proof.md`
  - `docs/PRDs/README.md`
  - `docs/PRDs/proof-first-engine-loop-2026-07-05/README.md`
  - `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/README.md`
  - `tools/verify/src/adapterSurfaceDrift.test.ts`
  - `tools/verify/src/gameProductionGate.ts`
  - `tools/verify/src/cli/run.ts`
  - `tools/verify/src/release.ts`
  - `packages/authoring/src/operationRegistry.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/commands/registry.ts`

No verification commands were run because this was a documentation-only
exploration with no executable code changes.

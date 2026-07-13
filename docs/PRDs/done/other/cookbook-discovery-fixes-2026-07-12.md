# Cookbook Discovery Fixes

Date: 2026-07-12
Status: Complete - Fixes 1-5 implemented; related files committed together
Scope: `packages/cli/src/cookbook/`, `packages/cli/src/commands/cookbook.ts`,
`packages/cli/src/commands/game.ts`, `docs/cookbook/*.md`, packaged CLI data.

## Implementation status (2026-07-12)

Done in this change:

- `packages/cli/src/cookbook/match.ts` - weighted token matcher
  (`matchCookbookEntries`, `bestCookbookMatch`, `matchCookbookEntryForBlock`,
  `COOKBOOK_MATCH_FLOOR = 3`; weights: keyword/id 3, surface 2, goal/category 1;
  plural-stripping tokenizer).
- `parse.ts` accepts optional `keywords:`/`blocks:` frontmatter lists.
- `tn cookbook search <query> --json` (top 5 above floor,
  `TN_COOKBOOK_SEARCH_OK`/`TN_COOKBOOK_SEARCH_EMPTY`), registry usage line
  updated in `packages/cli/src/index.ts`.
- Unknown-id paths suggest the best keyword match above the shared floor and
  otherwise point at the complete list; errors also teach `tn cookbook search`.
- `game.ts`: `cookbookForGoal` and `cookbookForGameplayBlock` hardcoded maps
  deleted; both derive from cookbook entry metadata loaded once per
  `tn game plan` invocation.
- `keywords:`/`blocks:` backfilled on the 10 previously hardcoded entries
  (player-move-wasd, follow-camera, collectible-respawn, kinematic-hazard,
  lane-runner-spawn, checkpoint-race-progress, physics-knockdown,
  trigger-zone-win, fail-retry-reset, sound-cue).
- Tests: `match.test.ts` (self-reachability top-3 for every entry's own goal,
  goal/block parity snapshots, descriptor-backed blocks validation) and
  search/suggestion tests in `cookbook.test.ts`.
- Docs: `FORMAT.md` documents the new fields; `docs/STATUS.md` +
  `docs/status/capabilities/authoring.md` claims updated.
- Shipped workflow guidance teaches `tn cookbook search`, and every tracked
  cookbook entry owns useful `keywords:` metadata.
- Cookbook `blocks:` metadata is validated against descriptor ids derived from
  the owning game-plan block builder rather than a copied shape allowlist.
- The CLI command descriptor owns `cookbook_lookup` MCP exposure; MCP delegates
  show/search to the same packaged CLI JSON paths and matcher.

## Completion verification

- Focused cookbook matcher/command tests: 13/13 pass.
- MCP package tests: 18/18 pass; CLI and MCP typechecks pass.
- `pnpm check:docs`: pass.
- `pnpm verify:cookbook`: pass for the tracked cookbook set. An unrelated
  untracked prose-only cookbook draft was temporarily excluded and restored
  because repository discovery otherwise treats it as an invalid entry.
- `pnpm test`: all related coverage passes; the CLI package has one unrelated
  flaky model-test turntable artifact race, which passes when rerun in
  isolation.
- `pnpm verify:conformance`: unrelated Bevy overlay-host compile failure because
  dirty tests import symbols gated behind the `native-webview` feature.

## Problem

The cookbook (34 validated entries in `docs/cookbook/`) is only reachable by
exact id (`tn cookbook show <id>`) or a full list dump (`tn cookbook list`).
Discovery quality therefore depends on two hand-maintained keyword maps inside
`game.ts` that violate the "no second hand-maintained adapter list" work rule
and silently exclude newer entries from ever being recommended.

Grep does not solve this for the primary audience. Scaffolded game projects
(`templates/structured-source-starter`, `structured-source-minimal`,
`racing-kit-rally-starter`) ship no `docs/cookbook/` copy; the entries live
only in the packaged CLI at `dist/data/cookbook` inside `node_modules`
(copied at build time by `packages/cli/scripts/copy-templates.mjs:47` and
resolved at runtime by `resolveCookbookDirectory` in
`packages/cli/src/commands/cookbook.ts:64`). Any discovery improvement must
work through the `tn` surface against the shipped copy, not against a source
checkout.

## Non-goals (explicitly rejected)

- No embeddings, vector index, or fine-tuned matcher. 34 entries; token
  overlap is enough (strategy already recorded in the scaffold-agent-skills
  decision: no micro-LLM query router).
- No caching of `loadCookbookEntries`. Re-parsing 34 small files per
  invocation is negligible.
- No re-fix of dead cookbook ids in `tn game plan`. Already guarded:
  `packages/cli/src/commands/gameScore.test.ts:214` asserts every emitted
  `cookbookId` exists, and `tools/verify/src/emittedCommandGate.ts:110` runs
  `tn cookbook show` for each.

## Fix 1 - Entry-owned matching metadata (registry-first)

Make the cookbook entries themselves own the vocabulary that maps goals and
gameplay blocks to entries.

1. Extend the frontmatter contract in `docs/cookbook/FORMAT.md` with two
   optional list fields:
   - `keywords:` free-text tokens an agent or goal string might use
     (e.g. `collectible-respawn` gets `coin`, `pickup`, `gather`, `respawn`).
   - `blocks:` gameplay block ids or `prefix.*` patterns this entry serves
     (e.g. `follow-camera` gets `camera.*`; `checkpoint-race-progress` gets
     `objective.checkpoint-lap`).
2. Extend `ICookbookEntryFrontmatter` in
   `packages/cli/src/cookbook/parse.ts:1` with `keywords?: string[]` and
   `blocks?: string[]`. Both optional; missing fields mean "match on
   id/goal/surfaces only". No new required-section validation.
3. Backfill `keywords`/`blocks` on the entries currently reachable only via
   the hardcoded maps: `player-move-wasd`, `follow-camera`,
   `collectible-respawn`, `kinematic-hazard`, `lane-runner-spawn`,
   `checkpoint-race-progress`, `physics-knockdown`, `trigger-zone-win`,
   `fail-retry-reset`, `sound-cue`. Other entries can gain keywords
   opportunistically.

Shipping note: frontmatter changes ride along automatically -
`copy-templates.mjs` copies `docs/cookbook` verbatim into the package, so the
metadata is present in every installed CLI. No packaging change needed, but
`pnpm verify:cookbook` must keep passing since it executes entries verbatim.

## Fix 2 - One matcher, three call sites

Add `packages/cli/src/cookbook/match.ts`:

```ts
export interface ICookbookMatch { entry: ICookbookEntry; score: number; }
export function matchCookbookEntries(query: string, entries: readonly ICookbookEntry[]): ICookbookMatch[];
export function matchCookbookEntryForBlock(blockId: string, entries: readonly ICookbookEntry[]): ICookbookEntry | undefined;
```

Scoring: lowercase, tokenize on non-alphanumerics, then weighted overlap of
query tokens against entry tokens - suggested weights: keyword hit 3, id-token
hit 3, surface hit 2, goal-token hit 1, category hit 1. Return matches sorted
by score, ties broken by id. Callers apply their own floor.

Wire it into the three existing consumers:

1. **`cookbookForGoal` (`packages/cli/src/commands/game.ts:1260`)** - replace
   the four hardcoded `matchesAny` branches with
   `matchCookbookEntries(goal, entries)[0]` above a score floor, falling back
   to the current `trigger-zone-win` default. Pass `entries` down from the
   game-plan handler (one `loadCookbookEntries` call per plan invocation);
   `mechanicRow`/`buildMechanicRows` gain an `entries` parameter rather than
   loading inside helpers.
2. **`cookbookForGameplayBlock` (`packages/cli/src/commands/game.ts:1216`)** -
   replace the six hardcoded `block.id` branches with
   `matchCookbookEntryForBlock`, which resolves `blocks:` frontmatter
   (exact id first, then `prefix.*` pattern). Delete both hand-maintained
   functions once parity tests pass.
3. **`nearestId` suggestion path (`packages/cli/src/commands/cookbook.ts:82`)**
   - on `TN_COOKBOOK_UNKNOWN_ID`, run the matcher over the failed id/query
   instead of thresholdless Levenshtein over ids only. If the best score is
   below the floor, suggest `tn cookbook list --json` instead of an unrelated
   id. (Today `tn cookbook show coin-pickup` suggests whatever id is
   edit-closest, however unrelated.)

## Fix 3 - `tn cookbook search <query>` (byproduct, registry-first)

Since the matcher exists, expose it:

1. Update the owning command registry entry first: the `cookbook` block in
   `packages/cli/src/index.ts:106` gains the
   `tn cookbook search <query> [--json]` usage line; help text derives from
   it.
2. In `cookbookCommand` (`packages/cli/src/commands/cookbook.ts:8`), add the
   `search` subcommand: join remaining positional args as the query, return
   top 5 as `{ code: "TN_COOKBOOK_SEARCH_OK", count, matches: [{ id, goal,
   category, score, surfaces }] }`. Zero matches above the floor returns the
   same shape with `count: 0` and a diagnostic suggesting
   `tn cookbook list --json` (exit 0 - empty search is not an error).
3. Mention the subcommand in the shipped template guidance
   (`templates/_shared/skills/threenative-workflow/SKILL.md` and the template
   `AGENTS.md` files) where `tn cookbook list`/`show` are already referenced,
   so agents in scaffolded projects learn it exists. This is the only channel
   that reaches the shipped audience.

## Fix 4 - Consistency tests (fail when one surface is missed)

Per the work rules, derivation must be guarded:

1. **Self-reachability**: for every cookbook entry, `matchCookbookEntries`
   over its own `goal` text returns that entry within the top 3. Lives next
   to `packages/cli/src/cookbook/parse.test.ts`. This is the drift test that
   fails when someone adds an entry whose goal vocabulary can never find it.
2. **Parity snapshot for removed maps**: pin the current behavior -
   goal "race around checkpoints" -> `checkpoint-race-progress`,
   "knock down targets" -> `physics-knockdown`, "collect coins" ->
   `collectible-respawn`, block `camera.follow` -> `follow-camera`,
   `objective.collectible` -> `collectible-respawn`, `spawn.lane` ->
   `lane-runner-spawn`, `controller.*` -> `player-move-wasd` - so the
   derived matcher cannot silently regress plan output.
3. **Blocks validity**: every `blocks:` value matches a known gameplay block
   descriptor id or prefix (cross-check against the descriptor registry used
   by `IGameplayBlockDescriptor`), so entry metadata cannot drift from the
   block catalog.
4. Existing gates (`gameScore.test.ts` dead-id check, `verify:cookbook`
   executable gate, `emittedCommandGate`) stay untouched and keep covering
   the emitted-command surface.

## Fix 5 (optional, separate change) - MCP exposure

`packages/mcp-server/src` has zero cookbook references while the MCP contract
(`docs/contracts/authoring-mcp.md:27`) hands out `cookbook: <id>` pointers on
operations. MCP-driven agents cannot fetch the entry they are pointed at
without shelling out to `tn`. Add a `cookbook_lookup` tool (show by id +
search by query) that reuses `loadCookbookEntries`/`matchCookbookEntries`
against the packaged data dir. Registry-first: derive the tool from the same
command descriptor rather than a second list. Defer if MCP surface work is
not currently prioritized.

## Ordering and verification

Land Fixes 1-4 as one change (they share the matcher; the parity tests in
Fix 4 gate the deletion of the hardcoded maps in Fix 2). Fix 5 is independent.

Verification, narrowest first:

```bash
pnpm --filter @threenative/cli test
pnpm verify:cookbook
pnpm test
pnpm verify:conformance
```

Docs to update in the same change: `docs/status/capabilities/authoring.md`
(cookbook lookup section, lines 35-36) plus the one-line index entry in
`docs/STATUS.md`; `docs/cookbook/FORMAT.md` for the new frontmatter fields.

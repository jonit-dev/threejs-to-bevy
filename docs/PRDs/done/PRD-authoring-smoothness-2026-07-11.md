# PRD: Authoring Smoothness — Post-Orb-Reactor Fixes and Features (2026-07-11)

`Planning Mode: Principal Architect`
`Status: done`

Implementation completed on 2026-07-11. Event schemas, structured cleanup,
workspace-aware scaffolding, selector/batch authoring, ownership diagnostics,
tick-based playtests, self-sufficient help, and iterate transparency are
implemented with focused regression coverage. The orb-reactor aggregate
iterate passed with nine enrolled web scenarios, including event emission and
win-state proof.

## 1. Context

The orb-reactor trial
(`docs/PRDs/AUTHORING-TRIAL-ORB-REACTOR-2026-07-11.md`, evidence in
`examples/orb-reactor`) confirmed the golden-path entry fixes hold: plan
routing, recipe proof commands, cookbook scripts, and resource-schema
inference all worked. The friction has moved from "getting started" to
"authoring the actual game": events, cleanup, proof-loop transparency, and
diagnostics that assume an engine checkout.

This PRD supersedes the trial report as the actionable list. Trial findings
already fixed in the working tree (browser `node:fs` import chain, module
bundler self-alias TDZ, starter tsconfig, `ScriptContext` command/event
typing) are captured here only as commit + regression-guard items.

Guiding constraint (trial finding N15): **an agent with no engine checkout
must be able to resolve every diagnostic from the CLI alone.** Five trial
findings required grepping engine source; on the distributed CLI each would
be a hard stall. Every item below includes its self-sufficiency surface
(help topic, fix payload, or schema output) as part of acceptance.

## 2. P0 — Commit and guard the applied fixes

### P0-1: Land the four working-tree fixes with regression guards

- `packages/ir` `./feedback` subpath + `context.ts` subpath import.
  Guard: a test that walks the runtime-web browser entry module graph with
  browser resolution conditions and fails if any `node:` specifier is
  reachable. (This class — value-importing the ir root from browser code —
  will recur without a gate.)
- `moduleBundler.ts` self-alias fix. Guard: a bundler test that BUNDLES AND
  EXECUTES a local module importing a stdlib helper by unchanged name
  (the 23 existing tests all passed while the emitted bundle threw at
  runtime; add an execution-level assertion, not a string snapshot).
- Starter template tsconfig (`Bundler` resolution). Guard: template CI runs
  `tn types generate && tsc --noEmit` on a freshly scaffolded project that
  contains a relative `lib/` import.
- `ScriptContext` `commands`/`events` typing. Guard: stdlib parity test
  already covers bundle-source; add a compile-check fixture using
  `context.commands.despawn` without casts.

## 3. P1 — Kill the remaining dead ends

### P1-1: Event schema authoring channel (trial N3)

`ctx.events.emit` is documented but unreachable from structured source.
Pick one (or both):

- Extend authored schema documents with `kind: "event"` (loader,
  validation, typegen), mirroring the existing resource shape; OR
- Infer event schemas from behavior metadata + literal payloads, mirroring
  the resource-schema inference that fixed F8 (preferred — zero new files).

Acceptance: a system with `eventWrites: ["match.win"]` and a literal
`events.emit("match.win", { collected: 0 })` builds green with no
hand-written schema; flow `event`-kind triggers fire from script emissions
in a playtest; `TN_IR_SYSTEM_EVENT_SCHEMA_MISSING` carries a paste-exact
fix payload naming the target file/metadata. At least one cookbook entry
and one enrolled example use events end-to-end (today: zero).

### P1-2: No raw-exception builds, round two (trial N4, F9 class)

A `kind: "event"` schema document present in `content/schemas/` produced
`TN_BUILD_FAILED: Cannot read properties of undefined (reading 'set')`.
Two fixes: (a) unknown schema-document kinds get an explicit diagnostic
instead of silent-skip-then-crash; (b) extend the P0-1 emit-pipeline wrap
from the previous PRD to this route. Acceptance: rebuilding the trial's
crashing input yields a structured diagnostic with file + path.

### P1-3: Iterate failure transparency (trial N6, N7)

- On screenshot/playtest step failure, `tn iterate` inlines what
  `tn doctor --url` already captures: page errors, console errors, and the
  first failing module. Acceptance: reintroducing the N1 browser break and
  running iterate names `node:fs/promises` in the report without any
  doctor invocation.
- Port hygiene: iterate/playtest either picks a free port or reports
  `TN_PREVIEW_PORT_IN_USE` naming the process, instead of Playwright's
  "execution context was destroyed". Acceptance: iterate passes (or fails
  with the named diagnostic) while a dev server holds 5173.

### P1-4: Workspace-aware scaffolding (trial N5)

`tn create` inside an enclosing pnpm workspace ships an `.npmrc`
(or workspace exclusion) so `pnpm install` produces local `node_modules`,
or detects the situation and emits the `--ignore-workspace` instruction in
`nextCommands`. Acceptance: scaffold inside this repo, run the emitted
commands verbatim, `pnpm run dev:web` and `pnpm run typecheck` both work.

## 4. P2 — Scaffold hygiene and cleanup debt (trial N10-N12)

### P2-1: Removal commands

`tn scene remove-entity`, `remove-ui-node`, `remove-resource`, and
`tn remove <block>` (inverse of `tn add`, deleting the mechanic doc, its
scene entities, its playtest, and its resources). Reference-aware: removal
either cascades bindings/systems or reports each dangling reference with a
fix. Acceptance: the manual JSON surgery performed in the orb-reactor trial
(scaffold entities, inline UI bindings, spawner grid) is reproducible with
CLI commands only.

### P2-2: Recipe/block output parity with the cookbook

- Recipe scripts must be real implementations, not empty stubs — reuse the
  cookbook bodies that already pass the compile + no-empty-export gate
  (the F4 fix built the gate; point recipes at the same source of truth).
- The top-down recipe's movement system reads MoveX AND MoveZ.
- `tn actor add pickup` gets a visible default prefab and a `--shared`
  mode that registers one shared system for N instances instead of a stub
  script + systems file per pickup.
- `tn add spawner` (and any block that spawns geometry) takes
  `--position/--scale` and defaults to something that does not dominate
  scene center. Acceptance: fresh scaffold screenshot shows no
  placeholder geometry larger than the player.

### P2-3: Single ownership for systems and UI attachments

Recipes write systems and UI into the scene document; blocks and `tn ui`
write sibling `content/systems/*.json` and `content/ui/*.json`. Pick the
content-file registry as owner, migrate recipe output, and add a drift
diagnostic for scene-inline duplicates. Acceptance: a fresh recipe apply
writes zero systems/UI into the scene doc.

## 5. P3 — Efficiency features (new)

### P3-1: Tag- or pattern-scoped command declarations

The trial needed eight literal `{ kind: "despawn", entity: "orb.0N" }`
declarations. Support either entity tags
(`commands: [{ kind: "despawn", tag: "orb" }]`) or id globs
(`entity: "orb.*"`), validated against the scene at build time.
Acceptance: orb-reactor's `collectOrbs` declares one line for all orbs and
still fails validation if a despawn targets an id/tag not in the scene.

### P3-2: Batch instance placement

`tn scene add-prefab-instances arena --prefab prefab.orb --positions
"x,y,z;x,y,z;..." --components '<json>'` (or `--ring/--grid` generators).
Acceptance: the 8-orb placement is one command.

### P3-3: Playtest ergonomics (trial N13, N14)

- Express steps in fixed ticks (`holdTicks`) with a documented
  frame<->tick relation; `tn playtest schema` states the timing model.
- A `wait` step kind (today: hold an unbound key).
- `tn playtest scaffold` reads the project and targets real entity ids,
  resource ids, and HUD node ids instead of `pickup`/`score-label`/
  `GameState` placeholders.
- Movement assert gains `pathLength` alongside net-displacement.
  Acceptance: the orb-reactor drone-hit scenario is writable on the first
  attempt using tick counts derived from patrol speed, no calibration runs.

### P3-4: Distributed-CLI self-sufficiency audit (trial N15)

Add `tn help` topics (or extend `tn playtest schema`-style JSON surfaces)
for: command declaration shapes, event/resource schema channels, flow
trigger kinds and their resource-lookup semantics, and the playtest timing
model. Gate: a doc test walks every diagnostic in the catalog and asserts
its fix/docs pointer resolves to a shipped help topic or contract doc —
no `packages/**` or engine-source path may appear in any agent-facing
suggestion string. Acceptance: replaying the five engine-source greps from
the trial, each answer is reachable via `tn help`/schema output alone.

### P3-5: Anti-proof-theater at iterate level (F3 completion)

`tn iterate` (not just `game score`) warns when registered systems have
empty bodies or when no scenario asserts a gameplay-caused resource
change. Acceptance: fresh scaffold iterate reports "scaffold-only, gameplay
unproven" while still exiting green on build health; orb-reactor reports
proven.

## 6. Verification

Narrow first: new bundler execution test, browser-import-graph gate,
template scaffold CI, event-schema round-trip test, then
`pnpm verify:cookbook`, `pnpm verify:emitted-commands`,
`tn iterate --project examples/orb-reactor --json` green with the three
proof scenarios, then `pnpm build && pnpm typecheck && pnpm test`.

## 7. Non-goals

Benchmark gate redesign (positioning discussion is separate), typed-spec
authoring, MCP transport, native pickup parity (tracked with coin-patrol),
new rendering work.

# Authoring Trial: Orb Reactor (2026-07-11, post-golden-path-fixes)

`Status: findings recorded; engine fixes applied in working tree`

## 1. What was built

`examples/orb-reactor` — top-down arena: collect 8 orbs before a 45s meltdown
countdown, avoid 2 patrolling drones (1 life per hit, 3 lives), HUD for
orbs/lives/time/status, win and lose states. Primitives only, by design.
Deliberately exercises the two newest features: the `tn add timer` runtime
countdown primitive and project-local script modules
(`src/scripts/lib/rules.ts` imported relatively by all four systems).

Proof: `tn iterate` green (validate/build/screenshot/playtest);
`proof-pickup` (Orbs.collected 0->1, HUD "Orbs 1/8", Match.started flips),
`proof-drone-hit` (Lives 3->0 across cooldown-separated sweeps, lose path),
`proof-timer` (RoundTimer.remaining 44.2->35.7, HUD text). Playtest files in
`examples/orb-reactor/playtests/proof-*.playtest.json`.

## 2. Verdict vs the 2026-07-11 coin-patrol trial

**The golden-path entry is clearly better.** Everything the friction PRD
(`docs/PRDs/done/PRD-authoring-golden-path-frictions-2026-07-11.md`) claimed
fixed held up:

| Old | Status this trial |
|---|---|
| F1 wrong recipe routing | FIXED — plan emitted `top-down-collector` for the top-down goal |
| F2 nonsense proofCommands | FIXED — recipes emit `tn playtest scaffold --assert pickup` |
| F4 hollow cookbook scripts | FIXED — `kinematic-hazard` etc. ship real dual-axis, cooldown-guarded implementations |
| F5 missing MoveZ | FIXED — starter input map has MoveZ with W/S |
| F6 input device double-prefix | not re-tested (no input edits needed) |
| F8 hand-written resource schemas | FIXED — never wrote `resources.schema.json`; inference from literal defaults worked |
| F3 proof theater | PARTIAL — `tn iterate` still passes end-to-end with only recipe stub systems registered (observed directly before authoring gameplay) |
| F9 raw-exception builds | REGRESSED IN A NEW SPOT — see N6 |

**But the mid-game (past scaffolding, into real systems) is where friction
now lives**, and two same-day engine regressions broke the runtime outright.

## 3. New findings (N1-N15), in order encountered

### Runtime-breaking engine bugs (both fixed in this working tree)

- **N1 — Web preview black-screened for every project.** The uncommitted
  gameplay-primitives change made
  `packages/runtime-web-three/src/systems/context.ts` value-import
  `feedbackPresetById` from the `@threenative/ir` ROOT index, which
  transitively reaches a static `node:fs/promises` import
  (`validate.js -> assetValidation.js`); Vite externalizes it into a throwing
  proxy and the whole browser module graph dies at init. Fix applied: new
  `./feedback` subpath export in `packages/ir/package.json` + subpath import
  in context.ts (same pattern as `bundlePaths`/`input`/`runtimeConfig`).
  Guard wanted: a test that imports the runtime-web browser entry graph in a
  browser-like resolver and fails on any `node:` reachability.
- **N2 — Project-local script modules (flagship new feature) crashed on
  first real use.** `moduleBundler.ts` emitted
  `const defineBehavior = defineBehavior;` (self-referential TDZ) for any
  stdlib named import inside a wrapped local module. All 23 existing bundler
  tests passed without catching it — none execute a bundle that imports a
  helper by unchanged name from inside a local module. Fix applied: skip the
  self-alias (outer top-level stdlib alias is already in scope).

### Authoring-layer dead ends

- **N3 — Script events are unusable from structured source.**
  `ctx.events.emit` is documented as implemented, but: behavior-metadata
  `eventWrites` accepts strings only; there is NO channel to declare an event
  schema (authored schema documents accept `component`/`resource` kinds only
  — a `kind: "event"` file is silently ignored); build then fails
  `TN_IR_SYSTEM_EVENT_SCHEMA_MISSING` with no fix payload. Consequence: flow
  `event`-kind triggers are unreachable from scripts, and zero example games
  use events. Worked around with `resourceEquals` flow triggers on
  `Match.outcome`. This needs either metadata-object event declarations
  (mirroring the resource-schema inference fix) or an `event` schema-document
  kind.
- **N4 — F9's class is alive.** With the ignored `kind:"event"` schema file
  present, `tn build` died with raw `TN_BUILD_FAILED: Cannot read properties
  of undefined (reading 'set')` — no file, no path. The P0-1 "no
  raw-exception builds" wrap does not cover this route.

### Golden-path environment traps

- **N5 — `pnpm install` inside the engine repo silently attaches the new
  project to the monorepo workspace**: no local `node_modules`, so the
  scaffolded `pnpm run dev:web` fails with `tn: command not found` and
  typecheck can't resolve `@threenative/script-stdlib`. Workaround:
  `pnpm install --ignore-workspace`. `tn create` should ship an `.npmrc` or
  detect an enclosing workspace and say so.
- **N6 — Port collision kills iterate cryptically.** With a dev server
  already on 5173, the iterate playtest step fails with Playwright's
  "Execution context was destroyed, most likely because of a navigation".
  Should pick a free port or name the conflict.
- **N7 — `tn iterate` screenshot failures are a black box; `tn doctor --url`
  is the tool that actually works.** The iterate report on a dead preview
  carries no browser console or page errors; doctor captured the exact
  exception both times (N1 and N2 were only diagnosable through it). Iterate
  should inline doctor's page-error capture on screenshot failure.
- **N8 — Starter tsconfig contradicted the product.** `NodeNext` resolution
  rejects the extensionless relative imports the local-modules cookbook
  teaches AND the scaffold's own generated-types import
  (`../../.threenative/types/project-context`), so the scaffolded
  `pnpm run typecheck` could never pass. Fixed in
  `templates/structured-source-starter/tsconfig.json` -> `Bundler`
  resolution. After the fix, typecheck caught real errors (ProjectEntityId
  literal narrowing), i.e. it is valuable when it runs.
- **N9 — stdlib `ScriptContext` type omits `commands` and `events`** — they
  fall through the `[surface: string]: unknown` index signature, so the
  documented command-buffer API is a type error (`context.commands` is
  `unknown`). Fixed in `packages/script-stdlib/src/script-context.ts`.

### Scaffold hygiene / cleanup debt

- **N10 — Recipes and blocks scatter demo content across three registries
  with no removal commands.** This trial had to hand-edit JSON to delete:
  demo entities `coin.01`/`goal`/`goal.plan` (recipe), scene-INLINE ui
  nodes/bindings (recipes write UI into the scene doc while `tn ui` owns
  `content/ui/hud.ui.json`), scene-attached systems (recipes) vs
  `content/systems/*.json` (blocks), a dangling `goal.plan.collected`
  binding after entity removal, and four giant `spawner.grid.*` boxes that
  `tn add spawner` (a verbatim plan command) dumped at scene center. There is
  no `tn scene remove-entity/remove-ui-node`; `--replace` on
  `add-prefab-instance` cannot adopt an existing entity id.
- **N11 — Recipe scripts are still empty stubs** (`collectible.ts` was
  `export function collectible(): void {}` — not even registered), and the
  top-down recipe's movement system reads MoveX only, so the scaffolded
  "top-down" game cannot move vertically. The cookbook teaches well now; the
  recipes don't match it.
- **N12 — `tn actor add pickup` produces an invisible actor** (trigger
  collider + bob, no prefab/mesh) plus one stub script and one systems file
  per instance — 8 pickups would mean 8 dead files.

### Proof loop

- **N13 — Playtest timing is opaque.** `holdFrames` is not fixed ticks
  (~0.09s of sim per held frame observed); a 24-frame walk overshot 5x into
  the arena clamp. Calibration took three runs. Also the `movement` assert
  measures net displacement, not path length.
- **N14 — `tn playtest scaffold` emits generic asserts referencing entities
  and resources that do not exist in the project** (`pickup`, `score-label`,
  `GameState`). It should read the scene/resources and target real ids.

### The strategic one

- **N15 — Five of these frictions were only resolvable by grepping engine
  source** (browser import chain, moduleBundler emit, event-schema
  validation path, flow trigger semantics, `CommandDeclaration` object
  shape). On a distributed CLI, none of that is possible; each of these would
  be a hard stall. The bar for `tn help`/docs/diagnostics has to be: an agent
  with NO engine checkout can answer "how do I declare a command / an event
  schema / a flow trigger / how long is a playtest frame" from the CLI alone.

## 4. Engine changes applied during this trial (uncommitted)

- `packages/ir/package.json` — add `./feedback` subpath export (N1)
- `packages/runtime-web-three/src/systems/context.ts` — import
  `feedbackPresetById` via subpath; remaining ir-root imports type-only (N1)
- `packages/compiler/src/scripts/moduleBundler.ts` — skip self-referential
  helper alias in wrapped modules (N2)
- `packages/script-stdlib/src/script-context.ts` — type `commands` and
  `events` surfaces (N9); `bundle-source.generated.ts` regenerated
- `templates/structured-source-starter/tsconfig.json` — `module: ESNext`,
  `moduleResolution: Bundler` (N8)

Verified with: compiler/stdlib package tests (23/23 bundler tests, stdlib
parity test), `tn iterate` green on orb-reactor, three proof playtests.

## 5. Suggested priority

1. N3 event-schema channel (unblocks flows/feedback; mirrors the F8 fix)
2. N7+N6 iterate failure transparency (doctor-grade page errors, port hygiene)
3. N10-N12 scaffold cleanup debt (remove commands, visible pickups, stub parity with cookbook)
4. N15 distributed-CLI self-sufficiency audit of help/diagnostics
5. N13-N14 playtest timing docs + scenario scaffolds that read the project

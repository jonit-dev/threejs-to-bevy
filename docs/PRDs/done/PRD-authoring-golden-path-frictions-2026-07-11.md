# PRD: Close the Remaining Authoring Golden-Path Frictions (2026-07-11)

`Planning Mode: Principal Architect`
`Status: completed`

## 1. Context

Hands-on trial (2026-07-11, this repo): an agent scaffolded
`examples/coin-patrol` with `tn create`, ran `tn game plan` for a fresh goal
("collect 10 coins, avoid 2 patrolling drones, 3 lives, HUD"), executed every
plan-emitted command verbatim, and authored the real gameplay. The trial
project is preserved at `examples/coin-patrol`, enrolled as a build-only example
until native pickup parity is available, with its build and web proof repaired.

**What the 2026-07-09 fixes got right (verified working):** `tn create` and
`pnpm install` clean; all 6 plan-emitted commands exit 0; `tn recipe apply`
transactional and adoption-aware; `tn iterate` emits exactly one JSON object
on stdout, native opt-in, 5/5 scenarios scoped and passing; diagnostics
mostly carry `fix` payloads. The emitted-commands gate did its job.

**What still breaks, in the order encountered:**

| # | Defect | Evidence |
|---|---|---|
| F1 | Plan routes wrong recipe: goal classified `top-down`, `top-down-collector` ranked first in kitCandidates, yet the movement row emits `tn recipe apply lane-runner` (lane movement, obstacle-avoid objective, distance score) for a free-movement collector. Executable but semantically wrong; agent inherits a wrong-genre controller plus dead stubs. | plan output for coin-patrol goal |
| F2 | Recipe proof commands are template nonsense: collectible recipe's own proofCommands include `tn playtest --entity goal.plan --press KeyD --expect-moved` — pressing a key and expecting the COLLECTIBLE to move. Running it fails and burns steps. | recipe apply collectible output |
| F3 | Proof theater: recipes register systems (`lane-runner`, `goal.plan.collect`) whose script bodies are empty stubs, yet all 5 iterate playtests pass. The golden path is green with zero gameplay authored, so scenario-pass cannot distinguish scaffold from game. | iterate-1 report, 5/5 pass on stubs |
| F4 | Cookbook teaching payload is hollow: EVERY inspected entry (`collectible-respawn`, `kinematic-hazard`, `trigger-zone-win`, `hud-score-binding`, `player-move-wasd`, `top-down-collector-recipe`) has the same script section — X-axis movement boilerplate plus an empty stub named after the pattern (`triggerZoneWin(): void {}`). `player-move-wasd` claims WASD but moves only on MoveX. `hud-score-binding` hedges with `resources.set?.(...)`. The commands pass CI; the script knowledge an agent actually needs (sensors, resource patches, respawn) is absent — this is the meta-recipe Goodhart the round-4 review predicted. | cookbook show outputs |
| F5 | Starter input map contradicts genre: no MoveZ axis; W bound to `jump` in a top-down template. | content/input/arena.input.json |
| F6 | `tn input add-axis` double-prefixes device: passing `keyboard.KeyW` (the exact format the input document itself uses) produces `keyboard.keyboard.KeyW` and fails. Flag help does not state bare codes are required. | TN_INPUT_KEYBOARD_CODE_INVALID |
| F7 | Diagnostic cites dead cookbook ID: `TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED` fix payload references cookbook `script-portable-system`, which `tn cookbook show` rejects (`TN_COOKBOOK_UNKNOWN_ID`). Same drift class as the audited plan IDs, now in the diagnostics channel, which has no drift gate. | build output + cookbook show |
| F8 | Resource-schema friction half-fixed: `reads resource without a schema` now ships a fix.snippet (good) but names no target file path, and the schema is still hand-written where it could be derived from `resources.get/patch` defaults. Recurred in all 4 benchmark sessions; recurred here. | TN_COMPILER_EMITTED_INVALID_BUNDLE |
| F9 | **Following F8's own fix.snippet verbatim crashes the build with a raw exception**: `TN_BUILD_FAILED: object is not iterable` — no file, no path, no diagnostic code detail. Root cause found only by engine-source grep (the churn class the benchmark ratchets to zero): the snippet shows the BUNDLE IR shape (`schemas` as an object map), but the authoring loader (`packages/compiler/src/emit/structured-documents.ts::structuredSchemaFile`) expects `kind:"schema"` documents with `data.kind:"resource"` and `data.schemas` as an ARRAY of `{id, fields}`. The prescriptive diagnostic prescribes the wrong document shape, and the mismatched file is then iterated unguarded somewhere in the build. | examples/coin-patrol/content/schemas/resources.schema.json is the crashing repro |

The follow-up execution reached the pickup, lives, win-state, and HUD/resource
playtest scaffolds. Native pickup parity remains an explicit blocker, so Coin
Patrol stays build-only rather than claiming a native pass.

## 2. Solution — execution items, in order

### P0-1: Kill raw-exception builds (F9)

Any uncaught error in `tn build`/`tn iterate` must surface as a structured
diagnostic naming the offending source file. Wrap the emit pipeline;
attribute the failing document. Acceptance: building
`examples/coin-patrol` as-is reports the schema-document shape error with
file + path + fix, not "object is not iterable".

### P0-2: Fix the schema-snippet shape drift and derive the file (F8, F9)

- Correct the fix.snippet in the missing-resource-schema diagnostic to the
  authoring shape, and include the exact target path
  (`content/schemas/<doc>.json` convention) in fix.instruction.
- Better: auto-derive the resource schema from `defineBehavior` metadata +
  `resources.get(name, defaults)` default shapes at build time, keeping the
  authored file optional. Acceptance: a project with resourceReads/Writes
  and no schema file builds green or receives a paste-exact full-file fix.
- Add a snippet-validity test class: every diagnostic fix.snippet that
  claims to be a document must round-trip through the authoring loader.

### P0-3: Drift-gate every cross-reference channel (F7, extends emitted-commands gate)

The emitted-commands gate covers plan output; diagnostics and cookbook
entries also emit IDs and commands. Add a test that walks the diagnostic
catalog (and cookbook `proof`/`commands` strings) and asserts every
referenced cookbook ID exists and every command parses against the CLI
registry. Acceptance: F7's dead `script-portable-system` reference fails CI.

### P1-4: Give cookbook entries real teaching payloads (F4)

For each gameplay entry, the `script` section must contain a compilable,
bundler-legal (self-contained) system that actually implements the pattern:
sensor/trigger handling, resource patch + HUD binding, respawn, hazard hit
with cooldown. Reuse `examples/coin-patrol/src/scripts/player.ts` —
`coinPatrolRules` demonstrates collect + lives + win/lose in one
bundler-compliant system. Enforce with a test: every cookbook script
compiles through the real script bundler and contains no empty-body export.
`player-move-wasd` must move on both axes and its template must ship MoveZ
(F5) with W unbound from jump for top-down.

### P1-5: Plan routing correctness (F1, F2)

- The movement row's recipe must match the classified archetype: top-down
  goal -> `top-down-collector` recipe, never `lane-runner`. Derive the
  mechanic->recipe mapping from the kit registry (the correct candidate was
  already ranked first — use it).
- Recipe proofCommands must be surface-appropriate: collectibles get a
  pickup assertion (`tn playtest scaffold --assert pickup`), not
  press-and-expect-moved on a static entity. Extend the emitted-commands
  gate to assert proof commands SEMANTICALLY apply (entity kind vs
  assertion kind), not just exit 0.

### P1-6: Anti-proof-theater ratchet (F3)

`tn game score`/`qa` (or iterate) should flag registered systems whose
exports are empty bodies, and the generated-game gate should require at
least one scenario asserting a resource/HUD change caused by gameplay (the
playtest DSL already supports resource asserts). Acceptance: the freshly
scaffolded plan output does NOT pass a "gameplay proven" bar until a
non-stub system mutates a declared resource under test.

### P2-7: Input CLI ergonomics (F6)

`--negative-keys`/`--positive-keys` accept both bare codes and
device-prefixed forms (strip a duplicate `keyboard.` prefix), and the help
string states the accepted form. One normalization function + test.

### P2-8: Finish the trial as the acceptance run

Repair `examples/coin-patrol` using the fixed pipeline (correct schema doc,
playtest scaffolds for pickup/win-state/lives), enroll it or delete it per
example-manifest policy, and only then schedule the measured round-5B
benchmark rerun (per `tools/agent-benchmark/OFF-RECIPE-ROUND-4-RECOMMENDATIONS-2026-07-07.md`
decision rule).

## 3. Verification

Narrow first: the new snippet-round-trip and cookbook-compile tests, then
`pnpm verify:emitted-commands`, `pnpm verify:cookbook`, then
`tn iterate --project examples/coin-patrol --json` green with a pickup
assertion, then `pnpm build && pnpm typecheck && pnpm test`.

## 4. Execution evidence

- P0-1/P0-2: schema-shape failures now return structured file/path/fix
  diagnostics; literal `resources.get/set/patch` defaults contribute inferred
  resource fields without overwriting authored field kinds.
- P0-3/P1-4: `pnpm verify:cookbook` passes all 25 entries, including diagnostic
  and CLI cross-reference checks, real script bundling, and empty-export checks.
- P1-5/P1-6: `pnpm verify:emitted-commands` passes 10 template/archetype cases
  with zero unexpected failures; active recipe application is derived from
  recipe descriptors, semantic pickup proof is enforced, and fresh scaffold
  proof failures require the game-quality anti-proof diagnostic.
- P2-7/P2-8: input normalization/help, Coin Patrol pickup/lives/win scenarios,
  build-only enrollment, `pnpm build`, `pnpm typecheck`, and focused package
  tests pass. The exact `tn iterate --project examples/coin-patrol --json`
  run passes five web scenarios; native pickup parity is not claimed.

## 5. Non-goals

Typed game-spec authoring (measured worse), MCP transport, new rendering
work, benchmark gate redesign beyond the proof-quality weighting already
agreed in the round-4 recommendations.

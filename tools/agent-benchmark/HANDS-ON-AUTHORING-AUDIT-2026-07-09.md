# Hands-On Authoring Audit - 2026-07-09 (Round 5B input)

Method: a fresh agent session (Claude, this repo, no benchmark sandbox)
scaffolded a project with `tn create` and followed the tool's own guidance
verbatim toward a checkpoint-race goal, logging every step and failure. This
is not a measured benchmark run; it is a defect audit of the paved road the
benchmark agents are being asked to walk.

Headline: **the round-3/4 adoption fixes landed and work** (`bin/tn` shim,
`tn game plan` mechanic decomposition, `tn iterate`, cookbook, compact scene
inspect). But **the golden path breaks at the first mutation**: every
`tn recipe apply` invocation in this trial failed, and the plan command emits
commands and cookbook IDs that do not exist. 13 tool steps produced zero
lines of authored gameplay. That, not instruction adoption, is where the
47-53 step medians now come from: each broken emitted command costs a
3-6-step repair detour, and after the first few failures the agent rationally
abandons the tooling and hand-authors everything - which is exactly the
42-60-step, 3.6x profile in the round-5 data.

## Step ledger (verbatim trail)

| # | Command | Result |
|---|---------|--------|
| 1 | `tn create trial-race --json` | OK. `bin/tn` shim present (round-3 fix landed). |
| 2 | `tn game plan --goal "checkpoint race..."` | OK, 7.0 KB. Real mechanic decomposition with per-mechanic command + cookbookId + proof. But commands carry `<scene-id>` placeholders and (see 6, 15) wrong flags and wrong cookbook IDs. |
| 3 | `tn scene inspect --project . --json` | FAIL `TN_SCENE_INSPECT_ID_MISSING`. Error shows usage but does not list the one available scene ID. |
| 4 | `tn authoring inspect` | OK but paths-only: no entity/system/resource ID map (round-3 suggestion 5 "project map" never landed). |
| 5 | `tn scene inspect arena` | OK, compact and excellent (1.0 KB, all IDs). |
| 6 | `tn recipe apply vehicle-checkpoint --scene arena --entity player --camera camera.main` (the plan's own emitted command, placeholders filled) | FAIL `TN_AUTHORING_RECIPE_ARG_MISSING vehicleId`. The plan emitted `--entity`; the recipe wants a vehicle flag. Error reports only the FIRST missing arg. |
| 7 | `tn recipe vehicle-checkpoint --help` | Accidentally useful: bare run prints all three required args (sceneId, vehicleId, cameraId) - but no flag spellings. |
| 8 | `grep vehicleId packages/cli/src` | The flag is `--vehicle`. **Required an engine-source grep** - a churn class the round-5B admissibility conditions ratchet to zero, and impossible in the benchmark sandbox. |
| 9 | `... --vehicle-id player` | FAIL (guessed flag). |
| 10 | `... --vehicle player` | FAIL `TN_AUTHORING_DUPLICATE_ENTITY_ID 'player'`. The recipe only CREATES entities; it cannot adopt the starter's existing `player`. The default starter and the plan's default recipe are incompatible out of the box. Response claims `filesWritten: [scene, input]` although everything rolled back. |
| 11 | `... --vehicle kart` | FAIL `TN_AUTHORING_SCRIPT_EXPORT_MISSING vehicleCheckpointSystem` - the recipe registers a system whose script body it does not scaffold and whose expected signature it does not print. Chicken-and-egg. |
| 12 | same command retried | FAIL differently: `TN_AUTHORING_DUPLICATE_PREFAB_ID 'kart.prefab'`. Step 11's failed apply left partial state; **recipe apply is not transactional and not idempotent**, so the natural agent behavior (fix, retry) compounds the failure. |
| 13 | `tn authoring validate` | OK, 0 diagnostics - the orphaned partial state is invisible to validation. |
| 14 | `tn iterate --project . --json` | FAIL. (a) stdout is not JSON: Bevy log lines + `NVVM compilation failed: 3` precede the object, breaking structured parsing. (b) The starter's own native smoke playtest exits SIGSEGV with the zero-information diagnostic "harness exited with signal SIGSEGV" (the round-4 "runtime black box", still unfixed). Web scenarios passed; the env-fragile native lane fails the whole loop by default. |
| 15 | `tn cookbook show objective.checkpoint-lap` (ID cited by `tn game plan`) | FAIL `TN_COOKBOOK_UNKNOWN_ID`. 4 of the 6 decomposition rows cite nonexistent cookbook IDs (`objective.checkpoint-lap`, `controller.vehicle-cardinal`, `camera.position-follow`, `fail-retry-reset` variants) where the real registry has `checkpoint-race-progress`, `player-move-wasd`, `follow-camera`. |

## Diagnosis

Round 3 concluded "the tools exist, agents never used them" and fixed the
instruction channel. Round 4 confirmed adoption. This trial shows the next
layer: **when an agent does trust and use the tools, the tool-emitted
commands themselves fail**, and each failure both costs repair steps and
(per the round-3 cause-2 analysis) burns the credibility of every remaining
documented surface. The plan command is a router that routes to dead ends:
wrong flags, nonexistent cookbook IDs, recipes that cannot bind to the
scaffold the same CLI just created. This is precisely the drift class the
repo's own CLAUDE.md rule forbids ("do not add a second hand-maintained
adapter list...") - the plan's command/cookbook strings are hand-maintained
copies of truths owned elsewhere, with no drift test.

Step math: median TN off-recipe runs spend ~41K tokens/step of replay. The
gate needs <= 28 steps. This trial burned 10 steps on a single recipe
mutation that never landed. Fixing the emitted-command layer is worth more
than any new capability.

## Guidance, in priority order

### 1. Every tool-emitted command must run green, enforced by test (highest leverage)

Extend round-3 suggestion 2 from "the entry point works" to "**every command
string any `tn` response emits works**". Concrete gate: an acceptance test
that scaffolds each starter template to a temp dir, runs `tn game plan` for
one goal per archetype, then executes every command in
`mechanicDecomposition[].command`, `archetypeSuggestions[].command`, and
`proofCommands[]` verbatim (placeholders bound from `tn scene inspect`), and
asserts exit 0. Same for every `cookbookId` the plan emits:
`tn cookbook show <id>` must succeed. Today this test fails at least four
ways on the default template; that is the benchmark failing in CI form,
reproducible in seconds instead of a $$ measured round.

### 2. Make `tn recipe apply` transactional, idempotent, and adoption-capable

- All-or-nothing: pre-flight all validations against an in-memory copy;
  write only on full success. Never report `filesWritten` on failure.
- Idempotent: re-running the same apply after a failure (or success) must
  not create duplicates; treat already-present recipe output as "already
  applied", not an error.
- Adopt existing entities: `--vehicle player` on a starter that already has
  `player` should bind the recipe to that entity (or the error must say
  "entity exists; pass --use-existing or a new id"). The default template
  and the default archetype recipe must compose - test them together.
- Script stubs: if a recipe requires `vehicleCheckpointSystem` in
  `src/scripts/player.ts`, the recipe writes the typed stub (or the
  diagnostic prints the exact export skeleton). Never demand an export the
  agent has to reverse-engineer.

### 3. Derive plan output from the owning registries (kill the drift)

`tn game plan`'s cookbook IDs, recipe flags, and command templates must be
generated from the cookbook registry and the recipe arg schemas, not typed
by hand in `game.ts`/`kits.ts`. Where derivation is not practical yet, add
the smallest drift test (plan-emitted IDs are a subset of registry IDs;
plan-emitted flags parse against the recipe's own arg parser). Also emit
resolved IDs instead of `<scene-id>` placeholders when the project has
exactly one scene/camera - the plan command already has project access.

### 4. Errors must enumerate the valid option space

- `TN_SCENE_INSPECT_ID_MISSING` should list available scene IDs (there is
  one). `TN_COOKBOOK_UNKNOWN_ID` already suggests one near-match - good;
  do the same everywhere.
- Missing-arg failures must report ALL missing args with their exact flag
  spellings (`--vehicle <entity-id>`), not the first one and not the
  internal camelCase name. Each of these is one repair step instead of
  three guesses.

### 5. Clean machine channel and env-robust iterate

- `--json` means stdout is exactly one JSON object. Route Bevy/NVVM/driver
  chatter to stderr. (This trial's iterate output starts with four log
  lines; a strict-JSON parser in the harness fails at char 0.)
- The starter's default `tn iterate` runs a native playtest that SIGSEGVs
  on this machine while all web scenarios pass. Default the starter loop to
  the web lane and make native opt-in (or auto-skip with a structured
  `TN_NATIVE_UNAVAILABLE` diagnostic naming the probable cause). A crash
  must never surface as just "exited with signal SIGSEGV" - wrap the
  harness to capture the last runtime phase and emit the round-4-requested
  structured diagnostic.

### 6. Ship the project map (round-3 suggestion 5, still missing)

`tn authoring inspect` returns file paths only. Add the ID map (per
document: entity/system/resource/prefab/UI IDs plus one-line
responsibility) or a `tn project map --json`. `tn scene inspect arena`
already proves the compact format works; hoist it one level.

### 7. Benchmark implications for round 5B

- Do not spend a measured 5B run before items 1-2 land; the run will
  measure the recipe dead-ends, not the architecture. The item-1 acceptance
  test is the cheap proxy: when it is green, rerun the matrix.
- Add one behavioral counter: emitted-command failure rate (failures of
  commands the tooling itself printed). Target 0. It cleanly separates
  "agent went off-road" from "the road was broken", which rounds 3-5
  conflated.
- The strategic question from round 4 stands: vanilla one-shots a memorized
  ~350-line Three.js game with no proof, so a raw-token ratio on toy
  prompts structurally favors vanilla. Once emitted commands run green,
  if the ratio still fails at ~30 honest steps, change the gate to
  proof-parity cost (tokens per passing playtest assertion) or harden the
  prompts past one-shot size - do not keep paying for rounds that re-answer
  the same asymmetry.

## What was genuinely good (keep and lean on)

- `bin/tn` shim: first command worked; entry-point credibility held.
- `tn game plan` decomposition shape: right idea, right granularity - it
  only needs true data.
- `tn scene inspect <id>`: exemplary compact response.
- `tn iterate` step report structure (validate/build/screenshot/playtest
  with per-scenario pass/fail) is exactly the right one-loop shape.
- Diagnostic fix-snippets (duplicate-entity error included a docs link,
  instruction, and snippet) - extend this pattern to the cases above.

## Resolution evidence - 2026-07-09

All seven guidance items above are implemented in the authoring path:

- `pnpm verify:emitted-commands` now executes plan-emitted mechanic commands,
  actor suggestions, proof commands, and cookbook references for both
  maintained starters across top-down, third-person, first-person,
  side-scroller, and racing goals. Its report owns the
  `emittedCommandFailureRate` counter.
- Recipe apply is staged and committed only after every operation, script
  export, and proof artifact succeeds. It adopts project-inventory entities,
  preserves authored camera/transform/physics ownership, treats duplicate
  outputs as already present, and reports an exact no-op on retry.
- Game-plan recipe flags and cookbook IDs derive from recipe/cookbook owning
  descriptors, concrete project IDs replace placeholders, missing arguments
  enumerate every exact CLI flag, and missing scene inspection lists valid IDs.
- Compact recipe JSON is the default (`--full-json` is opt-in), authoring
  inspect emits a project ID/responsibility map, default iterate skips native
  scenarios unless `--native` is passed, and native crashes are captured as a
  structured diagnostic with the last readiness phase and output tail.
- Hands-on verification also found and fixed two deeper composition defects:
  same-tick resource patches now read pending writes instead of overwriting one
  another, and scene-owned structured UI now emits alongside standalone UI
  documents without duplicating already-owned node IDs.

The final acceptance artifact is
`tools/verify/artifacts/emitted-commands/verification-report.json`. A measured
Round 5B benchmark is still a separate follow-up; this resolution removes the
known paved-road failures so that run can measure authoring efficiency rather
than dead-end repair churn.

| Audit item | Completion evidence |
|---|---|
| 1. Executable emitted commands | Final gate: 156 commands, 0 failures, 0.0 failure rate across 2 templates x 5 goals; stdout for every emitted command parses as exactly one JSON object. |
| 2. Transaction/idempotency/adoption/stubs | `packages/cli/src/commands/recipe.test.ts` covers failed apply with zero writes, exact unchanged retry, starter entity/camera adoption, and generated script export; recipe mutation commits only staged changed files after full success. |
| 3. Registry ownership/drift | Recipe command flags derive from exported recipe argument descriptors; `gameScore.test.ts` checks every emitted cookbook ID against the loaded cookbook registry and every recipe command against concrete descriptor flags; the executable gate closes the remaining integration drift surface. |
| 4. Valid option enumeration | Recipe missing-argument tests require all exact flags in one response; scene-inspect tests require `availableSceneIds`. |
| 5. Machine channel/native robustness | The gate enforces one JSON stdout object, iterate tests prove native scenarios are opt-in, and the native-signal regression test requires `TN_PLAYTEST_NATIVE_CRASH`, last readiness phase, and captured output tail. |
| 6. Project map | Authoring-inspect tests require `threenative.project-map` documents with entity/prefab/resource/system/UI IDs and responsibilities. |
| 7. Behavioral counter | The emitted-command report owns `emittedCommandCount`, `emittedCommandFailureCount`, and `emittedCommandFailureRate`; the final values are 156, 0, and 0. |

Compact unchanged recipe retry output is guarded below 2 KiB. The verified
sample fell from 17,308 bytes to 898 bytes (about 94.8% fewer bytes/tokens).

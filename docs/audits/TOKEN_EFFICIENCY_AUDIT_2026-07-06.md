# Token Efficiency Audit: How ThreeNative Can Beat Vanilla Three.js

Date: 2026-07-06
Input: `tools/verify/artifacts/agent-benchmark/pilot-2026-07/` (8 codex
sessions, full `codex-events.jsonl` transcripts per candidate)
Status: proposal. No code changed by this audit.

## 1. Goal

The PRD-001 pilot failed the 2x threshold:

| Prompt      | ThreeNative median | Vanilla median | Ratio |
|-------------|-------------------:|---------------:|------:|
| collector   | 1,984,022          | 791,745        | 2.51x |
| lane-runner | 4,013,006          | 1,020,845      | 3.93x |

New target proposed here: **ThreeNative median <= 0.5x vanilla median**
(i.e. half the tokens of vanilla, not merely "within 2x"). The transcript
evidence below says this is realistic, because almost none of the ThreeNative
token spend is intrinsic to the dialect -- it is CLI output volume and loop
fragmentation, both fixable.

## 2. Where the tokens actually went (measured)

Per-session tool output bytes and command counts, mined from the pilot
transcripts:

| Session                    | Commands | Total tool output | `tn playtest` output | read/search calls | Failed cmds |
|----------------------------|---------:|------------------:|---------------------:|------------------:|------------:|
| collector-threenative-r1   | 44       | 6,405,463 B       | 6,291,456 B (6 calls) | 24               | 3           |
| collector-threenative-r2   | 45       | 1,196,328 B       | 1,052,133 B (4 calls) | 27               | 5           |
| lane-runner-threenative-r1 | 60       | 5,089,753 B       | 4,196,850 B (9 calls) | 34               | 9           |
| lane-runner-threenative-r2 | 47       | 2,267,876 B       | 2,105,535 B (5 calls) | 26               | 8           |
| collector-vanilla-r1       | 8        | 14,249 B          | --                    | 6                | 1           |
| collector-vanilla-r2       | 9        | 15,345 B          | --                    | 5                | 0           |
| lane-runner-vanilla-r1     | 10       | 34,852 B          | --                    | 8                | 0           |
| lane-runner-vanilla-r2     | 7        | 16,216 B          | --                    | 5                | 0           |

Session token counts are dominated by input tokens (output tokens were only
8k-20k in every session, both conditions). Input tokens are the conversation
re-sent every turn, so total input is approximately
`sum over turns of context-size-at-that-turn`. ThreeNative loses on both
factors of that product: 5-8x more turns, and megabytes of tool output
resident in context for every subsequent turn.

## 3. Root causes, ranked by measured cost

### R1 (dominant): `tn playtest --json` dumps the full effect log to stdout

Every playtest call printed the complete per-frame `effectLog` plus
`observations` -- every `setComponent` for every entity on every fixed tick,
pretty-printed with one array element per line -- until it hit the 1,048,576
byte harness truncation cap. That is roughly 260k tokens *per playtest call*.
The worst session made 9 playtest calls (4.2 MB); the best-behaved still paid
1.05 MB. This one payload category is **76-98% of all tool output bytes in
every ThreeNative session** and, given the re-send multiplier, plausibly
60-80% of the measured input-token gap.

The data is already persisted to
`artifacts/playtest/<scenario>/latest/effect-log.json` by the same code path
(`packages/cli/src/commands/playtest.ts` writes `effect-log.json`,
`console.json`, `network.json`, then *also* embeds `effectLog` and
`observations` in the JSON stdout payload around
`packages/cli/src/commands/playtest.ts:921`). Printing it is pure waste.

### R2: artifact JSON files are unbounded, and agents cat them

In lane-runner-r1 the agent ran `jq` over
`artifacts/playtest/.../summary.json` / `observations` and got **732,198
bytes** back in one command. Moving noise from stdout into files does not
help if the files agents are told to inspect are themselves megabyte-scale
frame logs with no compact summary alongside.

### R3: fragmented inner loop -> 44-60 turns vs 7-10 for vanilla

ThreeNative sessions ran `authoring validate`, `build`, and `playtest` as
separate commands, repeatedly (collector-r1: 5 validates + 4 builds + 6
playtests). `tn iterate` (PRD-003) exists precisely to collapse this and was
used **zero times in all four sessions** -- the starter instructions clearly
do not funnel agents into it. Each extra turn re-sends the whole
conversation; with megabyte outputs in context (R1), extra turns are
catastrophically expensive rather than merely wasteful.

Failed commands (3-9 per ThreeNative session vs 0-1 vanilla) add repair
turns on top. Note the pilot ran before/alongside PRD-004 prescriptive
diagnostics landed, so some of this may already be improved.

### R4: dialect discovery tax -- 24-34 exploratory reads per session

Agents read skill files, `find`-ed the whole starter template, grepped
`packages/` for `interface ScriptContext|getAxis|query(`, and read 8-14 KB
example files from `examples/metro-surfer-heist/` to learn the API. That is
70-110 KB of context per session, plus the turns it takes to do it. The
cookbook (PRD-002) was not consulted via `tn cookbook`; agents spelunked the
monorepo instead. Vanilla pays none of this: the model already knows
Three.js from pretraining.

### R5: `tn game plan --json` prints ~40 KB

Called 1-2 times per session (40,313-40,875 B each). Small next to R1, but
it is the first command every session runs, so it sits in context for the
entire session and is re-sent on every one of the 44-60 turns.

## 4. Why vanilla wins today (and its floor)

The vanilla agent writes one ~200-line file from pretrained knowledge, in
1-4 iterations, with ~15 KB of total tool output. Its ~600k-1M token cost is
almost entirely fixed overhead: system prompt and conversation re-sent
across ~8 turns while it writes and verifies in the browser. That floor does
not shrink -- vanilla cannot get much cheaper than "write everything from
scratch, then hand-verify with Playwright".

ThreeNative can go *below* that floor because it can legitimately skip work
vanilla must do: scaffold a compiling, playable baseline from a recipe, then
have the agent only patch and prove. Fewer turns, tiny diffs, machine
verification. That is the structural path to the 0.5x target -- but only
after the output-volume bleeding (R1/R2) stops.

## 5. Proposals

### P0 -- stop the bleeding (est. -60-80% of ThreeNative input tokens)

**P0-1. Make `tn playtest --json` summary-only by default.**
Drop `effectLog` and `observations` from the stdout payload; keep pass/fail,
`diagnostics`, `before`/`after`, `distance`, `movementDelta`, `follow`, and
artifact *paths*. Target stdout: <= 2 KB. Add `--verbose-effects` (or
`--effects stdout`) for the rare interactive debugging case. The files under
`artifacts/playtest/.../latest/` already carry the full data.
Estimated effect on the pilot: collector-r1 loses ~6.3 MB of first-pass
output plus its re-send tail -- modeled against the 2.03M measured input
tokens, the session lands in the 400-500k range, already below the vanilla
median of 792k, before any other fix.

**P0-2. Bound every agent-facing artifact summary.**
`summary.json` (and anything a skill/doc tells agents to read) must be a
compact verdict document (< 4 KB): pass/fail per expectation, final poses of
asserted entities, counts, and pointers to the deep logs. Deep logs
(`effect-log.json`, `observations`) keep their data but move behind names
documented as "machine logs -- query, don't read". Add
`tn playtest report --latest --json` (or extend `tn iterate` output) as the
sanctioned compact query so agents never have a reason to `jq` a frame log.

**P0-3. Add a stdout budget gate so this never regresses.**
A verify test that runs every agent-documented `tn ... --json` command
against the starter template and asserts stdout <= 8 KB (playtest, build,
validate, iterate, game plan, cookbook show). Wire into
`pnpm verify:conformance` or a new `verify:agent-io`. This converts "token
ergonomics" from a hope into a gate.

### P1 -- cut turns and discovery (est. 2-4x fewer iterations)

**P1-1. Funnel agents into `tn iterate` as the only inner loop.**
Starter `AGENTS.md` and the skills should say: after editing, run exactly
`tn iterate --project . --json`; do not run validate/build/playtest
separately. In the pilot this replaces ~15 command turns per session with
~4-6. Ensure `tn iterate` stdout also respects the P0-3 budget and includes
the compact playtest verdicts inline.

**P1-2. Ship a compact API card so agents never spelunk the repo.**
One generated, CI-validated file in the starter (e.g.
`docs/API-CARD.md` or an `llms.txt`, ~4-6 KB) containing: the full
`ScriptContext` surface with one-line signatures, the content JSON document
kinds and their minimal valid shapes, input axis conventions, resource
schema rules, and pointers to `tn cookbook show <id>`. Success metric,
measurable from transcripts: zero `rg`/`sed` reads outside the candidate
directory. That deletes 20-30 turns' worth of exploration and 70-110 KB of
resident context per session.

**P1-3. `tn game plan` writes the plan to a file, prints a summary.**
Full plan to `artifacts/plan/latest/plan.json`; stdout <= 2 KB with the
milestone list and file map. Saves ~40 KB of context resident across every
turn of every session.

### P2 -- go below vanilla's floor (the 0.5x lever)

**P2-1. `tn game plan --apply`: scaffold to playable, not to empty.**
`game plan` already knows the recipe category. Let `--apply` materialize the
matching starter recipe (collector, lane-runner, etc.) as compiling,
playtest-passing durable source: scene, input, HUD, one gameplay script,
and committed playtest scenarios. The agent's job becomes: apply, run
`tn iterate` once to confirm green, patch the deltas the prompt actually
requires, iterate to green, done. Realistic session shape: 5-8 turns, < 100
KB tool output, est. 250-400k tokens -- 0.3-0.5x the vanilla median.
Vanilla structurally cannot match this because it has no scaffold and no
machine-checkable "playable" oracle.

**P2-2. Record cost-weighted tokens alongside raw tokens in the benchmark.**
90%+ of ThreeNative input tokens were cache hits (e.g. collector-r1:
1,836,288 cached of 2,026,330 input). Raw-token medians treat a cached token
the same as a fresh one, which overstates the real cost gap. Keep the raw
median as the headline (comparability with the pilot), but add
`uncachedInputTokens` and a blended-cost field to `session.json` and the
aggregate report so the re-run can report both.

## 6. Projected outcome

Rough model per prompt (median session), applying P0+P1 to the measured
pilot sessions -- removing playtest/observation payloads from context,
collapsing validate/build/playtest turns into iterate, and deleting
exploration turns:

| Scenario                    | collector est. | lane-runner est. | vs vanilla median |
|-----------------------------|---------------:|-----------------:|------------------:|
| Pilot (measured)            | 1,984k         | 4,013k           | 2.5x / 3.9x       |
| P0 only                     | ~450-600k      | ~700-900k        | ~0.7x / ~0.8x     |
| P0+P1                       | ~350-450k      | ~450-650k        | ~0.5x / ~0.55x    |
| P0+P1+P2-1 (scaffold-first) | ~250-350k      | ~300-450k        | ~0.35x / ~0.4x    |

Estimates, not measurements -- the re-run below is the proof. But the causal
chain is measured, not guessed: the gap is output volume times turn count,
and every proposal attacks one of those two factors.

## 7. Suggested execution order

1. P0-1 + P0-2 + P0-3 (one PRD: "agent IO budget"). Small diff, mostly in
   `packages/cli/src/commands/playtest.ts` payload assembly plus a verify
   gate.
2. P1-1 + P1-3 (docs/CLI polish, tiny diffs). P1-2 as its own small PRD with
   a parity test against the real `ScriptContext` types.
3. Re-run the 8-session pilot per `tools/agent-benchmark/PROTOCOL.md`
   unchanged, with P2-2's extra fields. Acceptance: ThreeNative median
   <= 0.5x vanilla on both prompts; also record iteration count and
   failed-command count (targets: <= 8 iterations, <= 2 failed commands).
4. If the re-run lands at 0.5-1.0x rather than <= 0.5x, P2-1
   (scaffold-to-playable) is the remaining structural lever; do it before
   any further engine-breadth work, per the decision gate in
   `docs/PRDs/done/agent-ergonomics-2026-07-05/README.md`.

## 8. V2 Token-Cost Evidence

`tools/verify/artifacts/agent-benchmark/token-cost-version-2-2026-07-07/` re-aggregates
the tracked 8-session pilot with version 2 cached/uncached input, output-token,
tool-output, failed-command, and cost-weighted fields mined from
`codex-events.jsonl`.

This is not a fresh post-fix rerun. It preserves the historical pilot decision
under the stricter <=0.5x raw-token target: collector ratio 2.51x and
lane-runner ratio 3.93x, both failing. Until a fresh post-P0/P1 rerun proves
the target, scaffold-first remains the active next lever.

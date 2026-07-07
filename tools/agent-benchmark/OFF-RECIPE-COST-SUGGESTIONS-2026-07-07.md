# Off-Recipe Cost Suggestions - 2026-07-07 (Round 3)

Companion to `OFF-RECIPE-DIRECTION-2026-07-07.md` and successor to
`TOKEN-COST-DIRECTION.md`. This is the third attempt at the authoring-cost
problem, so this doc does not re-summarize the existing audits. It is built
from a fresh pass over the raw event logs in
`tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/candidates/*/codex-events.jsonl`,
and it reaches a different diagnosis than rounds 1 and 2.

## The round-3 finding: the tools exist, agents never used them

Rounds 1 and 2 built the right surfaces: `tn iterate` (one-step verify),
`tn scene inspect` (targeted reads), `tn cookbook` (18 validated few-shot
entries), `tn add` mechanic blocks, `tn playtest report`, fix-snippet
diagnostics. The starter `AGENTS.md` documents all of them, including an
explicit "verify with `tn iterate --project . --json` only; do not run
validate, build, screenshot, or playtest separately."

Actual invocation counts across all four ThreeNative off-recipe sessions,
extracted from the command events:

| Command | AGENTS.md says | Actual invocations (4 sessions) |
| --- | --- | ---: |
| `tn iterate` | the only verify step | 0 |
| `tn cookbook list/show` | check before authoring | 0 |
| `tn scene inspect --node` | use instead of file reads | 0 |
| `tn add <block>` | bounded mechanic mutations | 0 |
| `tn playtest report --latest` | use after iterate failure | 0 |
| `tn authoring validate` (standalone) | do not run separately | 16 |
| `tn build` (standalone) | do not run separately | 19 |
| `tn playtest` (standalone) | do not run separately | 21 |

The off-recipe failure is therefore not primarily a missing-capability
problem. It is an **instruction-channel failure**: the investments from the
previous rounds never reached the agent's working behavior. Fixing sinks the
agent never touches cannot move the number.

## Why the instruction channel failed (all three causes are generic)

### Cause 1: a stale, competing instruction surface won

Every ThreeNative session started by reading 3-4 `SKILL.md` files from the
monorepo's `.codex/skills/` (threenative-runner-playtest,
threenative-editor-operations, threenative-visual-verification; ~16 KB over
4 steps) — before reading the starter `AGENTS.md`. Those skills teach the
**old** workflow:

- `node packages/cli/dist/index.js build/validate/verify ... --json`
- `pnpm tn -- build/verify/compare-images ...`
- separate build, validate, verify steps

They never mention `tn iterate`, cookbook, blocks, or targeted inspection.
The sessions then executed exactly the workflow the skills teach, down to
the `node .../packages/cli/dist/index.js` invocation form (14-17 times per
session). The harness also emitted a "skills context budget exceeded" error
at session start, so skill selection itself is misconfigured.

### Cause 2: the first documented command failed, poisoning the rest

Each session's first `tn` attempt (`pnpm tn -- game plan ...`) failed with
`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "tn" not found`. After one
verified failure of the documented entry point, agents switched to the
locally-verified fallback (`node <abs-path>/dist/index.js`) and never again
trusted a documented-but-unverified command. That is rational agent
behavior: a workflow doc loses its authority the moment its first command
fails. The unused `tn iterate`/cookbook are downstream casualties of one
broken shim.

### Cause 3: prose does not steer; command responses do

`AGENTS.md` is 11.4 KB of dense rules; the iterate-only rule sits ~70 lines
deep. Meanwhile `AGENT-LEARNINGS-2026-07-07.md` already records that agents
reliably follow direct proof loops and structured diagnostics. The
transcripts confirm the asymmetry: agents obeyed every fix snippet a
command printed, and ignored nearly every rule the prose stated.

Worked example of the cost (physics-knockdown-r1): one
`TN_PLAYTEST_FAILED` was followed by **12 steps** of manual forensics —
repeated `jq` into `runtime-trace.json` and `effect-log.json`, four of them
failing on wrong shape assumptions — until the agent found
`TN_WEB_SYSTEM_RESOURCE_WRITE_UNDECLARED` buried inside the trace. That
diagnostic existed at failure time; it just was not in the playtest command
response. The documented `tn playtest report --latest` would have answered
in one step; the agent did not know to trust it (causes 1-2).

## Step economics confirm steps are the whole game

From the eight `session.json` files:

| Run | Raw tokens | Steps | Avg context/step |
| --- | ---: | ---: | ---: |
| checkpoint-race TN r1/r2 | 1.90M / 1.76M | 52 / 42 | 36K / 42K |
| checkpoint-race vanilla r1/r2 | 1.00M / 0.51M | 13 / 10 | 76K / 50K |
| physics-knockdown TN r1/r2 | 2.92M / 2.67M | 60 / 46 | 48K / 58K |
| physics-knockdown vanilla r1/r2 | 2.21M / 0.57M | 29 / 8 | 76K / 70K |

Vanilla's context per step is *higher* than ThreeNative's. ThreeNative
loses purely on step count: 42-60 steps vs 8-29. Where the TN steps went
(command categorization across the four sessions):

- Verify/proof loop (validate + build + playtest + artifact forensics):
  ~17-22 steps per session where `tn iterate` + a self-explaining failure
  should cost ~4-6.
- Reading scaffold and monorepo files one at a time: 14-18 steps per
  session (12 single-file reads of the scaffold's own content in the best
  run, plus racing-kit/metro-surfer sources read as few-shot substitutes
  for the unused cookbook).
- Harness skill reading: 3-4 steps.
- CLI path discovery after the `pnpm tn` failure: 2-4 steps.

To pass 2.0x, checkpoint-race needs roughly <= 28 steps (budget 1.01M at
~36K/step). The unused-tooling waste above is ~20+ steps. The gate is
reachable with zero new authoring features — if the existing ones actually
get used.

## Suggestions: generic mechanisms only, in priority order

Constraint honored throughout (and per `OFF-RECIPE-DIRECTIVE.md`): no
prompt-specific recipes, no tuning against these two prompts. Every fix
below is a mechanism that applies to any goal.

### 1. One workflow truth, enforced by CI, consumed everywhere

Make the current workflow contract (entry point, verify command, discovery
commands, mutation surfaces) a single generated source, and derive every
instruction surface from it: starter `AGENTS.md`/`CLAUDE.md`/`README`,
`.codex/skills/threenative-*` skills, cookbook preambles, root docs.

Add a conformance check (`pnpm check:docs` extension) that fails on stale
workflow shapes anywhere agents can read: `node
packages/cli/dist/index.js`, `pnpm tn --`, or guidance to run
validate/build/playtest as separate verify steps. Today
`.codex/skills/threenative-visual-verification/SKILL.md` and
`threenative-runner-playtest/SKILL.md` would fail that check — they are
actively training agents into the 3x workflow. Also fix the harness skills
budget misconfiguration surfaced by the session-start error.

This is generic by construction: any future command rename or workflow
change propagates to every surface or CI fails.

### 2. The documented entry point must succeed on first invocation

Ship a working `tn` in every starter/candidate project: a `bin/tn` shim (or
`package.json` script) that resolves the workspace CLI dist, with a precise
one-line error if it cannot. Add a CLI-level acceptance test: copy the
starter to a temp dir, run the first three commands `AGENTS.md` recommends
**verbatim as written**, assert exit 0.

This is not just removing 2-4 failed steps; it protects the credibility of
the whole documented surface (cause 2). Every documented command that works
on first try keeps `tn iterate` and `tn cookbook` trustworthy for free.

### 3. Move steering from prose into command responses

Agents follow what commands tell them at the moment of action, not what an
11 KB document said 40 steps ago. Generic pattern: every `tn` JSON response
ends with a `next` field containing the single recommended follow-up
command.

- `tn build`, `tn authoring validate`, `tn playtest` run standalone append
  a one-line notice: "these are subsumed by `tn iterate --project . --json`
  (single verify step)". The nudge arrives exactly when the agent is
  choosing its loop, replayed rules do not.
- `tn playtest` failure responses must surface the first actionable runtime
  diagnostic from the trace artifacts (the undeclared-resource-write case
  above) plus the exact `tn playtest report --latest --scenario <name>
  --json` command. No agent should ever need raw `jq` into
  `runtime-trace.json`; in this round that forensics loop cost ~10 steps
  per playtest failure and produced 4 additional failed commands.
- Extend the existing fix-snippet pattern (already proven for schema and
  rigid-body diagnostics) to playtest scenario repair: on movement-probe
  failures, propose the corrected scenario payload (entity ID, duration,
  threshold).
- Generate playtest scenarios from authored content instead of asking the
  agent to guess inputs. Six of the 13 failed playtests were movement
  scenarios where the guessed input produced insufficient displacement. A
  scaffold-time or `tn playtest --suggest-scenario` path that derives entity
  IDs, input axes, expected displacement, and tolerance from the scene makes
  the first playtest run calibrated, not a probe. (The `--suggest-scenario`
  flag already exists per `AGENTS.md`; like the rest, it was never invoked —
  suggestion 3's `next` hints are what make it discoverable.)

### 4. Make `tn game plan` useful off-recipe: decompose, don't scaffold

Off-recipe, `tn game plan` currently returns a generic "continue the
existing structured-source gameplay system" file map — ~4 KB that told the
agent nothing, which is why all four sessions fell back to grepping
examples. Replace the fallback with a **mechanic decomposition**: map the
goal onto the generic mechanic taxonomy (movement, objective progression,
scoring, fail/retry, hazards, physics interactions, HUD, camera) and emit,
per mechanic, the matching `tn add` block command and/or cookbook ID plus
the owning file. The taxonomy and the block/cookbook index are generic; no
prompt-shaped recipe is involved. The agent should receive its
decomposition from the plan command, not reconstruct it from `rg` over
`examples/`.

### 5. Kill the read-everything tax with one generated project map

The best TN run spent 12 consecutive steps reading every scaffold file
individually, then more steps re-reading them. Generic fix: generate a
compact project map (either embedded in the starter `AGENTS.md` or via
`tn project map --json`) listing every source file with its document type,
entity/resource/system IDs, and a one-line responsibility. One read
replaces ~12, and it regenerates for any project shape. Keep advertising
`tn scene inspect --node` in command responses (per suggestion 3) for
targeted follow-ups.

### 6. Ratchet adoption, not just totals, in the benchmark analyzer

The aggregate report already counts tokens, steps, and failed commands. Add
generic behavioral counters so instruction-channel regressions fail fast
without a full round:

- iterate-adoption: standalone validate/build/playtest count when
  `tn iterate` covers them (target: 0).
- discovery-adoption: cookbook/plan-decomposition consulted before first
  script edit (target: >= 1) and engine-source `rg` count (target: 0) —
  this is the classifier deferred in `COOKBOOK-TOPIC-AUDIT-2026-07-07.md`.
- artifact-forensics: raw `jq`/`sed` into `artifacts/**` (target: 0 —
  every needed answer should come from a `tn` report command).
- step budget: <= 30 for off-recipe TN sessions as the next ratchet.
- failed-command median: <= 1 per session (the existing secondary gate),
  now realistic once suggestion 2 removes the entry-point failures.

These measure whether the channel works for *any* prompt, which is the
generic property we need.

### 7. Fix the scorer start-flow mismatch (fairness)

`checkpoint-race-vanilla-r1` failed the neutral movement probe despite
being playable behind its own start flow. Define a generic start contract
in `PROTOCOL.md` (e.g., an auto-start query parameter every candidate must
support, or probe-clicks-then-probes), so medians stop losing runs to
scorer/candidate handshake noise in either condition.

## What NOT to do (unchanged plus one addition)

- No `checkpoint-race`/`physics-knockdown` recipes; the prompts die the
  moment a recipe covers them (`OFF-RECIPE-DIRECTIVE.md`).
- No further output compaction; verified again this round — total tool
  output is 114-198 KB per session against 1.8-2.9M raw tokens.
- No new authoring capabilities before the adoption fixes land. Round 3's
  lesson is that capability without adoption is invisible to the
  benchmark; building more unused surface makes the next round's analysis
  harder, not better.

## Expected outcome

Applying suggestions 1-5 to the best checkpoint-race run (42 steps):
skills/CLI-discovery waste (~7 steps) goes away with 1-2; the verify loop
(~15 steps) drops to ~5 with 3; example-grepping and scaffold reads (~14
steps) drop to ~4 with 4-5. That lands near 18-22 steps ≈ 650-800K raw
tokens against the 1.01M gate — passing with margin, using only generic
mechanisms. physics-knockdown (2.008x) flips with any one of the levers.

Next round per protocol: same two prompts, fresh dated evidence dir, both
conditions, medians only. If a session still ignores `tn iterate` or
cookbook after 1-3 land, treat that as the primary finding and stop the
round early — adoption is the variable under test now.

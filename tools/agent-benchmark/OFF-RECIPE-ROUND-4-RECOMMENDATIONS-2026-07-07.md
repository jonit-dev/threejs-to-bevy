# Off-Recipe Round 4: Diagnosis and Recommendations - 2026-07-07

Successor to `OFF-RECIPE-COST-SUGGESTIONS-2026-07-07.md` (round 3). Built from
the fresh two-repeat rerun in
`tools/verify/artifacts/agent-benchmark/off-recipe-rerun-2026-07-07b/` and a
command-level categorization of all eight `codex-events.jsonl` transcripts.

## Round-4 result

| Prompt | Round-3 raw ratio | Round-4 raw ratio | Gate |
| --- | ---: | ---: | --- |
| `checkpoint-race` | 3.614x | 3.253x | <= 0.5x FAIL |
| `physics-knockdown` | 2.008x | 4.854x | <= 0.5x FAIL |

## The round-4 finding: adoption is fixed; the gap is structural

Round 3 diagnosed an instruction-channel failure (`tn iterate`, cookbook,
`tn game plan` had 0 invocations across all sessions). Round 3's fixes
worked: this round, **all four** ThreeNative sessions used `tn game plan`,
consulted the cookbook, verified with `tn iterate`, read the starter-local
skill, and the `bin/tn` shim succeeded on first invocation. Adoption is no
longer the variable. The ratio barely moved anyway, which means adoption was
never the binding constraint. Three structural facts explain the rest.

### Fact 1: vanilla wins on memorization, not engineering

All four vanilla sessions follow an identical shape: write a ~350-line
self-contained Three.js game **in a single pass from parametric knowledge**
(~90% of final code written before anything is executed), `node --check`,
one browser smoke test, small patches, done. 8-15 steps, ~620-970K raw
tokens, **zero failed commands, zero documentation reads, zero API errors**.

The prompts (checkpoint race, physics knockdown) are canonical tutorial
genres saturated in training data. Vanilla is not competing as an engine; it
is competing as recall. ThreeNative has zero training-data presence, so
every convention must be learned in-session by failing at it.

Consequence: a <= 0.5x raw-token gate on prompts the model can one-shot from
memory demands that TN be *cheaper than recall*. No framework with schemas,
declarations, and a verify loop can win that, ever. **The gate is
mis-specified for these prompts, independent of any TN defect.**

### Fact 2: the comparison is asymmetric on proof

TN sessions paid for real verification: schema validation, resource
ownership checks, playtest assertions with displacement thresholds, and
screenshots. Vanilla's entire proof bar was "page loads without console
errors and something moves." The benchmark prices both products at raw
tokens, so the unproven memorized webpage wins by construction. Nothing in
the gate credits what TN delivers (portable IR, native runtime, provable
gameplay).

### Fact 3: TN's own step cost is dominated by three named failure classes

Command categorization across the four TN sessions (33 / 55 / 39 / 68 total
steps; 5 / 11 / 5 / 14 failed):

1. **Resource/schema declaration friction (all 4 sessions).** Recurring
   `resourceWrites`/`resourceReads` undeclared errors and schema mismatches
   (4+ per session in the worst runs), plus a legacy transform API form and
   input-ID validation failures. Every one of these is the model failing to
   recall a private-framework convention — the training-data tax made
   concrete.
2. **Iterate retry chains with repeated root causes.** Longest chains: 4
   consecutive failures (cp-r2, pk-r2), often re-hitting the same error
   class after a partial fix.
3. **A schema/runtime black box (pk-r2, the regression driver).** The agent
   declared projectile velocity correctly — iterate validated it — but the
   value never propagated to physics `context.state` at runtime. Result: 9
   consecutive playtest failures with the *identical* assertion
   (`Entity 'projectile' moved 0.000000 on Z`), zero diagnostic progress
   between retries, plus 6 artifact-forensics commands that did not drive a
   fix. This is an engine bug or diagnostic hole, not agent behavior; it
   alone explains most of the 2.0x -> 4.85x physics regression (the rest is
   vanilla's median dropping 42% between rounds — noise from n=2).

## Recommendations, in priority order

Constraint unchanged (`OFF-RECIPE-DIRECTIVE.md`): generic mechanisms only,
no prompt-shaped recipes.

### 1. Auto-derive resource declarations; never ask the agent to declare what the CLI can infer

`resourceWrites`/`resourceReads` are statically derivable from the scripts
that read/write them. Make the build/validate pipeline infer them (or emit
the exact declaration block as a fix snippet applied via a `--fix` flag).
Target: this error class becomes impossible to hit. It was the #1 failure
in all four sessions and it is 100% mechanical.

### 2. Fix the schema/runtime parity hole (the pk-r2 black box)

Two parts:

- Fix the propagation bug: a declared, validated resource value
  (projectile velocity) must reach runtime `context.state` / the physics
  engine, or fail loudly at build time.
- Add a parity diagnostic: anything declared in the schema layer but never
  observed at runtime during a playtest becomes a named diagnostic in the
  playtest failure response (e.g. `TN_RESOURCE_DECLARED_NOT_OBSERVED`),
  with the entity/resource ID. A playtest must be incapable of failing the
  same way twice while providing no new information.

### 3. Validate at write time, not iterate time

Extend the validated-mutation surface (`tn add`, cook, fix snippets) so a
schema mistake costs one instant rejection-with-snippet instead of a full
iterate cycle. Direction: authoring as "choose and parameterize validated
blocks" rather than "write our JSON dialect from memory." Composition is a
game a zero-training-data framework can win; freehand recall is not.

### 4. Ratchet: no error class may cost more than one retry

Add to the aggregate analyzer (alongside the round-3 adoption counters,
which worked): per-session max consecutive failures with the same
diagnostic code (target: <= 1), and identical-assertion playtest repeats
(target: 0). These would have flagged pk-r2's 9-failure chain immediately.

### 5. Fix the scoreboard: equal proof bar, honest gate

- **Equal proof:** vanilla candidates must pass the same committed playtest
  assertions TN passes (displacement thresholds, mechanic-specific checks),
  not just the neutral movement probe. Price equal products.
- **Gate:** replace <= 0.5x raw tokens with token parity (<= 1.0-1.5x at
  equal proof bar) plus the existing failed-command median and step budget.
  Keep raw tokens as a reported metric, not a gate.

### 6. Add prompts past one-shot complexity

Keep the two current prompts for continuity, but add off-recipe prompts
where memorization runs out and vanilla must iterate too: persistent
save/load state, multi-mechanic interaction (e.g. physics + scoring +
fail/retry coupling), tuned difficulty against a numeric spec,
content-scale (N generated levels validated for solvability). Generic
selection criterion: a prompt qualifies if vanilla's one-pass write cannot
satisfy the committed proof without at least one debug iteration.

### 7. Stabilize the medians

n=2 per condition let vanilla's median swing 42% between rounds and flip
physics-knockdown from borderline to disaster. Move to 3 repeats minimum
per condition, and keep the round-3 start-contract fix so no run is lost to
scorer handshake noise.

## Architectural bets: where a step-change (not a ratchet) is available

Recommendations 1-4 shave failure steps; realistic ceiling is parity. If a
significant win is required — TN at or *below* vanilla cost — it has to come
from restructuring the authoring surface around the actual root cause: the
model's knowledge lives in vanilla Three.js/TypeScript, not in our JSON
dialect. Three bets, ordered by expected impact.

### Bet A: TypeScript-as-the-schema authoring surface

Replace "hand-write our JSON dialect, validate at iterate time" with
"author in TypeScript against generated types, where the type system *is*
the schema." Content documents become typed TS objects (compiled to the
canonical JSON as a build artifact); scripts already are TS. Resource
reads/writes, entity IDs, input IDs, and component shapes all become
compile-time facts checked by `tsc` in-editor/at-build.

- **Why it is a step change:** it converts every round-4 failure class
  (schema mismatch, undeclared resource, invalid input ID, legacy API
  form) from a runtime iterate failure into an instant type error — and
  models are near-perfect at satisfying TypeScript types because TS itself
  is saturated in training data. We stop asking the model to recall our
  conventions and start letting the compiler enforce them at zero recall
  cost. Expected effect: the entire schema/declaration/retry budget
  (~10-20 steps/session) collapses to ~0-2, and iterate becomes a proof
  step instead of a discovery step.
- **Fit:** consistent with the existing source boundary (durable behavior
  already lives in `src/scripts/**/*.ts`; this extends the same principle
  to durable data, with `content/**/*.json` kept as the generated
  canonical form).
- **Cost/risk:** medium-large (codegen for types from schemas, a
  TS->content compile step, migration of starters/cookbook). Risk is low:
  even if the benchmark ratio moves less than expected, valid-by-
  construction authoring is unconditionally better.

### Bet B: vanilla-lift pipeline (author where the training data is, compile into TN)

Invert the flow: let the agent author the game in the style it can
one-shot — plain Three.js/TS against a thin, well-known-looking API — and
have ThreeNative *lift* that program into the portable IR (entities,
physics metadata, systems) via a constrained compiler, rejecting only
constructs the IR cannot represent, with fix snippets.

- **Why it is a step change:** it turns the training-data tax into the
  asset. TN cost becomes vanilla cost plus a bounded, mostly-automatic
  conversion step — parity-or-better *by construction*, on any prompt
  vanilla can one-shot. This is the full version of the decision rule's
  pivot, and it can be prototyped without abandoning the current surface:
  the IR, native runtime, playtest, and scoring stack are reused
  unchanged.
- **Cost/risk:** large. The lift compiler is real engineering, and the
  constrained-subset boundary must be honest (silent partial lifts would
  be worse than today's friction). Prototype scope: lift only the mechanic
  taxonomy `tn game plan` already emits (movement, objectives, scoring,
  hazards, physics interactions) and reject the rest loudly.

### Bet C: single-document game spec (collapse the multi-file read/write surface)

14-23 steps per TN session went to reading and editing many small source
files. Offer one high-level authoring document (game spec) that declares
scenes, entities, mechanics, and wiring in one place, expanded
deterministically into today's structured source. One read to understand
the project; one write per mechanic change.

- **Why it wins:** attacks the navigation/step tax directly (the
  second-largest cost bucket after failures). Models are strong at
  editing one coherent document and weak at coordinating edits across a
  file lattice they have never seen.
- **Cost/risk:** medium. Overlaps with `tn project map` (round 3, #5) and
  the `tn add` blocks — this is the same idea taken to its limit. Risk:
  the spec becomes a second dialect to recall; mitigate by making it the
  TS surface from Bet A rather than another JSON grammar.

### Sequencing

Bets A and C compose (C's spec should be A's typed TS) and are compatible
with the current architecture — start A immediately after recommendations
1-4 if round 5 confirms friction is dead but parity is not reached. Bet B
is the fallback pivot: prototype it only if round 5 still fails at equal
proof bar, since it changes what "authoring in ThreeNative" means. All
three remain generic mechanisms — none encodes anything about the
benchmark prompts.

## What NOT to do

- No new authoring capabilities before 1-3 land. Round 3's lesson stands:
  unused or friction-laden surface is invisible or negative to the
  benchmark.
- No prompt-shaped recipes, including for any new prompts added under
  recommendation 6.
- No further output compaction; step count, not per-step context, remains
  the whole game (TN loses on 33-68 steps vs 8-15, while vanilla's context
  per step is *higher*).
- Do not chase the 0.5x gate on the current prompts. It is unreachable
  against memorized one-shot generation and optimizing for it will distort
  the design (e.g. skipping proofs to save steps).

## Expected outcome and decision rule

Applying 1-4 to the round-4 transcripts: declaration/schema failures
(~4-11 steps/session) drop to ~0-2; the pk-r2 black box (~15 steps) drops
to ~2; retry chains cap at 1. Plausible TN landing zone: ~15-25 steps,
~0.7-1.2M raw tokens — i.e. **rough parity** with vanilla at equal proof
bar, not 0.5x. That is the realistic best case and it is worth exactly one
more round.

**Decision rule:** land 1-4, correct the protocol per 5-7, rerun once.

- If TN reaches <= ~1.5x at equal proof bar (and <= ~1.0x on the
  beyond-one-shot prompts), the authoring architecture is validated;
  continue investing.
- If TN still sits above ~1.5x with the failure classes engineered out,
  conclude that agents should author in the vanilla style and ThreeNative's
  role shifts to ingesting/converting that output into the portable IR and
  native runtime — a pivot that reuses the IR, runtime, playtest, and
  scoring infrastructure already built. Stop the authoring-cost program at
  that point rather than running further rounds.

## Running the benchmark properly (round-5 procedure)

The mechanics below follow `PROTOCOL.md` plus the corrections from
recommendations 5-7. Deviations from the current protocol are marked
**(change)**.

### Preparation

1. Land recommendations 1-4 first; rebuild the CLI and benchmark tool
   (`pnpm --filter @threenative/agent-benchmark build`, plus the CLI
   package). Never benchmark against a stale `dist/`.
2. Create a fresh dated evidence dir:
   `tools/verify/artifacts/agent-benchmark/off-recipe-<date>/` with a
   `RUNS.txt` log (see round-4's for the format: prep lines, then
   START/DONE timestamps per run).
3. Prepare candidates fresh per run — vanilla from the bare starter,
   ThreeNative via `tn init` — so every run proves the distributable, not a
   warmed-up checkout. Verify each TN candidate has `AGENTS.md`,
   `CLAUDE.md`, `.codex/skills/threenative-workflow/SKILL.md`, `bin/tn`
   before starting the clock.
4. **(change)** Pin and record the model/CLI versions of the agent harness
   in `RUNS.txt`. Ratios across rounds are meaningless if the underlying
   model changed silently.

### Session rules

5. Fresh agent session per run; no transcript reuse; only the prompt plus
   the condition's starter instructions — no hints.
6. **(change)** 3 repeats per condition per prompt, minimum (was 2).
   Round 4 showed n=2 lets one lucky/unlucky run swing a median 42%.
   Interleave conditions (TN, vanilla, TN, ...) as in round 4 so
   time-of-day/harness drift does not load onto one condition.
7. Stop on: agent claims playable, token cap, or operator-visible setup
   failure. Log every operator intervention in `RUNS.txt` — an intervened
   run is excluded from medians, not patched.
8. Record `session.json` per candidate with the current telemetry fields (raw tokens,
   cached/uncached input, output tokens, tool output bytes,
   `toolStepCount`, `failedCommandCount`).

### Scoring

9. Score each candidate:

   ```bash
   node tools/agent-benchmark/dist/index.js score \
     --candidate <project> --condition <vanilla|threenative> --json
   ```

   Apply the scorer start contract (autostart param + click-before-probe)
   to both conditions so no run dies to handshake noise.
10. **(change)** Equal proof bar: run the committed prompt-specific
    playtest scenarios against *both* conditions, not just the neutral
    movement probe. A vanilla run that cannot pass the same assertions TN
    must pass scores as not-playable. This is the single biggest fairness
    fix.
11. Aggregate once, medians only:

    ```bash
    node tools/agent-benchmark/dist/index.js aggregate \
      --runs tools/verify/artifacts/agent-benchmark/off-recipe-<date> \
      --out .../benchmark-report.json --json
    ```

### Gates and reporting

12. **(change)** Gate on: raw-token ratio <= 1.5x at equal proof bar
    (report 1.0x as the stretch target), failed-command median <= 1,
    max-consecutive-same-diagnostic <= 1, identical-assertion playtest
    repeats = 0, TN step budget <= 30. Report the raw ratio against 0.5x
    for continuity but do not gate on it.
13. Write the round REPORT.md in the evidence dir comparing against the
    prior round's `benchmark-report.json`, and update the PRD/status docs
    link. Include the behavioral counters, not just totals — round 4
    proved totals alone cannot distinguish "tools unused" from "tools used
    but frictional".
14. Early-stop rule: if any TN session hits a repeated-identical-failure
    chain (>= 3 same diagnostic with no new information), stop the round,
    file it as the primary finding, and fix it before burning the
    remaining runs — that is what the pk-r2 black box should have
    triggered in round 4.

## Evidence

- Fresh run: `tools/verify/artifacts/agent-benchmark/off-recipe-rerun-2026-07-07b/REPORT.md`
- Transcript categorization: command-level analysis of the eight
  `candidates/*/codex-events.jsonl` files in that run directory (TN
  breakdown: 33/55/39/68 steps, failure causes per iterate cycle; vanilla
  breakdown: 15/8/13/8 steps, zero failures, single-pass writes).
- Round-3 doc: `tools/agent-benchmark/OFF-RECIPE-COST-SUGGESTIONS-2026-07-07.md`

# Off-Recipe Benchmark Directive: Was the 2026-07-07 Pass Real?

Date: 2026-07-07. Companion to `TOKEN-COST-DIRECTION.md` and `PROTOCOL.md`.
This is the work order for the next benchmark round. Read the whole document
before running anything.

## Verdict on the scaffold-first pass: half-real, not fake

The `scaffold-first-token-rerun-2026-07-07b` pass (collector 0.124x,
lane-runner 0.083x raw median tokens vs vanilla) is not fabricated — the runs
are genuine, the scorer passed, the games render and playtest. But it does not
answer the question CHALLENGES.md item 1 asked.

What actually happened in the winning runs: the agent executed **two
commands** — `tn game plan --goal ... --apply --json` and
`tn iterate --project . --json` — and stopped. The plan recipe scaffolded the
entire game. There are exactly two recipes in
`packages/cli/src/commands/game.ts` (`top-down-collector`, `lane-runner`) and
they were purpose-built during the fix round for exactly the two prompts the
rerun used. The benchmark therefore measured the recipe pipeline, not agent
authoring. That is Goodhart's law, not fraud.

Split the pass into what it proves and what it does not:

- **Proved:** the step-count diagnosis in `TOKEN-COST-DIRECTION.md` is
  correct. When the loop collapses to a few steps, per-step transcript replay
  stops being fatal. `tn iterate`, `tn scene inspect`, compact outputs, and
  the prescriptive starter instructions are real, generalizing wins. Do not
  revert or re-litigate them.
- **Not proved:** that an agent can *author* a game in the ThreeNative
  dialect at acceptable token cost. The last real measurement of that is
  still the 2026-07-06 pilot: 2.5x (collector) and 3.9x (lane-runner) vanilla
  median tokens. Any prompt without a matching recipe falls back onto that
  path.
- **Also visible in the pass:** the winning screenshot is colored primitives
  under a directional light — the Challenge 3d ceiling, untouched.

## Scaffolding is not the problem — zero delta is

To be explicit, because this directive could be misread as "scaffolding is
cheating": it is not. Generic scaffolding (camera, lights, floor, controlled
player, input bindings, HUD skeleton, playtest harness) is the correct
design and stays. Vanilla agents get the equivalent for free — the model has
Three.js boilerplate memorized — so pre-baking it on disk is the fair
counterpart, and no benchmark condition should ever penalize it.

The 07-07b problem is different: the recipes shipped the *entire game*
(mechanics, scoring, win state, passing playtests), so the agent's authored
delta was zero and the benchmark measured template copying. The quantity the
benchmark exists to measure is **marginal authoring cost**: given the best
scaffold available, what does the game-specific delta cost in the
ThreeNative dialect vs vanilla? Off-recipe prompts force that delta to be
nonzero in both conditions.

## The task: run the off-recipe condition

The suite already contains two prompts with **no matching recipe**:
`prompts/checkpoint-race.md` and `prompts/physics-knockdown.md`. They have
never been run in either condition. Run them under the standard protocol.

### Setup

1. Fresh dated evidence directory:
   `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-XX/`.
2. Both prompts, both conditions (vanilla Three.js and ThreeNative
   scaffold-first starter), 2 runs each = 8 sessions minimum. There is no
   existing vanilla baseline for these prompts — run vanilla fresh; do not
   reuse collector/lane-runner baselines.
3. Keep prompts, model condition, stop rules, and scorer unchanged per
   `PROTOCOL.md`. Gate on medians, never a single run.

### Rules that keep the measurement honest

- **Do not add a `checkpoint-race` or `physics-knockdown` recipe before or
  during this round.** The entire point is to measure authoring cost when no
  recipe fits. Adding recipes may be good product work later, but a benchmark
  prompt is disqualified the moment a recipe covers it — if recipes are
  added afterward, new off-recipe prompts must replace these.
- The ThreeNative agent MAY scaffold the nearest recipe and author deltas on
  top (that is the realistic user path), or author from the bare starter.
  Record which path each run took in the run report.
- Do not tune starter docs, API card, or diagnostics *against these specific
  prompts* mid-round. Generic fixes discovered from transcripts go into the
  next round, same as `TOKEN-COST-DIRECTION.md` did.

### Pass thresholds

- **Thesis gate (must pass): raw median token ratio <= 2.0x vanilla per
  prompt.** This is the original CHALLENGES.md kill/continue bar for
  authoring, not the 0.5x scaffold gate — off-recipe runs do real authoring
  work and are not expected to hit 0.5x.
- Stretch signal worth calling out if hit: <= 1.0x.
- Secondary: failed-command median <= 1, all runs pass the neutral scorer
  (`TN_BENCH_SCORE_OK`), screenshots meet each prompt's stated visual bar.

### Deliverables

1. `REPORT.md` in the evidence directory with the same table shape as
   `scaffold-first-token-rerun-2026-07-07b/REPORT.md`, plus one column for
   authoring path (recipe-delta vs bare-starter) and a short friction list
   per condition drawn from the transcripts.
2. Update `CHALLENGES.md` item 1 and the closing "honest prior" section with
   the off-recipe result, keeping the same candid register.
3. Update the relevant `docs/status/capabilities/*.md` entry and the
   `docs/STATUS.md` index line if benchmark status claims change.
4. If the gate **fails**, extract the top 3 token sinks from the ThreeNative
   transcripts (same method as `TOKEN-COST-DIRECTION.md` section "What the
   rerun agent actually spent steps on") into a new direction doc. Do not
   start fixing before the analysis is written.

## What NOT to spend time on this round

- More token compaction of `tn iterate`/playtest output — settled.
- New recipes — explicitly forbidden this round (see rules above).
- Visual-contract work (Challenge 3d). It is the next battle, but it needs
  the off-recipe authoring number first: if authoring cost is acceptable,
  visual quality becomes the top priority; if not, authoring cost is.
- Re-running collector/lane-runner. Their scaffold-first numbers are
  recorded; re-confirming them adds nothing.

## Decision table after the round

| Off-recipe result | Meaning | Next move |
| --- | --- | --- |
| Both prompts <= 2x | Authoring thesis alive off the rails | Shift to visual contract + cookbook (CHALLENGES items 2, 4) |
| Mixed (one passes) | Dialect tax bites on specific mechanics | Fix the measured sinks, one more round |
| Both > 2x | Scaffold pass was rails-only; thesis still failing | Apply CHALLENGES "stop building and salvage" analysis seriously |

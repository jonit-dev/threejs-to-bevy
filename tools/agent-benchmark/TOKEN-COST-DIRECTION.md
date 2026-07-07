# Token Cost Direction: Why the 0.5x Gate Still Fails and What To Do

Date: 2026-07-06. Applies to the pending scaffold-first work
(`packages/cli/src/commands/game.ts` enrich/retarget changes) and the next
benchmark rerun.

## Where we are

From `token-cost-version-2-2026-07-07/benchmark-report.json` and the
`scaffold-first-rerun-2026-07-07` collector run:

| Metric (collector) | Vanilla | ThreeNative version 2 | TN scaffold-first rerun | Target |
| --- | --- | --- | --- | --- |
| Raw median tokens | 791,745 | 1,984,022 | ~1,451,385 | <= 395,873 (0.5x) |
| Iterations | 2 | 11.5 | ~repair loop still present | ~vanilla or less |
| Failed commands | 0.5 | 4 | 2 | 0 |
| Tool output bytes | 15 KB | 3.8 MB | 114 KB | already fine |

Lane-runner is worse: 4.0M vs 1.02M (3.93x, needs <= ~510K).

## The key diagnosis: output verbosity is no longer the problem — step count is

The scaffold-first rerun proves the compact-report work landed: total tool
output for the whole session was ~114 KB, yet the session still consumed 1.44M
input tokens, 1.32M of them cached. That means the cost is **conversation
replay per agent step**: every one of the ~35 command steps (plus reasoning
turns) re-sends the growing transcript. At ~25-40K context per step, each
extra step the scaffold forces costs more than the entire tool output of the
session.

Vanilla wins because the agent writes one Three.js file from memory in 2-4
iterations and stops. ThreeNative starts with a *larger* per-step base context
(starter AGENTS.md, API card, scene JSON), so to reach 0.5x it must finish in
roughly **one third** of vanilla's steps — about 10-12 tool steps total.
Shaving more bytes off command output will not close the gap; collapsing the
repair loop will.

Budget math for collector: 12 steps x ~33K average context ≈ 396K, exactly at
the gate. Every step above ~12 puts the gate out of reach regardless of how
compact each command's output is.

## What the rerun agent actually spent steps on

From `scaffold-first-rerun-2026-07-07/logs/collector-threenative-r1.events.jsonl`:

1. **Repairing the scaffold** — the agent had to add a visible player, five
   pickups, score/status/retry HUD, arena floor/bounds, a win state, and `R`
   retry, and fix stale playtests that targeted `scaffold.player`. That is the
   bulk of the ~35 steps and it is all work `tn game plan --apply` should have
   done.
2. **Redundant verification** — `pnpm run validate:authoring`, `pnpm run
   build`, `tn playtest` x3, `tn iterate` x3 (13-14 KB JSON each), plus a dev
   server launch. Seven-plus verification steps where one should do.
3. **Re-reading project files** — `content/scenes/arena.scene.json` read three
   times (~12 KB replayed), `docs/API-CARD.md` in full, plus two `rg` sweeps
   over engine internals (`NumberEx`, HUD bindings) because the API card did
   not answer the question.

## Instructions, in priority order

### 1. Make the scaffold playable with zero edits (biggest lever)

The pending `enrichScaffoldSystems` / `enrichScaffoldUi` /
`retargetStarterPlaytests` work is the right direction. Finish it so that for
each benchmark recipe (`top-down-collector`, and add the lane-runner recipe —
`enrichScaffoldUi` currently only handles `top-down-collector`):

- A fresh starter + `tn game plan --goal <benchmark prompt> --apply --json`
  produces, with **no manual edits**: visible controlled player, visible
  objectives/obstacles, HUD (score/status), win/fail state, retry input, and
  non-blank first render.
- Generated `playtests/*.playtest.json` target the scaffolded entity IDs (no
  stale `scaffold.player` references) and pass immediately.

Add a CLI-level acceptance test that enforces this end to end: scaffold a temp
project, apply the plan, build, run the playtest, assert pass with zero file
edits in between. That test is the ratchet that keeps the step count down; the
benchmark should become a confirmation, not a discovery mechanism.

### 2. Collapse verification into one step

Make `tn iterate` (or a `--full` mode) subsume `validate:authoring` + build +
committed playtests, and return a summary under ~2 KB with only: pass/fail per
gate, first actionable diagnostic per failure, and artifact paths. Then update
the starter AGENTS.md/CLAUDE.md to say explicitly: "verify with `tn iterate`
only; do not run validate/build/playtest separately." Seven verification steps
becoming one saves ~200K+ tokens per session on its own.

### 3. Answer questions in the API card so the agent never greps the engine

The rerun burned two `rg` sweeps (18 KB output plus the steps) on `NumberEx`
and HUD text bindings. Whatever the benchmark archetypes need — HUD text
binding shape, input helpers, math utilities — must be answerable from the
compact API card alone. Audit the rerun transcripts for every `rg`/`sed` into
engine sources and add those answers to the card. Keep the card small; it is
replayed every step, so it should stay a card, not a manual.

### 4. Eliminate repeat file reads with targeted inspection

`arena.scene.json` was read three times. Either keep scaffolded scene files
small enough that one read suffices, or provide a targeted query command
(e.g., `tn scene inspect --node <id> --json`) and advertise it in the starter
instructions so agents stop paging whole JSON files through context.

### 5. Drive failed commands to zero

Version 2 medians were 4 (collector) and 9 (lane-runner) failed commands; each failure
typically triggers a diagnose-retry loop of several steps. For the top failure
modes in the transcripts, make the error message itself contain the fix (exact
flag, exact path, exact schema field) so recovery is one step, not three.

### 6. Add step count to the ratchet

`session.json` version 2 already captures token splits; also record the tool-step
count and gate on it (suggested: <= 12 steps for scaffold-first runs). Steps
are the causal variable; raw tokens are the symptom. A step gate fails fast in
CI without needing a full benchmark rerun.

## Rerun protocol reminder

Per `PROTOCOL.md`: keep prompts, model conditions, run count, and stop rules
unchanged; fresh dated directory under
`tools/verify/artifacts/agent-benchmark/`; both prompts (collector **and**
lane-runner — the current rerun dir only has one collector run); link the
aggregate report from the PRD/status docs. Do not claim progress from a single
run — the gate is on medians.

## What NOT to spend time on

- Further compaction of playtest/iterate output below ~2 KB — output bytes are
  already two orders of magnitude below the cost driver.
- Trimming the root repo docs — benchmark runs happen in starter projects; only
  starter-visible files (starter AGENTS.md/CLAUDE.md, API card, scaffolded
  content) are replayed per step.
- Cost-weighted or cached-token accounting tweaks — the gate is raw tokens by
  protocol; cached tokens still count.

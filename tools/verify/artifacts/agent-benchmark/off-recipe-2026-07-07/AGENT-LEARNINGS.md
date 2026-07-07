# Agent Learnings From Off-Recipe Benchmark

Date: 2026-07-07

This note summarizes how the benchmark agents behaved across the eight
off-recipe sessions. It is intentionally tied to raw artifacts so future fixes
can be audited against transcripts rather than anecdotes.

## Raw Data

- Aggregate: `benchmark-report.json`
- Human report: `REPORT.md`
- Run matrix: `RUNS.txt`
- Run reports: `{checkpoint-race,physics-knockdown}-*/run-report.json`
- Score outputs: `{checkpoint-race,physics-knockdown}-*/score-output.json`
- Sessions: `candidates/{checkpoint-race,physics-knockdown}-*/session.json`
- Transcripts: `candidates/{checkpoint-race,physics-knockdown}-*/codex-events.jsonl`
- Final agent claims: `candidates/{checkpoint-race,physics-knockdown}-*/final-response.txt`

## What Agents Did

Vanilla agents mostly authored a self-contained canvas game and verified it
with a static server plus Playwright. They used fewer shell commands, produced
less tool output, and spent little time searching the repo.

ThreeNative agents could reach playable results, but they behaved like agents
learning an unfamiliar dialect under test pressure. They searched broad repo
areas, inspected JSON and scripts repeatedly, repaired schema/script issues,
and re-ran playtests many times before final proof.

## Quantitative Signals

| Signal | Checkpoint-race ThreeNative | Physics-knockdown ThreeNative |
| --- | ---: | ---: |
| Median raw tokens | 1,829,573.5 | 2,792,109 |
| Raw ratio vs vanilla | 3.614x | 2.008x |
| Median tool steps | 47 | 53 |
| Failed command median | 5.5 | 8 |
| Median tool output bytes | 156,165 | 166,541.5 |

ThreeNative command categories from raw transcripts:

| Run | Playtests | Failed playtests | Inspect commands | Search output bytes |
| --- | ---: | ---: | ---: | ---: |
| checkpoint-race-threenative-r1 | 17 | 4 | 17 | 68,732 |
| checkpoint-race-threenative-r2 | 11 | 1 | 18 | 8,062 |
| physics-knockdown-threenative-r1 | 22 | 6 | 17 | 25,295 |
| physics-knockdown-threenative-r2 | 12 | 2 | 16 | 78,000 |

## Insights

- The recipe-matched scaffold win did not generalize to off-recipe authoring.
  When the mechanic is not already fully scaffolded, agents fall back to a
  long schema/script/proof discovery loop.
- The strongest immediate fix is not another full game recipe. It is a compact
  set of composable mechanic blocks plus proof recipes for common loops:
  checkpoint progress, target knockdown, score, retry, projectile/push object,
  and HUD resource bindings.
- Starter command ambiguity is still expensive. Agents should not need to try
  `tn`, `pnpm tn`, and monorepo `node packages/cli/dist/index.js` variants.
- Diagnostics help, but agents still need the fix in the next command shape.
  Every diagnostic that requires broad repo search is still too expensive.
- Proof artifacts are valuable but too verbose for the repair loop. Agents need
  a compact proof summary first, with links to full JSON only when needed.
- The neutral scorer caught a real benchmark-design issue: one vanilla game had
  a start flow that its own Playwright test handled, but the generic keyboard
  probe did not. Benchmark prompts should either ban pre-start gates or teach
  the scorer a start action.

## What To Do Better

- Put a working local command card in every benchmark candidate before the
  session starts.
- Add `tn cookbook find` or equivalent few-shot lookup for exactly these
  patterns, and reference it from starter instructions.
- Add a single `tn proof`/`tn iterate` mode that emits movement, objective,
  resource/HUD deltas, screenshot paths, and the first fix suggestion in one
  compact JSON object.
- Prefer mechanic blocks over prompt-shaped recipes so the benchmark remains
  honest while reducing repeated authoring cost.
- Add benchmark scorer support for explicit start/reset actions, or make
  "playable without a start click" part of the prompt contract.

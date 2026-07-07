# Off-Recipe Benchmark Report

Date: 2026-07-07

Aggregate report: `benchmark-report.json`

## Verdict

Fail. All eight required off-recipe sessions are recorded and scored. The
measured result fails the PRD-001 `<= 2.0x` raw-token gate for both prompts:

- `checkpoint-race`: ThreeNative median raw tokens were `3.614x` vanilla.
- `physics-knockdown`: ThreeNative median raw tokens were `2.008x` vanilla.

The current aggregate harness also fails its stricter `<= 0.5x` raw-token gate
and the `<= 12` ThreeNative step budget for both prompts. This is a real
off-recipe authoring failure, not a recipe-matched scaffold failure.

## Median Results

| Prompt | Vanilla median raw tokens | ThreeNative median raw tokens | Raw ratio | ThreeNative median steps | Failed command median | Authoring path | Score notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| checkpoint-race | 506,211 | 1,829,573.5 | 3.614x | 47 | 5.5 | recipe-delta/manual structured source | 3 scorer OK, 1 vanilla movement probe failure |
| physics-knockdown | 1,390,836 | 2,792,109 | 2.008x | 53 | 8 | recipe-delta/manual structured source | 4 scorer OK |

`checkpoint-race-vanilla-r1` is still recorded and scored, but the aggregate
excludes it from medians because the neutral keyboard probe reported
`TN_BENCH_NO_MOVEMENT`. The candidate final response claimed a separate
Playwright completion path, so this is evidence of scorer/start-flow mismatch,
not deleted data.

## Scored Runs

| Run | Raw tokens | Tool steps | Failed commands | Tool output bytes | Score |
| --- | ---: | ---: | ---: | ---: | --- |
| checkpoint-race-vanilla-r1 | 1,001,374 | 13 | 0 | 29,513 | failed movement probe |
| checkpoint-race-vanilla-r2 | 506,211 | 10 | 0 | 2,158 | pass |
| checkpoint-race-threenative-r1 | 1,897,575 | 52 | 8 | 197,896 | pass with browser-log warning |
| checkpoint-race-threenative-r2 | 1,761,572 | 42 | 3 | 114,434 | pass with browser-log warning |
| physics-knockdown-vanilla-r1 | 2,213,914 | 29 | 1 | 14,533 | pass |
| physics-knockdown-vanilla-r2 | 567,758 | 8 | 1 | 1,364 | pass |
| physics-knockdown-threenative-r1 | 2,917,799 | 60 | 13 | 171,034 | pass with browser-log warning |
| physics-knockdown-threenative-r2 | 2,666,419 | 46 | 3 | 162,049 | pass with browser-log warning |

## Friction List

- ThreeNative setup/tool invocation was not obvious in candidate directories.
  Three of four ThreeNative runs tried unavailable `tn`/`pnpm tn` forms or
  invalid scaffold-first apply paths before falling back to the monorepo CLI
  path.
- Playtest proof remained the largest loop. The four ThreeNative sessions ran
  62 total playtest commands with 13 failed playtest attempts before final
  proof.
- Source inspection volume stayed high. The four ThreeNative sessions ran 68
  inspect commands and produced 174,727 bytes of inspection output.
- Search output was another token sink. The four ThreeNative sessions produced
  180,089 bytes of search output, mostly while rediscovering schema and script
  conventions.
- Structured-source repair cost remained visible: unsupported script imports,
  missing component schemas, bundle validation, scenario tuning, and proof JSON
  interpretation repeatedly interrupted game-specific work.
- One vanilla candidate was playable by its own final Playwright check but
  failed the neutral scorer because the generic keyboard probe changed no
  pixels before the candidate's start flow.

## Evidence

- `RUNS.txt`
- `benchmark-report.json`
- `aggregate-output.json`
- `{checkpoint-race,physics-knockdown}-*/run-report.json`
- `{checkpoint-race,physics-knockdown}-*/score-output.json`
- `candidates/{checkpoint-race,physics-knockdown}-*/session.json`
- `candidates/{checkpoint-race,physics-knockdown}-*/codex-events.jsonl`
- `AGENT-LEARNINGS.md`

The scorer reported `TN_BENCH_SCORE_OK` for seven of eight runs. The remaining
run has a recorded scorer failure reason and is retained as raw evidence.

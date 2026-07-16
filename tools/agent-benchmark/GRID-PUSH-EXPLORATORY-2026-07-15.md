# Exploratory Grid-Push Authoring Benchmark

This one-pair exploratory run tested a Sokoban-style grid-pushing puzzle before
adding a matching recipe, scaffold, or mechanic block. It is diagnostic
evidence, not a release-gate matrix: the protocol requires three admissible
equal-proof repeats per condition.

The neutral contract requires blocked grid movement, push-only crates, visible
goal/win progression, and reset/retry.

| Condition | Final result | Proof | Human rubric | Raw tokens | Cost-weighted | Tool steps | Admissible |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| ThreeNative | Existing physics-target game, not a grid puzzle | 0/4 | 0 playability, 1 visual | 215,837 | 41,885 | 4 | No: prompt proof missing |
| Vanilla | Polished DOM grid puzzle with the requested loop | 4/4 | 3 playability, 3 visual | 1,487,434 | 285,898 | 13 | No: no canvas; token cap exceeded |
| ThreeNative corrected rerun | Custom grid-push puzzle authored on the starter | 4/4 | 3 playability, 2 visual | 2,825,566 | 457,976 | 24 | No: token cap exceeded |

The naive raw ratio is 0.145x and cost-weighted ratio is 0.147x, but neither is
a valid efficiency result. ThreeNative was cheap because it accepted the wrong
game; vanilla reached the intended loop only outside the scorer and token-cap
contracts. The aggregate verdict is `insufficient-data`.

The corrected rerun proves the semantic fix: the planner emitted
`TN_GAME_PLAN_OFF_RECIPE` with `authoringMode: "custom-on-starter"`, the agent
rejected the unrelated scaffold, and all four prompt assertions passed in real
browser playtests. It is not an efficiency success. Portable-script and
playtest repair consumed nine failed commands and exceeded the 300,000 raw-token
cap by 9.42x. Cached input dominated the raw count; even the cost-weighted
457,976-token measure remained over budget.

## Authoring Finding

`tn game plan` interpreted crate pushing as `add physics-target --count 5`.
That command emitted physics-target source and scenarios, and `tn iterate`
returned `TN_ITERATE_OK` because those scenarios passed. The agent then claimed
completion even though none of the prepared grid-puzzle assertions had
evidence. This is a semantic false green across intent classification and proof
selection, not a renderer failure.

The bounded planner and completion guards are now implemented: unmatched goals
stay on the structured-source starter, proposed mechanics require an inspected
semantic fit, and `TN_ITERATE_OK` is not accepted as prompt completion without
prompt-level evidence. The remaining finding is efficiency: unfamiliar custom
authoring needs a shorter path through portable behavior constraints and
prompt-specific playtests. Do not hide that cost by adding a prompt-shaped
grid-puzzle recipe.

Raw local evidence is under
`tools/verify/artifacts/agent-benchmark/exploratory-grid-push-2026-07-15/`:

- `benchmark-report.json`: aggregate `insufficient-data` verdict.
- `grid-push-puzzle-*/run-report.json`: scorer results.
- `candidates/*/codex-events.jsonl`: authoritative session events.
- `candidates/*/session.json`: token and tool-step accounting.
- `candidates/grid-push-puzzle-threenative-r1/artifacts/iterate/latest/`:
  wrong-game screenshot and scenario evidence.
- `candidates/grid-push-puzzle-vanilla-r1/artifacts/proof/`: neutral proof and
  initial, progress, win, and mobile screenshots.

Corrected evidence is under
`tools/verify/artifacts/agent-benchmark/exploratory-grid-push-fixed-2026-07-15/`:

- `grid-push-puzzle-threenative-r1/run-report.json`: scorer result and 4/4
  neutral proof.
- `candidates/grid-push-puzzle-threenative-r1/session.json`: authoritative
  token, command, and stop-reason accounting.
- `candidates/grid-push-puzzle-threenative-r1/artifacts/iterate/latest/`: the
  four passing prompt-specific browser scenarios and screenshots.

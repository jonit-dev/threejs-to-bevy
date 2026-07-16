# Off-Recipe Authoring Efficiency Rerun (2026-07-16)

## Decision

**FAIL.** All 18 frozen slots were attempted with the same model, reasoning,
permissions, prompt hashes, scorer, and workspace build. Sixteen sessions
produced authoritative `turn.completed` usage; every one exceeded the fixed
300,000 raw-token cap. Two ThreeNative `wave-defense` sessions reached the
25-command hard stop, were interrupted, and did not emit `turn.completed`, so
no session metrics were invented for them.

The clean aggregate contains 16 authoritative run reports and has verdict
`fail`. Five ThreeNative reports also lack complete equal-proof results, and
four exceeded the two-failed-command cap. The matrix command returns
`TN_BENCH_MATRIX_INCOMPLETE`. No token ratio or authoring-smoothness promotion
is claimed.

## Method

- Built the workspace CLI and benchmark runner before starting sessions.
- Prepared three hash-locked prompts, two conditions, and three repeats per
  condition: 18 independent candidate directories.
- Initialized ThreeNative candidates from the generated structured-source
  starter and pinned them to the built workspace CLI; initialized vanilla
  candidates without ThreeNative source.
- Used `gpt-5.6-sol`, medium reasoning, identical unrestricted permissions,
  neutral condition guidance, a 25-command hard stop, and authoritative usage
  only from `turn.completed` events.
- Scored each completed session at its manifest-owned report path, aggregated
  the 16 valid reports, ran the matrix command, and manually inspected the
  first/last screenshots for every completed or capped candidate.

## Authoritative sessions

| Run | Proof | Raw tokens | Cost weighted | Tool steps | Failed commands |
| --- | --- | ---: | ---: | ---: | ---: |
| `grid-push-puzzle-threenative-r1` | pass | 2,105,626 | 341,683.6 | 20 | 1 |
| `grid-push-puzzle-threenative-r2` | pass | 1,493,680 | 287,996.8 | 15 | 0 |
| `grid-push-puzzle-threenative-r3` | fail | 1,222,583 | 232,784.6 | 19 | 3 |
| `grid-push-puzzle-vanilla-r1` | pass | 1,071,566 | 219,546.8 | 13 | 5 |
| `grid-push-puzzle-vanilla-r2` | pass | 1,537,790 | 284,874.8 | 7 | 0 |
| `grid-push-puzzle-vanilla-r3` | pass | 840,032 | 188,230.4 | 6 | 0 |
| `wave-defense-threenative-r1` | fail | 1,946,098 | 401,496.4 | 22 | 4 |
| `wave-defense-vanilla-r1` | pass | 2,037,902 | 341,697.2 | 7 | 2 |
| `wave-defense-vanilla-r2` | pass | 1,231,200 | 255,916.8 | 8 | 0 |
| `wave-defense-vanilla-r3` | pass | 1,509,736 | 285,390.4 | 8 | 0 |
| `turn-based-tactics-threenative-r1` | missing | 2,310,039 | 333,667.8 | 15 | 1 |
| `turn-based-tactics-threenative-r2` | missing | 1,907,057 | 285,041.0 | 17 | 3 |
| `turn-based-tactics-threenative-r3` | missing | 3,158,563 | 420,719.8 | 19 | 4 |
| `turn-based-tactics-vanilla-r1` | pass | 1,251,140 | 253,508.0 | 13 | 6 |
| `turn-based-tactics-vanilla-r2` | pass | 1,341,484 | 322,194.4 | 11 | 2 |
| `turn-based-tactics-vanilla-r3` | pass | 584,945 | 153,175.4 | 8 | 1 |

`wave-defense-threenative-r2` and `wave-defense-threenative-r3` are retained
as capped attempts with event streams and screenshots, but without
`session.json` or scored run reports because no authoritative final usage was
emitted.

## Manual checkpoint

All retained screenshots show nonblank WebGL games matching their prompt.
ThreeNative candidates were clear, basic implementations (manual playability
2, visual 2); vanilla candidates were generally more polished (3, 3). The two
capped wave-defense candidates also show recognizable defenders, enemies,
base state, wave/score HUD, and retry or active-play feedback. These manual
observations do not make incomplete sessions admissible and are not injected
into scorer artifacts.

## Evidence

- `tools/verify/artifacts/agent-benchmark/off-recipe-efficiency-2026-07-16/round-5-prepare-manifest.json`
- `tools/verify/artifacts/agent-benchmark/off-recipe-efficiency-2026-07-16/candidates/`
- `tools/verify/artifacts/agent-benchmark/off-recipe-efficiency-2026-07-16/benchmark-report.json`
- Per-run manifest-owned reports under
  `tools/verify/artifacts/agent-benchmark/off-recipe-efficiency-2026-07-16/<run-id>/run-report.json`

## Retained prior attempt

The 2026-07-15 attempt remains under
`tools/verify/artifacts/agent-benchmark/off-recipe-efficiency-2026-07-15/`.
It stopped after its first authoritative ThreeNative grid-push session used
5,846,058 raw tokens, 45 tool steps, and six failed commands. The 2026-07-16
round supersedes that incomplete operator attempt for current evidence, but
does not overwrite or relabel it.

## Limitations and next owner

This result separates functional rendering from efficient authoring. The
candidate games demonstrate that the authoring path can produce recognizable
off-recipe WebGL games, but the frozen efficiency and equal-proof gates fail.
The runner also needs an authoritative capped-session termination protocol so
a hard stop can preserve final usage without fabricating `turn.completed`.
The spatial recipe remains experimental and this PRD remains active.

## Follow-up repair pilots

The authoring and runner repairs were checked with fresh single-run pilots
before spending another full 18-slot matrix. ThreeNative now has scorer-passing
current-run proof for all three frozen prompts below the 300,000-token cap:

| Prompt | Raw tokens | Tool steps | Failed commands | Proof |
| --- | ---: | ---: | ---: | --- |
| grid push puzzle | 233,690 | 5 | 0 | exact five-assertion pass |
| wave defense | 258,858 | 9 | 1 | exact five-assertion pass |
| turn-based tactics | 263,890 | 12 | 0 | exact current-run pass |

The replacement grid run also proved the runner's full 160,000-token interrupt
reserve after a prior retry exposed an accidental 20% cap in the threshold
formula. Evidence is retained under the `off-recipe-efficiency-2026-07-16-r4-pilot15`,
`r4-pilot12`, and `r4-pilot13` artifact directories respectively.

The fresh vanilla wave control stayed below the raw-token cap but retained no
admissible equal-proof artifact. Its dependency also predated the corrected
exact Three.js pin instruction. The scorer now rejects missing proof explicitly,
but the frozen decision rule forbids weakening proof or thresholds after seeing
runs. Therefore no replacement matrix or efficiency promotion is claimed; the
next bounded owner is condition-neutral scorer-owned proof (or an equally
viable vanilla proof workflow), followed by a completely fresh 18-slot run.

# Round 5 Matrix Status - 2026-07-07

This records the current state after the typed-spec friction fixes from
`NEXT-STEPS-2026-07-07.md`. It is not a benchmark verdict.

## Current Evidence

| Requirement | Required | Current evidence | Status |
|---|---:|---|---|
| Typed-spec collector repeats | 3 proof-passing fresh sessions | `typed-spec-trial-2026-07-07a` has 1 aggregate-admissible proof-passing typed-spec collector run. | missing |
| Direct ThreeNative collector repeats | 3 proof-passing fresh sessions | No direct ThreeNative collector run reports in the typed-spec trial directory. | missing |
| Vanilla collector repeats | 3 proof-passing fresh sessions | No round-5 equal-proof vanilla collector run reports in the typed-spec trial directory. | missing |
| Failed-command friction gate | median 0 by construction before rerun | `pnpm verify:session-cost` passed with `typed-spec-recipe-top-down-collector`: failed commands `0`, manual edits `0`, tool steps `3`, iterate output `1532` bytes. | satisfied for deterministic scaffold path |
| CLI acceptance proof | scaffold + apply + build + playtest, zero manual edits | `tools/verify/artifacts/session-cost/verification-report.json` records `typed-spec-recipe-top-down-collector.acceptance`: scaffold `pass`, game-plan apply `pass`, build `pass`, playtest `pass`, manualEdits `0`, scenario `playtests/top-down-collector.playtest.json`. | satisfied for deterministic scaffold path |
| Step-count lever | `tn iterate` single summary <= 2 KB | Same `verify:session-cost` typed-spec replay reports `1532` stdout bytes. | satisfied for deterministic scaffold path |
| r3 proof-failure diagnostic | movement through route with no state change explains likely owner | Playtest assertion diagnostics now emit `TN_PLAYTEST_RESOURCE_STATE_STAGNATED` when movement occurs but an asserted resource path stays unchanged; the diagnostic summarizes `effect-log.json` resource snapshots and owning systems. r3 evidence shows `collector-system` repeatedly emitted unchanged `GameState` while both `move-player-to-goal` and `collector-system` wrote `Transform`, pointing to an authoring/route collision predicate issue rather than dropped resource writes. | satisfied for future playtests |
| Decision rule | pre-committed before matrix rerun | `ROUND-5-PROTOCOL.md` contains the post-friction pre-commitment. | satisfied |
| Matrix diagnostics | missing cells are machine-readable | `typed-spec-trial-2026-07-07a/benchmark-report.json` emits `TN_BENCH_MATRIX_THREENATIVE_REPEATS_MISSING`, `TN_BENCH_MATRIX_VANILLA_REPEATS_MISSING`, and `TN_BENCH_MATRIX_TYPED_SPEC_REPEATS_MISSING`. | satisfied |
| Matrix CLI gate | incomplete matrix exits nonzero | `node tools/agent-benchmark/dist/index.js matrix --report tools/verify/artifacts/agent-benchmark/typed-spec-trial-2026-07-07a/benchmark-report.json --require-typed-spec --json` returns `TN_BENCH_MATRIX_INCOMPLETE`. | satisfied |
| Scorer/aggregate admissibility | no placeholder session metadata | `score` writes `TN_BENCH_SCORE_SESSION_*` diagnostics for copied or incomplete session metadata, and `aggregate` excludes proof-passing run reports whose session evidence has `tokenCount <= 0` or omits `failedCommandCount`/`toolStepCount`, emitting `TN_BENCH_AGGREGATE_SESSION_*` diagnostics for those cases. | satisfied |
| NEXT-STEPS audit | requirement-level status | `node tools/agent-benchmark/dist/index.js audit --matrix-report tools/verify/artifacts/agent-benchmark/typed-spec-trial-2026-07-07a/benchmark-report.json --session-cost tools/verify/artifacts/session-cost/verification-report.json --round-manifest tools/verify/artifacts/agent-benchmark/round-5-collector-prep-2026-07-07/round-5-prepare-manifest.json --json` returns `TN_BENCH_NEXT_STEPS_AUDIT_INCOMPLETE`; every requirement is complete except the fresh-session comparison matrix. | blocked on sessions |
| Fresh-session candidate prep | 9 collector slots | `tools/verify/artifacts/agent-benchmark/round-5-collector-prep-2026-07-07/round-5-prepare-manifest.json` contains three slots each for typed-spec, direct ThreeNative, and vanilla collector sessions. | ready for operators |
| Prepared-round status | machine-readable slot progress | `node tools/agent-benchmark/dist/index.js status --manifest tools/verify/artifacts/agent-benchmark/round-5-collector-prep-2026-07-07/round-5-prepare-manifest.json --json` reports missing or invalid `session.json`/`run-report.json` evidence per slot, rejects copied session templates or sessions missing `failedCommandCount`/`toolStepCount`, only counts a slot as scored when both files are valid, match the slot, and the run report has `proof.ok: true`, and emits `nextActions[]` for the operator queue. Add `--condition typed-spec`, `--condition threenative`, or `--condition vanilla` to inspect one matrix arm. | ready for operators |
| Next action CLI | single-slot operator queue | `node tools/agent-benchmark/dist/index.js next --manifest tools/verify/artifacts/agent-benchmark/round-5-collector-prep-2026-07-07/round-5-prepare-manifest.json --json` returns the first pending slot action, currently `collector-typed-spec-r1` with `run-fresh-session`; `--condition vanilla` and related filters return the first pending slot for that arm. | ready for operators |

## Admissibility Boundary

The missing matrix cells cannot be filled by copying deterministic scaffold
replays or by inventing token counts. `PROTOCOL.md` requires fresh agent
sessions, stop reasons, token counts, and proof-backed `run-report.json`
artifacts for each condition.

## Next Collection Commands

For each fresh agent-produced candidate, score and aggregate with:

```bash
node tools/agent-benchmark/dist/index.js score \
  --candidate <candidate-dir> \
  --condition <vanilla|threenative|typed-spec> \
  --out tools/verify/artifacts/agent-benchmark/<round-id>/<run-id>/run-report.json \
  --json

node tools/agent-benchmark/dist/index.js aggregate \
  --runs tools/verify/artifacts/agent-benchmark/<round-id> \
  --out tools/verify/artifacts/agent-benchmark/<round-id>/benchmark-report.json \
  --json

node tools/agent-benchmark/dist/index.js status \
  --manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --require-complete \
  --json

node tools/agent-benchmark/dist/index.js next \
  --manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --json

node tools/agent-benchmark/dist/index.js matrix \
  --report tools/verify/artifacts/agent-benchmark/<round-id>/benchmark-report.json \
  --require-typed-spec \
  --json

node tools/agent-benchmark/dist/index.js audit \
  --matrix-report tools/verify/artifacts/agent-benchmark/<round-id>/benchmark-report.json \
  --session-cost tools/verify/artifacts/session-cost/verification-report.json \
  --round-manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --json
```

The rerun remains incomplete until `status --require-complete` passes and the
aggregate report has at least three proof-passing repeats for each required
condition.

# Typed-Spec Trial 2026-07-07a

## Scope

Partial PRD-017 focused benchmark evidence for the `collector` prompt. This is one fresh `typed-spec` repeat only; it does **not** satisfy the default-starter decision threshold.

## Result

- Run: `collector-typed-spec-r1`
- Condition: `typed-spec`
- Stop reason: `claimed-playable`
- Equal proof: passed `collector` required assertions.
- Benchmark score: passed with 1 diagnostic(s).
- Aggregate verdict: `insufficient-data`.

## Metrics

| Metric | Value |
| --- | ---: |
| Raw tokens | 4443576 |
| Input tokens | 4423150 |
| Cached input tokens | 4030592 |
| Uncached input tokens | 392558 |
| Output tokens | 20426 |
| Cost-weighted tokens | 816043 |
| Tool steps | 65 |
| Failed commands | 9 |
| Max same diagnostic chain | 0 |
| Identical assertion repeats | 0 |
| Tool output bytes | 311580 |

## Evidence

- Transcript: `logs/collector-typed-spec-r1.events.jsonl`
- Candidate: `candidates/collector-typed-spec-r1/`
- Session: `candidates/collector-typed-spec-r1/session.json`
- Score report: `collector-typed-spec-r1/run-report.json`
- Aggregate report: `benchmark-report.json`
- Final proof report: `candidates/collector-typed-spec-r1/artifacts/iterate/latest/report.json`
- Final win screenshot: `candidates/collector-typed-spec-r1/artifacts/iterate/latest/playtest/after.png`

## Findings

The run reached `TN_ITERATE_OK` for `playtests/collect-all.playtest.json`, with movement, score `5 / 5`, win-state HUD, and zero playtest diagnostics. The aggregate remains insufficient because the PRD-017 threshold requires three typed-spec repeats plus comparable direct ThreeNative runs for the focused prompt set.

Observed typed-spec friction in this run:

- Generated typed-spec package script calls bare `tn`; the isolated candidate lacked `node_modules/.bin/tn`, so the agent used `pnpm tn -- authoring compile-typed-spec --project . --json`.
- Generated legacy systems document still referenced `movePlayerToGoal`, requiring alignment to the typed-spec script export.
- The agent first wrote entity IDs under system `writes`; the compiler correctly rejected them as undeclared component writes.
- The typed spec initially omitted a camera, producing runtime readiness/canvas failure until the camera and lights were authored in the spec.
- Hiding pickups through `MeshRenderer.visible` required declaring `MeshRenderer` in system writes before playtest diagnostics cleared.

## Decision

Do not make typed spec the default from this evidence. Continue the focused trial with two more `collector` typed-spec repeats and comparable fresh direct ThreeNative collector repeats, then expand to the remaining focused prompts if the collector result is promising.

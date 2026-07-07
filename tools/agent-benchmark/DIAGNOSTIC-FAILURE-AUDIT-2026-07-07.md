# Diagnostic Failure Audit - 2026-07-07

Observed failed commands from benchmark candidate transcripts are grouped below
by repair action. Raw data is in
`tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/candidates/*/codex-events.jsonl`;
session-level failed command counts are in each sibling `session.json`.

| Failure Mode | Evidence | Count | Diagnostic Action |
| --- | --- | ---: | --- |
| `tn` executable unavailable in candidate shells. | `physics-knockdown-threenative-r1`, `checkpoint-race-threenative-r1`, `checkpoint-race-threenative-r2` failed `tn ...` or `pnpm exec tn ...` before switching to repo CLI dist. | 4 | Documented as environment/setup work; no in-process diagnostic can fire when the command is not found. |
| Script module-local constants referenced by exported systems. | `checkpoint-race-threenative-r1`, `checkpoint-race-threenative-r2`, `physics-knockdown-threenative-r1`, `physics-knockdown-threenative-r2` hit `TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED`. | 4 | Already structured with a fix snippet; keep code stable. |
| System writes `GameState` as a component without a schema. | `checkpoint-race-threenative-r1` and `physics-knockdown-threenative-r1` hit `TN_COMPILER_EMITTED_INVALID_BUNDLE` with `writes component 'GameState' without a schema`. | 2 | Add IR schema fix snippets and preserve them through `tn build --json`. |
| Authored `RigidBody.kind: "fixed"`. | `physics-knockdown-threenative-r1` failed `tn authoring validate` with `Unknown rigid body kind 'fixed'`. | 1 | Add exact fix payload: use `static` for immovable fixed objects. |
| Playtest expected movement but input produced no enough movement. | `checkpoint-race-threenative-r1`, `checkpoint-race-threenative-r2`, `physics-knockdown-threenative-r1`, `physics-knockdown-threenative-r2` failed movement-oriented playtests. | 6 | Existing diagnostics include entity, key, distance, threshold, and artifacts; richer auto-repair is deferred to playtest-analysis work. |
| Ad hoc `jq` inspection assumed arrays where artifacts were objects. | `physics-knockdown-threenative-r1` and `physics-knockdown-threenative-r2` failed artifact inspection commands. | 4 | Deferred; this is shell exploration rather than ThreeNative diagnostic output. |
| Vanilla server port already in use. | `physics-knockdown-vanilla-r1` failed `python3 -m http.server 4173`. | 1 | Out of scope for ThreeNative diagnostics. |

Selected top in-process fixes for PRD-005:

1. Missing ECS schema diagnostics now include literal component/resource schema
   snippets.
2. `tn build --json` preserves those fix snippets when bundle validation fails.
3. Rigid body kind validation now includes an exact `fixed` -> `static` repair.

Deferred:

- Recovery-step metric in benchmark reports. The current artifacts expose
  `failedCommandCount`; one-step recovery requires command-pair classification
  in the benchmark analyzer.
- Command-not-found recovery. This needs benchmark harness environment changes
  or generated project instructions, not a CLI diagnostic.

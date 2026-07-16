# Agent Authoring Benchmark Protocol

This benchmark measures how many agent-session tokens and repair iterations it
takes to reach the same playable game prompt in two conditions:

- `vanilla`: a plain Three.js project with no ThreeNative APIs.
- `threenative`: a default ThreeNative structured-source starter.

## Session Rules

1. Start a fresh agent session per run. Do not reuse transcript context across
   runs.
2. Give the agent only the selected prompt plus the condition-specific starter
   instructions. Do not add hidden implementation hints.
3. Token cap: 300,000 total session tokens.
4. Stop when the agent claims playable, hits the token cap, or the operator
   stops a run for setup failure.
5. Derive the final session token count from the AI agent's authoritative
   usage event and record the distinct repair iteration count in `session.json`
   at the candidate project root. For Codex, use `capture-session` against the
   JSONL event stream; do not estimate tokens from files or command output.
6. For version 2 sessions, also capture transcript-derived `inputTokens`,
   `cachedInputTokens`, `uncachedInputTokens`, `outputTokens`,
   `toolOutputBytes`, and `failedCommandCount`. Keep `tokenCount` as the raw
   headline total. Record `toolStepCount` as the number of completed command
   tool executions in the agent session; off-recipe ThreeNative reruns should
   stay at or below 30 steps.

`tokenCount` means actual AI-agent burn: Codex
`turn.completed.usage.input_tokens + output_tokens`, or the equivalent
provider usage counters for another agent. Scaffold-created JSON/source bytes
are excluded. Command stdout/stderr bytes are reported separately as
`toolOutputBytes` and are never converted to tokens.

```bash
node tools/agent-benchmark/dist/index.js capture-session \
  --events <candidate>/codex-events.jsonl \
  --template <candidate>/session.template.json \
  --out <candidate>/session.json \
  --stop-reason claimed-playable \
  --json
```

## Playable Definition

A run is playable only when all of these are true:

- Keyboard input moves a visible actor.
- The actor can move toward a visible objective, reward, checkpoint, or target.
- A win, fail, retry, or score/progression path is reachable.
- The game renders to a browser canvas without a blank first screen.

## Equal-Proof Contract

Round 5 no longer accepts page-load smoke as a vanilla proof substitute. Every
prompt has committed neutral assertions in
`tools/agent-benchmark/src/proof-contract.ts`. Both `vanilla` and
`threenative` run reports must store `proof.requiredAssertionIds`,
`proof.assertions`, `proof.classification`, and `proof.ok`.

Continuity prompts currently include `collector` and `lane-runner`.
Beyond-one-shot prompts currently include `checkpoint-race` and
`physics-knockdown`. The exploratory `grid-push-puzzle` prompt is also
classified beyond-one-shot, but does not become a gate until it has three
admissible repeats per condition. The aggregate gate counts only successful
runs whose proof assertions pass for the shared prompt contract.

## Human Rubric

The operator records two 0-3 scores in `session.json`.

- `playability`: 0 no interaction, 1 partial movement, 2 playable loop with
  rough edges, 3 clear loop with objective and retry/progression.
- `visual`: 0 blank/debug, 1 readable placeholders, 2 cohesive but rough, 3
  polished vertical slice for the prompt.

The scorer does not compute these fields; it only merges them with objective
screenshot and movement metrics.

## Scorer Start Contract

Every candidate must be playable after either of these generic scorer start
signals:

- The preview URL includes `?tn-benchmark-autostart=1`.
- The scorer clicks the page once before probing keyboard input.

Candidates may also start immediately. The scorer applies both start signals
before WASD/arrow-key probes so runs are not lost to menu/start-button handshake
differences between conditions.

## Candidate Layout

Each produced project must include:

- `session.json` following `schemas/session.schema.json`.
- A browser preview path, either `index.html` or `package.json` with `dev` or
  `start`.

When the candidate project should not be modified, place the session file next
to the evidence and pass `--session <path>`.

Run:

```bash
node tools/agent-benchmark/dist/index.js score \
  --candidate <project> \
  --condition vanilla \
  --session <optional-session-json> \
  --json
```

Prepare round-5 fresh-session slots:

```bash
node tools/agent-benchmark/dist/index.js prepare \
  --out tools/verify/artifacts/agent-benchmark/<round-id> \
  --prompt collector \
  --repeats 3 \
  --conditions typed-spec,threenative,vanilla \
  --json
```

Inspect collection progress before aggregating:

```bash
node tools/agent-benchmark/dist/index.js status \
  --manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --condition typed-spec \
  --json

node tools/agent-benchmark/dist/index.js status \
  --manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --require-complete \
  --json

node tools/agent-benchmark/dist/index.js next \
  --manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --condition vanilla \
  --json
```

`status --require-complete` exits nonzero until every prepared slot has a
valid, matching `session.json` plus a valid, matching, proof-passing
`run-report.json`. Session evidence must include non-placeholder `tokenCount`
plus `failedCommandCount` and `toolStepCount`, because those fields feed the
round-5 matrix medians. The status payload includes `nextActions[]` with the
next slot-level action and exact scoring command when a candidate is ready to
score. Add `--condition <vanilla|threenative|typed-spec>` to inspect or dequeue
one arm of the matrix at a time. `next` returns only the first pending action
for queue-based operators.
`score` writes the same session-metric diagnostics into `run-report.json`, and
aggregate reports apply the same admissibility filter, so copied templates or
incomplete session metadata do not count as proof-passing repeats.

Aggregate reports:

```bash
node tools/agent-benchmark/dist/index.js aggregate \
  --runs tools/verify/artifacts/agent-benchmark/pilot-2026-07 \
  --out tools/verify/artifacts/agent-benchmark/pilot-2026-07/benchmark-report.json \
  --json

node tools/agent-benchmark/dist/index.js matrix \
  --report tools/verify/artifacts/agent-benchmark/pilot-2026-07/benchmark-report.json \
  --require-typed-spec \
  --json
```

Audit the post-friction NEXT-STEPS checklist against the aggregate matrix,
session-cost acceptance report, prepared round manifest, and protocol text:

```bash
node tools/agent-benchmark/dist/index.js audit \
  --matrix-report tools/verify/artifacts/agent-benchmark/<round-id>/benchmark-report.json \
  --session-cost tools/verify/artifacts/session-cost/verification-report.json \
  --round-manifest tools/verify/artifacts/agent-benchmark/<round-id>/round-5-prepare-manifest.json \
  --json
```

`audit` exits nonzero until every NEXT-STEPS requirement is complete. It is
expected to remain incomplete while the fresh-session comparison matrix is
missing required proof-passing repeats.

The continuation target is now equal proof instead of the original unequal
`<= 0.5x` raw-token screen:

- Continuity prompts pass when ThreeNative median raw tokens are `<= 1.5x`
  vanilla median raw tokens.
- Beyond-one-shot prompts pass when ThreeNative median raw tokens are `<= 1.0x`
  vanilla median raw tokens.
- Each condition needs at least three proof-passing repeats per prompt.
- ThreeNative failed-command median must be `0`.
- ThreeNative retry-chain medians must stay at same-diagnostic `<= 1` and
  identical failed assertions `== 0`.
- ThreeNative tool-step median remains capped at `<= 30`.

Cost-weighted tokens, cached/uncached input tokens, tool-output bytes, failed
command count, retry chains, and iteration count remain root-cause metrics
alongside the gate verdict.

For `collector` candidates, the scorer infers equal-proof assertion results
from committed playtest `summary.json` artifacts when they include movement,
`resource.GameState.scoreText`, and `resource.GameState.statusText`
assertions. Keep those summaries under the candidate artifact tree so
`run-report.json` can carry machine-readable `proof` without manual editing.

Post-fix reruns must keep the original prompts, model conditions, run count,
and stop rules unchanged. Store fresh rerun artifacts under a new dated
`tools/verify/artifacts/agent-benchmark/<rerun-id>/` directory and link the
aggregate report from the PRD/status docs.

For ThreeNative collector and lane-runner reruns after scaffold-first support,
begin the implementation session with:

```bash
tn game plan --goal "<benchmark prompt>" --project . --apply --json
tn iterate --project . --json
```

Plain `tn game plan --json` remains the non-mutating planning baseline. The
scaffold-first condition must keep generated `playtests/*.playtest.json`
scenarios and `artifacts/game-production/scaffold-first.json` evidence so the
rerun can prove whether the <=0.5x raw-token target is met or still fails.

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
5. Record the final session token count and distinct repair iteration count in
   `session.json` at the candidate project root.
6. For version 2 sessions, also capture transcript-derived `inputTokens`,
   `cachedInputTokens`, `uncachedInputTokens`, `outputTokens`,
   `toolOutputBytes`, and `failedCommandCount`. Keep `tokenCount` as the raw
   headline total. Record `toolStepCount` as the number of completed command
   tool executions in the agent session; off-recipe ThreeNative reruns should
   stay at or below 30 steps.

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
`physics-knockdown`. The aggregate gate counts only successful runs whose
proof assertions pass for the shared prompt contract.

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

Aggregate reports:

```bash
node tools/agent-benchmark/dist/index.js aggregate \
  --runs tools/verify/artifacts/agent-benchmark/pilot-2026-07 \
  --out tools/verify/artifacts/agent-benchmark/pilot-2026-07/benchmark-report.json \
  --json
```

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

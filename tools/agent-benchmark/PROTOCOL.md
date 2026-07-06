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

## Playable Definition

A run is playable only when all of these are true:

- Keyboard input moves a visible actor.
- The actor can move toward a visible objective, reward, checkpoint, or target.
- A win, fail, retry, or score/progression path is reachable.
- The game renders to a browser canvas without a blank first screen.

## Human Rubric

The operator records two 0-3 scores in `session.json`.

- `playability`: 0 no interaction, 1 partial movement, 2 playable loop with
  rough edges, 3 clear loop with objective and retry/progression.
- `visual`: 0 blank/debug, 1 readable placeholders, 2 cohesive but rough, 3
  polished vertical slice for the prompt.

The scorer does not compute these fields; it only merges them with objective
screenshot and movement metrics.

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

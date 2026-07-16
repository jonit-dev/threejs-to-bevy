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
4. Stop when the turn completes, the runner observes the token or tool-call
   cap, or setup genuinely fails. Turn completion is not a playability claim;
   only the equal-proof scorer decides that.
5. The benchmark-owned runner derives the final session token count from the
   app-server's authoritative usage notification and writes `session.json` at
   the candidate root. Do not assert a stop reason, estimate tokens from files,
   or overwrite runner evidence.
6. For version 2 sessions, also capture transcript-derived `inputTokens`,
   `cachedInputTokens`, `uncachedInputTokens`, `outputTokens`,
   `toolOutputBytes`, and `failedCommandCount`. Keep `tokenCount` as the raw
   headline total. Record `toolStepCount` as the number of all completed tool
   invocations (commands, file changes, MCP/dynamic tools, and web searches);
   off-recipe ThreeNative reruns have a 15-step median and 25-step hard cap.

`tokenCount` means actual AI-agent burn: Codex
`turn.completed.usage.input_tokens + output_tokens`, or the equivalent
provider usage counters for another agent. Scaffold-created JSON/source bytes
are excluded. Command stdout/stderr bytes are reported separately as
`toolOutputBytes` and are never converted to tokens.

Launch prepared sessions through `run-session`. It prepends a candidate-local
`tn` wrapper that points at the already-built workspace CLI, passes only the
frozen prompt plus generated neutral condition/proof section, and runs Codex
through its app-server event protocol. It freezes model/reasoning/config, sets
the live 300,000-token goal budget, bounds individual tool output, counts every
tool class, and requests a turn interrupt at the 25-tool cap while retaining
the final usage event. Because provider usage arrives between model calls, the
runner reserves 160,000 tokens and preempts at the first cumulative event at or
above 140,000; this leaves room for the app-server interrupt round trip without
crossing the 300,000 hard cap.
If a tool is in flight when that event arrives, the runner waits for its
completion event before interrupting the turn so the candidate is not left
half-mutated. ThreeNative authoring commands use the generated project's
`node bin/tn` wrapper, including `node bin/tn game plan`, and the isolated
session home exposes the host's configured Playwright browser cache without
passing its host path into the agent environment.
The app-server treats the candidate's benchmark observation protocol as its
project-root marker and disables host plugins, so a run cannot inherit parent
repository skills or plugin instructions. Candidate-local generated
ThreeNative instructions remain available in the ThreeNative condition.
Direct
`codex exec` runs or a globally installed `tn` are not admissible operators.
Nested agent CLIs are shadowed in the candidate PATH and forbidden by the
session instruction because their usage would escape the authoritative thread
accounting.
The candidate-local `tn` wrapper also hides the workspace CLI path from both
conditions. Parent-repository source, scorer implementation, tests, other
runs, and their artifacts are non-public evaluation internals and must not be
inspected by a candidate session.

```bash
node tools/agent-benchmark/dist/index.js run-session \
  --candidate <candidate> \
  --condition <threenative|typed-spec|vanilla> \
  --max-tool-steps 25 \
  --json
```

Each run is append-only and writes `benchmark-protocol.json`,
`codex-app-events.jsonl`, normalized `codex-events.jsonl`,
`runner-result.json`, and `session.json`. `runner-result.json` records the
Codex version, thread/turn IDs, stop cause, final usage, tool count, protocol
snapshot, and an event-stream SHA-256.

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
Beyond-one-shot prompts include `checkpoint-race`, `physics-knockdown`,
`grid-push-puzzle`, `wave-defense`, and `turn-based-tactics`. The off-recipe
matrix is gated only when each prompt has three admissible repeats per
condition. The aggregate gate counts only successful
runs whose proof assertions pass for the shared prompt contract.

Prepared slots store the frozen prompt SHA-256 in both the candidate entry and
manifest. Capture and scoring reject changed or missing `benchmark-prompt.txt`
content. Multi-prompt holdout operator instructions contain only the condition
and neutral proof contract; recipe, block, or fallback implementation hints are
not permitted.

## Observation Route Contract

Candidates do not author benchmark pass/fail results. Before visual polish,
each condition receives the same prepared prompt-specific scorer-owned route
in `benchmark-observation-route.json` and authors the bounded raw scorer-input
state it reaches. The route contains only generic
visible/raw-snapshot bindings and ordered input or wait actions with named
checkpoints. It contains no assertion IDs, expected values, pass flags,
JavaScript or eval payloads, product-specific selectors, or condition-specific
hooks. The scorer owns retained observations and assertion classification.

Preparation writes `benchmark-observation-protocol.json` beside each frozen
prompt and embeds its independent version and SHA-256 in every candidate entry
and round manifest. This observation hash is separate from the unchanged
prompt hash and content-addressed prompt proof contract. Its version comes
from the proof-contract owner, and a drift test keeps preparation from defining
a second version. Both conditions for a prompt receive a byte-identical route
example and protocol. The bounded v1 contract permits at most 16 bindings, 32
route actions, and 2,000 milliseconds in any wait action; pointer coordinates
are normalized to the scored viewport.

The off-recipe routes use the exact scorer-owned route/checkpoint vocabulary:

- Grid: `grid-canvas` (`rendered`), `grid-movement` (`start`, `moved`,
  `blocked`), `grid-push-and-pull` (`start`, `pushed`, `pull-attempt`), and
  `grid-goal-and-retry` (`start`, `progress`, `complete`, `reset`).
- Wave: `wave-canvas` (`rendered`), `wave-defender-control` (`start`, `moved`,
  `aimed`, `attacked`), `wave-progression` (`wave-one`, `wave-two`), and
  `wave-base-failure-retry` (`healthy`, `failed`, `reset`).
- Tactics: `tactics-canvas` (`rendered`), `tactics-unit-control` (`unselected`,
  `selected`, `moved`), `tactics-enemy-turn` (`player-turn`, `opponent-moved`),
  `tactics-success` (`start`, `success`), and `tactics-failure-retry` (`start`,
  `failure`, `reset`).

The playable page exposes `globalThis.__TN_BENCHMARK_OBSERVE__` as a
zero-argument raw snapshot function. It returns `{ actors, metrics, phase }`;
actors have stable IDs, semantic roles, visibility, and applicable cell,
position, or selected state. Every emitted actor and metric must visibly
correlate with the rendered game or visible UI. This observer emits state, not
pass flags or proof conclusions. Grid cells are numeric `[column, row]` tuples.

The agent should author the raw observer-facing state transitions before
polish without rewriting the scorer-owned route. The route is not an
implementation guide or a substitute for a playable game. Agents must
not search broad skill collections or reference trees to construct it; prompt
text, public project instructions, and visible controls are sufficient.

Passing ThreeNative playtest summaries may provide additional scorer-owned
observations. They do not authorize candidate-authored `pass: true` benchmark
JSON. Vanilla and ThreeNative candidates use the same raw route schema; neither
condition is asked to self-assert screenshot proof.

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

Vanilla candidates must declare the repository-pinned `three` dependency,
import it as `THREE`, construct `THREE.WebGLRenderer`, and expose that active
instance as `globalThis.__THREE_BENCHMARK_RENDERER__`. The scorer verifies the
handle is an actual imported renderer instance, owns the scored canvas/context,
and has rendered at least one frame. DOM games, blank/disconnected canvases,
renderer-shaped fakes, and dependency-only impostors are inadmissible.

## Candidate Layout

Each produced project must include:

- `session.json` following `schemas/session.schema.json`.
- The append-only runner/protocol/event files listed above.
- The prepared `benchmark-observation-protocol.json` and scorer-owned
  `benchmark-observation-route.json` following that bounded raw-input contract.
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

The off-recipe matrix uses `--prompts
grid-push-puzzle,wave-defense,turn-based-tactics`, `--repeats 3`, and
`--conditions threenative,vanilla`, producing exactly 18 frozen slots.

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
  --manifest tools/verify/artifacts/agent-benchmark/pilot-2026-07/round-5-prepare-manifest.json \
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

The off-recipe efficiency gate requires both raw and cost-weighted ThreeNative
median ratios `<= 1.0x` vanilla for every prompt. It also caps ThreeNative at a
15-step median/25-step maximum and two failed commands per run. Continuity
history retains its earlier thresholds:

- Continuity prompts pass when ThreeNative median raw tokens are `<= 1.5x`
  vanilla median raw tokens.
- Beyond-one-shot prompts pass when ThreeNative median raw tokens are `<= 1.0x`
  vanilla median raw tokens.
- Each condition needs at least three proof-passing repeats per prompt.
- ThreeNative failed-command median must be `0`.
- ThreeNative retry-chain medians must stay at same-diagnostic `<= 1` and
  identical failed assertions `== 0`.
- ThreeNative tool-step median remains capped at `<= 15`, with every run
  capped at `<= 25`.

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

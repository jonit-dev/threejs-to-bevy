# ThreeNative performance capability matrix

## Canonical commands

Run commands from the project directory with its `bin/tn`, or from the
repository root with the equivalent repository CLI.

### Web FPS and renderer proof

```bash
bin/tn performance proof \
  --project . \
  --target web \
  --url http://127.0.0.1:5173 \
  --frames 120 \
  --out artifacts/performance-loop/<run>/web-proof.json \
  --json
```

The versioned sidecar reports measured frame-time p50/p95/p99, draw calls,
draw groups/programs, visible instances, active LOD bands, texture bytes, and
entity count. Use p95 frame time for the FPS gate:

```text
p95FrameBudgetMs = 1000 / targetFps
p95Fps = 1000 / p95FrameMs
```

### Web CPU/GPU profile

```bash
bin/tn performance trace \
  --project . \
  --url http://127.0.0.1:5173 \
  --seconds 10 \
  --out artifacts/performance-loop/<run>/web-trace.json.gz \
  --json
```

This launches Playwright Chromium and records DevTools timeline, GPU, V8, and
high-resolution CPU-profiler categories. It does not accept a native target.
There is currently no `tn performance compare`; compare matched artifacts with
the bundled skill script.

Restart `tn dev --target web` when source changed or the served module differs
from the built runtime. Do not compare an interactive Chrome trace with a
headless Playwright trace.

### Web/native playtest and parity

```bash
bin/tn playtest \
  --project . \
  --scenario playtests/<scenario>.playtest.json \
  --target web \
  --out artifacts/performance-loop/<run>/web-playtest \
  --stable-artifacts \
  --json

bin/tn playtest \
  --project . \
  --scenario playtests/<scenario>.playtest.json \
  --target desktop \
  --out artifacts/performance-loop/<run>/native-playtest \
  --stable-artifacts \
  --json

bin/tn parity playtest \
  --project . \
  --scenario playtests/<scenario>.playtest.json \
  --targets web,desktop \
  --stable-artifacts \
  --json
```

Preserve `summary.json`, `observations.json`, `runtime-observations.json`,
`runtime-trace.json`, diagnostics, effect logs, and relevant screenshots.
Native playtests additionally write `native-frame-samples.json`.

When a reference image exists, protect visual quality with:

```bash
bin/tn parity visual \
  --project . \
  --url http://127.0.0.1:5173 \
  --reference docs/reference/<target>.png \
  --json
```

### Native FPS

Use `native-frame-samples.json` from the desktop playtest:

```bash
node .codex/skills/threenative-performance-debugging/scripts/summarize-native-frame-samples.mjs \
  <native-frame-samples.json>
```

Judge steady state using samples after tick 20 when present. Otherwise disclose
the fallback window and use drop-first samples. Keep startup results separate.

### Native static performance proof

```bash
bin/tn performance proof \
  --project . \
  --target desktop \
  --out artifacts/performance-loop/<run>/native-proof.json \
  --json
```

The current Bevy collector promotes static bundle/entity/texture/LOD metrics
but reports frame time, draw calls, draw groups, and visible instances as
unsupported. Never use this sidecar alone to claim native FPS.

There is no promoted `tn performance trace --target desktop` CPU/GPU profiler.
Use native frame samples and runtime traces first. If an environment-approved
native profiler such as Linux `perf` is already available, use it only as
supplemental matched diagnosis against the exact proof-harness/native binary;
record symbols, build mode, command, and capture conditions. It does not
replace desktop playtest FPS evidence.

## Artifact roles

| Artifact | Web | Native | Acceptance role |
| --- | --- | --- | --- |
| `performance-proof.json` | Measured FPS/render counters | Static metrics; frame timing unsupported | Web p95 gate only |
| `performance-trace.json.gz` | DevTools CPU/GPU diagnosis | Unsupported | Bottleneck diagnosis, not FPS gate |
| `native-frame-samples.json` | Not emitted | Measured frame samples | Native p95 gate |
| `runtime-trace.json` | Semantic/runtime observations | Semantic/runtime observations | Diagnose and prevent behavior drift |
| playtest `summary.json` | Gameplay and diagnostics | Gameplay and diagnostics | Required correctness gate |
| `tn parity playtest` report | Paired target behavior | Paired target behavior | Required for shared behavior changes |

## Measurement integrity

- Match machine load, scenario, input, viewport, quality profile, browser or
  native build, warmup, duration/sample count, and tool version.
- Capture before and after sequentially. Prefer an A/B/A confirmation when
  noise is high.
- Use immutable round directories and retain failed/rejected snapshots.
- Record cold-start and steady-state separately.
- FPS target acceptance uses p95 frame time, not average FPS.
- At 60 FPS the p95 budget is 16.667 ms; at 30 FPS it is 33.333 ms.
- A trace hotspot improvement is insufficient when target FPS regresses.
- A target passes only with fresh evidence from that target.

## Isolation ladder

Use the smallest controlled experiment that answers the current question:

1. Disable systems/scripts while preserving scene/render inputs.
2. Replace texture/material-heavy inputs with source-owned controlled variants.
3. Disable or lower one renderer feature only as a diagnostic experiment.
4. Reduce entity/draw/physics load in a controlled fixture.
5. Compare the isolated result, then fix the real durable owner.

Do not ship the isolation variant unless it preserves the requested product and
quality requirements.

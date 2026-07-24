---
name: threenative-performance-optimization-loop
description: Profile and optimize ThreeNative games on both Three.js web and Bevy native targets through sequential baseline/change/follow-up evidence until a requested steady-state FPS target is met (default 60). Use for low FPS, frame spikes, CPU/GPU bottlenecks, performance regressions, render or script cost investigations, matched before/after profiling, and web/native performance acceptance.
---

# ThreeNative Performance Optimization Loop

Drive a sequence of bounded measure-identify-fix-verify rounds. Default to both `web` and
`desktop`, a 60 FPS target, p95 frame time acceptance, and 120 measured frames.
Do not claim completion until every requested target passes.

Read [references/capabilities.md](references/capabilities.md) before the first
run. It records the exact commands, artifacts, and current native limitations.

## Establish the contract

Resolve these values from the request or repository; use the defaults when
unspecified:

- project and committed playtest scenario
- targets: `web,desktop`
- target FPS: `60`
- p95 budget: `1000 / targetFps` milliseconds (`16.667` at 60 FPS)
- sample count: `120`
- web trace duration: `10` seconds
- acceptance window: steady-state samples after tick 20

Treat `desktop`, `native`, and `bevy` as the Bevy target, but use `desktop` in
new commands and artifact names.

Before measuring:

1. Read the repository `AGENTS.md`.
2. Identify the durable owner of the suspected cost.
3. Record the current git commit and dirty-worktree state without modifying
   unrelated changes.
4. Build only affected packages.
5. Stop or wait for unrelated CPU/GPU-heavy processes. Never compare captures
   taken under different contention.
6. Use one scenario, viewport, quality profile, build mode, warmup, input
   sequence, browser/runtime version, and machine for the whole series.

## Create a sequential baseline

Use a unique immutable directory such as:

```text
artifacts/performance-loop/<timestamp>/round-00-before/
```

Never overwrite a baseline with `latest`.

For web:

1. Start or restart `tn dev --target web`; verify served runtime modules are
   fresh after package changes.
2. Run `tn performance proof` for measured frame percentiles and renderer
   counters.
3. Run the committed web playtest with stable input and inspect gameplay,
   diagnostics, `runtime-trace.json`, and visual evidence.
4. Run `tn performance trace` for Playwright/CDP CPU/GPU evidence.

For native:

1. Run the same scenario with `tn playtest --target desktop`.
2. Preserve `native-frame-samples.json`, `runtime-trace.json`, summary,
   observations, diagnostics, and screenshots when requested.
3. Summarize all, startup, after-tick-10, and after-tick-20 windows.
4. Run `tn performance proof --target desktop` for supported static metrics,
   but never use it as native FPS proof while frame timing is reported
   unsupported.

Run `tn parity playtest --targets web,desktop` when shared behavior could
change. When a visual reference exists, rerun `tn parity visual` under the
same viewport. Performance gains do not excuse gameplay or visual drift.

## Diagnose one bottleneck

Separate startup from steady-state and CPU/script from rendering/GPU cost.

- Web: inspect the DevTools trace's top self and inclusive CPU stacks, GC,
  long tasks, frame events, shader compilation, uploads, draw calls, programs,
  textures, triangles, and dropped frames.
- Native: inspect after-tick-20 frame percentiles and spikes, semantic runtime
  traces, diagnostics, asset/material load behavior, systems, entity counts,
  and supported native counters.
- Both: compare script-disabled and render/material-light controlled variants
  only when they preserve the scenario sufficiently to isolate one hypothesis.

Choose the largest measured actionable bottleneck. State the hypothesis and
expected metric before editing.

## Optimize the durable owner

Make one bounded optimization per round. Preserve authored values, gameplay,
visual intent, public contracts, and target parity. Edit source, scripts,
adapter/runtime code, registries, or verification owners—not generated bundles,
`dist/**`, or `scripts.bundle.js`.

Add focused positive and negative tests for shared runtime changes. Update
required status/capability documentation under repository policy.

Do not:

- lower quality, resolution, assertions, sample counts, or target budgets to
  manufacture a pass
- compare debug and release builds, different viewports, different scenarios,
  cold and warm captures, or headless and interactive runs as if matched
- claim FPS from a Chrome CPU trace or native static proof
- stack several speculative optimizations before remeasuring

## Capture the immediate follow-up

After every change:

1. Run focused tests/builds.
2. Restart stale previews or native binaries.
3. Capture `round-NN-after` immediately with the same commands and conditions.
4. Compare it only with `round-NN-before`.
5. If accepted, copy/link the after snapshot as the next round's before
   snapshot. If rejected, revert only this round's owned change when safe, or
   leave it clearly identified for user review.

Use the bundled comparator:

```bash
node <skill-dir>/scripts/compare-performance-snapshots.mjs \
  --target both \
  --target-fps 60 \
  --min-samples 120 \
  --before-web-proof <before-web-proof.json> \
  --after-web-proof <after-web-proof.json> \
  --before-native-samples <before-native-frame-samples.json> \
  --after-native-samples <after-native-frame-samples.json> \
  --before-web-trace <before-performance-trace.json.gz> \
  --after-web-trace <after-performance-trace.json.gz> \
  --out <round-comparison.json> \
  --json
```

The comparator exits `0` only when all requested targets meet the p95 budget,
`1` when evidence is valid but a target misses it, and `2` for missing or
invalid evidence. Trace deltas are diagnostic; proof/sample p95 values decide
FPS acceptance.

## Continue or stop

Continue through measured rounds until one terminal condition:

- **Pass:** web and native p95 frame time are each at or below
  `1000 / targetFps`, gameplay/parity checks pass, no material visual
  regression is introduced, and the result is reproduced in a final fresh
  capture.
- **Regression:** the optimization worsens the primary target or causes
  gameplay/visual drift. Reject or repair the round, then continue from the
  last accepted snapshot.
- **Environment blocker:** native display/capture, browser, build, or machine
  contention prevents matched evidence. Report the exact diagnostic and keep
  the last valid baseline.
- **Scope blocker:** no safe in-scope optimization remains, or meeting the
  target requires a user decision about architecture, product behavior, or
  visible quality. Report the measured gap and request that decision.

Do not stop after an improvement while a requested target still fails. Ask
before expanding scope into architecture changes or materially reducing visual
quality, and resume the loop after the user resolves the blocker.

## Final evidence

Report:

- exact target FPS and p95 millisecond budget
- exact commands, target, scenario, viewport/profile, sample window, build
  mode, and environment caveats
- a per-round table with before/after p50, p95, p99, derived p95 FPS, and delta
- top web CPU improvements/regressions from matched traces
- native steady-state and spike summary
- accepted and rejected changes
- final artifact paths
- gameplay/parity and focused test results
- unsupported measurements and remaining uncertainty

Do not average web and native together. The slower requested target determines
the final status.

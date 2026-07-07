# Game Production Status

Generated games and playable examples are treated as small polished vertical
slices, not blockouts.

Current support:

- Planning, cookbook, recipe, iterate, playtest, QA, score, and release
  workflows exist for structured-source games.
- `tn game plan --apply --json` explicitly applies scaffold-first collector
  and lane-runner baselines through bounded recipe operations, writes committed
  playtest scenarios, and records `artifacts/game-production/scaffold-first.json`.
- `verify:generated-games` is being narrowed to representative release
  evidence, while de-enrolled examples remain covered by a cheaper build-only
  sweep.
- Finished examples must prove build, nonblank screenshots, visible motion,
  input playtests, visual quality, and source ownership.
- Fresh scaffold-first token-cost evidence passes the <=0.5x raw-token target:
  collector median 98,244.5 vs 791,745 vanilla (0.124x), lane-runner median
  84,250.5 vs 1,020,845 vanilla (0.083x), with 3.5 median tool steps and zero
  failed-command median. Evidence:
  `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/`.

Verification:

- `pnpm verify:generated-games`
- `pnpm verify:example-build-sweep`
- `pnpm verify:smoke`
- `tn iterate --project . --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

# Game Production Status

Generated games and playable examples are treated as small polished vertical
slices, not blockouts.

Current support:

- Planning, cookbook, recipe, iterate, playtest, QA, score, and release
  workflows exist for structured-source games.
- `tn create --archetype <top-down|third-person|first-person|side-scroller|racing>`
  emits an L1 archetype descriptor, controller stub, look profile, package
  proof script, and movement probe; `tn game plan` selects and reports the same
  archetypes from goal vocabulary in both compact output and `plan.json`.
- `tn add <spawner|timer|trigger-sequence|score|projectile|follow-camera>`
  composes L2 mechanic blocks into structured source, writes
  `content/mechanics/*.mechanic.json`, emits block playtest scenarios, and
  preserves authoring validation.
- `tn look apply <arcade-neon|forest-dawn|sunset-racer|toybox-pop|noir-metal>`
  applies curated scaffold polish through runtime and material source
  operations without exposing renderer internals.
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
- Fresh off-recipe evidence fails the <=2x raw-token authoring gate:
  checkpoint-race median 1,829,573.5 vs 506,211 vanilla (3.614x), and
  physics-knockdown median 2,792,109 vs 1,390,836 vanilla (2.008x), with
  47-53 median ThreeNative tool steps. Evidence:
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/`.

Verification:

- `node ../../scripts/run-package-tests.mjs dist/commands/create.test.js`
  from `packages/cli` (324 CLI tests passed after a full workspace build,
  including archetype create/game-plan coverage).
- `node --test packages/cli/dist/commands/look.test.js packages/cli/dist/verify/renderingQuality.test.js`
- `pnpm --filter @threenative/cli test` (337 CLI tests, including all six
  mechanic block writers and authoring validation).
- `pnpm verify:generated-games`
- `pnpm verify:example-build-sweep`
- `pnpm verify:smoke`
- `tn iterate --project . --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

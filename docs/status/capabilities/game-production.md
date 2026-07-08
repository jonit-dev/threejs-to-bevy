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
- Declarative gameplay-flow contracts are emerging behind bounded operations:
  `tn scene set-spawner` persists typed `Spawner` components with deterministic
  web/native trace tests, while `tn flow create|add-state|add-transition` and
  `tn sequence create|add-track|add-key` write validated structured source and
  compiler-emitted `game-flow.ir.json` / `sequences.ir.json` bundle entries.
  Full runtime GameFlow/Sequence evaluators remain future work; unsupported
  trigger/action/track kinds fail closed in validation.
- `tn look apply <arcade-neon|forest-dawn|sunset-racer|toybox-pop|noir-metal>`
  applies curated scaffold polish through runtime and material source
  operations without exposing renderer internals.
- `tn world generate --biome <meadow|forest|desert|canyon|arctic> --seed <n>`
  creates deterministic heightmap terrain, terrain-aware scatter source, and
  catalog provenance; `tn world proof --json` records the terrain/scatter proof
  artifact consumed by game scoring as world/environment evidence, including
  flat-heightmap rejection through `flatPlaneRisk` and a heightmap preview PNG
  for manual world review.
- `tn game plan --apply --json` explicitly applies scaffold-first collector
  and lane-runner baselines through bounded recipe operations, writes committed
  playtest scenarios, and records `artifacts/game-production/scaffold-first.json`.
  Collector apply now emits movement, pickup, win-state, and retry proof-family
  scenarios and tells agents to verify with `tn iterate --project . --json`.
- `verify:generated-games` gates the representative release evidence set
  (`examples/humanoid-physics-course`, `examples/metro-surfer-heist`) and
  reports the build-only archived set (`examples/stylized-nature-component`);
  `verify:example-build-sweep` keeps de-enrolled examples buildable without
  requiring full QA/release evidence.
- Finished examples must prove build, nonblank screenshots, visible motion,
  input playtests, visual quality, and source ownership.
- Fresh scaffold-first token-cost evidence passes the <=0.5x raw-token target:
  collector median 98,244.5 vs 791,745 vanilla (0.124x), lane-runner median
  84,250.5 vs 1,020,845 vanilla (0.083x), with 3.5 median tool steps and zero
  failed-command median. Evidence:
  `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/`.
- Fresh guided Round-5 collector evidence also passes the <=0.5x raw-token
  target under equal-proof assertions and current vanilla controls: direct
  ThreeNative median 20,950 vs 46,192 vanilla (0.454x), typed-spec median
  20,000, with 9/9 proof-passing scored slots and green status/matrix/audit.
  The aggregate verdict remains failed only on the non-token failed-command
  budget. Evidence:
  `tools/verify/artifacts/agent-benchmark/round-5-collector-guided-2026-07-08/`.
- Fresh off-recipe evidence fails the <=2x raw-token authoring gate:
  checkpoint-race median 1,829,573.5 vs 506,211 vanilla (3.614x), and
  physics-knockdown median 2,792,109 vs 1,390,836 vanilla (2.008x), with
  47-53 median ThreeNative tool steps. Evidence:
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/`.
- Round-5 protocol replaces unequal raw-token comparison with committed
  equal-proof assertions for vanilla and ThreeNative, at least three repeats
  per condition, and continuity/beyond-one-shot token thresholds. Round-5B
  preparation covers lane-runner, checkpoint-race, and physics-knockdown only
  after the next-steps audit and churn budgets are green.

Verification:

- `node ../../scripts/run-package-tests.mjs dist/commands/create.test.js`
  from `packages/cli` (324 CLI tests passed after a full workspace build,
  including archetype create/game-plan coverage).
- `node --test packages/cli/dist/commands/look.test.js packages/cli/dist/verify/renderingQuality.test.js`
- `pnpm --filter @threenative/cli test` (354 CLI tests, including all six
  mechanic block writers, proof-family game plan apply, and authoring
  validation).
- `pnpm --filter @threenative/agent-benchmark test`
- `pnpm verify:generated-games`
- `pnpm verify:example-build-sweep`
- `pnpm verify:smoke`
- `tn iterate --project . --json`
- `tn world generate --biome meadow --seed 7 --json`
- `tn world proof --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).

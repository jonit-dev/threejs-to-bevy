# Engine Readiness Report - Small/Mid-Sized Games

Original report: 2026-07-08. Updated through: 2026-07-09.

Sources: `docs/STATUS.md`, `docs/status/capabilities/*.md`,
`docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`, completed PRDs, focused-gate
implementations, and committed benchmark evidence under
`tools/verify/artifacts/agent-benchmark/`.

## Verdict

- ✅ **Small web-first games: ready today.** ThreeNative has an end-to-end
  structured authoring, runtime, playtest, visual-proof, QA, and release-gate
  path. `examples/metro-surfer-heist` remains the release-enrolled vertical
  slice.
- ⚠️ **Mid-sized web-first games: build-proven, not release-proven.**
  `examples/neon-harbor-rescue` now exercises menus, settings, two gameplay
  phases, HUD bindings, audio metadata, saved-progress metadata, fail/retry,
  and seven passing web iterate scenarios. It is intentionally build-only
  until production art, real local-data persistence, interactive settings
  proof, and visual/release evidence land.
- ⚠️ **Native Bevy: bounded and evidence-gated.** Bevy consumes emitted IR and
  now has focused gameplay, rendering, UI, physics, and audio/platform proof.
  The native promotion freeze still applies to new claims: shipped-game need,
  web evidence, native evidence, and a focused gate are required.
- ❌ **Broad "mid-sized games are release-ready" is not yet supportable.** One
  forcing-function project builds and iterates, but no mid-sized title is
  release-enrolled or shipped, and the off-recipe authoring-cost gate remains
  red.

## Latest accomplishments

- ✅ **Mid-size enabling contracts landed.** GameFlow, Sequence, Spawner,
  actor archetypes, typed scripting, delayed commands, particle commands,
  script audio, character/physics contacts, terrain/biomes, and efficient-scale
  proof are implemented with focused evidence. Contract de-sprawl split
  authoring operations and introduced shared runtime traces.
- ✅ **The adapter-surface remediation bundle is complete.** Generated-game
  proof enrollment is config-owned; migrated authoring operations expose
  executable adapter metadata; CLI commands have a typed registry substrate;
  editor operations/composites use shared metadata; and drift gates guard the
  remaining explicit gaps.
- ✅ **The system-quality remediation bundle is complete.** High-risk IR
  contract drift, web/native loop scheduling, native live spawn/despawn
  reconciliation, and compiler bundle planning/writer separation now have
  focused tests and shared fixtures.
- ✅ **Runtime correctness and performance audit findings closed.** The July 9
  audit reports all 16 confirmed correctness, parity, lifecycle, and
  algorithmic findings fixed. Long-running cross-hardware dense-physics and
  browser GPU-memory history remain monitoring items.
- ✅ **Gameplay parity became executable release evidence.** `tn parity
  playtest`, comparison reports, coverage-debt checks, negative controls,
  timing/state probes, and the `verify:gameplay-parity` gate now bound web and
  desktop claims.
- ✅ **Portable rendering depth expanded substantially.** Shader material
  authoring/parity, fitted cross-adapter render-look calibration, AO monotonic
  sweeps, bloom, depth of field, motion trails, and wet-floor SSR have focused
  web+Bevy fixtures and `verify:rendering-photoreal` evidence.
- ✅ **Feature-parity polishing closed five focused slices.** Shared residual
  contracts, visual calibration, native UI/text/accessibility, native
  physics/navigation depth, and audio/platform runtime policy each gained an
  aggregate focused gate.
- ✅ **Proof ownership and diagnostics improved.** Gate descriptors now own
  migrated focused/release surfaces; examples and templates have manifest
  ownership; game-quality metrics are bundle-backed; and stagnant or repeated
  playtest failures produce source-linked diagnostics.
- ✅ **Scaffold-first efficiency remains strong.** Committed evidence reports
  collector at 0.124x and lane-runner at 0.083x vanilla raw tokens. Guided
  Round 5 collector reaches 0.454x under equal-proof assertions.

## Remaining warnings and failures

- ❌ **Off-recipe authoring cost still fails the product gate.** Checkpoint
  race is 3.614x vanilla raw tokens and physics knockdown is 2.008x against a
  <=2x target, with 47-53 median ThreeNative tool steps. Round 5B still needs
  fresh measured reruns after the new churn and diagnostic ratchets.
- ❌ **The guided Round 5 aggregate is not wholly green.** Token efficiency
  passes, but the committed aggregate still fails its non-token failed-command
  budget.
- ⚠️ **Neon Harbor Rescue is not a release proof.** Placeholder primitives,
  metadata-only saved progress, incomplete interactive settings input proof,
  and missing visual-quality/release artifacts are recorded in
  `examples/neon-harbor-rescue/FRICTION.md`.
- ⚠️ **Contract truth is improved, not centralized.** SDK, IR, compiler, web,
  Bevy, CLI/editor/MCP, and verification registries still span multiple
  ownership layers. Remaining descriptor allowlists and unschemed documents
  must keep shrinking.
- ⚠️ **Photoreal parity remains backend-bounded.** Bevy 0.14 deferred/forward
  reflection response differs from web, and persistent temporal history adds
  render-resource lifecycle risk. Existing cleanup/reset/parity tests must
  remain green.
- ⚠️ **Several product boundaries remain explicit.** IME/virtual keyboards,
  platform screen readers, broad native UI effects, advanced navigation,
  vehicles/soft bodies/ragdolls, multi-window platform behavior, and signed
  installers/store packaging are not broad portable promotions.
- ⚠️ **Cross-hardware budgets need history.** Dense physics at 5,000 bodies and
  browser GPU-memory behavior need sustained hardware samples before tighter
  release budgets are justified.

## Recommended next steps

1. ✅ Treat the adapter, leverage-point, feature-parity-polishing, systems
   remediation, and gameplay-parity bundles as completed foundations; do not
   reopen duplicate registries or one-off proof lists.
2. ⚠️ Promote `neon-harbor-rescue` from build-only only after replacing hero
   placeholders, wiring durable persistence, proving interactive settings,
   and adding screenshot/contact-sheet plus release-proof artifacts.
3. ❌ Rerun Round 5B for lane runner, checkpoint race, and physics knockdown;
   do not claim off-recipe efficiency until both token and failed-command
   budgets pass.
4. ⚠️ Continue descriptor/schema migration where explicit gaps remain, with
   drift tests for every non-derived surface.
5. ⚠️ Accumulate cross-hardware physics/GPU history, then rerate the systems
   quality score and tighten budgets only from measured data.
6. ⚠️ Finish the remaining active product work, especially advanced
   animation/physics depth and signed installer/store packaging, without
   bypassing the native-promotion policy.

## Current operating guidance

- ✅ Use structured source, registry-backed `tn` operations, `tn iterate`, and
  focused proof gates as the supported production path.
- ✅ Use web as the primary runtime and webview packaging where it satisfies
  the shipped-game requirement.
- ⚠️ Treat every native promotion and every new proof requirement as
  evidence-owned, descriptor-backed work.
- ❌ Do not call build-only examples, trace-only native rows, or passing token
  ratios release readiness by themselves.

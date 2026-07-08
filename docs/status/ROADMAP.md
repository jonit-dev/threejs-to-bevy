# ThreeNative Roadmap

Status: proposed 2026-07-05. This is the strategic front door for "what next";
`docs/STATUS.md` remains the front door for "what works today".

## North Star

A viable game engine where an AI agent (or human) can go from a game idea to a
polished, performant, playable game that runs identically on web (Three.js) and
native (Bevy), and can *prove* it at every step.

That decomposes into five product qualities, in priority order:

1. **Easy agent dev** — the authoring-to-proof loop is fast, bounded, and
   trustworthy. An agent can always answer "does my game work?" cheaply.
2. **Parity** — one IR, two runtimes, same behavior. Parity is proven by
   shared trace contracts and behavioral tests, not by duplicated code and
   subjective screenshots.
3. **Nice looks** — the zero-config default output looks like a finished game,
   not a tech demo. Cinematic look, real materials, believable environments.
4. **Efficient** — dense scenes are affordable at runtime (instancing,
   culling, LOD, streaming), proven by measured budgets, not metadata.
5. **Viable** — the capability surface covers what real small/mid games need
   (gameplay flow, animation depth, terrain, distribution), with everything
   else failing loudly at a documented boundary.

## Where We Are (2026-07)

Strengths: unusually broad promoted surface — ECS/app model, portable
scripting with effect validation, PBR rendering baseline, physics + character
controller, skeletal animation, retained UI, spatial audio, persistence,
structured-source authoring (CLI/MCP/editor), desktop packaging, and a large
verify-gate suite.

The binding constraints (per `docs/audits/FOUNDATIONAL_BOTTLENECK_AUDIT_2026-07-05.md`):

- **Proof asymmetry**: `tn playtest`/`screenshot`/`record`/`game qa` input
  proof is web-only; the Bevy runtime has no behavioral proof path.
- **Narrow proof loop**: playtest is single-input, movement-centric, one-shot;
  no scenario sequences, weak assertions, no fast failure-to-fix tier.
- **Contract sprawl**: authoring operations monolith (5k+ lines), duplicated
  web/Bevy mapping code, 2.8k-line status docs — velocity tax on every change.
- **Visual ceiling**: `cinematic` look, terrain/open worlds, and advanced
  rendering are aspirational tiers; the default output reads "stylized demo".

The roadmap sequences fixes to those constraints. Rule of thumb: **do not
start a phase's headline feature until the previous phase's proof
infrastructure exists to verify it.**

## Active PRD Slices

Use these implementation PRDs as the executable backlog for this roadmap:

- **Track 1 — Agent Proof Loop:**
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-001-agent-proof-loop-scenario-ratchet.md`
- **Track 2 — Completed Web-First Proof:**
  `docs/PRDs/done/PRD-002-humanoid-course-stair-traversal-proof.md`
- **Track 3 — Boundaries And Contract Hygiene:**
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-003-external-services-media-boundaries.md` and
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-004-contract-de-sprawl-authoring-runtime-traces.md`
- **Track 4 — Nice Looks by Default:**
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-005-cinematic-default-look.md` and
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-006-believable-world-terrain-and-biome-dressing.md`
- **Track 5 — Efficient at Scale:**
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-007-runtime-proven-efficient-scale.md`
- **Track 6 — Capability Depth:**
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-008-declarative-gameplay-flow-spawners-sequencer.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-009-actor-archetypes-and-typed-scripting.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-010-portable-scripting-audio-facade.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-011-portable-scripting-delayed-commands-scheduling.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-012-portable-scripting-particle-commands.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-013-portable-scripting-character-physics-contacts.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-014-portable-shader-material-parity.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-015-portable-photoreal-rendering-and-postprocessing.md`,
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-016-advanced-animation-physics-depth.md`, and
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-017-signed-installers-store-packaging.md`
- **Frozen Native Tracks:**
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-018-native-parity-closure-and-proof-loop.md` and
  `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-019-native-render-parity-and-performance.md`

## Phase 1 — Agent Proof Loop (the foundation)

Goal: `tn playtest` becomes the default self-verification harness every agent
runs before claiming "works". Everything later in this roadmap is verified
through it.

- Scenario-driven playtests: `playtests/*.playtest.json` with multi-step input
  sequences (move, wait, interact, assert), not one keypress.
- Rich assertions: resources/GameState values, UI text/visibility, camera
  pose/occupancy, physics contacts/triggers, diagnostics-clean, entity
  position/bounds — in addition to existing signed-axis and follow checks.
- `tn playtest --discover`: infer runnable scenarios from authored input +
  player source so a bare project still gets a smoke playtest.
- Artifact bundle per run (report + screenshot + optional recording) with the
  existing freshness sidecar metadata; `--watch` mode for the edit loop.
- Proof tiering promoted as an explicit contract: `tn playtest` (seconds) →
  `tn game qa --run-proof` (scenario smoke, minutes) → `verify:*` (release).
  Generated-project instructions and templates teach this tier order.

Exit criteria: every maintained starter and generated-game example carries at
least one scenario playtest; `verify:generated-games` requires it; the audit's
"agents cannot cheaply prove a game works" finding is closed.

## Phase 2 — Native Parity Closure (parity you can prove)

Goal: the Bevy runtime is a first-class proof target, and parity claims move
from duplicated implementations + visual gates to shared behavioral contracts.

- Native proof harness: `tn playtest --target desktop`, `tn screenshot`, and
  `tn game qa` drive the Bevy runtime with the same scenario files and
  assertion vocabulary (headless via Xvfb where needed).
- Parity ratchet gate: every scenario playtest that passes on web must pass on
  native for promoted capabilities; regressions block release.
- Trace contracts over code duplication: extract small shared semantic-state
  trace schemas (transform/physics/UI/animation snapshots) that both adapters
  emit, so conformance compares traces instead of maintaining parallel logic.
  Use this to justify — not precede — refactors of the Bevy mapping hotspots
  (`map_world.rs`, `ui.rs`, `conformance.rs`, loader `types.rs`).
- Close the remaining Partial parity rows (point/spot light fidelity, texture
  slots, instancing/batching, atmosphere, first-person walkthrough on Bevy)
  under the new ratchet rather than as one-off screenshot fixes.

Exit criteria: an agent can build a game and prove it behaves the same on both
runtimes without reading Rust; `docs/bevy-feature-parity.md` Partial rows for
promoted capabilities reach Supported or are explicitly re-scoped.

## Phase 3 — Nice Looks by Default (the visual bar)

Goal: a zero-config generated game looks art-directed. "Finished" is judged by
screenshots and motion, verified through the Phase 1/2 proof loop.

- Promote the `cinematic` render-look profile on both runtimes with
  screenshot-backed regression references; make it the default for new
  projects (`balanced` and `parity` remain selectable).
- Bounded polish presets: shadow quality, bloom/exposure, material presets,
  and glTF material-extension/morph/blend fidelity — the parity doc's
  "practical order for game-polish work" items 2–3.
- Believable environments, first slice: portable heightfield terrain
  (rendered + collidable on both runtimes), scatter/biome dressing, and
  `tn world generate --biome` so generated games stop shipping empty horizons.
- Raise the game-production visual gates to match: primitive-placeholder and
  flat-screenshot diagnostics tighten once cinematic default lands, so the
  quality floor moves with the capability.

Exit criteria: a fresh `tn create` + `tn game plan/improve` project passes the
visual scorecard with the cinematic default and a dressed environment, proven
by nonblank/contrast metrics plus scenario playtests on web and native.

## Phase 4 — Efficient at Scale (performance you can measure)

Goal: dense worlds are affordable and the budget claims are runtime-proven.

- Runtime-proven instancing/batching and LOD swap on both runtimes under a
  measured stress gate (frame time, draw calls, entity counts) — moving these
  from report-level metadata to enforced budgets.
- Terrain tile/chunk streaming with LOD (advanced-features Tier 2), gated on
  the Phase 3 terrain slice.
- Texture compression (KTX2/Basis) on native; asset-budget gates extended to
  cover it.
- Performance tiering in target profiles: authored budgets per target class,
  with `tn game qa` failing when a scenario playtest exceeds them.

Exit criteria: a benchmark scene (dense scatter + animated actors) meets
authored frame budgets on both runtimes in CI-comparable runs.

## Phase 5 — Capability Depth (a viable engine's long tail)

Sequenced behind the proof loop; each item ships with scenario proof and a
parity ratchet entry. Draw from the active PRD backlog in priority order:

1. Declarative gameplay flow (`Spawner`, `GameFlow`, `Sequence`) — removes the
   biggest remaining script burden for common game shapes.
2. Typed scripting + actor archetypes (`defineBehavior`,
   `tn actor add character --asset <glb>`) — the largest remaining agent-DX
   win in authoring.
3. Scripting facades: audio (`ctx.audio`), delayed commands/scheduling,
   particle commands, contact filtering/slope-push semantics.
4. Portable shader/material extension points and a narrow post-processing
   graph (advanced-features Tier 3 entry, capability-gated).
5. Advanced animation/physics depth (IK, retargeting, blend trees, vehicles,
   ragdoll) — promote selectively based on generated-game demand.
6. Distribution: signed installers and store packaging move from preflight
   diagnostics to real flows when credentials/context exist.

## Continuous Tracks (every phase)

- **Contract de-sprawl**: split the authoring operations monolith by source
  family behind the stable registry facade; keep the Bevy mapping hotspots
  shrinking via trace contracts. Refactors ride behind the proof loop.
- **Docs front doors**: keep STATUS.md/parity docs answering "what is current,
  what do I run" in the first screen; move historical evidence to appendices
  or `docs/audits/`. Dense front doors are an agent-DX bug.
- **Boundary honesty**: unsupported surfaces keep failing with stable
  diagnostics; nothing is promoted without web+Bevy proof. Networking,
  cloud services, and 2D remain explicit non-goals.

## Non-Goals (unchanged)

- Multiplayer/networking, cloud accounts/saves, streaming media decoders.
- A native desktop visual editor (browser editor + CLI remain the surface).
- Pixel-identical rendering between runtimes (parity is same-source,
  same-bundle, same-behavior; not same-pixels).

## Sequencing Rationale

The 2026-07-05 bottleneck audit concluded the constraint is not missing engine
features but that agents cannot cheaply prove a game works. Phase 1 fixes the
loop; Phase 2 uses it to make parity a ratchet instead of a re-verification
tax; Phases 3–4 spend the resulting velocity on the two user-visible gaps
(looks, performance); Phase 5 deepens capability only where the proof loop and
generated-game demand justify it. Starting anywhere later in the sequence
re-creates the current situation: features that exist but cannot be trusted.

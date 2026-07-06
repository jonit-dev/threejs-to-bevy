# ThreeNative Foundational Bottleneck Audit

Date: 2026-07-05

## Scope

Inspected the current `main` worktree of `/home/joao/projects/threejs-to-bevy`, with emphasis on foundational development bottlenecks rather than isolated bugs.

Areas reviewed:

- CLI and agent-development workflow, especially `tn playtest`.
- Structured source / authoring operations.
- Compiler and IR validation contracts.
- Web runtime and Bevy runtime adapter boundaries.
- Verification gates, docs/status front doors, and current source-size signals.
- Existing audit/PRD context under `docs/audits/`, `docs/status/`, and `docs/PRDs/`.

Important worktree note: this audit was written on a dirty branch with substantial pre-existing uncommitted changes. Findings below are about current repository shape, not a clean release baseline.

## Executive Summary

The project does **not** look blocked by one fatal architecture flaw. The core product boundary is sound:

```txt
structured source / scripts / SDK declarations
  -> compiler + IR bundle
  -> web Three.js runtime and native Bevy runtime adapters
  -> proof through CLI and verification gates
```

The real bottleneck is that development velocity is now constrained by **proof-loop quality** and **contract-surface sprawl**:

1. `tn playtest` is foundational and should become the primary tight-loop self-verification command for agents. It is already useful, but still too narrow: single key press, movement-centric, web-only, limited discovery, limited assertion types, and limited artifact bundles.
2. Authoring and runtime capabilities keep landing in central contract files. Source-size warnings dropped compared with older audits, but the remaining warnings are now the core bottleneck files, especially authoring operations and native runtime mapping.
3. Web/Bevy parity still depends too much on duplicated implementation and broad gates instead of small, reusable trace contracts.
4. Docs/status files still carry too much front-door burden. The repo has a lot of PRD and evidence content, but agents need fewer, sharper entry points.
5. Verification exists, but agents still need a faster “what broke and what do I do next?” loop before broad QA or visual parity gates.

Bottom line: **the highest leverage work right now is not another big capability. It is turning `tn playtest` + scenario proof + discovery + focused assertions into the default agent feedback loop, then using that loop to safely chip away at the remaining monoliths and parity seams.**

## Current Evidence

### Commands / scans run

```bash
git status --short --branch
git log --oneline --decorate -8
python3 line-count scan for known contract/runtime/verify files
npx -y pnpm@10.25.0 check:source-size
```

`check:source-size` currently reports 8 warnings:

| File | Lines | Why it matters |
| --- | ---: | --- |
| `packages/authoring/src/operations.ts` | 5256 | Source editing contract is still highly centralized. |
| `runtime-bevy/crates/threenative_runtime/src/map_world.rs` | 2659 | Native runtime mapping remains a parity bottleneck. |
| `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs` | 2426 | Native scripting host tests are large and costly to navigate. |
| `runtime-bevy/crates/threenative_loader/src/types.rs` | 2073 | Native IR mirror is large and schema-drift-prone. |
| `runtime-bevy/crates/threenative_runtime/src/ui.rs` | 2051 | Native UI mapping is concentrated in one file. |
| `runtime-bevy/crates/threenative_runtime/src/conformance.rs` | 1793 | Native conformance/reporting is dense. |
| `packages/ir/src/uiValidation.ts` | 1272 | UI validation is near the central-contract threshold. |
| `packages/compiler/src/emit/bundle.ts` | 1209 | Bundle emission remains just above threshold. |

Additional inspected hotspots:

| File | Lines | Note |
| --- | ---: | --- |
| `packages/cli/src/commands/playtest.ts` | 466 | Small enough to evolve now; high leverage. |
| `packages/cli/src/commands/playtest.test.ts` | currently dirty | Existing test coverage already protects key options. |
| `packages/runtime-web-three/src/render.ts` | 1070 | Growing runtime front door. |
| `packages/runtime-web-three/src/worldMapping/stylizedNature.ts` | 1051 | Good extraction direction, but feature module is itself already large. |
| `docs/STATUS.md` | 2851 | Too large for a contributor front door. |
| `docs/bevy-feature-parity.md` | 1074 | Useful, but evidence density is high. |

## Top Foundational Bottlenecks

### 1. `tn playtest` is the highest-leverage feedback loop, but it is still too narrow

**Evidence**

`packages/cli/src/commands/playtest.ts` already does the right foundational things:

- builds the project;
- validates the bundle;
- starts the web preview;
- launches Playwright;
- probes live runtime state;
- captures a screenshot;
- emits JSON and proof metadata;
- checks movement, signed axis, follower movement/separation, runtime readiness, and basic screenshot validity.

Current shape is still one-shot and movement-centric:

```bash
tn playtest --project <path> --entity <id> --press <KeyboardEvent.code> --frames <n> --expect-moved
```

**Impact**

This command is exactly where agent development velocity should compound. Every agent-authored game needs a cheap proof loop before it claims “works.” But the current command leaves major false-positive gaps:

- It can pass while HUD/resources/animation/triggers are broken.
- It cannot script a sequence like accelerate → steer → collect → collide.
- It cannot discover likely player/camera/input IDs, so agents still guess.
- It writes a screenshot but not a full proof bundle with before/after, console/network logs, effect-log slice, and reproduction command.
- It has no watch mode for edit → run → repair loops.
- Native/desktop playtest is not yet a target-neutral scenario contract.

**Solution**

Promote `tn playtest` into a scenario-driven self-verification harness:

- `playtests/*.playtest.json` scenario files with multi-step input sequences.
- `--discover` and `--suggest-scenario` to remove guessing.
- Rich assertions for resources, UI text, camera framing, visibility/projected bounds, contacts/triggers, animation state, console/network/runtime diagnostics.
- Artifact bundle per run: `summary.json`, before/after screenshots, optional contact sheet/video, focused effect log, console/network logs, reproduction command.
- `--watch`, `--max-runs`, `--stable-artifacts`, and line-delimited JSON events for agent loops.
- Web first, explicit `TN_PLAYTEST_TARGET_UNSUPPORTED` for native until Bevy trace support exists.
- Keep core game-agnostic; use templates/presets for genre-specific scenarios.

**First tactical slice**

Implement Phase 1 from `docs/PRDs/other/playtest-self-verification-polish.md`:

- scenario loading;
- multi-step input;
- artifact manifest;
- stable `--out` / `--stable-artifacts`;
- backward-compatible one-shot flags converted internally into a scenario.

**Verification**

```bash
npx -y pnpm@10.25.0 --filter @threenative/cli test -- --run playtest
npx -y pnpm@10.25.0 --filter @threenative/cli typecheck
npx -y pnpm@10.25.0 --filter @threenative/cli build
```

### 2. Authoring operations are still the central source-editing bottleneck

**Evidence**

`packages/authoring/src/operations.ts` is still 5256 lines and remains the biggest source-size warning.

The authoring package is the contract behind:

- CLI source mutations;
- future editor save-back;
- MCP/agent operations;
- structured source validation and editing.

**Impact**

This is a velocity bottleneck because any new authoring capability risks touching the same large file. That raises review cost, merge conflicts, and accidental drift between source-family behavior.

This matters more than raw line count. Authoring operations are a **product API** for agents and editor workflows. If this layer is hard to navigate, every downstream feature becomes slower.

**Solution**

Keep public exports stable, but split operation implementation by source family:

```txt
packages/authoring/src/operations.ts            # facade / stable exports
packages/authoring/src/operations/scene.ts      # scene/entity/component ops
packages/authoring/src/operations/ui.ts         # UI ops
packages/authoring/src/operations/material.ts   # material ops
packages/authoring/src/operations/input.ts      # input ops
packages/authoring/src/operations/systems.ts    # systems/resources/events ops
```

Also keep pushing `operationRegistry.ts` toward a single descriptor table that owns:

- operation name;
- source family;
- argument schema;
- dispatcher;
- path/write policy;
- help/discovery metadata.

**First tactical slice**

Extract one low-risk family, preferably UI or materials, under characterization tests. Do not rewrite semantics. Move code, preserve public imports and diagnostics.

**Verification**

```bash
npx -y pnpm@10.25.0 --filter @threenative/authoring test
npx -y pnpm@10.25.0 check:source-size
```

### 3. Web/Bevy parity is still implementation-parity-heavy instead of trace-contract-heavy

**Evidence**

Remaining Bevy hotspots:

- `runtime-bevy/crates/threenative_runtime/src/map_world.rs` — 2659 lines.
- `runtime-bevy/crates/threenative_runtime/src/ui.rs` — 2051 lines.
- `runtime-bevy/crates/threenative_runtime/src/conformance.rs` — 1793 lines.
- `runtime-bevy/crates/threenative_loader/src/types.rs` — 2073 lines.

Web runtime has better modularization in places, but still large runtime fronts:

- `packages/runtime-web-three/src/render.ts` — 1070 lines.
- `packages/runtime-web-three/src/worldMapping/stylizedNature.ts` — 1051 lines.

**Impact**

Every feature that needs both web and native behavior still risks two separate implementations plus broad visual proof. That slows development and makes parity regressions expensive to diagnose.

The bottleneck is not “Bevy exists.” The bottleneck is that the repo needs more small trace contracts that say: for this authored IR/scenario, both adapters observed the same semantic state.

**Solution**

Add/expand feature-level trace contracts before visual parity:

- entity transform observations;
- resource snapshots;
- UI text snapshots;
- animation state observations;
- contact/trigger observations;
- camera projection/framing observations;
- runtime diagnostic snapshots.

Then let web and Bevy satisfy the same trace shape. Screenshots remain necessary for visual proof, but trace contracts should catch most semantic drift faster.

**First tactical slice**

Use `tn playtest` scenario output as the contract shape for web now and native later. Do not create a separate Bevy-only proof format.

**Verification**

```bash
npx -y pnpm@10.25.0 verify:conformance
cargo test -p threenative_runtime
```

Where `cargo` may need to run from `runtime-bevy/` depending on workspace setup.

### 4. Verification gates exist, but agents still need a faster failure-to-fix loop

**Evidence**

The repo has many verification scripts:

- `verify:game-production`
- `verify:template-playability`
- `verify:runtime-gameplay-host`
- `verify:render-look`
- `verify:conformance`
- `verify:pre-push`
- `check:docs`
- `check:source-size`

`tools/verify/src/gameProductionGate.ts` and its tests are significant, while `tn playtest` is only 466 lines and already targeted.

**Impact**

Broad gates are useful late, but agents need a cheap early loop. If the first real proof is a broad gate, development gets slow and noisy. If the first proof is just a screenshot, claims get unreliable.

**Solution**

Layer verification intentionally:

1. `tn playtest` — fast focused behavior proof while editing.
2. `tn game qa` — small scenario suite + game-production checks.
3. `verify:*` gates — broader release/parity/template validation.

Make `tn game qa` consume playtest summaries when present instead of duplicating the same probes.

**First tactical slice**

After scenario playtest exists, add generated starter scenarios:

- `playtests/smoke-movement.playtest.json`
- `playtests/camera-follow.playtest.json`
- `playtests/hud-resource.playtest.json`

Then let `tn game qa` discover a tiny smoke set.

**Verification**

```bash
npx -y pnpm@10.25.0 verify:template-playability
npx -y pnpm@10.25.0 verify:game-production
```

### 5. Docs/status front doors are still too dense for fast agent onboarding

**Evidence**

- `docs/STATUS.md` is 2851 lines.
- `docs/bevy-feature-parity.md` is 1074 lines.
- `docs/PRDs/README.md` is useful, but active/completed references are dense.

**Impact**

Agents and contributors need a fast “what is current, what is supported, what should I run?” path. Dense docs encourage either skipping context or over-reading historical evidence.

**Solution**

Keep the docs, but sharpen the front doors:

- `docs/STATUS.md`: current capabilities, active gates, and links only.
- Move long evidence into dated status/evidence files.
- For each foundational command (`tn playtest`, `tn game qa`, `tn verify:*`), add a compact “when to use / command / expected artifact” section.
- Keep `docs/bevy-feature-parity.md` as parity matrix, but move bulky evidence anchors into linked evidence reports.

**First tactical slice**

After playtest polish begins, add a short status entry for `tn playtest` as the agent self-verification command and link to the PRD plus examples.

**Verification**

```bash
npx -y pnpm@10.25.0 check:docs
```

## Immediate Development Speedups

### Do now: `tn playtest` scenario Phase 1

This is the fastest high-impact move.

Why:

- Small file surface.
- Already has tests.
- Directly improves every future agent implementation session.
- Reduces false “works” claims.
- Creates the proof shape for future native parity.

Deliverable:

- `--scenario`
- multi-step input
- artifact manifest
- focused effect-log/console capture
- stable diagnostic codes
- backward compatibility

### Do next: `tn playtest --discover`

Agents waste time guessing IDs. Discovery is a multiplier.

Deliverable:

- controllable entities;
- input bindings;
- likely camera/follow targets;
- likely resource/HUD IDs;
- `--suggest-scenario` output.

### Then: assertion expansion for resources/UI/diagnostics/visibility

Movement alone is too weak.

Deliverable:

- resource assertions;
- HUD text assertions;
- console/network/runtime diagnostics;
- projected bounds / visibility;
- camera framing.

### Parallel cleanup: extract one authoring operation family

Do not start a giant refactor. Extract one cohesive family with characterization tests. This reduces the biggest source-size hotspot without blocking playtest work.

### Defer: huge native parity push until playtest scenario contract exists

Native proof matters, but doing it before the scenario contract risks building another one-off proof path. Define the target-neutral playtest output first.

## Not Foundational / Defer

These are useful but should not displace the above:

- Another broad feature kit before playtest proof is stronger.
- More visual polish profiles without a tight behavioral proof loop.
- Full docs reorganization before `tn playtest` and authoring seams are improved.
- Large-scale rewrite of Bevy runtime mapping; use trace contracts and incremental extraction instead.
- Genre-specific core CLI commands. Generate scenario presets/templates instead.

## Recommended Sequencing

### Week 1: Make playtest scenario-based

1. Add scenario parser and validation.
2. Convert one-shot flags into internal scenario.
3. Add multi-step key input.
4. Add artifact manifest and reproduction command.
5. Preserve current tests and add scenario tests.

### Week 2: Add discovery and richer assertions

1. Add `--discover`.
2. Add `--suggest-scenario`.
3. Add resource/UI/console/network assertions.
4. Add projected-bounds visibility check if runtime observation support is already available.

### Week 3: Wire playtest into generated projects and QA

1. Add starter scenario files.
2. Let `tn game qa` consume a tiny scenario set.
3. Document the self-verification loop in status/docs.
4. Add native target unsupported diagnostic / trace-contract placeholder.

### Week 4: Use the improved proof loop to attack monoliths

1. Extract one authoring operation family.
2. Add trace contract fixture for one web/Bevy parity-sensitive feature.
3. Split one Bevy runtime mapper area only after trace coverage exists.

## Open Questions

1. Should committed playtest scenarios live under `playtests/` or `.threenative/playtests/`? Recommendation: `playtests/` because they are project-owned proof assets.
2. Should `tn playtest --watch` be part of Phase 1 or Phase 2? Recommendation: Phase 2 unless scenario artifacts are done first.
3. Should broad QA run all scenarios by default? Recommendation: no. It should run a tiny smoke subset unless explicitly asked.
4. What is the native trace minimum? Recommendation: transforms, resources, UI text, diagnostics, camera projection/framing, and screenshot path.
5. Should Playwright screenshot analysis live in `tn playtest`? Recommendation: lightweight visibility checks yes; aesthetic scoring stays in verify/game QA.

## Final Call

The foundational bottleneck is not “we need more engine features.” The bottleneck is that agents still cannot cheaply and reliably prove that a game works while they are building it.

Fix that first.

`tn playtest` should become the default command every agent runs before saying a ThreeNative game or feature is functional. Once that loop is strong, the remaining authoring/runtime/parity cleanup gets safer and faster.

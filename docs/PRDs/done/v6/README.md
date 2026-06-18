# V6 PRDs

Complexity: 9 -> HIGH mode

V6 uses [docs/ROADMAP.md](../../ROADMAP.md),
[docs/STATUS.md](../../STATUS.md), and
[docs/bevy-feature-parity.md](../../bevy-feature-parity.md) as the controlling
scope. The goal is common game-engine feature parity for small 3D games: promote
the highest-value missing gameplay, physics, character, animation, UI, audio,
asset, diagnostic, scene, and release-gate contracts only when SDK, IR,
validation, web Three.js, native Bevy where claimed, conformance, docs, and
examples agree.

```txt
V5 hardening and authoring foundation
  -> resources/events/schedules for gameplay
  -> narrow physics and character interaction
  -> animation, retained UI, and audio runtime slices
  -> hardened assets and diagnostics
  -> functional V6 game scene
  -> repeatable verify:v6 gate
```

## V6 Scope Decisions

- V6 promotes common small-game features, not editor, online, networking,
  replication, collaboration, public plugin, custom renderer, raw Three.js, or
  direct Bevy authoring scope.
- V6 builds on the V4 scripting host and V5 authoring helpers instead of
  introducing a second gameplay runtime.
- Every promoted runtime feature needs SDK/IR/compiler/validation coverage,
  web runtime behavior, Bevy evidence where native support is claimed, shared
  conformance observations, diagnostics, docs, and scene proof where practical.
- V6 must include a maintained proof example under `examples/`, following the
  existing example folder patterns, and must write verification evidence under
  `tools/verify/artifacts/milestones/v6`.
- V6 verification must not be "trust me" build/test evidence. Features with
  visible output must produce real rendered web artifacts and, where native
  support is claimed, Bevy rendered artifacts or explicitly documented native
  visual drift. Use the repo visual verification workflow under
  `.codex/skills/threenative-visual-verification` as guidance when adding or
  debugging visual proof.
- Deeper physics, animation graphs, rich UI/audio, packaging, and performance
  work that is too large for the common feature set is deferred to V7.
- Unsupported or target-specific behavior must fail with stable diagnostics or
  be documented as explicit target drift.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V6-00 Scope and Contract Alignment](./V6-00-scope-and-contract-alignment.md) | V5 complete | V6 boundaries, exclusions, status, parity tracker, and docs gate agree before implementation starts. |
| 1 | [V6-01 Gameplay Resources and Event Contracts](./V6-01-gameplay-resources-and-event-contracts.md) | V6-00 | Portable resources and events become first-class SDK/IR/compiler/runtime contracts with web and Bevy scripting evidence. |
| 2 | [V6-02 Gameplay System Scheduling and State](./V6-02-gameplay-system-scheduling-and-state.md) | V6-01 | Common gameplay systems can read resources, emit events, mutate allowed components, and run predictably across web and native. |
| 3 | [V6-03 Physics Colliders and Collision Events](./V6-03-physics-colliders-and-collision-events.md) | V6-02 | Static and dynamic collider definitions, trigger/contact events, and stable collision diagnostics work across shared fixtures. |
| 4 | [V6-04 Character Interaction Slice](./V6-04-character-interaction-slice.md) | V6-03 | A portable character/controller interaction path supports movement, grounding, simple blocking, and interaction events. |
| 5 | [V6-05 Animation Playback Contracts](./V6-05-animation-playback-contracts.md) | V6-02 | Clip selection, play/stop/state metadata, and playback observations work for model-backed animated entities. |
| 6 | [V6-06 Retained UI Runtime](./V6-06-retained-ui-runtime.md) | V6-01 | Retained UI layout, text/basic controls, input/focus events, and runtime observations are implemented for web and claimed native support. |
| 7 | [V6-07 Audio Playback Runtime](./V6-07-audio-playback-runtime.md) | V6-01 | Bundle-local audio assets can be played by portable systems/UI/game state with diagnostics and runtime evidence. |
| 8 | [V6-08 Asset and Diagnostic Hardening](./V6-08-asset-and-diagnostic-hardening.md) | V6-03, V6-05, V6-06, V6-07 | New V6 asset types and cross-feature failures have stable validation, CLI JSON, Bevy mapping, and docs diagnostics. |
| 9 | [V6-09 Functional V6 Game Scene](./V6-09-functional-v6-game-scene.md) | V6-04, V6-05, V6-06, V6-07, V6-08 | One maintained playable scene demonstrates the promoted V6 engine features together. |
| 10 | [V6-10 Release Gate and Docs Consistency](./V6-10-release-gate-and-docs-consistency.md) | All V6 tickets | `verify:v6`, conformance, Rust tests, docs checks, artifacts, status, and parity tracker gate the release. |

## V6 Acceptance Criteria

- Resources, events, schedules, physics contacts, character interaction,
  animation playback, UI, and audio are promoted only to the level proven by
  shared contracts and runtime evidence.
- Web and Bevy produce comparable observations, effect logs, or diagnostics for
  every promoted cross-runtime feature.
- The functional V6 scene is playable and uses promoted features together
  instead of proving only isolated fixtures.
- `examples/v6-functional` or its final documented equivalent exists,
  self-verifies, and writes artifacts under `tools/verify/artifacts/milestones/v6` that prove the V6
  slice is working.
- Visible promoted features have screenshot, image-diff, side-by-side, or
  equivalent real-world rendering artifacts where practical, plus conformance
  and runtime observations.
- V6 docs explicitly defer deeper physics, animation graphs, rich UI/audio,
  packaging, and performance work to V7 unless a V6 PRD narrows the slice.
- V6 does not claim editor, online, networking, replication, collaboration,
  public plugin, custom renderer, raw Three.js, or direct Bevy authoring
  support.

## Release Gate

V6 is complete for the documented scope when this aggregate gate passes:

```bash
pnpm verify:v6
pnpm verify:conformance
pnpm check:docs:v6
cd runtime-bevy && cargo test
```

`pnpm verify:v6` writes a machine-readable report under `tools/verify/artifacts/milestones/v6` with
ordered steps, diagnostics, TypeScript and Rust evidence, conformance links,
functional scene artifacts, playable trace evidence, and the first failing
step.

Use the existing `examples/*` and `artifacts/*` folder conventions. The V6
proof is incomplete if the example only builds without producing inspectable
artifacts that demonstrate the promoted behavior.

For visible features, the artifacts must include rendered output from the real
runtime path. Logs, schema validation, and unit tests are necessary but not
sufficient by themselves.

## Checkpoint Protocol

After each implementation phase in every V6 ticket, spawn the automated PRD
reviewer:

```txt
subagent_type: prd-work-reviewer
prompt: Review checkpoint for phase N of PRD at docs/PRDs/v6/<ticket>.md
```

Continue only when the reviewer reports PASS, or update the PRD with the
accepted scope change before proceeding.

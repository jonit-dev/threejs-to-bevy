# V7 PRDs

Complexity: 9 -> HIGH mode

V7 uses [docs/ROADMAP.md](../../ROADMAP.md),
[docs/STATUS.md](../../STATUS.md), and
[docs/bevy-feature-parity.md](../../bevy-feature-parity.md) as the controlling
scope. The goal is deep engine/runtime parity after V6: close advanced gaps
that are too large or risky for the common V6 feature set, or explicitly defer
or reject them with stable diagnostics.

```txt
V6 common feature parity
  -> post-V6 gap triage
  -> deeper conformance/evidence harness
  -> advanced physics, animation, UI, audio, renderer/content, scripting,
     packaging, and performance slices
  -> functional V7 scene and template
  -> repeatable verify:v7 gate
```

## V7 Scope Decisions

- V7 starts only after the V6 release gate is complete or explicitly updated.
- V7 promotes deeper runtime parity without changing the authoring boundary:
  users still author TypeScript, Bevy remains adapter-private, and raw
  Three.js/Bevy access remains unsupported.
- V7 is not the editor, online, networking, replication, collaboration, public
  plugin, or broad shader-graph milestone.
- Every promoted feature needs shared fixtures, target observations, docs,
  diagnostics, TypeScript tests, Rust evidence where native support is claimed,
  and release-gate artifacts.
- V7-01 owns the fixture catalog. Feature tickets from V7-02 through V7-09 must
  either use their category in
  `packages/ir/fixtures/conformance/v7-fixture-catalog.json` or update that
  catalog in the same change before claiming runtime support.
- V7 must include a maintained proof example or template under `examples/` and,
  where promoted, `templates/`, following existing folder patterns, and must
  write verification evidence under `tools/verify/artifacts/milestones/v7`.
- V7 verification must not be "trust me" build/test evidence. Features with
  visible output must produce real rendered web artifacts and, where native
  support is claimed, Bevy rendered artifacts or explicitly documented native
  visual drift. Use the repo visual verification workflow under
  `.codex/skills/threenative-visual-verification` as guidance when adding or
  debugging visual proof.
- Features that are too backend-specific must become explicit deferred or
  never-portable diagnostics rather than ambiguous partial support.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V7-00 Post-V6 Gap Triage and Contract Alignment](./V7-00-post-v6-gap-triage-and-contract-alignment.md) | V6 release gate complete | V7 scope, exclusions, maturity rows, parity tracker, and docs agree on what is promoted, deferred, or never portable. |
| 1 | [V7-01 V7 Conformance Fixtures and Evidence Harness](./V7-01-v7-conformance-fixtures-and-evidence-harness.md) | V7-00 | Shared fixtures and reports can prove deeper physics, animation, UI/audio, renderer/content, scripting, packaging, and performance claims across web and Bevy. |
| 2 | [V7-02 Advanced Physics and Character Runtime Parity](./V7-02-advanced-physics-and-character-runtime-parity.md) | V7-01, V6 physics baseline | Shape casts, richer sensors/triggers, contact filtering, deterministic event ordering, and a stronger character-controller slice become portable contracts with web/Bevy evidence. |
| 3 | [V7-03 Animation Graphs State Machines Events and Particles](./V7-03-animation-graphs-state-machines-events-and-particles.md) | V7-01, V6 animation baseline | Named clip playback graduates into portable graph/state-machine behavior with blends, transitions, animation events, and a bounded particle contract. |
| 4 | [V7-04 Rich Portable UI Navigation and Input Parity](./V7-04-rich-portable-ui-navigation-and-input-parity.md) | V7-01, V6 UI baseline | UI moves beyond HUD/menu basics into focus order, gamepad/touch navigation, richer retained layout, safe-area behavior, and native parity hardening. |
| 5 | [V7-05 Spatial Audio Buses and Runtime Audio Hardening](./V7-05-spatial-audio-buses-and-runtime-audio-hardening.md) | V7-01, V6 audio baseline | Audio adds spatial emitters/listeners, bus or mixer groups, volume routing, lifecycle-safe looping, and deterministic event-driven playback evidence. |
| 6 | [V7-06 Renderer and Dense Content Runtime Parity](./V7-06-renderer-and-dense-content-runtime-parity.md) | V7-01, V5/V6 renderer work | Runtime mesh LOD swapping, practical native instancing, imported asset edge cases, and one narrow post-processing slice are promoted or explicitly deferred with diagnostics. |
| 7 | [V7-07 Scripting Determinism and Runtime Lifecycle](./V7-07-scripting-determinism-and-runtime-lifecycle.md) | V7-01, V6 gameplay systems | Resource writes, deterministic schedule ordering, larger script-heavy fixtures, hot-reload boundaries, and justified system-local persisted state are specified and gated. |
| 8 | [V7-08 Packaging Target Profiles and Platform Diagnostics](./V7-08-packaging-target-profiles-and-platform-diagnostics.md) | V7-01 | Desktop packaging, target-profile selection, artifact layout, packaged bundle loading, and platform-specific diagnostics work without changing the TypeScript authoring boundary. |
| 9 | [V7-09 Performance Budgets and Profiling Evidence](./V7-09-performance-budgets-and-profiling-evidence.md) | V7-02 through V7-08 as applicable | Web and Bevy reports expose actionable frame, entity, draw/instance, asset-load, script, UI, audio, and package-size budgets for V7-scale scenes. |
| 10 | [V7-10 Functional V7 Scene and Template](./V7-10-functional-v7-scene-and-template.md) | V7-02 through V7-09 | A maintained scene/template demonstrates promoted V7 features through visible gameplay, UI/audio behavior, animation/physics interactions, dense content, packaged run artifacts, and performance reports. |
| 11 | [V7-11 Release Gate and Docs Consistency](./V7-11-release-gate-and-docs-consistency.md) | All V7 tickets | `verify:v7`, docs checks, conformance, Rust tests, visual/runtime artifacts, performance evidence, and parity/maturity docs become the authoritative V7 completion gate. |

## V7 Acceptance Criteria

- V7 begins with a post-V6 gap triage table that marks each candidate as
  promoted, deferred, or never portable.
- Deep physics, animation, UI, audio, renderer/content, scripting lifecycle,
  packaging, and performance work is release-gated only at the level proven by
  shared evidence.
- The functional V7 scene and template demonstrate promoted features together.
- `examples/v7-functional` or its final documented equivalent exists,
  self-verifies, and writes artifacts under `tools/verify/artifacts/milestones/v7` that prove the V7
  slice is working.
- Visible promoted features have screenshot, image-diff, side-by-side, or
  equivalent real-world rendering artifacts where practical, plus conformance,
  runtime observations, and performance evidence where applicable.
- Backend-specific features that cannot be represented portably fail with stable
  diagnostics.
- V7 does not claim editor, online, networking, replication, collaboration,
  public plugin, raw Three.js, direct Bevy, or broad shader graph support.

## Release Gate

V7 is complete for the documented scope when this aggregate gate passes:

```bash
pnpm verify:v7
pnpm verify:conformance
pnpm check:docs:v7
cd runtime-bevy && cargo test
```

`pnpm verify:v7` writes a machine-readable report under `tools/verify/artifacts/milestones/v7` with
ordered steps, diagnostics, conformance links, Rust evidence, functional scene
artifacts, packaged target artifacts where applicable, performance reports, and
the first failing step.

Use the existing `examples/*`, `templates/*`, and `artifacts/*` folder
conventions. The V7 proof is incomplete if the example or template only builds
without producing inspectable artifacts that demonstrate the promoted behavior.

For visible features, the artifacts must include rendered output from the real
runtime path. Logs, schema validation, and unit tests are necessary but not
sufficient by themselves.

## Checkpoint Protocol

After each implementation phase in every V7 ticket, spawn the automated PRD
reviewer:

```txt
subagent_type: prd-work-reviewer
prompt: Review checkpoint for phase N of PRD at docs/PRDs/v7/<ticket>.md
```

Continue only when the reviewer reports PASS, or update the PRD with the
accepted scope change before proceeding.

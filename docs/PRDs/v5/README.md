# V5 PRDs

Complexity: 9 -> HIGH mode

V5 uses [docs/ROADMAP.md](../../ROADMAP.md),
[docs/STATUS.md](../../STATUS.md), and
[docs/bevy-feature-parity.md](../../bevy-feature-parity.md) as the controlling
scope. The goal is not an unrelated product surface; it is making the V1-V4
foundation easier to maintain while raising both the 3D visual bar and the
game-authoring experience with contracts that are validated, tested, and
release-gated.

```txt
existing V1-V4 contracts
  -> cleaner fixtures and diagnostics
  -> shared conformance and native Rust evidence
  -> selected visual-quality promotions
  -> game-first SDK/template ergonomics
  -> functional V5 scene
  -> repeatable verify:v5 gate
```

## V5 Scope Decisions

- Refactors must preserve behavior unless a V5 PRD explicitly changes a
  contract.
- Shared IR fixtures are the source of truth for web/native conformance.
- Every V5 feature that claims Bevy support needs focused Rust test evidence.
- Promoted visual features must have SDK/IR/compiler/validation/runtime coverage
  and appear in a maintained 3D scene where practical.
- V5 can harden scripting, diagnostics, rendering, asset, SDK authoring, and
  release harness behavior, but it does not introduce editor, online,
  networking, replication, public plugin, or custom renderer scope.
- V5 requires a game-first authoring ergonomics layer and starter template that
  lower into existing portable contracts unless a V5 PRD explicitly promotes a
  new SDK/IR/runtime contract.
- `assets-source/environment` should be used when it reasonably demonstrates a
  V5 visual-quality feature.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V5-00 Scope and Contract Alignment](./V5-00-scope-and-contract-alignment.md) | V4 complete | V5 boundaries, PRD index, status, parity tracker, and exclusions agree. |
| 1 | [V5-01 Capability-Derived Manifests and Shared Fixtures](./V5-01-capability-derived-manifests-and-shared-fixtures.md) | V5-00 | Bundle capabilities are derived from emitted IR, and drift areas have shared fixtures. |
| 2 | [V5-02 Conformance Reports and Native Observations](./V5-02-conformance-reports-and-native-observations.md) | V5-01 | Reports expose materials, assets, visibility, diagnostics, and Bevy observations with path-level mismatches. |
| 3 | [V5-03 Diagnostic Shape Normalization](./V5-03-diagnostic-shape-normalization.md) | V5-00 | Compiler, IR, CLI, docs, verifier, and native diagnostics have stable actionable shapes. |
| 4 | [V5-04 Fixture Builder and Test Harness Refactor](./V5-04-fixture-builder-and-test-harness-refactor.md) | V5-01 | Repeated fixture setup is replaced by reusable builders without behavior changes. |
| 5 | [V5-05 Native Runtime Regression Coverage](./V5-05-native-runtime-regression-coverage.md) | V5-02, V5-03 | Rust tests preserve loader, renderer, environment, V4 scripting host, service, and diagnostic behavior. |
| 6 | [V5-06 Textured Standard Material Parity](./V5-06-textured-standard-material-parity.md) | V5-01, V5-02, V5-05 | Texture slots become an accepted/rejected contract with web and Bevy runtime evidence. |
| 7 | [V5-07 Lighting Atmosphere Shadow and Color Parity](./V5-07-lighting-atmosphere-shadow-and-color-parity.md) | V5-01, V5-02, V5-05 | Visibility, point/spot lights, shadows, fog, sky, and color fields have focused parity evidence. |
| 8 | [V5-08 Dense Content Instancing LOD and Budgets](./V5-08-dense-content-instancing-lod-and-budgets.md) | V5-01, V5-02, V5-05 | Dense scene content has real instance/budget evidence and a narrow portable LOD metadata slice. |
| 9 | [V5-09 Functional Visual Quality Scene](./V5-09-functional-visual-quality-scene.md) | V5-06, V5-07, V5-08 | A maintained scene demonstrates promoted V5 features with web and Bevy evidence. |
| 10 | [V5-11 Game Authoring Ergonomics Refactor](./V5-11-game-authoring-ergonomics-refactor.md) | V5-04, V5-09 | Required SDK/template ergonomics make small games faster to author without expanding V5 into editor, online, raw Three.js, or custom runtime scope. |
| 11 | [V5-10 Release Gate and Docs Consistency](./V5-10-release-gate-and-docs-consistency.md) | All V5 tickets, including V5-11 | `verify:v5`, `check:docs:v5`, status, parity, artifacts, and docs gate V5. |

## V5 Acceptance Criteria

- Existing V1-V4 examples and gates still pass after behavior-preserving
  refactors.
- Conformance failures identify the fixture, runtime pair, bundle path, expected
  value, actual value, and related artifacts.
- Rust/Bevy tests cover every V5 feature that claims native support.
- Diagnostics preserve stable codes and expose severity, path context, and
  suggested fixes where the local diagnostic model supports them.
- Promoted V5 visual features have portable contracts, target capability
  behavior, validation, runtime coverage, and scene proof.
- The V5 scene visibly exercises most promoted V5 visual features using
  `assets-source/environment` assets where practical.
- The V5 game starter and ergonomics APIs prove a small playable game can be
  authored with less low-level setup than direct scene/world assembly.
- V5 does not claim editor, online, networking, replication, public plugin, or
  custom renderer support.
- V5-11 must not weaken the hardening, native evidence, conformance,
  diagnostics, or visual-scene release criteria above.

## Release Gate

Before treating V5 as complete, run:

```bash
pnpm verify:v5
pnpm verify:conformance
pnpm check:docs:v5
cd runtime-bevy && cargo test
```

`pnpm verify:v5` should write a machine-readable report under `artifacts/v5`
with ordered steps, diagnostics, Rust test evidence, conformance links, visual
artifacts, SDK ergonomics/starter evidence, and the first failing step.

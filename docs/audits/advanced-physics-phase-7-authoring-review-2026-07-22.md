# Advanced Physics Phase 7 Authoring Review

Date: 2026-07-22

## Scope

This review exercises the Phase 7 public authoring and debug workflow from a
fresh structured-source project. The game planner reported
`TN_GAME_PLAN_OFF_RECIPE`, so the emitted inspection command was run before the
project was custom-authored through bounded `tn physics` operations.

The retained generated project at `examples/advanced-vehicle-course` adds:

- a four-wheel assembly and production vehicle controller to `chassis`;
- compact prefab instances for the referenced tire and wheel visuals;
- a deliberately invalid front-left contact pose at attachment Y `1.5`;
- a fixed joint from `debug.joint` to `debug.anchor`, tuned to a break-force
  threshold of `0.0001`;
- a generated fracture manifest and `Destructible` declaration on
  `debug.target`.

The paired review scenario records source hash
`d66ec4433cc2420ffca0909048233ce5f3b5079b1b4c9f7df173d90d1ace8bdb`
and bundle hash
`02cf77f2566bed3021ce45000a967a6f7a91569df3ae17a8c08603bcd6732ffc`.
The fracture manifest owns source hash
`sha256:ad14f1b60caf6303b94afe7af41e9847c096fff7eac32ed70da80c39ea99b3d8`.

## Authoring and validation

The following public boundaries completed successfully:

```text
tn physics wheel add
tn physics vehicle add
tn physics joint add
tn physics joint set
tn physics fracture generate
tn physics destructible add
tn authoring validate
tn build
```

The smoke exposed and fixed two source-boundary defects rather than working
around them:

- physics validation now consumes the generated structured-source top-level
  `transform` owner;
- validation now resolves compact prefab `instances` when checking tire and
  visual references.

Focused authoring tests pass 7/7, including both generated-source regressions,
descriptor parity, dry-run/apply round trips, atomic mutations, scoped
validation, and structured diagnostic fix round trips.

## Debug findings

Both web and graphical desktop `tn playtest` runs return `TN_PLAYTEST_OK`.
The persisted normalized debug series reports:

- `suspension:chassis:front-left` remains 1.5 meters above the chassis origin
  while `front-right` reaches the ground and compresses;
- `wheel:chassis:front-left` remains ungrounded while the other wheels contact;
- `joint-load:debug.joint` reports `0.00017` on web and `4.0875` on desktop,
  both above the authored `0.0001` threshold.

The wheel evidence makes the bad contact obvious: the front-left cast remains
far above the ground while the other wheels contact normally. The same web and
desktop joint-load primitive identifies the fixed joint as over-stressed
without inspecting a backend handle.

The complete observation artifact contains the applicable generated-project
categories (`bond`, `budget`, `center-of-mass`, `collider`, `force`,
`joint-load`, `sleep`, `slip`, `suspension`, and `wheel`). Registry-derived
paired fixture evidence covers the remaining `aero` and `contact` categories
and verifies all registry categories exactly once.

## Artifact and output bounds

The normalized target artifacts are hash-identical for this recorded scenario:

- summary:
  `sha256-c42d3290c04b8858ca5119b30db26f32346108271346b7ba2eb3044aa9183c15`;
- full observations:
  `sha256-bf1283a6079e75d71cc8ebb71c510e64b6b62ea50731529d2dcc45187b515d29`;
- final frame:
  `sha256-b100951b2c602bc83788ba3a0ac914831e5b304f69968aa8270c6c864c99cb1c`.

The full observations artifact is 1,576,509 bytes. Default JSON stdout remains
bounded at 2,499 bytes on web and 1,947 bytes on desktop; their hashes are
`sha256-1e2a1122e2830d2cda9907bf44aa45572c5977f5d01bd6be76898b7751960a3a`
and
`sha256-fa5b68b5ef521562c3f57f10f4a42862d1859741fc05be8a74991fd5f5e4c0e5`.
Deep primitives, telemetry, timing, and per-step snapshots remain in the
artifact rather than terminal output.

## Automated usability coverage

- The editor physics debug panel now exposes a checkbox for every registry
  category, filters enabled primitives deterministically, and sends category
  changes to its host. The production web runtime snapshot boundary accepts
  that category set. The panel test verifies toggling, filtering, bounded
  primitive summaries, and live body/contact/query/timing telemetry.
- The desktop proof-harness test verifies the final native debug snapshot and
  labeled per-step debug series are persisted.
- Paired debug evidence tests fail closed for missing categories and mismatched
  primitive IDs or kinds.
- The generated-project web and desktop captures use the same structured source
  and bundle, with no runtime error diagnostics.

## Retained independent-review bundle

The initial independent checkpoint review correctly rejected this phase
because the panel displayed static counts and the audit did not retain its
editor/debug evidence. The remediation is retained at
`tools/verify/artifacts/advanced-physics/phase-7-authoring-debug/`:

- `verification-report.json` records the generated project, public authoring
  boundary, toggle owner, verification commands, and every evidence path/hash;
- `editor-physics-debug-panel.png` is a manual review frame showing every
  registry-owned toggle, live telemetry, the bad front-left suspension cast,
  and the over-stressed joint-load primitive;
- `web-observations.json` and `desktop-observations.json` retain the paired
  generated-project debug series instead of referring to temporary files;
- the screenshot is rendered from the retained web observation rather than a
  synthetic panel fixture, and both retained observations contain the same
  `joint-load:debug.joint` and `suspension:chassis:front-left` identities.

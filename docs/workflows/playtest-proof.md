# Playtest Proof

Use `tn playtest` when a game needs proof that input changes gameplay state, not
just proof that the scene renders.

Use `tn iterate --project . --json` as the default inner loop when an agent
needs one response for authoring validation, build, screenshot capture, and the
first committed playtest scenario. It writes fast repair-loop artifacts under
`artifacts/iterate/latest/`. Those artifacts are intentionally not release
evidence; run the committed `tn playtest --stable-artifacts`, `tn game qa
--run-proof`, and desktop/native playtest commands before completion claims.

```bash
tn playtest --project examples/racing-kit-rally --entity player.car --press KeyW --frames 60 --expect-moved --json
```

Prefer committed scenarios for generated games and maintained starters:

```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
```

Scenario steps may count fixed simulation ticks directly. `holdTicks` and
`waitTicks` advance the paused browser runtime by exactly that many fixed
updates. Slow headless rendering cannot add catch-up ticks. Use `kind: "wait"`
for an explicit no-input interval instead of pressing an unbound key.
`holdFrames` and `waitFrames` retain rendered-frame compatibility behavior,
and older runtimes fall back to that behavior. Run `tn playtest schema --json`
for the full machine-readable shape.

```json
{
  "kind": "input",
  "press": "KeyD",
  "holdTicks": 45,
  "release": true
}
```

Scenario files may include `setup.entities[]` Transform overrides. The web
runner applies those overrides before warmup and before the baseline transform
sample, so focused proofs can start near a stair, ramp, trigger, pickup, or
other authored interaction without depending on a long navigation prelude.

```json
{
  "schemaVersion": 1,
  "name": "stair-proof",
  "target": "web",
  "subject": "player",
  "setup": { "entities": [{ "entity": "player", "position": [-2.35, 0.02, 3.8] }] },
  "steps": [{ "press": "KeyW", "holdFrames": 28, "release": true }],
  "assert": {
    "movement": {
      "entity": "player",
      "axis": "-z",
      "minAxisDelta": { "axis": "+y", "min": 0.2 },
      "minDistance": 1
    },
    "contacts": [{ "entity": "player", "with": "stairs.step.03", "minCount": 1 }]
  }
}
```

When the intended input should move on a specific coordinate, include an axis
assertion. Use `movement.axis` for the primary signed direction and
`movement.minAxisDelta` when the final transform must also prove a second axis,
such as gaining height while climbing stairs.

```bash
tn playtest --project examples/lantern-orchard --entity player --press KeyD --frames 45 --expect-moved --expect-axis x --json
```

The command builds and validates the project, starts a web preview, waits for
runtime readiness, presses the requested keyboard `KeyboardEvent.code`, samples
the web runtime effect log, and writes a screenshot artifact under
`examples/<name>/artifacts/playtest/`.

Successful reports include:

- `before` and `after` transform samples for the target entity
- movement `distance`
- `movementDelta` and optional `expectAxis` when an axis assertion is requested
- rich assertion results such as `movement.axisDelta` when scenarios include
  `movement.minAxisDelta`
- the pressed input code and frame count
- a screenshot artifact path
- `runtime: "web"` to make the current proof target explicit
- `artifacts.summary`, `artifacts.manifest`, `artifacts.directory`, and
  `reproduceCommand` when a scenario proof bundle is written

Failure diagnostics are stable:

- `TN_PLAYTEST_ENTITY_NOT_FOUND`
- `TN_PLAYTEST_INPUT_NO_EFFECT`
- `TN_PLAYTEST_AXIS_NO_EFFECT`
- `TN_PLAYTEST_RUNTIME_NOT_READY`
- `TN_PLAYTEST_BROWSER_UNAVAILABLE`

Watch mode emits line-delimited JSON events for repair loops:

- `start`: watch start and each individual run start.
- `artifact`: artifact directory or primary artifact produced by a run.
- `diagnostic`: stable diagnostic `code`, message, and a smallest repair
  command.
- `pass` / `fail`: final status for the run. The event includes the full JSON
  report from the final run.
- `stop`: watch loop exit, including the final exit code.

Use `--pass-once` when an agent should stop after the first passing repair:

```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --watch --pass-once --json
```

Native/Bevy scenario execution is available for keyboard-driven movement proof
through `tn playtest --target desktop|bevy`. The native path uses the Bevy proof
harness readiness stream and writes the same summary/manifest/observations
artifact shape as web playtests, including harness-requested `before.png` and
`after.png` screenshots when the desktop environment supports Bevy window
capture. Native playtests also write a short `png-sequence` under
`native-recording/` with a `native-recording.json` manifest. Encoded native
video export is still follow-on polish; use the PNG sequence or web recording
when motion-video proof is required.

The structured-source starter includes a committed native fixture:

```bash
tn playtest --project . --scenario playtests/native-smoke-movement.playtest.json --stable-artifacts --json
```

Generated examples can carry the same target-specific fixture; for example:

```bash
tn playtest --project examples/lantern-orchard --scenario playtests/native-smoke-movement.playtest.json --stable-artifacts --json
```

Use `tn parity playtest` when the same scenario must be proved as one paired
web/desktop contract. The command delegates to `tn playtest` once per target,
writes per-target summary bundles, and emits one aggregate report with
`TN_GAMEPLAY_PARITY_TARGET_FAILED` when either target fails before semantic
comparison.

```bash
tn parity playtest \
  --project examples/humanoid-physics-course \
  --scenario playtests/humanoid-course-forward-movement.playtest.json \
  --targets web,desktop \
  --stable-artifacts \
  --json
```

The default smoke path does not request native recording or native screenshot
sequences. Add those heavier artifacts only for focused debugging or release
evidence that explicitly needs them.

Gameplay parity manifests must keep enrolled scene coverage explicit. Every
required surface named by a parity entry, such as an entity, asset, texture,
material, resource, UI node, collider, trigger, or animation clip, needs a
pass/fail assertion row. Surfaces that are not enforceable yet must be listed
as `reportOnly` or `unsupported` with a stable reason; otherwise the gameplay
parity gate fails with `TN_RUNTIME_PARITY_COVERAGE_GAP`.

Gameplay parity entries use an explicit promotion ladder:

- `enforced`: contributes to pass/fail claims.
- `calibrating`: runs in reports, requires `promotionCriteria`, and does not
  contribute to pass claims.
- `quarantined`: runs for visibility, requires `reason`, and stays
  non-passing until the blocker is removed.
- `report-only`: runs for visibility, requires `reason`, and downgrades drift
  diagnostics to warnings.

Runtime probe assertion rows include a proof source. The gate prefers paired
runtime observation sidecars when a manifest supplies them and labels those
assertions as `runtime-observation`; otherwise source-backed fallback rows are
kept visible as `source-manifest` and must not be used to claim broad native
runtime resource parity.

`tn playtest` writes `runtime-observations.json` beside `summary.json` when a
target can expose cheap runtime facts for assets, textures, and materials. Web
playtests read those facts from the browser runtime snapshot; native playtests
read them from proof-harness readiness samples. `tn parity playtest` preserves
the per-target sidecars, and the gameplay parity probe gate auto-discovers
matching sidecars from the same aggregate run before falling back to source
manifests.

Negative controls live in verify-tools synthetic fixtures. They intentionally
exercise movement, axis, resource, contact, animation, asset, texture,
material, and coverage drift diagnostics. These fixtures are harness proof
only; they must not be copied into example artifacts or release evidence.

Coverage reports separate enforced smoke/full coverage from source inventory
debt. `sourceInventoryCoveragePercent` is a debt signal, not a pass claim, and
missing enforced required surfaces still fail with
`TN_RUNTIME_PARITY_COVERAGE_GAP`.

The smoke gameplay parity budget is 60 seconds. Enforced smoke entries that
exceed it emit `TN_GAMEPLAY_PARITY_SMOKE_BUDGET_EXCEEDED`; move heavy scenarios
to the full profile unless timing evidence justifies promotion.

Humanoid test-instrument features use `featureSurfaces` in the gameplay parity
manifest. A feature row must name `whyThisFeature`, required surfaces,
promotion criteria, tolerance rationale, and artifact links before it can move
beyond `calibrating`; otherwise the manifest emits a stable feature diagnostic.

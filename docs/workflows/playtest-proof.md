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

When the intended input should move on a specific coordinate, include an axis
assertion:

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

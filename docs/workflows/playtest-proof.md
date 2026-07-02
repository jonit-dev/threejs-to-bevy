# Playtest Proof

Use `tn playtest` when a game needs proof that input changes gameplay state, not
just proof that the scene renders.

```bash
tn playtest --project examples/racing-kit-rally --entity player.car --press KeyW --frames 60 --expect-moved --json
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

Failure diagnostics are stable:

- `TN_PLAYTEST_ENTITY_NOT_FOUND`
- `TN_PLAYTEST_INPUT_NO_EFFECT`
- `TN_PLAYTEST_AXIS_NO_EFFECT`
- `TN_PLAYTEST_RUNTIME_NOT_READY`
- `TN_PLAYTEST_BROWSER_UNAVAILABLE`

Native/Bevy playtest injection is still pending. Until that adapter exposes the
same proof hook, `tn playtest` is a web-runtime gameplay proof over the emitted
portable bundle.

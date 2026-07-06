# Native Proof Harness

The native proof harness is the structured contract used by CLI proof commands
to drive the Bevy runtime deterministically. Normal runtime launch is unchanged;
the harness is enabled only when `threenative_runtime` receives both
`--proof-harness <commands.json>` and `--readiness-out <readiness.json>`.

## Command Stream

```json
{
  "schema": "threenative.native-proof-harness",
  "version": "0.1.0",
  "commands": [
    { "tick": 5, "type": "key", "code": "KeyW", "pressed": true },
    { "tick": 20, "type": "key", "code": "KeyW", "pressed": false },
    { "tick": 30, "type": "exit" }
  ]
}
```

- `tick` is the native frame tick before input capture for that frame.
- `type: "key"` applies a portable keyboard `code` to Bevy's input resource.
  Supported codes match `docs/contracts/input.md`.
- `type: "exit"` requests a clean runtime exit.

Unsupported command schemas fail at startup. Unsupported key codes are reported
in readiness diagnostics and make the readiness payload `ok: false`.

## Readiness

The runtime writes readiness after each harness tick:

```json
{
  "schema": "threenative.native-proof-readiness",
  "version": "0.1.0",
  "ok": true,
  "tick": 5,
  "diagnostics": []
}
```

CLI callers must treat `ok: false` or any diagnostic with
`severity: "error"` as proof failure.

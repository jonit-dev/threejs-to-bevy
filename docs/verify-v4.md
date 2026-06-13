# verify:v4

`verify:v4` is the current V4 scripting gate. It builds the primitive scripting
demo, runs web JavaScript and native QuickJS over the same fixed trace, compares
canonical effect logs, and keeps the web and native visual proof artifacts under
`artifacts/v4`.

Current artifacts:

- `artifacts/v4/v4-scripting-report.json`
- `artifacts/v4/verification-report.json`
- `artifacts/v4/web-effects.json`
- `artifacts/v4/native-effects.json`
- `artifacts/v4/effects-diff.json`
- `artifacts/v4/web-effect-log.json`
- `artifacts/v4/web-visual-report.json`
- `artifacts/v4/frame-01.png`, `frame-02.png`, and `frame-03.png`
- `artifacts/v4/native-bevy-frame-01.png`

The file uses schema `threenative.web-system-effects` and can contain stable
`patch`, `event`, `command`, and `service` entries with frame, tick, schedule,
system ID, entity ID, component/event/service ID, and normalized payloads. The
current primitive example emits patch, event, command, and service entries from
rotation, movement, spawn/despawn, event handoff, `physics.raycast`, and
`animation.play` proof systems.

Generate the web-side proof with:

```bash
pnpm verify:v4 -- --json
```

Generate the native Bevy frame proof with:

```bash
cd runtime-bevy
cargo run --quiet -p threenative_runtime --bin threenative_capture -- \
  ../examples/v4-scripting/dist/v4-scripting.bundle \
  camera.main \
  ../artifacts/v4/native-bevy-frame-01.png
```

The V4-specific verifier helper writes the same web proof under top-level
`artifacts/v4` for release-gate aggregation. The fixed trace uses
`elapsed=1`, `dt=fixedDt=1/60`, `MoveForward=true`, `Jump=true`, `MoveX=1`,
and `MoveY=0`; fields ignored during comparison are listed in
`effects-diff.json`.

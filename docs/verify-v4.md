# verify:v4

`verify:v4` is not the release gate yet. V4 now has web-side artifacts and a
native Bevy frame artifact; the later V4 native verifier will compare web and
QuickJS effect output automatically.

Current artifacts:

- `artifacts/v4/v4-scripting-report.json`
- `artifacts/v4/verification-report.json`
- `artifacts/v4/web-effect-log.json`
- `artifacts/v4/frame-01.png`, `frame-02.png`, and `frame-03.png`
- `artifacts/v4/native-bevy-frame-01.png`

The file uses schema `threenative.web-system-effects` and can contain stable
`patch`, `event`, `command`, and `service` entries with frame, tick, schedule,
system ID, entity ID, component/event/service ID, and normalized payloads. The
current primitive example emits patch and event entries; focused web/native
tests cover command and service entries until the fixed-trace V4 verifier is
wired.

Generate the web-side proof with:

```bash
pnpm tn -- verify --project examples/v4-scripting --frames 3 --expect-motion --json
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
`artifacts/v4` for release-gate aggregation.

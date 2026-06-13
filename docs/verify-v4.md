# verify:v4

`verify:v4` is not the release gate yet. V4-03 adds the web-side artifact that
the later V4 native verifier will compare against QuickJS output.

Current web artifacts:

- `artifacts/v4/v4-scripting-report.json`
- `artifacts/v4/verification-report.json`
- `artifacts/v4/web-effect-log.json`
- `artifacts/v4/frame-01.png`, `frame-02.png`, and `frame-03.png`

The file uses schema `threenative.web-system-effects` and can contain stable
`patch`, `event`, `command`, and `service` entries with frame, tick, schedule,
system ID, entity ID, component/event/service ID, and normalized payloads. The
current primitive example emits patch and event entries; the fuller command and
service demo remains in the later V4 primitive-demo ticket.

Until native QuickJS execution is wired, generate the web-side proof with:

```bash
pnpm tn -- verify --project examples/v4-scripting --frames 3 --expect-motion --json
```

The V4-specific verifier helper writes the same web proof under top-level
`artifacts/v4` for release-gate aggregation.

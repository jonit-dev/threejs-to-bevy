# verify:v5

`verify:v5` is the current V5 visual-quality scene gate. It is intentionally
narrower than the future V5 aggregate release gate tracked by V5-10.

Run:

```bash
pnpm verify:v5
pnpm verify:v5 -- --json
```

The gate currently:

- checks V5 documentation consistency
- builds the CLI
- builds `examples/v5-functional`
- validates the emitted `dist/v5-functional.bundle`
- captures web visual verification screenshots and diagnostics
- writes dense-content budget evidence under `artifacts/v5/dense-content`
- writes `artifacts/v5/verification-report.json`

The V5 scene demonstrates promoted V5 visual features that have already landed:
textured environment assets, lighting and atmosphere metadata, shadow/color
fields, repeated dense scatter, source-asset LOD metadata, and environment
budget reports.

This gate does not claim editor, online, networking, public plugin, custom
renderer, runtime mesh LOD swapping, or renderer-level native instancing
support.

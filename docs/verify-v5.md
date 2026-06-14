# verify:v5

`verify:v5` is the V5 aggregate release gate. It proves the maintained V5
visual scene, docs/diagnostics guard, conformance evidence, Rust native test
evidence, dense-content budget evidence, and game-authoring ergonomics starter
smoke in one repeatable command.

Run:

```bash
pnpm verify:v5
pnpm verify:v5 -- --json
```

The gate currently:

- checks V5 documentation consistency
- runs selected V5 docs/gate and SDK TypeScript tests
- builds the CLI
- builds `examples/v5-functional`
- validates the emitted `dist/v5-functional.bundle`
- captures web visual verification screenshots and diagnostics
- writes dense-content budget evidence under `artifacts/v5/dense-content`
- creates, builds, and validates `v5-game-starter` under
  `artifacts/v5/starter-smoke`
- runs shared conformance and links `artifacts/conformance/verification-report.json`
- runs Bevy native tests and writes `artifacts/v5/rust-test-report.json`
- writes `artifacts/v5/verification-report.json`

The V5 report uses schema `threenative.verify.v5` version `0.1.0` and includes
`status`, `code`, `steps`, `diagnostics`, `artifacts`, `startedAt`, and
`durationMs`. Failures include a stable `TN_VERIFY_V5_STEP_FAILED` diagnostic
for the first failing step.

The V5 scene demonstrates promoted V5 visual features that have already landed:
textured environment assets, lighting and atmosphere metadata, shadow/color
fields, repeated dense scatter, source-asset LOD metadata, and environment
budget reports. The starter smoke demonstrates the game-first SDK ergonomics
path through `defineGame` and `tn create --template v5-game-starter`.

This gate does not claim editor, online, networking, public plugin, custom
renderer, runtime mesh LOD swapping, or renderer-level native instancing
support.

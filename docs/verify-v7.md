# verify:v7

`verify:v7` is not the aggregate V7 release gate yet. V7-01 starts the evidence
contract that later V7 feature tickets and the final V7 gate must use.

Current V7 conformance evidence starts with:

- `packages/ir/fixtures/conformance/v7-fixture-catalog.json`
- `pnpm verify:conformance`
- `artifacts/conformance/verification-report.json`

The V7 fixture catalog maps V7-02 through V7-09 to baseline bundles, planned
accepted and rejected fixture bundle paths, expected target capabilities,
report artifact paths, and rejected diagnostic code families.

Conformance mismatch diagnostics must localize drift with:

- `fixture`
- `path`
- `expectedRuntime`
- `actualRuntime`
- `expected`
- `actual`
- `bundlePath`
- `artifactPath`
- `artifactPaths`
- stable diagnostic `code`

This document does not claim V7 runtime support. Runtime-specific V7 reports,
functional scene artifacts, packaging evidence, performance evidence, and the
final `pnpm verify:v7` aggregate command remain later V7 tickets.

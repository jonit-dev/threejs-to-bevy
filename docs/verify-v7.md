# verify:v7

`verify:v7` is not the aggregate V7 release gate yet. V7-01 starts the evidence
contract that later V7 feature tickets and the final V7 gate must use, and
V7-02 now adds the first runtime-specific fixed trace.

Current V7 conformance evidence starts with:

- `packages/ir/fixtures/conformance/v7-fixture-catalog.json`
- `packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle`
- `pnpm verify:conformance`
- `artifacts/conformance/verification-report.json`
- `artifacts/conformance/v7-advanced-physics-character/web-effects.json`
- `artifacts/conformance/v7-advanced-physics-character/native-effects.json`
- `artifacts/conformance/v7-advanced-physics-character/effects-diff.json`

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

The current V7-02 runtime evidence is intentionally narrow: the
`v7-advanced-physics-character` fixture compares web and native fixed traces for
portable primitive overlap and swept box shape-cast queries with collider layer
filters. Focused web and native runtime tests also pin deterministic ordering
for simultaneous collision and trigger contacts. This does not claim full solver
parity, dynamic mesh collider behavior, broader sensor coverage, or
character-controller movement/blocking parity.

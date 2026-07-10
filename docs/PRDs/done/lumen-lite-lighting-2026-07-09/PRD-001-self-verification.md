# PRD-001 Self-Verification: Portable Cascaded Shadow Stability

Date: 2026-07-09

## Result

PASS for the PRD-owned contract and release proof. The implementation adds a
portable cascade profile, a real web cascaded-shadow controller with texel
stabilization, native Bevy mapping, shared conformance reporting, and live
cross-runtime evidence.

## Acceptance Evidence

| Acceptance criterion | Evidence |
| --- | --- |
| Authored fields validate and enroll the capability | IR and compiler tests pass; `shadow-cascade-stability` validates through the fixture catalog. |
| Web shadows remain stable under camera motion | The focused gate measures identical controller snapshots at 0.25 texel and a changing 1.25-texel control; real web evidence is nonblank. |
| Bevy maps the shared profile | Native rendering tests pass and the focused gate compares the requested/applied profile reports. |
| Material hooks remain composable | Controller tests prove existing `onBeforeCompile` and cache-key hooks are preserved and restored; no global `ShaderChunk` mutation is used. |
| Capability and parity documentation is current | Documentation consistency passes after updating rendering capability, status, Bevy parity, and systems-quality records. |

## Verification Matrix

| Command or review | Result |
| --- | --- |
| `pnpm build` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm --filter @threenative/ir test` | PASS, 344 tests |
| `pnpm --filter @threenative/runtime-web-three test` | PASS, 342 tests |
| `cargo test -p threenative_runtime --test rendering_atmosphere` | PASS, 11 tests |
| `pnpm verify:conformance` | PASS |
| `pnpm verify:focused verify:shadow-cascade-stability` | PASS, no diagnostics |
| `pnpm check:docs` | PASS |
| Manual inspection of the cascade contact sheet | PASS; visible nonblank web/native shadows, no broad cascade band |

The focused report is generated at
`tools/verify/artifacts/shadow-cascade-stability/verification-report.json`.
At final verification it reported web/native boundary deltas below the gate
limits, nonblank contrast and edge gradients, and exact requested profiles.

## Defects Found And Corrected

1. The first live render could compile a material before cascade uniforms were
   populated. The controller now establishes shader state before first use.
2. The initial cascade transition produced a broad horizontal band. Cascade
   coverage and shader blend margins are now symmetric and bounded.

## Repository-Wide Baseline Exceptions

The aggregate `pnpm test` command reaches all PRD-owned suites successfully but
fails an unrelated MCP assertion: the test expects `runtime.set_window` to lack
CLI adapter metadata even though the owning registry now supplies it. No MCP or
authoring-registry files are changed by this PRD.

`pnpm verify:focused verify:feature-parity-visual-polish` also reaches the
PRD-owned checks but fails the pre-existing `v10-dense` `lod-impostor` web/native
brightness threshold (observed 0.2149, threshold 0.1). That fixture has neither
an atmosphere profile nor the `shadow-cascade-profile` capability, so the new
controller is not instantiated for it. The dedicated live cascade release gate
passes and remains the acceptance authority for this PRD.

## Cleanup

Temporary preview and native capture processes were stopped. Generated evidence
remains in ignored artifact directories; durable source, fixture enrollment,
tests, documentation, and this report are committed.

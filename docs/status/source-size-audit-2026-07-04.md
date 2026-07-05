# Source Size Audit - 2026-07-04

## Scope

Scanned TypeScript, TSX, and Rust source files with:

```bash
pnpm check:source-size -- --json
```

The check is intentionally warning-only. It exits `0` even when diagnostics are
present, and every diagnostic has `severity: "warning"`.

## Thresholds

- Source files: 1200 lines
- Test files: 1800 lines
- Class/type/impl blocks: 350 lines

## Result

- Files scanned: 765
- Warning violations: 19
- Blocking errors: 0
- Status: warning

## Flagged Violations

| Count | Path | Lines | Threshold | Diagnostic |
|-------|------|-------|-----------|------------|
| 1 | `packages/authoring/src/operations.ts` | 5414 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 2 | `packages/ir/src/validate.ts` | 2805 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 3 | `runtime-bevy/crates/threenative_runtime/src/map_world.rs` | 2673 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 4 | `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs` | 2426 | 1800 | `TN_SOURCE_SIZE_FILE_LINES` |
| 5 | `tools/verify/src/gameProductionGate.test.ts` | 2076 | 1800 | `TN_SOURCE_SIZE_FILE_LINES` |
| 6 | `runtime-bevy/crates/threenative_loader/src/types.rs` | 2073 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 7 | `runtime-bevy/crates/threenative_runtime/src/ui.rs` | 2051 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 8 | `packages/runtime-web-three/src/mapWorld.ts` | 2045 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 9 | `packages/cli/src/commands/game.ts` | 1947 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 10 | `runtime-bevy/crates/threenative_runtime/src/conformance.rs` | 1793 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 11 | `packages/cli/src/commands/scene.ts` | 1693 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 12 | `tools/verify/src/gameProductionGate.ts` | 1638 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 13 | `packages/ir/src/types.ts` | 1590 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 14 | `packages/cli/src/commands/sourceDocuments.ts` | 1569 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 15 | `packages/compiler/src/emit/bundle.ts` | 1528 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 16 | `packages/runtime-web-three/src/systems/context.ts` | 1527 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 17 | `packages/ir/src/uiValidation.ts` | 1442 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 18 | `packages/ir/src/assetValidation.ts` | 1360 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |
| 19 | `packages/cli/src/commands/asset.ts` | 1207 | 1200 | `TN_SOURCE_SIZE_FILE_LINES` |

## Interpretation

This audit flags likely SRP review candidates, not correctness bugs. The
largest hotspots are authoring operations, IR validation, runtime world
mapping, runtime UI mapping, and CLI command modules. These are shared surfaces
where future edits should prefer extracting cohesive helpers or submodules
before adding more behavior.

No class/type/impl block exceeded the current block threshold after the Rust
parser lifetime handling was corrected; the current violations are file-level
size warnings only.

## Verification

- `node --test scripts/check-source-size.test.mjs` passed.
- `pnpm check:source-size -- --json` completed with exit code `0` and 19 warning
  diagnostics.


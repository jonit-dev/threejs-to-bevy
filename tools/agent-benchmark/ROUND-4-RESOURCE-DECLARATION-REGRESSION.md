# Round-4 Resource Declaration Regression

Date: 2026-07-07

## Source Finding

`OFF-RECIPE-ROUND-4-RECOMMENDATIONS-2026-07-07.md` identified
`resourceWrites`/`resourceReads` declaration friction as the top repeated
ThreeNative failure class across all four round-4 sessions. The failure is
mechanical when scripts use literal resource helper IDs.

## Regression Coverage

- `packages/compiler/src/scripts/resourceAccess.test.ts`
  - infers sorted resource reads and writes from literal
    `context.resources.get/set/patch` helper calls.
  - rejects dynamic resource IDs with
    `TN_SCRIPT_DYNAMIC_RESOURCE_ID_UNSUPPORTED` and a fix hint.
- `packages/compiler/src/scripts/diagnostics.test.ts`
  - validates declared literal resource reads and writes.
  - preserves explicit dynamic-ID diagnostics.
- `packages/compiler/src/examples.test.ts`
  - builds a structured-source system with no authored `resourceReads` field
    and proves emitted `systems.ir.json` contains derived `["GameState"]`.
  - builds lifecycle exports independently and proves only the export that
    writes `GameState` receives the derived write list.
- `packages/cli/src/commands/build.test.ts`
  - runs `tn build --json` through `buildCommand` with no authored
    `resourceWrites` and proves the build succeeds with derived
    `["GameState"]` in `systems.ir.json`.

## Expected Agent Outcome

Agents should no longer hit undeclared-resource errors for statically named
resource helper calls. Dynamic resource IDs remain unsupported because they
cannot be represented deterministically in the IR contract; those cases fail
with a named diagnostic and literal-ID fix guidance.

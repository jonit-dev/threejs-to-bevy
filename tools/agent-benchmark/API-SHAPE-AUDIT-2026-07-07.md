# API Shape Audit - 2026-07-07

## Raw Data

Transcript/event evidence reviewed:

- `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/candidates/*/codex-events.jsonl`
- `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/candidates/*/session.json`
- Existing diagnostic inventory:
  `tools/agent-benchmark/DIAGNOSTIC-FAILURE-AUDIT-2026-07-07.md`

Focused occurrence scan:

| Shape | Hits | Classification | Decision |
| --- | ---: | --- | --- |
| `context.input.getAxis(...)` | 25 | keep | Already convention-first and matches authored input axis names. |
| `context.time.fixedDelta` | 19 | keep | Preferred property. Compiler already warns on callable legacy form. |
| `entity.transform().position` | covered by starter/cookbook | keep | Preferred direct transform property. Compiler already warns on `positionOr(...)`. |
| `input.axis1(...)` | 4 | replace | Legacy compatibility remains typed, but diagnostics steer to `getAxis(...)`. |
| `transform.positionOr(...)` | 8 | replace | Legacy compatibility remains typed for runtime facades; docs steer to `position`. |
| `time.fixedDelta(...)` | 1 | replace | Legacy callable idiom remains diagnosed as info, not a hard failure. |
| `NumberEx` | 12 | alias | Add preferred `Mathf` alias; keep `NumberEx` for one cycle. |
| `Vec2` | 5 | alias | Add preferred `Vector2` alias; keep `Vec2` for one cycle. |
| `Vec3` | 21 | alias | Add preferred `Vector3` alias; keep `Vec3` for one cycle. |

## Implemented Alias Set

- `Mathf = NumberEx`
- `Vector2 = Vec2`
- `Vector3 = Vec3`

These are exact object aliases, not wrappers, so behavior, determinism, and
bundle output semantics stay unchanged.

## Migration Notes

- Starter scripts and cookbook examples now prefer `Vector3`.
- API cards teach `Mathf`, `Vector2`, and `Vector3`, while documenting that
  `NumberEx`, `Vec2`, and `Vec3` remain supported.
- Compiler helper import allowlists accept old and new names.
- Prescriptive unsupported-import snippets now suggest `Vector3`.

## Verification

Focused verification should include:

```bash
pnpm --filter @threenative/script-stdlib test
pnpm --filter @threenative/compiler test
pnpm verify:cookbook
```

# Write-Time Validation Audit - 2026-07-07

Purpose: classify every high-value path that writes durable authoring source or
generated starter source, and make retry-chain failures a gate rather than a
benchmark footnote.

## Policy

- `content/**/*.json` edits should go through bounded CLI commands or the
  shared `@threenative/authoring` operations.
- Candidate structured source must validate before write when the command is a
  mutation of existing durable source.
- Generated-only scaffold paths may write known starter documents, but they
  must be covered by deterministic replay gates.
- Raw direct JSON editing remains a last resort for gaps where no bounded
  command exists.

## Writer Classification

| Writer surface | Files | Policy | Notes |
|----------------|-------|--------|-------|
| Source document commands | `packages/cli/src/commands/sourceDocuments.ts`, `packages/authoring/src/operations.ts` | validate-before-write | `createSourceDocument`, `upsertSourceDocument`, and `mutateLoadedSourceDocument` validate candidate documents before writing. |
| Scene commands and lifecycle edits | `packages/cli/src/commands/sourceDocuments.ts`, `packages/authoring/src/operations.ts` | validate-before-write | Scene mutations use cloned candidate data and validate before persistence; tests cover unchanged files on rejection. |
| UI, material, prefab, physics, system, and resource commands | `packages/cli/src/commands/sourceDocuments.ts`, `packages/authoring/src/operationRegistry.ts` | validate-before-write | Commands route through registered authoring operations and shared source document mutation helpers. |
| Mechanic blocks | `packages/cli/src/mechanicBlocks/registry.ts` | generated-only bounded writes | Blocks emit typed known source shapes and are covered by scaffold/session-cost replay. Future expansion should move new mutating blocks through shared authoring operations. |
| `tn game plan --apply` scaffolds | `packages/cli/src/commands/game.ts`, authoring recipe helpers | generated-only bounded writes | Writes starter source, scripts, and scenario files from deterministic plans; session-cost replay covers supported recipe paths. |
| Project/starter generation | `packages/cli/src/commands/create.ts`, templates | generated-only | Generated starters are not mutation repair loops; smoke and template-production gates cover source validity. |
| Agent raw direct edits | `content/**/*.json` outside CLI | deferred | Supported only when no bounded CLI operation covers the change. Agents should preserve schema/version fields and run authoring validation immediately. |

## Round-4 Mistake Mapping

| Mistake class | Immediate rejection surface | Fix guidance |
|---------------|-----------------------------|--------------|
| `RigidBody.kind: "fixed"` | Authoring validation / source mutation commands | Use `kind: "static"` for immovable bodies. |
| Unknown input action or binding id | Input/source mutation diagnostics | Use one of the declared action IDs from the source document. |
| Legacy transform or malformed component shape | Scene/source mutation diagnostics | Use typed component fields emitted by `tn scene ... --json` commands. |
| Missing script resource declaration | Script declaration extraction and runtime resource diagnostics | Declare script reads/writes through SDK helpers so web and native observers can prove use. |

## Retry Ratchet

Session-cost reports now include:

- `maxConsecutiveSameDiagnostic`: repeated failures with the same diagnostic
  code after the first occurrence.
- `identicalAssertionRepeatCount`: repeated failed playtest assertions with the
  same id and normalized details.

The gate fails when `maxConsecutiveSameDiagnostic > 1` or
`identicalAssertionRepeatCount > 0`.

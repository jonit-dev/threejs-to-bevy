# Adapter Surface Remediation PRDs

This bundle slices
[`docs/status/systems-code-quality-diagnostic-adapter-surfaces-2026-07-08.md`](../../../status/systems-code-quality-diagnostic-adapter-surfaces-2026-07-08.md)
into ordered, verifiable work. The diagnostic found the same systemic failure
across authoring operations, editor source operations, CLI commands, and
generated-game verification: a descriptor or policy source of truth exists, but
adapter surfaces still re-derive it by hand.

The goal is not a broad rewrite. The goal is to make command, editor, MCP, and
verification surfaces descriptor-backed, drift-checked, and fail-closed when an
operation, command, or generated-game proof requirement is missing from a
surface.

## Ordered PRDs

1. [PRD-001 Generated-Game Proof Enrollment From Config](../../done/other/adapter-surface-remediation-2026-07-08/PRD-001-generated-game-proof-enrollment-from-config.md)
2. [PRD-002 Adapter Surface Drift Gates](../../done/other/adapter-surface-remediation-2026-07-08/PRD-002-adapter-surface-drift-gates.md)
3. [PRD-003 CLI Command Registry and Shared Arg Plumbing](../../done/other/adapter-surface-remediation-2026-07-08/PRD-003-cli-command-registry-and-shared-arg-plumbing.md)
4. [PRD-004 Executable Authoring Operation Descriptors](PRD-004-executable-authoring-operation-descriptors.md)
5. [PRD-005 Editor Operation Metadata and Composite Recipes](PRD-005-editor-operation-metadata-and-composite-recipes.md)

## Dependency Shape

- PRD-001 is independent and should land first. It has the smallest surface,
  removes one real generated-game policy inconsistency, and establishes the
  precedent that enrollment policy travels with the project that owns it.
- PRD-002 should land before refactors. It turns silent adapter drift into
  focused failing tests while the current hand-written surfaces still exist.
- PRD-003 follows PRD-002 because the CLI registry becomes the shared host for
  command metadata, dispatch, help text, and reusable argv parsing.
- PRD-004 builds on PRD-003's parsing substrate and extends authoring operation
  descriptors enough to drive CLI/MCP/editor adapter metadata incrementally.
- PRD-005 follows PRD-004 because editor operation metadata should consume the
  executable authoring descriptors rather than invent a third registry.

## Diagnostic Coverage Map

| Diagnostic item | Owning PRD |
| --- | --- |
| Generated-game enrollment arrays and path-specific proof policy | PRD-001 |
| Agent inventory required for only `metro-surfer-heist` | PRD-001 |
| Missing diagnostic for hard-coded/enrolled project without marker artifact | PRD-001 |
| Operation registry names not checked against CLI/MCP/editor/smoke surfaces | PRD-002 |
| Editor operation names and payload builder keys not checked against registry descriptors | PRD-002 |
| CLI metadata/help/dispatch not integrity-checked against command handlers | PRD-002 |
| `packages/cli/src/index.ts` command metadata, dispatch, and help duplication | PRD-003 |
| Per-command `--` normalization, flag parsing, and coercion duplication | PRD-003 |
| `sourceDocuments` CLI usage and MCP argv flag-name drift | PRD-004 |
| Operation descriptors lack CLI paths, flag names, positional order, and constraints | PRD-004 |
| Editor store/server/model defaults, payload builders, fallbacks, and recipes diverge | PRD-005 |
| Dead or duplicated editor fallbacks such as `ui.add_text` | PRD-005 |

## Source Evidence

- `docs/status/systems-code-quality-diagnostic-adapter-surfaces-2026-07-08.md`
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
- `packages/authoring/src/operationRegistry.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/sourceDocuments.ts`
- `packages/mcp-server/src/index.ts`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/state/editorStore.ts`
- `packages/editor/src/adapters/editorModel.ts`
- `tools/verify/src/editorRequiredOperations.ts`
- `tools/verify/src/gameProductionGate.ts`
- `tools/verify/src/release.ts`

## Bundle Acceptance

- [ ] The four matching red rows in `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
      are downgraded only after implementation evidence is linked.
- [ ] New command, operation, editor, MCP, and generated-game policy surfaces
      are descriptor-backed or covered by explicit drift diagnostics.
- [ ] Per-PRD verification commands pass, including focused package tests and
      relevant verify gates.
- [ ] Capability or release-gate claims changed by implementation are reflected
      in `docs/status/capabilities/*.md`, `docs/STATUS.md`, and
      `docs/bevy-feature-parity.md` where applicable.

# PRD-005: Editor Operation Metadata and Composite Recipes

## Status

Done

## Context

Editor source operations currently span store actions, server payload builders,
fallback switches, model inventory data, authoring registry descriptors, and
verify smoke lists. The diagnostic found duplicated defaults, duplicated
composite recipes, payload transformations that ignore registry descriptors,
and at least one unreachable fallback path.

The editor does need editor-specific semantics, but those semantics should be
metadata over the authoring registry: payload builders, explicit fallbacks, and
named composite recipes.

## Goals

- Introduce one editor operation metadata layer over authoring descriptors.
- Keep true editor composites as named recipes executed by both store plans and
  server APIs.
- Remove duplicated fallback cases and default definitions where descriptors or
  metadata can own them.
- Extend smoke coverage to execute composites end-to-end.

## Non-Goals

- Redesign the editor store.
- Add new authoring operation capabilities except where required to remove a
  dead fallback.
- Promote editor-only behavior as portable runtime behavior.

## Requirements

1. Add `editorOperationMetadata` that looks up the authoring operation
   descriptor and decorates it with editor-only payload builders, fallback
   markers, and optional composite recipe references.
2. Define composite recipes such as `add.light`, `add.terrain`,
   `scene.create_default`, and primitive-plus-placement patterns once, with
   ordered `{ name, args }` steps.
3. Route both editor store operation plans and server operation execution
   through the same metadata/recipe definitions.
4. Replace per-component switch logic with a
   `buildAddComponentOperation()`-style helper driven by metadata and
   descriptors.
5. Delete fallback-switch cases that duplicate registry operations; keep only
   marked genuine fallbacks, or wire/remove dead paths such as `ui.add_text`.
6. Extend smoke coverage to execute composite recipes, not only atomic
   operations.

## Acceptance Criteria

- [x] Editor operation names and payload builder keys are validated against
      authoring descriptors by tests from PRD-002.
- [x] Store plans and server execution use the same composite recipe definition
      for migrated editor composites.
- [x] Camera, terrain, light, and primitive placement defaults have one editor
      metadata owner or are read from the authoring descriptor.
- [x] Dead fallback paths are either made reachable and covered or removed.
- [x] Composite recipes run through focused editor tests and the relevant smoke
      gate.

## Verification

- [x] `pnpm --filter @threenative/editor test`
- [x] `pnpm --filter @threenative/authoring test`
- [x] Editor required-operations smoke gate from `tools/verify`
- [x] `pnpm verify:smoke` if smoke enrollment changes

## Files Likely Touched

- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/state/editorStore.ts`
- `packages/editor/src/adapters/editorModel.ts`
- `packages/editor/src/*test.ts`
- `packages/authoring/src/operationRegistry.ts`
- `tools/verify/src/editorRequiredOperations.ts`

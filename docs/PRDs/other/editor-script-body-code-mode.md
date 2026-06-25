# PRD: Editor Script Body Code Mode

Complexity: 7 -> MEDIUM mode

Score basis: +2 user-facing editor workflow, +2 script validation and source
boundary risk, +1 package/editor state changes, +1 CLI/compiler diagnostic
reuse, +1 verification coverage.

## 1. Context

**Problem:** The editor can attach script references to systems through
`system.attach_script` and `scene.attach_script`, but it does not provide a
MonoEditor-style code mode for creating, opening, editing, or validating the
TypeScript script bodies those references point to.

Current architecture deliberately keeps script bodies in
`src/scripts/**/*.ts`. Structured scene/system documents store only
module/export references. Generated `scripts.bundle.js` and emitted IR remain
build artifacts and must not be reverse-generated into source.

**Files analyzed:**

- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/state/editorStore.ts`
- `packages/editor/src/workbench/operations.ts`
- `packages/authoring/src/operations.ts`
- `packages/authoring/src/operationRegistry.ts`
- `packages/cli/src/commands/scene.ts`
- `packages/cli/src/commands/sourceDocuments.ts`
- `docs/contracts/authoring-source-documents.md`
- `docs/PRDs/other/editor-ready-modular-authoring-and-scripting-architecture.md`

## 2. Goal

Add a bounded editor code mode for script source modules that lets users:

- scaffold a project-local `src/scripts/**/*.ts` module;
- edit existing project-local script bodies;
- attach module/export references to systems through existing operations;
- validate that referenced exports exist and remain portable;
- see diagnostics without treating generated `scripts.bundle.js` as source.

## 3. Non-Goals

- Do not add entity-level `Script` components as a new source model.
- Do not embed script bodies inside `.scene.json` or `.systems.json`.
- Do not reverse-generate TypeScript from `world.ir.json`, `systems.ir.json`,
  or `scripts.bundle.js`.
- Do not expose DOM, Node, filesystem, network, QuickJS, Three.js, or Bevy
  handles to portable scripts.
- Do not implement a full IDE, language server, debugger, or breakpoint system.

## 4. Integration Points

- Editor project API: expose script source inventory under `src/scripts/**`.
- Editor operation API: keep `system.attach_script` and `scene.attach_script`
  as the persistence path for references.
- Authoring validation: reuse missing-module and missing-export diagnostics.
- Compiler script diagnostics: surface forbidden ambient APIs and unsupported
  module state in the editor diagnostics panel.
- CLI parity: preserve `tn system attach-script` and `tn scene attach-script`
  behavior.

## 5. Solution

1. Add a guarded script-source route under the editor server:
   - list only files under `src/scripts/**`;
   - read/write only project-local `.ts` files;
   - reject traversal, generated bundle paths, and non-TypeScript targets.
2. Add a code-mode panel that opens from script inspector rows.
3. Add a scaffold action that creates a minimal exported function when the
   referenced module is missing.
4. On save, run authoring validation and the compiler script diagnostic pass
   without changing structured references.
5. Keep attach/reference edits in the existing script field controls so source
   body editing and reference editing remain separate workflows.

## 6. Verification

| Test | Assertion |
| --- | --- |
| Editor server script route test | Traversal and `dist/**/scripts.bundle.js` reads are rejected. |
| Editor script scaffold test | Missing `src/scripts/foo.ts` can be created with an exported function. |
| Editor attach integration test | `system.attach_script` references the scaffolded module/export. |
| Compiler diagnostic smoke | Saved script with forbidden ambient API reports a stable diagnostic. |
| Build proof | Edited script source compiles into `scripts.bundle.js` through `tn build`. |

## 7. Status

Planned. The current supported workflow is to edit `src/scripts/**/*.ts`
outside the editor and attach references through `system.attach_script` or
`scene.attach_script`.

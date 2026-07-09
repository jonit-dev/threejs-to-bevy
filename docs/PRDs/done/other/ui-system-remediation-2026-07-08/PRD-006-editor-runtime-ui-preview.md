# PRD: Editor Runtime UI Preview

## 1. Context

**Problem:** The editor has a `UiPanel` and a Three.js viewport, but authored
runtime UI is not previewed in the editor. Authors can edit UI source without
seeing the retained UI overlay until they run the game outside the editor.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 5.3 and 7.

**Files likely touched:**

- `packages/editor/src/preview/PreviewHost.tsx`
- `packages/editor/src/preview/EditorViewport3d.tsx`
- `packages/editor/src/panels/UiPanel.tsx`
- `packages/editor/src/state/editorStore.ts`
- `packages/runtime-web-three/src/ui/domOverlay.ts`
- `packages/runtime-web-three/src/ui/renderUi.ts`
- `packages/editor/src/**/*.test.tsx`
- `docs/status/capabilities/editor.md`
- `docs/status/capabilities/ui.md`

## 2. Solution

Embed the web runtime DOM overlay path in the editor preview for authored
retained UI documents. The editor remains a source operation shell: it should
preview compiled/captured UI data and route edits through existing authoring
operations rather than owning a second UI source model.

Preview should support selection/inspection enough to close the author loop,
but it must not expose DOM handles or runtime-only mutable state as durable
source.

## 3. Acceptance Criteria

- [x] Opening a project with retained UI shows the authored overlay in the
      editor preview.
- [x] UI edits made through existing source-backed operations update the preview
      without a full external run.
- [x] Binding placeholders or live binding values render deterministically in
      preview mode.
- [x] Preview interaction is either wired through the PRD-001 action path or
      explicitly read-only with visible editor state and docs.
- [x] The editor does not create a second durable UI source format.

## 4. Verification

- [x] Add editor tests for mounting preview UI from a fixture document.
- [x] Add a regression test that a source-backed UI edit refreshes the preview.
- [x] Run the editor test package.
- [x] Run `pnpm check:docs` if capability docs are updated.

## 5. Dependencies

Can proceed after PRD-001 if interactive preview is in scope. A read-only
preview can proceed independently.

## 6. Non-Goals

- Replacing the game runtime renderer inside the editor.
- React-authoring the portable game UI contract.
- Full visual design tooling.

# Functional Editor Viewport, Gizmo, and Selection

Complexity: 9 -> HIGH mode

Score basis: +3 touches 10+ files over the full implementation, +2 complex
viewport/selection/transform state, +2 multi-package editor/verifier/runtime
integration, +2 user-facing visual UI.

## 1. Context

**Problem:** The editor viewport can render source-backed objects, but it still
needs production-grade selection sync, transform gizmo behavior, visual cues, and
e2e proof before it is a functional scene editor.

**Files Analyzed:**

- `packages/editor/src/EditorApp.tsx`
- `packages/editor/src/preview/EditorViewport3d.tsx`
- `packages/editor/src/preview/selectionBridge.ts`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/workbench/operations.ts`
- `packages/editor/src/EditorApp.test.tsx`
- `packages/editor/src/preview/selectionBridge.test.ts`
- `tools/verify/src/editorPackage.ts`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/panels/ViewportPanel/ViewportPanel.tsx`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/panels/ViewportPanel/GizmoControls.tsx`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/panels/ViewportPanel/EntityTransformControls.tsx`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/panels/ViewportPanel/SelectionOutline.tsx`

**Current Behavior:**

- `EditorViewport3d` uses raw Three.js, `GLTFLoader`, `DRACOLoader`, and
  `TransformControls`.
- Hierarchy selection updates the viewport by attaching a box helper and
  transform controls to the matching object.
- Viewport pointer picking can select non-camera/non-light scene objects and
  report the selected row back to the app.
- Transform controls are always in translate mode; rotate/scale buttons are
  currently visual shell only.
- Camera/light glyphs and selection cues are partial, and the viewport is not
  yet proven across all scene object classes.

## 2. Integration Points

**How will this feature be reached?**

- [x] Entry point identified: `EditorApp` renders `EditorViewport3d` inside the
  central preview panel.
- [x] Caller file identified: `packages/editor/src/EditorApp.tsx` passes
  `selectedRowId`, `onSelectRow`, and `onTransformObject`.
- [x] Registration/wiring needed: expose gizmo mode state in `EditorApp`, pass it
  into `EditorViewport3d`, and route transform commits through
  `scene.set_transform`.

**Is this user-facing?**

- [x] YES -> viewport canvas, move/rotate/scale controls, selection outlines,
  camera/light/entity visual cues, hierarchy selection, and inspector sync.
- [ ] NO.

**Full user flow:**

1. User opens the editor.
2. Editor loads scene objects from structured source through `/api/project`.
3. User selects an entity in the hierarchy or clicks it in the viewport.
4. Selection is reflected in hierarchy, viewport outline/gizmo, and inspector.
5. User changes gizmo mode and drags the gizmo.
6. Transform commits through `scene.set_transform`, reloads source state, and the
   inspector shows the updated values.

## 3. Solution

**Approach:**

- Keep the editor viewport grounded in ThreeNative source/project models and
  generated bundle assets; do not adopt Vibe Coder's ECS/Rapier runtime as the
  source of truth.
- Promote viewport mode to an explicit editor state:
  `translate | rotate | scale`, with keyboard shortcuts and button state.
- Make selection correlation deterministic for entity rows, document-backed
  objects, loaded GLB children, and placeholder primitives.
- Add explicit visual cues for selected object bounds, active axis/gizmo mode,
  camera glyphs, light glyphs, terrain, hierarchy parent/child relationship, and
  unavailable picking targets.
- Commit transforms only through source-backed editor operations; if an entity
  cannot be mutated, render the gizmo disabled with a clear read-only reason.

```mermaid
flowchart LR
    Source[Structured source docs] --> API[/api/project]
    API --> Model[Editor shell model]
    Model --> Hierarchy[Hierarchy panel]
    Model --> Viewport[EditorViewport3d]
    Viewport --> Select[onSelectRow]
    Hierarchy --> Select
    Select --> Inspector[Inspector panel]
    Viewport --> Transform[onTransformObject]
    Transform --> Ops[/api/operation scene.set_transform]
    Ops --> Source
```

**Key Decisions:**

- [x] Library/framework choices: use the existing raw Three.js viewport and
  `TransformControls`; use Vibe Coder as UI behavior reference only.
- [x] Error-handling strategy: unsupported transform targets become disabled
  controls/read-only inspector rows instead of silent failures.
- [x] Reused utilities: `IEditorSceneObject`, `IEditorPropertyRow.operation`,
  `scene.set_transform`, `tools/verify/src/editorPackage.ts`.

**Data Changes:** None initially. The existing scene source transform data
remains authoritative.

## 4. Execution Phases

#### Phase 1: Explicit Viewport Selection Contract - Selecting anywhere updates the same editor state.

**Files (max 5):**

- `packages/editor/src/preview/EditorViewport3d.tsx` - stabilize object owner
  lookup, selection attach/detach, and selected object metadata.
- `packages/editor/src/preview/selectionBridge.ts` - normalize row/entity
  correlation helpers.
- `packages/editor/src/preview/selectionBridge.test.ts` - prove hierarchy,
  viewport, and loaded child mappings.
- `packages/editor/src/EditorApp.tsx` - ensure hierarchy and viewport share one
  selected row state.
- `packages/editor/src/EditorApp.test.tsx` - component-level selection sync
  assertions.

**Implementation:**

- [x] Define a single selection id contract for hierarchy rows and viewport
  object ownership.
- [x] Ensure GLB child meshes, placeholder meshes, terrain, cameras, and lights
  all resolve to the owning row where selection is supported.
- [x] Disable or ignore non-selectable helper geometry without changing
  selection.
- [x] Keep inspector rows in sync after hierarchy and viewport selection.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/preview/selectionBridge.test.ts` | `should resolve loaded model children to the owning scene row` | child hit maps to entity row id |
| `tools/verify/src/editorPackage.ts` | `editor-e2e viewport selection sync` | viewport click updates selected inspector entity |

**Completion Evidence:**

- `pnpm --filter @threenative/editor test` - 54 tests passing, including
  loaded model child selection ownership, nearest owner preference, and
  non-selectable helper geometry handling.
- Existing `verify:editor-package` browser proof selects hierarchy rows and
  viewport objects and fails if the inspector does not update to an expected
  source entity.

**User Verification:**

- Action: click tree/house/terrain in viewport.
- Expected: hierarchy row, viewport outline, gizmo, and inspector all show the
  same selected entity.

#### Phase 2: Gizmo Modes and Transform Persistence - Move, rotate, and scale commit through source operations.

**Files (max 5):**

- `packages/editor/src/EditorApp.tsx` - gizmo mode state, buttons, keyboard
  shortcut handling.
- `packages/editor/src/preview/EditorViewport3d.tsx` - accept mode prop and
  call `TransformControls.setMode`.
- `packages/editor/src/server/operationApi.ts` - verify transform operation
  argument shape remains compatible with viewport commits.
- `packages/editor/src/workbench/operations.ts` - expose operation typing if
  missing.
- `packages/editor/src/EditorApp.test.tsx` - mode and transform callback tests.

**Implementation:**

- [ ] Wire Move/Rotate/Scale buttons to real viewport modes.
- [ ] Add W/E/R shortcuts scoped to the editor shell.
- [ ] Persist translate, rotate, and scale values through `scene.set_transform`.
- [ ] Refresh inspector values after successful mutation.
- [ ] Render transform controls disabled when the selected object lacks a
  source-persistable transform.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/EditorApp.test.tsx` | `should switch gizmo mode when toolbar buttons are pressed` | active mode and viewport prop change |
| `packages/editor/src/EditorApp.test.tsx` | `should dispatch transform edits through the selected row operation` | callback receives row id and transform |

**User Verification:**

- Action: select an entity, press W/E/R, drag the gizmo.
- Expected: gizmo mode changes, source transform changes, and inspector numeric
  values reload from source.

#### Phase 3: Visual Cues and Viewport Tooling - The viewport communicates editor state without confusing helper clutter.

**Files (max 5):**

- `packages/editor/src/preview/EditorViewport3d.tsx` - selected bounds,
  camera/light glyphs, terrain cues, helper disposal.
- `packages/editor/src/styles.css` - viewport mode active state and accessible
  toolbar styling.
- `packages/editor/src/EditorApp.tsx` - label text and mode button ARIA.
- `packages/editor/src/EditorApp.test.tsx` - accessibility and mode labels.
- `tools/verify/src/editorPackage.ts` - e2e assertions for visual state.

**Implementation:**

- [ ] Replace confusing helper icons with consistent camera/light/terrain cues.
- [ ] Keep selection outline and transform controls visible over loaded GLBs.
- [ ] Avoid helper objects intercepting picking.
- [ ] Prove no stray right-side debug buttons or nonfunctional viewport controls
  remain.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/EditorApp.test.tsx` | `should expose accessible gizmo mode controls` | buttons have mode labels and active state |
| `tools/verify/src/editorPackage.ts` | `editor-e2e viewport visual cues` | selected object has inspector sync and no unexpected controls |

**User Verification:**

- Action: select camera, light, terrain, and loaded model rows.
- Expected: each selection has a clear cue, and only functional viewport controls
  are present.

#### Phase 4: Playwright Evidence - The editor gate proves real viewport behavior.

**Files (max 5):**

- `tools/verify/src/editorPackage.ts` - viewport selection/gizmo e2e coverage.
- `packages/editor/src/preview/EditorViewport3d.tsx` - testability hooks for
  loaded state only if needed.
- `packages/editor/src/EditorApp.tsx` - stable labels/hooks only if needed.
- `docs/STATUS.md` - status update after implementation.
- `docs/bevy-feature-parity.md` - evidence anchor update after implementation.

**Implementation:**

- [ ] Assert hierarchy-to-viewport selection sync.
- [ ] Assert viewport-to-hierarchy/inspector selection sync.
- [ ] Assert move/rotate/scale mode changes.
- [ ] Assert transform persistence into source JSON.
- [ ] Capture screenshots/artifacts under `tools/verify/artifacts/editor-package`.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/editorPackage.ts` | `editor-e2e viewport selection sync` | viewport click changes selected inspector entity |
| `tools/verify/src/editorPackage.ts` | `editor-e2e gizmo transform persistence` | source scene transform changes after gizmo commit |

**User Verification:**

- Action: run `pnpm verify:focused verify:editor-package`.
- Expected: report passes and includes viewport/gizmo evidence.

## 5. Verification Strategy

### New E2E Tests Required

Add these flows to `tools/verify/src/editorPackage.ts` or split them into
`packages/editor/e2e/editor-viewport.spec.ts` if the editor package gets a
dedicated Playwright suite. The focused gate must still call them through
`pnpm verify:focused verify:editor-package`.

| E2E Test | User Flow | Required Evidence |
|----------|-----------|-------------------|
| `editor viewport should sync hierarchy selection to viewport and inspector` | Click `base_basic_shaded 0` in hierarchy | Inspector `Name` is `base_basic_shaded 0`, viewport selected row is exposed, selection outline/gizmo is visible in screenshot |
| `editor viewport should sync viewport picking to hierarchy and inspector` | Click tree/house/terrain in canvas | Matching hierarchy row becomes selected and inspector rows switch to that entity |
| `editor viewport should switch gizmo modes with buttons and W/E/R` | Press Move, Rotate, Scale and keyboard shortcuts | Active toolbar state changes and viewport transform control mode changes |
| `editor viewport should persist translate rotate and scale edits` | Drag gizmo in each mode | Source `.scene.json` transform changes, `/api/project` reload shows updated rows, emitted `world.ir.json` has matching Transform |
| `editor viewport should expose selectable camera and light cues` | Select Main Camera and Directional Light | Inspector switches to Camera/Light rows and viewport screenshot shows non-confusing camera/light cue |
| `editor viewport should persist hierarchy reparenting or report unsupported` | Drag one hierarchy row under another | Either source `Hierarchy.parent` changes and survives reload, or the UI shows a stable unsupported diagnostic and does not claim persistence |
| `editor viewport should stay visually clean` | Open fixture and capture screenshot after selecting a GLB | Canvas is nonblank, selected outline and gizmo are visible, no stray debug/right-side helper buttons appear |

### Unit and Component Tests Required

- `packages/editor/src/preview/selectionBridge.test.ts`: owner mapping for GLB
  child meshes, primitives, camera glyphs, light glyphs, and terrain.
- `packages/editor/src/EditorApp.test.tsx`: hierarchy click, viewport callback,
  and inspector selection converge on the same row id.
- `packages/editor/src/EditorApp.test.tsx`: Move/Rotate/Scale controls update
  active mode and pass it to `EditorViewport3d`.
- `packages/editor/src/server/projectApi.test.ts`: selectable scene objects
  carry enough metadata to determine whether transform and reparent operations
  are source-persistable.

Exact commands:

```bash
pnpm --filter @threenative/editor typecheck
pnpm --filter @threenative/editor test
pnpm verify:focused verify:editor-package
pnpm check:docs
pnpm check:names
```

## 6. Acceptance Criteria

- [ ] Hierarchy and viewport selection share one source-backed selected row.
- [ ] Viewport clicks on primitives, GLB children, terrain, camera glyphs, and
  light glyphs behave intentionally and update inspector state when selectable.
- [ ] Move, rotate, and scale modes are real, keyboard-accessible, and reflected
  in `TransformControls`.
- [ ] Transform commits persist through structured source operations.
- [ ] Read-only or unsupported transform targets are visibly disabled.
- [ ] `verify:editor-package` proves selection sync, gizmo mode, transform
  persistence, and clean viewport visual controls.

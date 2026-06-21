# Functional Editor Operations, Modals, and Inspector Completion

Complexity: 11 -> HIGH mode

Score basis: +3 touches 10+ files over the full implementation, +2 complex
source mutation and UI state, +2 multi-package authoring/editor/verifier
integration, +2 user-facing modal/inspector UI, +2 shared component/default
logic.

## 1. Context

**Problem:** The editor has a shell, basic modals, typed inspector rows, and a
done inspector-field PRD, but the remaining source operations and modal flows
must be completed so users can actually edit components, add components, delete
objects, and save without relying on read-only placeholders.

**Files Analyzed:**

- `docs/PRDs/done/editor-inspector-component-field-mapping.md`
- `packages/editor/src/EditorApp.tsx`
- `packages/editor/src/adapters/editorModel.ts`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/workbench/operations.ts`
- `packages/editor/src/workbench/materialModel.ts`
- `packages/editor/src/workbench/uiInputSystemModel.ts`
- `packages/editor/src/EditorApp.test.tsx`
- `packages/editor/src/server/projectApi.test.ts`
- `packages/editor/src/server/bootConfig.test.ts`
- `tools/verify/src/editorPackage.ts`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/menus/AddComponentMenu.tsx`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/shared/AssetLoaderModal.tsx`
- `/home/joao/projects/vibe-coder-3d/src/editor/components/shared/ScenePersistenceModal.tsx`

**Current Behavior:**

- `IEditorPropertyRow` includes field kind, options, operation metadata,
  source path, JSON pointer, read-only state, and source family.
- `EDITOR_INSPECTOR_FIELD_INVENTORY` lists major fields, including Transform,
  MeshRenderer, Camera, Light, material, input, systems, UI, assets, meshes, and
  provenance.
- Add Component modal uses shared definitions/defaults/incompatibilities/packs,
  but several components remain read-only or not fully persisted.
- Add Object modal has enabled primitive sphere only; camera, light, terrain,
  empty entity, and custom GLB are disabled.
- Settings, Delete, and AI Chat are placeholders.
- Light, MeshRenderer prefab primitive/color/asset, environment skybox, and
  several document fields are intentionally read-only because promoted mutation
  operations are missing.

## 2. Integration Points

**How will this feature be reached?**

- [x] Entry point identified: Inspector panel edits, Add Component modal, Add
  Object modal, Delete modal, Save/New/Build modals, AI chat rail later.
- [x] Caller file identified: `EditorApp.tsx` calls `onEditProperty`,
  `onAddComponent`, `onAddObject`, `onMoveRow`, `onSaveScene`, and
  `onCreateScene`.
- [x] Registration/wiring needed: each enabled UI action must map to a named
  editor operation in `workbench/operations.ts` and `server/operationApi.ts`
  backed by `@threenative/authoring`.

**Is this user-facing?**

- [x] YES -> all inspector controls and modals are direct user workflows.
- [ ] NO.

**Full user flow:**

1. User selects an object or document.
2. Inspector shows only attached/source-relevant component panels and document
   rows.
3. User edits a supported field.
4. Editor dispatches a source operation, validates the project, and reloads the
   row.
5. User opens a modal to add component/object/delete/save/build.
6. Modal actions persist source changes, show diagnostics, and are covered by
   e2e evidence.

## 3. Solution

**Approach:**

- Treat the done inspector-field PRD as the baseline inventory; this PRD closes
  the remaining operational gaps.
- Promote read-only fields to editable only when an authoring operation exists
  and tests prove persistence.
- Keep Add Component, Add Object, Asset Loader, Scene Persistence, Delete, and
  Settings as separate modal flows with a shared modal shell.
- Centralize defaults, incompatibilities, packs, and operation payload builders
  so modal logic and inspector logic cannot drift.
- Use explicit diagnostics/read-only reasons instead of silently hiding fields
  that are valid source data but not yet editable.

```mermaid
flowchart LR
    Inspector[Inspector controls] --> FieldMap[Field inventory/defaults]
    Modals[Editor modals] --> FieldMap
    FieldMap --> Operation[Editor operation payload]
    Operation --> API[/api/operation]
    API --> Authoring[@threenative/authoring]
    Authoring --> Source[Structured source files]
    Source --> Reload[/api/project reload]
    Reload --> Inspector
```

**Key Decisions:**

- [x] Library/framework choices: existing React editor shell, authoring
  operations, Playwright verifier.
- [x] Error-handling strategy: failed operations return diagnostics with stable
  operation name, args, source path, and suggested fix.
- [x] Reused utilities: `EDITOR_ADD_COMPONENT_DEFINITIONS`,
  `EDITOR_INSPECTOR_FIELD_INVENTORY`, `runEditorOperation`,
  `dispatchAuthoringOperation`.

**Data Changes:** Structured source mutations only; generated IR remains build
output.

## 4. Execution Phases

#### Phase 1: Operation Coverage Audit - Every enabled control has a source operation or is read-only.

**Files (max 5):**

- `packages/editor/src/adapters/editorModel.ts` - inventory coverage metadata.
- `packages/editor/src/server/projectApi.ts` - row operation/read-only metadata.
- `packages/editor/src/server/projectApi.test.ts` - field coverage tests.
- `packages/editor/src/workbench/operations.ts` - operation name surface.
- `packages/editor/src/server/operationApi.ts` - operation dispatch audit.

**Implementation:**

- [x] Create a testable matrix of enabled fields, disabled fields, modal
  actions, operation names, and source families.
- [x] Fail tests when an editable row lacks an operation.
- [x] Fail tests when a modal button is enabled without a supported operation or
  implemented editor handler.
- [x] Ensure all read-only rows include a useful reason.

**Evidence:**

- `EDITOR_OPERATION_COVERAGE_MATRIX` covers inspector fields and modal actions.
- `pnpm --filter @threenative/editor test` covers editable inspector rows,
  read-only reasons, modal action metadata, and the editor operation name
  surface.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/server/projectApi.test.ts` | `should attach operations to every editable inspector row` | editable rows have operation name/valueArg |
| `packages/editor/src/adapters/editorModel.test.ts` | `should classify unsupported fields as read-only with reasons` | read-only fields explain why |

**User Verification:**

- Action: inspect camera, light, mesh, material, input, system, UI, asset, and
  environment rows.
- Expected: editable rows work; non-editable rows explain why.

#### Phase 2: Component and Field Mutation Completion - Common components are actually editable.

**Files (max 5):**

- `packages/editor/src/server/operationApi.ts` - dispatch missing promoted
  operations.
- `packages/authoring/src/operations.ts` - add/extend operations where source
  contract is missing.
- `packages/editor/src/server/projectApi.ts` - row operation payloads.
- `packages/editor/src/workbench/operations.ts` - operation typing.
- `packages/editor/src/server/projectApi.test.ts` - persistence tests.

**Implementation:**

- [ ] Keep Transform and Camera editable.
- [ ] Promote Light kind/intensity editing if authoring supports it; otherwise
  preserve read-only reasons.
- [ ] Promote MeshRenderer prefab primitive/color/asset editing if authoring
  supports it; otherwise preserve read-only reasons.
- [ ] Promote material color/roughness, input bindings, system script, and UI
  binding edits through existing source operations.
- [ ] Ensure operation validation rejects malformed payloads before writing.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/server/projectApi.test.ts` | `should persist material color edits through editor operation` | source JSON changes and reloads |
| `packages/editor/src/server/projectApi.test.ts` | `should reject unsupported light edits with diagnostics or persist when promoted` | behavior is explicit |
| `packages/authoring/src/__tests__/operations.test.ts` | `should mutate promoted scene component fields` | operation writes structured source |

**User Verification:**

- Action: edit representative fields in the inspector.
- Expected: fields persist to source and reload, or remain read-only with stable
  reasons.

#### Phase 3: Modal Flow Completion - Add, delete, settings, save, and build are not placeholders.

**Files (max 5):**

- `packages/editor/src/EditorApp.tsx` - modal content and state handling.
- `packages/editor/src/server/operationApi.ts` - modal operation dispatch.
- `packages/editor/src/workbench/operations.ts` - operation typing.
- `packages/editor/src/EditorApp.test.tsx` - modal behavior tests.
- `packages/editor/src/server/projectApi.test.ts` - operation persistence tests.

**Implementation:**

- [ ] Add Object supports Empty Entity, Primitive, Camera, Light, Terrain, and
  Custom GLB where source operations exist.
- [ ] Add Component supports defaults/incompatibilities/packs and persists
  compatible components.
- [ ] Delete supports source-backed entity/component deletion only after
  authoring operation exists; otherwise stays disabled with reason.
- [ ] Settings exposes only implemented editor settings.
- [ ] Save/Build modals show operation/build diagnostics and resulting status.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/EditorApp.test.tsx` | `should disable modal actions without source operations` | disabled action has explanation |
| `packages/editor/src/EditorApp.test.tsx` | `should submit add object choices with correct operation payloads` | callback receives operation args |
| `packages/editor/src/server/projectApi.test.ts` | `should persist add component defaults` | new component appears after reload |

**User Verification:**

- Action: open every toolbar/modal action.
- Expected: implemented actions work; unavailable actions are disabled or
  read-only with clear reasons.

#### Phase 4: Functional Editor E2E Gate - The package verifier proves realistic editing.

**Files (max 5):**

- `tools/verify/src/editorPackage.ts` - end-to-end modal and inspector flows.
- `packages/editor/src/EditorApp.tsx` - stable labels/hooks if needed.
- `packages/editor/src/server/projectApi.ts` - e2e metadata if needed.
- `docs/STATUS.md` - status update after implementation.
- `docs/bevy-feature-parity.md` - evidence anchor update after implementation.

**Implementation:**

- [ ] Select entities and documents.
- [ ] Edit representative fields and assert source JSON changes.
- [ ] Add compatible and incompatible components.
- [ ] Add object variants covered by source operations.
- [ ] Save, reload, build, and assert IR/bundle artifacts.
- [ ] Assert all modal placeholders are either implemented or explicitly
  disabled/read-only.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/editorPackage.ts` | `editor-e2e functional editor operations` | inspector/modals/source/IR evidence all pass |

**User Verification:**

- Action: run `pnpm verify:focused verify:editor-package`.
- Expected: report proves user-editable operations, modal flows, source
  persistence, and build output.

## 5. Verification Strategy

### New E2E Tests Required

Add these flows to `tools/verify/src/editorPackage.ts` and keep the artifacts
under `tools/verify/artifacts/editor-package/`.

| E2E Test | User Flow | Required Evidence |
|----------|-----------|-------------------|
| `editor inspector should edit every promoted field kind` | Edit number, vector3, color, enum, string list, script ref, boolean/string where promoted | Source JSON changes, `/api/project` reload reflects new values, disabled fields stay unchanged |
| `editor inspector should explain every read-only field` | Inspect MeshRenderer asset, Light, Environment, Asset, Terrain, custom JSON rows | Every disabled/read-only input has a visible or machine-readable `readOnlyReason` |
| `editor add component should persist compatible defaults` | Add Transform/Camera/Light/Script/MeshRenderer where compatible | Defaults appear in inspector, source JSON persists, incompatible definitions are disabled |
| `editor add component should reject incompatible or duplicate components` | Try adding Camera to MeshRenderer entity and duplicate Transform | Button is disabled or operation returns stable diagnostic; source does not change |
| `editor modals should not expose dead actions` | Open Add Object, Add Component, Delete, Settings, Save, New Scene, Build, AI Chat | Implemented actions work; unimplemented actions are disabled/read-only with clear reason |
| `editor delete should persist or remain explicitly unsupported` | Delete entity/component if promoted | Source deletion survives reload, or Delete modal reports unsupported without changing source |
| `editor save and build should report diagnostics and clean state` | Save after edits, then Build Preview | Statusbar/dialog shows saved/build result; source and IR artifacts are written; diagnostics are shown when build fails |

### Unit and Integration Tests Required

- `packages/editor/src/adapters/editorModel.test.ts`: every editable inventory
  field has operation metadata; every read-only inventory field has a reason.
- `packages/editor/src/server/projectApi.test.ts`: editable rows returned by
  `/api/project` include `operation.name`, `operation.valueArg`, source path,
  JSON pointer, and source family.
- `packages/editor/src/server/operationApi.test.ts`: promoted editor operations
  persist source and reject malformed args without partial writes.
- `packages/editor/src/EditorApp.test.tsx`: modal buttons are enabled only when
  backed by an operation and disabled buttons explain why.
- `packages/editor/src/components/panels/InspectorPanel.test.tsx`: controls
  render correctly for vector3, number, color, enum, asset, script, stringList,
  generated, JSON, and boolean rows.

Exact commands:

```bash
pnpm --filter @threenative/authoring test
pnpm --filter @threenative/editor typecheck
pnpm --filter @threenative/editor test
pnpm verify:focused verify:editor-package
pnpm check:docs
pnpm check:names
```

## 6. Acceptance Criteria

- [ ] Every enabled inspector control has a source operation and verification.
- [ ] Every read-only inspector field has a stable reason.
- [ ] Common component fields persist or are explicitly deferred: Transform,
  MeshRenderer, Camera, Light, Material, Input, Systems, UI, Asset, Environment,
  Terrain.
- [ ] Add Component uses shared definitions/defaults/incompatibilities/packs and
  persists compatible additions.
- [ ] Add Object, Delete, Settings, Save, New Scene, Build Preview, Asset Loader,
  and AI Chat are either implemented or intentionally disabled/read-only with
  user-visible reasons.
- [ ] Source JSON and emitted IR evidence prove the editor is not editing
  generated/runtime state as source.
- [ ] `verify:editor-package` passes with functional editor operation coverage.

# Functional Editor Scene, Assets, and Environment

Complexity: 10 -> HIGH mode

Score basis: +3 touches 10+ files over the full implementation, +2 complex
asset/environment state, +2 multi-package authoring/editor/compiler/verifier
integration, +2 user-facing scene/asset UI, +1 external project asset import
path.

## 1. Context

**Problem:** The editor can load a representative scene and GLBs in its package
gate, but it needs complete source-backed scene, asset, environment, LOD, and
new/load/save behavior to be a functional editor rather than a static visual
fixture.

**Files Analyzed:**

- `packages/editor/src/EditorApp.tsx`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/server/previewRoutes.ts`
- `packages/editor/src/server/buildApi.ts`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/preview/EditorViewport3d.tsx`
- `packages/editor/src/workbench/catalogModel.ts`
- `packages/editor/src/workbench/sceneModel.ts`
- `packages/authoring/src/documents.ts`
- `packages/authoring/src/operations.ts`
- `packages/authoring/src/schemas.ts`
- `tools/verify/src/editorPackage.ts`
- `/home/joao/projects/vibe-coder-3d/public/assets/models`

**Current Behavior:**

- The editor package verifier creates a temporary structured-source project and
  copies Vibe Coder GLBs for farm house and tree/base model proof.
- `/api/project` extracts scene entities, prefabs, inspector rows, LOD triangle
  estimates, and environment skybox summary.
- The viewport loads project GLB/GLTF assets through `/project-assets/...` with
  Draco support and records browser-loaded model evidence.
- New Scene creates default camera, directional light, and ambient light.
- Save Scene is currently a modal action that proves persistence status, but not
  a full dirty-state/save/reload workflow.
- Environment skybox is exposed in Camera inspector as read-only data; terrain
  heightmap and visible skybox rendering are not editor-complete.

## 2. Integration Points

**How will this feature be reached?**

- [x] Entry point identified: editor app modals/actions, `/api/project`,
  `/api/operation`, `/project-assets`, `/preview`.
- [x] Caller file identified: `EditorApp.tsx` invokes add, save, new scene,
  build, and viewport loading; server APIs read/write source documents.
- [x] Registration/wiring needed: asset import/load flows must write structured
  source and refresh `/api/project`; environment/terrain rows must map to editor
  models and preview visuals.

**Is this user-facing?**

- [x] YES -> Add Object, Custom GLB, New Scene, Save Scene, Assets panel,
  environment/terrain inspector rows, footer LOD stats, build preview.
- [ ] NO.

**Full user flow:**

1. User opens the editor on a structured source project.
2. Editor loads all source documents, assets, scene objects, environment, and
   LOD stats.
3. User creates a new scene or loads an existing one.
4. User adds primitives or imports/selects a GLB model.
5. User configures environment/terrain data where source operations exist; other
   fields are visible read-only.
6. User saves, builds preview, and verifies emitted IR/bundle evidence.

## 3. Solution

**Approach:**

- Treat structured source documents as the only editor write target.
- Expand project API extraction to first-class scene, asset, environment,
  terrain, LOD, and build/preview metadata.
- Promote asset/model loading from verifier-only fixture behavior into a real
  Add Object/asset picker flow backed by source operations.
- Render environment and terrain fields in the inspector with explicit
  editability decisions; do not hide unsupported fields.
- Keep LOD/triangle counts derived from assets/manifests where possible and
  clearly marked as estimates when source lacks exact geometry statistics.

```mermaid
flowchart LR
    Assets[Project assets] --> Source[Asset/scene/environment docs]
    Source --> ProjectAPI[/api/project]
    ProjectAPI --> Panels[Hierarchy/Inspector/Assets/Footer]
    ProjectAPI --> Viewport[EditorViewport3d]
    Panels --> Ops[/api/operation]
    Ops --> Source
    Source --> Build[Build preview]
    Build --> Bundle[IR bundle evidence]
```

**Key Decisions:**

- [x] Library/framework choices: use existing editor server/project APIs and
  Three.js GLTF/Draco loading in the viewport.
- [x] Error-handling strategy: unavailable asset paths and unsupported
  environment/terrain edits produce diagnostics/read-only reasons.
- [x] Reused utilities: authoring document classifier, operation registry,
  `projectApi`, `previewRoutes`, `editorPackage` gate.

**Data Changes:** Structured source additions only. No generated code is written
back as source.

## 4. Execution Phases

#### Phase 1: Scene Lifecycle Completeness - New, load, save, and reload are source-backed.

**Files (max 5):**

- `packages/editor/src/server/projectApi.ts` - active scene/load metadata.
- `packages/editor/src/server/operationApi.ts` - new/load/save lifecycle
  operations or status handling.
- `packages/editor/src/EditorApp.tsx` - lifecycle modal state and dirty/clean
  status.
- `packages/editor/src/workbench/sceneModel.ts` - scene lifecycle model helpers.
- `packages/editor/src/workbench/sceneModel.test.ts` - model tests.

**Implementation:**

- [x] Represent active scene and available scene documents in the editor model.
- [ ] Distinguish saved, dirty, build-ready, and diagnostic states.
- [ ] Ensure New Scene seeds Main Camera, Directional Light, and Ambient Light
  with source-backed IDs.
- [ ] Ensure Save persists structured source and reloads from disk.
- [ ] Ensure Load Scene switches active scene without generating source code.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/workbench/sceneModel.test.ts` | `should list source scenes and selected active scene` | active scene metadata is deterministic |
| `packages/editor/src/server/projectApi.test.ts` | `should load default scene after create and save` | camera/light defaults survive reload |

**Progress Evidence:**

- `pnpm --filter @threenative/editor test` - 57 tests passing, including
  deterministic source scene listing and active scene selection in
  `buildSceneLifecycleModel`.
- `pnpm --filter @threenative/editor test` - 58 tests passing after
  `/api/project` started returning `sceneLifecycle` metadata with saved,
  empty, and diagnostic lifecycle states, and after the editor status bar began
  surfacing active scene/state values.

**User Verification:**

- Action: create a scene, save, reload editor.
- Expected: default entities remain and diagnostics stay clean.

#### Phase 2: Asset and GLB Authoring Flow - Users can add real models, not only verifier fixtures.

**Files (max 5):**

- `packages/editor/src/EditorApp.tsx` - Add Object modal choices for primitive
  and custom GLB.
- `packages/editor/src/server/operationApi.ts` - asset/prefab/entity operations
  for selected GLB.
- `packages/editor/src/server/projectApi.ts` - asset rows and scene object asset
  paths.
- `packages/editor/src/preview/EditorViewport3d.tsx` - model load state,
  fallback, diagnostics hooks.
- `packages/editor/src/workbench/catalogModel.ts` - asset catalog helpers.

**Implementation:**

- [ ] Replace disabled Custom GLB/Add Object entries with source-backed flows
  where operations exist.
- [ ] Add asset picker rows that use project assets and manifests.
- [ ] Create prefab/entity source data for selected model assets.
- [ ] Show model load status and errors in diagnostics.
- [ ] Keep project asset path containment through `/project-assets`.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/workbench/catalogModel.test.ts` | `should expose GLB assets as add-object candidates` | model assets include path/kind metadata |
| `packages/editor/src/server/projectApi.test.ts` | `should load GLB prefab as scene object` | scene object has assetPath and MeshRenderer fields |

**User Verification:**

- Action: add a custom GLB from the project assets panel.
- Expected: model appears in hierarchy, viewport, source scene, and emitted IR.

#### Phase 3: Environment, Skybox, Terrain, and LOD - Scene context is visible and source-derived.

**Files (max 5):**

- `packages/editor/src/server/projectApi.ts` - environment/terrain/LOD model
  extraction.
- `packages/editor/src/adapters/editorModel.ts` - explicit environment and
  terrain inspector field inventory.
- `packages/editor/src/preview/EditorViewport3d.tsx` - visible sky/terrain cues
  when source data exists.
- `packages/editor/src/workbench/catalogModel.ts` - triangle/LOD source helpers.
- `packages/editor/src/server/projectApi.test.ts` - environment/terrain tests.

**Implementation:**

- [ ] Surface skybox, environment map, terrain, height mode, heightmap/source
  asset, walkability/path, and LOD rows with explicit control/read-only status.
- [ ] Render visible skybox/background cue in the editor viewport when an
  environment skybox exists.
- [ ] Render terrain from source data where supported; show flat fallback when
  heightmap editing/rendering is not promoted.
- [ ] Distinguish exact loaded triangles from estimates in footer data.
- [ ] Keep terrain heightmap unsupported/editability gaps visible as read-only
  with reasons.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/editor/src/server/projectApi.test.ts` | `should expose environment skybox and terrain rows` | rows have source path and field kind |
| `packages/editor/src/adapters/editorModel.test.ts` | `should inventory terrain heightmap and skybox fields` | every field has edit/read-only decision |

**User Verification:**

- Action: open an environment scene with skybox and terrain.
- Expected: Camera inspector and environment document rows show skybox/terrain,
  viewport reflects scene context, footer reports LOD/triangles.

#### Phase 4: Build Preview and Artifact Proof - Scene/source edits prove generated IR consistency.

**Files (max 5):**

- `tools/verify/src/editorPackage.ts` - scene/asset/environment e2e evidence.
- `packages/editor/src/server/buildApi.ts` - build status and diagnostics if
  needed.
- `packages/editor/src/server/projectApi.ts` - artifact metadata if needed.
- `docs/STATUS.md` - status update after implementation.
- `docs/bevy-feature-parity.md` - evidence anchor update after implementation.

**Implementation:**

- [ ] Assert created/default scene source.
- [ ] Assert added primitive and added GLB source.
- [ ] Assert environment skybox/terrain rows.
- [ ] Assert built `world.ir.json`, `environment.scene.json`, and
  `assets.manifest.json` match editor source expectations.
- [ ] Capture evidence artifacts under `tools/verify/artifacts/editor-package`.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tools/verify/src/editorPackage.ts` | `editor-e2e scene asset environment proof` | source and emitted bundle artifacts match |

**User Verification:**

- Action: run `pnpm verify:focused verify:editor-package`.
- Expected: report includes source scene, world IR, environment, asset manifest,
  screenshots, and no unexpected console errors.

## 5. Verification Strategy

### New E2E Tests Required

Add these flows to `tools/verify/src/editorPackage.ts` or a package-local
Playwright suite invoked by the same focused gate.

| E2E Test | User Flow | Required Evidence |
|----------|-----------|-------------------|
| `editor scene lifecycle should create save reload and load scenes` | Create New Scene, Save, reload editor, switch back to original scene | Default scene has Main Camera, Directional Light, Ambient Light; saved source file remains valid; active scene state is correct |
| `editor add object should create primitive camera light terrain and empty entities` | Use Add Object modal for each promoted object type | Hierarchy row appears, inspector panel matches component set, source `.scene.json` persists, emitted `world.ir.json` contains expected entity/components |
| `editor add custom glb should place project model into source scene` | Choose a project GLB from Add Object/asset picker | Asset path is source-persisted, model loads through `/project-assets`, screenshot shows model, `assets.manifest.json` includes the GLB |
| `editor asset panel should prove glb pipeline health` | Open fixture with house/tree GLBs | Both assets return non-empty HTTP responses, `__tnEditorLoadedModels` includes both paths, console has no unexpected loader errors |
| `editor environment should expose skybox terrain and heightmap fields` | Select Main Camera and environment document rows | Camera inspector shows Skybox/Skybox Mode; environment document shows terrain/height mode/heightmap rows with editability/read-only reasons |
| `editor terrain viewport should reflect source terrain context` | Open source terrain fixture | Viewport renders terrain cue, footer LOD/triangle values are source-derived or marked as estimates |
| `editor build should emit source-consistent scene environment and asset artifacts` | Build Preview after object/environment edits | Saved `world.ir.json`, `environment.scene.json`, and `assets.manifest.json` match edited source IDs and asset refs |

### Unit and Integration Tests Required

- `packages/editor/src/server/projectApi.test.ts`: scene lifecycle metadata,
  environment terrain rows, skybox rows, GLB prefab asset rows, and LOD source
  labels.
- `packages/editor/src/workbench/catalogModel.test.ts`: model assets are
  add-object candidates with path/kind/format metadata and containment-safe
  project URLs.
- `packages/editor/src/workbench/sceneModel.test.ts`: active scene selection,
  dirty/clean status, and save/reload transitions.
- `packages/authoring/src/__tests__/structured-documents.test.ts`: environment
  source documents with terrain/skybox remain classified and validated.

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

- [ ] New/load/save scene workflows are source-backed and survive reload.
- [ ] New scenes include Main Camera, Directional Light, and Ambient Light.
- [ ] Add Object supports at least primitives and project GLB models through
  structured source operations.
- [ ] Assets panel exposes usable project asset metadata and load diagnostics.
- [ ] Environment skybox, terrain, heightmap/height mode, and LOD/triangle data
  are visible with correct editability/read-only decisions.
- [ ] Build preview proves source edits reached emitted IR/bundle artifacts.
- [ ] `verify:editor-package` covers source JSON, IR, asset manifest,
  environment, GLB loading, and screenshot evidence.

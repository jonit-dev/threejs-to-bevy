# Editor Inspector Component Field Mapping

Complexity: 7 -> HIGH mode

## Summary

Audit and complete the ThreeNative editor inspector's component/input field mapping so selected source-backed scene objects expose every supported structured source field with the correct editor control, compatible add-component defaults, and Playwright e2e proof. The inspector must remain grounded in ThreeNative structured source documents and authoring operations; Vibe Coder modal behavior is useful UI prior art but not an authoritative ECS source.

## Files Analyzed

- `packages/editor/src/adapters/editorModel.ts`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/components/panels/InspectorPanel.tsx`
- `packages/editor/src/devFixture.tsx`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/workbench/operations.ts`
- `packages/authoring/src/schemas.ts`
- `packages/authoring/src/operations.ts`
- `tools/verify/src/editorPackage.ts`
- `docs/STATUS.md`
- `docs/bevy-feature-parity.md`

## Current Behavior

The editor currently derives scene objects in `projectApi.ts` from scene documents, prefab references, transform data, and a small set of inferred components. `devFixture.tsx` then maps selected scene objects into flat `IEditorPropertyRow` rows with string values. `InspectorPanel.tsx` renders attached-component sections, with special handling for Transform, primitive select, and color input. Most fields are read-only controls, and row typing is mostly inferred from labels rather than source schema metadata.

The current inspector likely does not cover all component schema fields. Known examples include `camera.target`, `Light.intensity`, material `roughness`, input action `bindings`, system script references, scene resources, prefab asset references, and nested object-like component payloads. There is no central inventory that maps authoring schema fields to inspector panel sections, field controls, default values, add-component modal entries, and mutation operation payloads.

The modal shell now covers Add Object, Add Component, Save Scene, New Scene, Build Preview, Settings/Delete placeholders, and the AI chat entry point. Vibe Coder modal findings show `AddComponentMenu` has component definitions, defaults, incompatibilities, and packs. Add Object and AssetLoader modals are separate. ScenePersistence modal and a shared modal shell exist there. ThreeNative should account for those findings when designing modal compatibility/default behavior without importing Vibe Coder runtime state as source.

## Goals

- Build a source-schema-backed field inventory for editor-visible component and input fields.
- Render all mapped fields with proper controls: number, vector3, color, enum/select, asset picker, script reference, boolean, nested object, read-only generated data.
- Align component panels, add-component modal compatibility, defaults, and operation payloads from the same definitions.
- Cover component-like source families beyond object Transform/MeshRenderer/Camera/Light where they appear in the editor: inputs, systems/scripts, UI/resource references, prefab/material/asset fields, and generated/read-only provenance data.
- Add e2e verification that proves mapped fields render and add-component defaults persist through structured authoring operations.
- Update `docs/STATUS.md` and `docs/bevy-feature-parity.md` only when the implementation lands and the release-gate status changes.

## Non-Goals

- Do not replace structured authoring source with Vibe Coder ECS/runtime state.
- Do not implement a general arbitrary JSON editor as the main inspector UX.
- Do not merge Add Object and AssetLoader modal flows into Add Component.
- Do not claim Bevy runtime feature parity changes from editor-only inspector work.

## Integration Points Checklist

- [ ] `packages/authoring/src/schemas.ts`: source fields, supported enums, IDs, script references, document and component key sets.
- [ ] `packages/authoring/src/operations.ts`: accepted mutation operation shapes and validation behavior.
- [ ] `packages/editor/src/server/projectApi.ts`: source-to-editor extraction, scene object component discovery, asset/input/system/material catalog data.
- [ ] `packages/editor/src/adapters/editorModel.ts`: typed inspector row/model contract for field kind, options, source path, JSON pointer, default, and read-only/generated status.
- [ ] `packages/editor/src/components/panels/InspectorPanel.tsx`: component sections and control rendering.
- [ ] `packages/editor/src/server/operationApi.ts`: editor operation dispatch for set component, transform, prefab component, input action, system script, material, and future compatible mutations.
- [ ] `packages/editor/src/workbench/operations.ts`: typed operation names exposed to workbench callers.
- [ ] `packages/editor/src/devFixture.tsx`: source-backed dev fixture model and interaction wiring.
- [ ] `tools/verify/src/editorPackage.ts`: Playwright coverage for field rendering, add-component defaults, modal compatibility, and persistence evidence.
- [ ] `docs/STATUS.md`: implementation status update after completion.
- [ ] `docs/bevy-feature-parity.md`: evidence-anchor update after completion if gate evidence changes.

## Solution

Introduce a single editor field mapping layer that converts authoring schema knowledge into typed inspector fields. The mapping should describe each supported field with:

- component/document scope and source path kind;
- display section and label;
- field kind;
- optional enum/options;
- default value for add-component or add-field flows;
- compatibility rules and mutually exclusive components;
- mutation operation and payload builder;
- read-only/generated status.

The initial mapped surface should cover:

- Transform: `position`, `rotation`, `scale` as vector3 numeric controls.
- Mesh/prefab rendering: primitive enum, color, asset picker, material reference where source supports it.
- Camera: `mode` enum and `target` entity reference.
- Light: `kind` enum-like control where supported by current source data, `intensity` number, generated/read-only fields when not in the stable schema.
- Material: `color` color control, `roughness` number.
- Input: action `id` read-only or text where creation allows it, `bindings` as editable string list/token control.
- Systems/scripts: schedule enum/text, script reference as module/export paired controls.
- UI/resource references: resource paths and binding references as text/reference pickers where present.
- Asset/audio/mesh catalogs: asset picker/read-only route fields, primitive mesh enum, generated load status as read-only data.
- Unknown but valid custom component payloads: nested object read-only summary first, then explicit editable support only after schema/operation coverage exists.

Add Component should use the same mapping definitions for available components, defaults, incompatibilities, and packs. Vibe Coder's AddComponentMenu findings should inform the UX: definitions/defaults/incompatibilities/packs belong together. Add Object and AssetLoader remain separate modal flows. ScenePersistence and shared modal shell behavior should remain separate reusable shell infrastructure.

## Architecture / Sequence Flow

```txt
structured source document
  -> @threenative/authoring schema + validation
  -> editor project API extracts source-backed scene/catalog model
  -> editor field mapping resolves supported fields, controls, defaults
  -> inspector panel renders component sections and typed controls
  -> user edits field or adds component
  -> workbench operation builds authoring operation payload
  -> editor operation API dispatches @threenative/authoring operation
  -> project reload validates source and refreshes inspector rows
  -> editor-package gate proves UI, source JSON, and emitted IR evidence
```

## Phased Implementation

### Phase 1: Audit and Field Inventory

Max 5 files:

- `packages/authoring/src/schemas.ts`
- `packages/authoring/src/operations.ts`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/adapters/editorModel.ts`
- `packages/editor/src/components/panels/InspectorPanel.tsx`

Deliverables:

- Produce an explicit inventory of schema fields currently rendered, partially rendered, missing, or intentionally read-only.
- Define the editor inspector field kinds and compatibility/default metadata needed by later phases.
- Identify unsupported schema fields that should produce stable read-only rows or diagnostics instead of silent omission.

### Phase 2: Source Model and Typed Inspector Rows

Max 5 files:

- `packages/editor/src/adapters/editorModel.ts`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/devFixture.tsx`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/workbench/operations.ts`

Deliverables:

- Extend inspector rows or add a typed inspector model without breaking existing shell assumptions.
- Populate JSON pointer/source document metadata for every editable field.
- Preserve read-only generated data for fields not safe to mutate.
- Ensure operation payloads can be derived from typed field metadata rather than label string matching.

### Phase 3: Inspector Controls and Add Component Compatibility

Max 5 files:

- `packages/editor/src/components/panels/InspectorPanel.tsx`
- `packages/editor/src/devFixture.tsx`
- `packages/editor/src/adapters/editorModel.ts`
- `packages/editor/src/server/projectApi.ts`
- `packages/editor/src/server/operationApi.ts`

Deliverables:

- Render number, vector3, color, enum/select, asset picker, script ref, boolean, nested object, and read-only generated controls.
- Wire Add Component to mapping definitions/defaults/incompatibilities/packs.
- Keep Add Object and AssetLoader separate from Add Component.
- Keep ScenePersistence behavior inside the existing modal shell and outside component mutation logic.

### Phase 4: E2E Evidence and Documentation

Max 5 files:

- `tools/verify/src/editorPackage.ts`
- `packages/editor/src/devFixture.tsx`
- `packages/editor/src/components/panels/InspectorPanel.tsx`
- `docs/STATUS.md`
- `docs/bevy-feature-parity.md`

Deliverables:

- Extend Playwright verification for representative typed controls and add-component defaults.
- Assert source JSON persistence and emitted IR evidence where applicable.
- Update status and parity evidence anchors once implementation is complete.

## Tests

- Unit tests for field mapping coverage: every promoted schema field has an explicit control/default/read-only decision.
- Adapter tests for source-to-inspector rows with source path and JSON pointer metadata.
- Inspector component tests for each control kind, including disabled/read-only generated data.
- Operation tests for editable fields that dispatch source mutations and reject incompatible/default-invalid values.
- Add-component modal tests for available definitions, defaults, incompatibilities, and packs.
- Playwright e2e in `verify:editor-package` for selecting an object, checking Transform/MeshRenderer/Camera/Light fields, adding a compatible component, verifying defaults, saving/reloading, building, and checking source/IR evidence.

## Checkpoint Protocol

- Start each phase by checking `git status --short` and reviewing existing user changes in touched files.
- Keep each phase to the listed file cap; split work instead of broadening a phase.
- Run the narrowest relevant tests after each phase before moving on.
- Treat any missing schema/operation contract as a blocker for editability; render read-only with an explicit unsupported reason until the source contract exists.
- After Phase 4, update `docs/STATUS.md` and `docs/bevy-feature-parity.md` in the same implementation change if the gate/evidence claim changed.
- Move this PRD to `docs/PRDs/done/` only when implementation and verification are complete.

## Verification Strategy

Use source-backed fixtures rather than mocked Vibe Coder runtime state. Verification should prove three layers: inspector UI render, structured source mutation, and build/runtime artifact consistency where the field affects emitted IR.

The editor e2e gate should capture:

- all expected component panels for selected source entities;
- representative control kinds visible and populated from source;
- Add Component modal definitions/defaults/incompatibilities/packs;
- unsupported or generated fields rendered as read-only;
- source JSON after edits;
- `world.ir.json` or relevant emitted artifact after build;
- no unexpected browser console errors.

Exact verification commands:

```bash
pnpm --filter @threenative/editor typecheck
pnpm --filter @threenative/editor test
pnpm verify:focused verify:editor-package
pnpm check:docs
pnpm check:names
```

## Acceptance Criteria

- The inspector has an explicit mapping decision for every promoted editor-visible field from the source schemas.
- Component panels are generated from source-backed attached components and include all mapped fields for Transform, MeshRenderer/prefab rendering, Camera, Light, material, input, systems/scripts, UI/resource references, and catalog fields where applicable.
- Field controls match data semantics: number, vector3, color, enum/select, asset picker, script ref, boolean, nested object, or read-only generated data.
- Add Component uses shared definitions/defaults/incompatibilities/packs and does not duplicate incompatible default logic in the modal.
- Add Object and AssetLoader remain separate modal flows; ScenePersistence remains a modal-shell consumer, not component-field logic.
- Editable fields persist through `@threenative/authoring` operations and reload back into the inspector.
- Unsupported fields are not silently ignored; they render read-only or produce stable diagnostics.
- `verify:editor-package` proves representative inspector controls, add-component defaults, source JSON persistence, and emitted artifact evidence.
- `docs/STATUS.md` and `docs/bevy-feature-parity.md` are updated when implementation is completed and evidence changes.

import assert from "node:assert/strict";
import test from "node:test";

import type { IAuthoringProject } from "@threenative/authoring";
import type { IEditorVisualPanelSnapshot } from "@threenative/ir";

import {
  assertNoForbiddenEditorImports,
  editorModelFromAuthoringProject,
  editorModelFromInspection,
  EDITOR_ADD_COMPONENT_DEFINITIONS,
  EDITOR_INSPECTOR_FIELD_INVENTORY,
  EDITOR_MODAL_ACTION_DEFINITIONS,
  EDITOR_OPERATION_COVERAGE_MATRIX,
} from "./editorModel.js";

test("should map authoring documents to project inventory", () => {
  const model = editorModelFromAuthoringProject({
    diagnostics: [],
    documents: [
      {
        data: { schema: "threenative.scene" },
        file: "/project/content/scenes/arena.scene.json",
        kind: "scene",
        projectRelativePath: "content/scenes/arena.scene.json",
      },
      {
        data: { schema: "threenative.materials" },
        file: "/project/content/materials/base.materials.json",
        kind: "material",
        projectRelativePath: "content/materials/base.materials.json",
      },
    ],
    projectPath: "/project",
  } satisfies IAuthoringProject);

  assert.deepEqual(
    model.hierarchy.map((row) => [row.id, row.access, row.badge]),
    [
      ["source:content/scenes/arena.scene.json", "sourcePersistable", "scene"],
      ["source:content/materials/base.materials.json", "sourcePersistable", "material"],
    ],
  );
  assert.equal(model.inspector.every((row) => row.readOnly === false), true);
});

test("should map IR visual panels without numeric ECS assumptions", () => {
  const model = editorModelFromInspection({
    documentKinds: {
      "world.ir.json": { access: "inspectableOnly", kind: "generated" },
    },
    visualPanels: visualSnapshotFixture(),
  });

  assert.deepEqual(model.hierarchy.map((row) => row.id), ["entity:player"]);
  assert.equal(model.hierarchy[0]?.access, "inspectableOnly");
  assert.equal(model.inspector[0]?.path, "world.ir.json/entities/0/components/Transform");
});

test("should classify generated and runtime rows as non-persistable", () => {
  const model = editorModelFromInspection({
    documentKinds: {
      "runtime/session.json": { access: "runtimeOnly", kind: "runtime" },
      "world.ir.json": { access: "inspectableOnly", kind: "generated" },
    },
    visualPanels: {
      ...visualSnapshotFixture(),
      panels: [
        {
          id: "properties",
          kind: "properties",
          rows: [
            { id: "runtime", label: "Runtime handle", path: "runtime/session.json/handle" },
            { id: "generated", label: "Generated", path: "world.ir.json/entities/0" },
          ],
          title: "Properties",
        },
      ],
    },
  });

  assert.equal(model.inspector.every((row) => row.readOnly), true);
  assert.deepEqual(
    assertNoForbiddenEditorImports({
      "ok.ts": "import { EditorApp } from './EditorApp.js';",
      "bad.ts": "import { EntityManager } from '@/core/EntityManager';",
    }),
    ["bad.ts: forbidden editor import '@/core'", "bad.ts: forbidden editor import 'EntityManager'"],
  );
});

test("should keep an explicit inspector field inventory for promoted source families", () => {
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => "component" in item && item.component === "Transform" && item.field === "position" && item.fieldKind === "vector3" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => "component" in item && item.component === "Camera" && item.field === "target" && item.operationName === "scene.set_camera"), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => "component" in item && item.component === "Camera" && item.field === "skybox" && item.sourceFamily === "environment" && item.operationName === "environment.set_skybox" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => "component" in item && item.component === "Light" && item.field === "intensity" && item.operationName === "scene.set_light" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => "component" in item && item.component === "Light" && item.field === "shadowBias" && item.operationName === "scene.set_light" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.field === "components.custom" && item.operationName === "scene.set_component" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.field === "assets.renderTarget.width" && item.operationName === "asset.add" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.field === "meshes.primitive" && item.operationName === "mesh.create_primitive" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "input" && item.field === "actions.bindings" && item.fieldKind === "stringList"), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "system" && item.field === "systems.script" && item.fieldKind === "script"), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "system" && item.field === "systems.reads" && item.operationName === "system.set_metadata" && item.readOnly === false), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "system" && item.field === "systems.queries" && item.fieldKind === "json" && item.operationName === "system.set_metadata"), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "ui" && item.field === "ui.nodes.type" && item.operationName === "ui.add_node"), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "ui" && item.field === "ui.nodes.style.color" && item.operationName === "ui.set_style"), true);
  assert.equal(EDITOR_ADD_COMPONENT_DEFINITIONS.some((definition) => definition.component === "MeshRenderer" && definition.incompatibleWith.includes("Camera")), true);
});

test("should classify unsupported fields as read-only with reasons", () => {
  const readOnlyRows = EDITOR_OPERATION_COVERAGE_MATRIX.filter((row) => row.readOnly);
  const editableRows = EDITOR_OPERATION_COVERAGE_MATRIX.filter((row) => !row.readOnly);

  assert.equal(readOnlyRows.every((row) => typeof row.readOnlyReason === "string" && row.readOnlyReason.length > 0), true);
  assert.equal(editableRows.every((row) => row.operationName !== undefined || row.handler !== undefined), true);
  assert.equal(EDITOR_MODAL_ACTION_DEFINITIONS.some((action) => action.id === "delete.selection" && action.readOnlyReason !== undefined), true);
  assert.equal(EDITOR_MODAL_ACTION_DEFINITIONS.some((action) => action.id === "add.custom_glb" && action.readOnlyReason !== undefined), true);
});

test("should inventory terrain heightmap and skybox fields", () => {
  const environmentRows = EDITOR_INSPECTOR_FIELD_INVENTORY.filter((item) => item.sourceFamily === "environment");
  const fields = new Set(environmentRows.map((item) => item.field));

  assert.equal(fields.has("environment.terrain.heightmap"), true);
  assert.equal(fields.has("environment.terrain.heightMode"), true);
  assert.equal(fields.has("environment.walkability"), true);
  assert.equal(fields.has("environment.path"), true);
  assert.equal(fields.has("environment.lightProbes"), true);
  assert.equal(environmentRows.every((item) => item.readOnly === false && item.operationName !== undefined), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => "component" in item && item.component === "Camera" && item.field === "skybox"), true);
  assert.equal(EDITOR_INSPECTOR_FIELD_INVENTORY.some((item) => item.sourceFamily === "scene" && item.field === "scene.kind" && item.operationName === "scene.set_lifecycle" && item.readOnly === false), true);
});

function visualSnapshotFixture(): IEditorVisualPanelSnapshot {
  return {
    panels: [
      {
        id: "scene-hierarchy",
        kind: "hierarchy",
        rows: [{ id: "entity:player", label: "player", path: "world.ir.json" }],
        title: "Scene Hierarchy",
      },
      {
        id: "properties",
        kind: "properties",
        rows: [{ id: "transform", label: "Transform", path: "world.ir.json/entities/0/components/Transform", value: "object" }],
        title: "Properties",
      },
    ],
    schema: "threenative.editor-visual-panels",
    summary: {
      assets: 0,
      diagnostics: 0,
      editableProperties: 1,
      rootNodes: 1,
    },
    version: "0.1.0",
  };
}

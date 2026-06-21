import assert from "node:assert/strict";
import test from "node:test";

import type { IAuthoringProject } from "@threenative/authoring";
import type { IEditorVisualPanelSnapshot } from "@threenative/ir";

import {
  assertNoForbiddenEditorImports,
  editorModelFromAuthoringProject,
  editorModelFromInspection,
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

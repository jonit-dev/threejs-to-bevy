import assert from "node:assert/strict";
import test from "node:test";

import { EDITOR_MODAL_ACTION_DEFINITIONS, type IEditorModalActionDefinition } from "../adapters/editorModel.js";
import { createEditorSessionModel, useEditorStore } from "./editorStore.js";

test("should manage modal and selection state through editor store", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().openModal("addObject");
  useEditorStore.getState().selectRow("entity:content/scenes/arena.scene.json:player");
  useEditorStore.getState().setStatus("Selecting player");

  assert.equal(useEditorStore.getState().modal, "addObject");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:content/scenes/arena.scene.json:player");
  assert.equal(useEditorStore.getState().status, "Selecting player");

  useEditorStore.getState().closeModal();
  assert.equal(useEditorStore.getState().modal, undefined);
});

test("should reset editor store session state", () => {
  useEditorStore.getState().reset({
    modal: "build",
    selectedRowId: "entity:player",
    status: "Building",
  });

  assert.equal(useEditorStore.getState().modal, "build");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:player");
  assert.equal(useEditorStore.getState().status, "Building");

  useEditorStore.getState().reset();
  assert.equal(useEditorStore.getState().modal, undefined);
  assert.equal(useEditorStore.getState().selectedRowId, undefined);
  assert.equal(useEditorStore.getState().status, "Ready");
});

test("should reject recursive hierarchy nesting", () => {
  useEditorStore.getState().reset();

  assert.equal(useEditorStore.getState().setParent("child", "parent"), true);
  assert.equal(useEditorStore.getState().setParent("parent", "child"), false);
  assert.equal(useEditorStore.getState().parentByRowId.parent, undefined);
  assert.equal(useEditorStore.getState().parentByRowId.child, "parent");
});

test("should apply and clear viewport transform overrides", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().setTransformOverride("entity:player", {
    position: [1, 2, 3],
    rotation: [0, 0.5, 0],
    scale: [1, 1, 1],
  });

  assert.deepEqual(useEditorStore.getState().transformByRowId["entity:player"]?.position, [1, 2, 3]);
  useEditorStore.getState().clearTransformOverride("entity:player");
  assert.equal(useEditorStore.getState().transformByRowId["entity:player"], undefined);
});

test("should switch viewport gizmo mode through editor store", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().setGizmoMode("rotate");
  assert.equal(useEditorStore.getState().gizmoMode, "rotate");

  useEditorStore.getState().setGizmoMode("scale");
  assert.equal(useEditorStore.getState().gizmoMode, "scale");
});

test("should store project payload and selected row together", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().setProject({
    ok: true,
    projectPath: "/tmp/project",
    sceneObjects: [{ id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:player" }],
  });
  useEditorStore.getState().selectRow("entity:player");

  assert.equal(useEditorStore.getState().project?.projectPath, "/tmp/project");
  assert.equal(useEditorStore.getState().project?.sceneObjects?.[0]?.id, "player");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:player");
});

test("should switch active scene without posting source operations", () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject({
    ok: true,
    projectPath: "/tmp/project",
    sceneLifecycle: {
      activeScene: { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
      scenes: [
        { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
        { documentPath: "content/scenes/menu.scene.json", id: "menu", label: "menu", sourcePersistable: true },
      ],
      state: "build-ready",
    },
    sceneObjects: [
      { documentPath: "content/scenes/arena.scene.json", id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:content/scenes/arena.scene.json:player" },
      { documentPath: "content/scenes/menu.scene.json", id: "start", kind: "entity", label: "start", primitive: "box", rowId: "entity:content/scenes/menu.scene.json:start" },
    ],
  });

  useEditorStore.getState().loadScene("content/scenes/menu.scene.json");

  assert.equal(useEditorStore.getState().activeScenePath, "content/scenes/menu.scene.json");
  assert.equal(useEditorStore.getState().project?.sceneLifecycle?.activeScene?.id, "menu");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:content/scenes/menu.scene.json:start");
  assert.equal(useEditorStore.getState().status, "Loaded source scene menu");
});

test("should mark local transform overrides as dirty until cleared", () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject({
    ok: true,
    projectPath: "/tmp/project",
    sceneLifecycle: {
      activeScene: { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
      scenes: [{ documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true }],
      state: "build-ready",
    },
    sceneObjects: [{ documentPath: "content/scenes/arena.scene.json", id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:content/scenes/arena.scene.json:player" }],
  });

  useEditorStore.getState().setTransformOverride("entity:content/scenes/arena.scene.json:player", {
    position: [1, 2, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });

  assert.equal(useEditorStore.getState().project?.sceneLifecycle?.state, "dirty");
  useEditorStore.getState().clearTransformOverride("entity:content/scenes/arena.scene.json:player");
  assert.equal(useEditorStore.getState().project?.sceneLifecycle?.state, "build-ready");
});

test("should derive the dev editor model from store state", () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject({
    documents: [
      {
        documents: [{ id: "arena", kind: "scene", path: "content/scenes/arena.scene.json" }],
        kind: "scene",
      },
    ],
    ok: true,
    projectPath: "/tmp/structured-source-starter",
    sceneLifecycle: {
      activeScene: { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
      scenes: [{ documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true }],
      state: "build-ready",
    },
    sceneObjects: [
      {
        components: ["Transform", "MeshRenderer"],
        documentPath: "content/scenes/arena.scene.json",
        id: "player",
        kind: "entity",
        label: "player",
        position: [1, 2, 3],
        primitive: "box",
        rowId: "entity:content/scenes/arena.scene.json:player",
      },
    ],
  });
  useEditorStore.getState().selectRow("entity:content/scenes/arena.scene.json:player");

  const model = createEditorSessionModel(useEditorStore.getState());

  assert.equal(model.projectName, "structured-source-starter");
  assert.equal(model.selectedRowId, "entity:content/scenes/arena.scene.json:player");
  assert.equal(model.sceneObjects[0]?.id, "player");
  assert.equal(model.inspector.some((row) => row.label === "Position" && row.value === "[1, 2, 3]"), true);
  assert.equal(model.statusItems.some((item) => item.id === "sourceDocuments" && item.value === "1"), true);
});

test("should route source document selection through the store", () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject({
    ok: true,
    projectPath: "/tmp/project",
    sceneLifecycle: {
      activeScene: { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
      scenes: [
        { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
        { documentPath: "content/scenes/menu.scene.json", id: "menu", label: "menu", sourcePersistable: true },
      ],
      state: "build-ready",
    },
    sceneObjects: [
      { documentPath: "content/scenes/arena.scene.json", id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:content/scenes/arena.scene.json:player" },
      { documentPath: "content/scenes/menu.scene.json", id: "start", kind: "entity", label: "start", primitive: "box", rowId: "entity:content/scenes/menu.scene.json:start" },
    ],
  });

  useEditorStore.getState().selectEditorRow("source:content/scenes/menu.scene.json");

  assert.equal(useEditorStore.getState().activeScenePath, "content/scenes/menu.scene.json");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:content/scenes/menu.scene.json:start");
  assert.equal(useEditorStore.getState().status, "Loaded source scene menu");
});

test("should move hierarchy rows through the store", () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject({
    documents: [
      {
        documents: [{ id: "arena", kind: "scene", path: "content/scenes/arena.scene.json" }],
        kind: "scene",
      },
    ],
    ok: true,
    projectPath: "/tmp/project",
    sceneLifecycle: {
      activeScene: { documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true },
      scenes: [{ documentPath: "content/scenes/arena.scene.json", id: "arena", label: "arena", sourcePersistable: true }],
      state: "build-ready",
    },
    sceneObjects: [
      { documentPath: "content/scenes/arena.scene.json", id: "parent", kind: "entity", label: "Parent", primitive: "box", rowId: "entity:parent" },
      { documentPath: "content/scenes/arena.scene.json", id: "child", kind: "entity", label: "Child", primitive: "box", rowId: "entity:child" },
    ],
  });

  useEditorStore.getState().moveEditorRow("entity:child", "entity:parent");

  assert.equal(useEditorStore.getState().parentByRowId["entity:child"], "entity:parent");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:child");
  assert.equal(useEditorStore.getState().status, "Nested Child under Parent in editor view");

  useEditorStore.getState().moveEditorRow("entity:parent", "entity:child");
  assert.equal(useEditorStore.getState().parentByRowId["entity:parent"], undefined);
  assert.equal(useEditorStore.getState().status, "Cannot nest Parent under Child");
});

test("should refresh project and select the first source object", async () => {
  useEditorStore.getState().reset();
  const restore = mockFetch(async (input) => {
    assert.equal(String(input), "/api/project");
    return jsonResponse({
      ok: true,
      projectPath: "/project",
      sceneObjects: [{ id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:player" }],
    });
  });
  try {
    const project = await useEditorStore.getState().refreshProject({ selectFirstObject: true });

    assert.equal(project.projectPath, "/project");
    assert.equal(useEditorStore.getState().project?.projectPath, "/project");
    assert.equal(useEditorStore.getState().selectedRowId, "entity:player");
  } finally {
    restore();
  }
});

test("should add primitive through operation sequence", async () => {
  useEditorStore.getState().reset({ project: { projectRevision: "rev:1" } });
  const operations: Array<{ args: Record<string, unknown>; name: string; projectRevision?: string }> = [];
  const restoreDateNow = mockDateNow(123456789);
  const restoreFetch = mockFetch(async (input, init) => {
    if (String(input) === "/api/operation") {
      const body = JSON.parse(String(init?.body)) as { args: Record<string, unknown>; name: string; projectRevision?: string };
      operations.push(body);
      return jsonResponse({ filesWritten: ["content/scenes/arena.scene.json"], ok: true });
    }
    assert.equal(String(input), "/api/project");
    return jsonResponse({
      documents: [{ documents: [{ id: "arena", kind: "scene", path: "content/scenes/arena.scene.json" }], kind: "scene" }],
      ok: true,
      sceneObjects: [{ id: "editor-box-21i3v9", kind: "entity", label: "Editor Box", primitive: "sphere", rowId: "entity:content/scenes/arena.scene.json:editor-box-21i3v9" }],
    });
  });
  try {
    await useEditorStore.getState().addObject(modalAction("add.primitive_sphere"));

    assert.deepEqual(operations.map((operation) => operation.name), ["scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
    assert.equal(operations[0]?.args.prefabId, "prefab.editor-box-21i3v9");
    assert.equal(operations[1]?.args.entityId, "editor-box-21i3v9");
    assert.equal(useEditorStore.getState().selectedRowId, "entity:content/scenes/arena.scene.json:editor-box-21i3v9");
    assert.match(useEditorStore.getState().status, /Added editor-box-21i3v9/);
  } finally {
    restoreFetch();
    restoreDateNow();
  }
});

test("should submit add object choices with correct operation payloads", async () => {
  const cases: Array<{
    actionId: IEditorModalActionDefinition["id"];
    expectedEntityId: string;
    expectedNames: string[];
    expectedPayload?: { index: number; key: string; value: unknown };
  }> = [
    { actionId: "add.empty_entity", expectedEntityId: "editor-entity-21i3v9", expectedNames: ["scene.add_entity"] },
    { actionId: "add.camera", expectedEntityId: "editor-camera-21i3v9", expectedNames: ["scene.add_entity", "scene.set_component", "scene.set_transform"], expectedPayload: { index: 1, key: "componentKind", value: "camera" } },
    { actionId: "add.light", expectedEntityId: "editor-light-21i3v9", expectedNames: ["scene.add_entity", "scene.set_component", "scene.set_transform"], expectedPayload: { index: 1, key: "componentKind", value: "Light" } },
  ];

  for (const item of cases) {
    useEditorStore.getState().reset({ project: { projectRevision: "rev:1" } });
    const operations: Array<{ args: Record<string, unknown>; name: string; projectRevision?: string }> = [];
    const restoreDateNow = mockDateNow(123456789);
    const restoreFetch = mockFetch(async (input, init) => {
      if (String(input) === "/api/operation") {
        const body = JSON.parse(String(init?.body)) as { args: Record<string, unknown>; name: string; projectRevision?: string };
        operations.push(body);
        return jsonResponse({ filesWritten: ["content/scenes/arena.scene.json"], ok: true });
      }
      assert.equal(String(input), "/api/project");
      return jsonResponse({
        documents: [{ documents: [{ id: "arena", kind: "scene", path: "content/scenes/arena.scene.json" }], kind: "scene" }],
        ok: true,
        sceneObjects: [{ id: item.expectedEntityId, kind: "entity", label: item.expectedEntityId, rowId: `entity:content/scenes/arena.scene.json:${item.expectedEntityId}` }],
      });
    });
    try {
      await useEditorStore.getState().addObject(modalAction(item.actionId));

      assert.deepEqual(operations.map((operation) => operation.name), item.expectedNames);
      assert.equal(operations[0]?.args.entityId, item.expectedEntityId);
      assert.equal(operations[0]?.args.sceneId, "arena");
      assert.equal(operations[0]?.projectRevision, "rev:1");
      if (item.expectedPayload !== undefined) {
        assert.equal(operations[item.expectedPayload.index]?.args[item.expectedPayload.key], item.expectedPayload.value);
      }
      assert.equal(useEditorStore.getState().selectedRowId, `entity:content/scenes/arena.scene.json:${item.expectedEntityId}`);
    } finally {
      restoreFetch();
      restoreDateNow();
    }
  }
});

test("should add custom GLB assets through a source prefab and entity", async () => {
  useEditorStore.getState().reset({ project: { projectRevision: "rev:1", sceneLifecycle: { activeScene: { documentPath: "content/scenes/menu.scene.json", id: "menu", label: "menu", sourcePersistable: true }, scenes: [{ documentPath: "content/scenes/menu.scene.json", id: "menu", label: "menu", sourcePersistable: true }], state: "build-ready" } } });
  const operations: Array<{ args: Record<string, unknown>; name: string; projectRevision?: string }> = [];
  const restoreDateNow = mockDateNow(123456789);
  const restoreFetch = mockFetch(async (input, init) => {
    if (String(input) === "/api/operation") {
      const body = JSON.parse(String(init?.body)) as { args: Record<string, unknown>; name: string; projectRevision?: string };
      operations.push(body);
      return jsonResponse({ filesWritten: ["content/scenes/menu.scene.json"], ok: true });
    }
    assert.equal(String(input), "/api/project");
    return jsonResponse({
      documents: [{ documents: [{ id: "menu", kind: "scene", path: "content/scenes/menu.scene.json" }], kind: "scene" }],
      ok: true,
      sceneObjects: [{ assetPath: "assets/models/house.glb", id: "editor-model-21i3v9", kind: "entity", label: "editor-model-21i3v9", primitive: "box", rowId: "entity:content/scenes/menu.scene.json:editor-model-21i3v9" }],
    });
  });
  try {
    await useEditorStore.getState().addObject({ assetPath: "assets/models/house.glb", id: "add.custom_glb", label: "model.house", operationName: "scene.add_prefab", readOnly: false });

    assert.deepEqual(operations.map((operation) => operation.name), ["scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
    assert.equal(operations[0]?.args.asset, "assets/models/house.glb");
    assert.equal(operations[0]?.args.sceneId, "menu");
    assert.equal(operations[1]?.args.prefabId, "prefab.editor-model-21i3v9");
    assert.match(useEditorStore.getState().status, /model assets\/models\/house\.glb/);
  } finally {
    restoreFetch();
    restoreDateNow();
  }
});

test("should report unsupported add object actions as disabled status", async () => {
  useEditorStore.getState().reset();

  await useEditorStore.getState().addObject(modalAction("add.custom_glb"));

  assert.equal(useEditorStore.getState().status, "Custom GLB import needs a promoted asset and prefab operation before it can be enabled.");
});

test("should report operation failures as editor status", async () => {
  useEditorStore.getState().reset({ project: { projectRevision: "rev:1" } });
  const restore = mockFetch(async () => jsonResponse({ diagnostics: [{ message: "operation failed" }], ok: false }));
  try {
    await useEditorStore.getState().editProperty(
      {
        access: "sourcePersistable",
        id: "row",
        label: "Color",
        operation: { args: { materialId: "mat" }, name: "material.set", valueArg: "color" },
        readOnly: false,
      },
      "#ffffff",
    );

    assert.equal(useEditorStore.getState().status, "operation failed");
    assert.equal(useEditorStore.getState().project?.projectRevision, "rev:1");
  } finally {
    restore();
  }
});

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    json: async () => payload,
  } as Response;
}

function mockDateNow(value: number): () => void {
  const previous = Date.now;
  Date.now = () => value;
  return () => {
    Date.now = previous;
  };
}

function modalAction(id: IEditorModalActionDefinition["id"]): IEditorModalActionDefinition {
  const action = EDITOR_MODAL_ACTION_DEFINITIONS.find((item) => item.id === id);
  assert.ok(action, `Missing modal action fixture ${id}`);
  return action;
}

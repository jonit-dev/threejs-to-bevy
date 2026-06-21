import assert from "node:assert/strict";
import test from "node:test";

import { useEditorStore } from "./editorStore.js";

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
    await useEditorStore.getState().addPrimitive();

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

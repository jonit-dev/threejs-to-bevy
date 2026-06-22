import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AUTHORING_OPERATION_NAMES,
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  listAuthoringOperationDescriptors,
} from "./operationRegistry.js";

test("should dispatch promoted editor-safe operations", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: {
        entityId: "player",
        position: [1, 2, 3],
        sceneId: "scene.arena",
      },
      name: "scene.set_transform",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
    };

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.deepEqual(result.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.transform?.position, [1, 2, 3]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch existing structured source operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    const operations = [
      await dispatchAuthoringOperation({ args: { assetId: "model.player", path: "assets/player.glb", type: "model" }, name: "asset.add", projectPath: root }),
      await dispatchAuthoringOperation({ args: { audioDocId: "arena" }, name: "audio.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "sound.hit", audioDocId: "arena", soundId: "hit" }, name: "audio.add_sound", projectPath: root }),
      await dispatchAuthoringOperation({ args: { materialId: "mat.player" }, name: "material.create", projectPath: root }),
      await dispatchAuthoringOperation({
        args: {
          alphaMode: "mask",
          baseColorTexture: "tex.player.albedo",
          color: "#fff",
          emissive: "#33ccff",
          materialId: "mat.player",
          metalness: 0.2,
          normalTexture: "tex.player.normal",
          roughness: 0.4,
        },
        name: "material.set",
        projectPath: root,
      }),
      await dispatchAuthoringOperation({ args: { uiDocId: "hud" }, name: "ui.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { text: "Score", nodeId: "score", uiDocId: "hud" }, name: "ui.add_text", projectPath: root }),
      await dispatchAuthoringOperation({ args: { action: "pause", label: "Pause", nodeId: "pause", type: "button", uiDocId: "hud" }, name: "ui.add_node", projectPath: root }),
      await dispatchAuthoringOperation({ args: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, nodeId: "pause", uiDocId: "hud", wrap: true }, name: "ui.set_style", projectPath: root }),
      await dispatchAuthoringOperation({ args: { keys: ["Space"], actionId: "jump", inputDocId: "arena" }, name: "input.add_action", projectPath: root }),
      await dispatchAuthoringOperation({ args: { axisId: "MoveX", inputDocId: "arena", negativeKeys: ["A"], positiveKeys: ["D"], value: "gamepad.leftStickX" }, name: "input.add_axis", projectPath: root }),
      await dispatchAuthoringOperation({ args: { kind: "box", meshId: "mesh.player" }, name: "mesh.create_primitive", projectPath: root }),
      await dispatchAuthoringOperation({ args: { prefabId: "player" }, name: "prefab.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "RigidBody", prefabId: "player", value: { kind: "dynamic" } }, name: "prefab.add_component", projectPath: root }),
      await dispatchAuthoringOperation({ args: { buildTargets: ["web"], projectId: "kart", sourceRoots: ["content", "src"] }, name: "project.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { groupId: "group.lane.red", name: "Red Lane", position: [-2, 0, 0], sceneId: "scene.arena" }, name: "scene.add_group", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", tag: "LaneRed" }, name: "scene.add_tag", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "Light", entityId: "player", sceneId: "scene.arena", value: { color: "#ffffff", intensity: 1, kind: "point" } }, name: "scene.set_component", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", kind: "dynamic", mass: 3 }, name: "scene.set_rigid_body", projectPath: root }),
      await dispatchAuthoringOperation({ args: { activation: "exclusive", initial: true, kind: "level", sceneId: "scene.arena" }, name: "scene.set_lifecycle", projectPath: root }),
    ];
    const material = JSON.parse(await readFile(join(root, "content", "materials", "mat.player.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };
    const asset = JSON.parse(await readFile(join(root, "content", "assets", "model.player.assets.json"), "utf8")) as {
      assets: Array<{ id: string; path: string; type: string }>;
    };
    const audio = JSON.parse(await readFile(join(root, "content", "audio", "arena.audio.json"), "utf8")) as {
      sounds: Array<{ asset: string; id: string }>;
    };
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as {
      nodes: Array<{ action?: string; id: string; label?: string; style?: Record<string, unknown>; text?: string; type: string }>;
    };
    const input = JSON.parse(await readFile(join(root, "content", "input", "arena.input.json"), "utf8")) as {
      actions: Array<{ bindings: string[]; id: string }>;
      axes: Array<{ id: string; negative: string[]; positive: string[]; value?: string }>;
    };
    const prefab = JSON.parse(await readFile(join(root, "content", "prefabs", "player.prefab.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      activation?: string;
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
      initial?: boolean;
      kind?: string;
    };

    assert.deepEqual(operations.map((operation) => operation.ok), Array.from({ length: operations.length }, () => true));
    assert.deepEqual(asset.assets, [{ id: "model.player", path: "assets/player.glb", type: "model" }]);
    assert.deepEqual(audio.sounds, [{ asset: "sound.hit", id: "hit" }]);
    assert.deepEqual(material.materials, [{ alphaMode: "mask", baseColorTexture: "tex.player.albedo", color: "#fff", emissive: "#33ccff", id: "mat.player", metalness: 0.2, normalTexture: "tex.player.normal", roughness: 0.4 }]);
    assert.deepEqual(ui.nodes, [
      { id: "score", text: "Score", type: "text" },
      { action: "pause", id: "pause", label: "Pause", style: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, wrap: true }, type: "button" },
    ]);
    assert.deepEqual(input.actions, [{ bindings: ["keyboard.Space"], id: "jump" }]);
    assert.deepEqual(input.axes, [{ id: "MoveX", negative: ["keyboard.a"], positive: ["keyboard.d"], value: "gamepad.leftStickX" }]);
    assert.deepEqual(prefab.entities[0]?.components, { RigidBody: { kind: "dynamic" } });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "group.lane.red"), {
      components: { SceneContainer: { kind: "group", name: "Red Lane" } },
      id: "group.lane.red",
      transform: { position: [-2, 0, 0] },
    });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.LaneRed, {});
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.RigidBody, { kind: "dynamic", mass: 3 });
    assert.equal(scene.kind, "level");
    assert.equal(scene.activation, "exclusive");
    assert.equal(scene.initial, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose operation metadata and registry diagnostics", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const transform = getAuthoringOperationDescriptor("scene.set_transform");
  const missing = await dispatchAuthoringOperation({ args: { entityId: "player" }, name: "scene.set_transform", projectPath: "/project" });
  const unsupported = await dispatchAuthoringOperation({ args: {}, name: "scene.delete_entity", projectPath: "/project" });

  assert.deepEqual(AUTHORING_OPERATION_NAMES, [
    "asset.add",
    "audio.create",
    "audio.add_sound",
    "environment.create",
    "environment.set_skybox",
    "environment.set_map",
    "environment.set_terrain",
    "input.add_action",
    "input.add_axis",
    "material.create",
    "material.set",
    "mesh.create_primitive",
    "mesh.create_custom",
    "prefab.create",
    "prefab.add_component",
    "project.create",
    "resources.create",
    "resources.add",
    "resources.set",
    "runtime.create",
    "runtime.set_window",
    "runtime.set_rendering",
    "scene.add_entity",
    "scene.add_group",
    "scene.add_prefab",
    "scene.add_tag",
    "scene.add_resource",
    "scene.add_ui_node",
    "scene.set_transform",
    "scene.set_camera",
    "scene.set_component",
    "scene.set_camera_component",
    "scene.set_light",
    "scene.set_lifecycle",
    "scene.set_mesh_renderer",
    "scene.set_rigid_body",
    "scene.set_collider",
    "scene.set_character_controller",
    "scene.remove_component",
    "scene.set_resource",
    "scene.attach_script",
    "scene.bind_ui",
    "ui.create",
    "ui.add_text",
    "ui.add_node",
    "ui.set_layout",
    "ui.bind",
    "ui.set_style",
    "system.create",
    "system.attach_script",
    "system.set_metadata",
  ]);
  assert.equal(descriptors.length, AUTHORING_OPERATION_NAMES.length);
  assert.equal(transform?.pathPolicy, "source-document");
  assert.equal(transform?.sourceFamily, "scene");
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_MISSING");
  assert.equal(missing.diagnostics[0]?.path, "/sceneId");
  assert.equal(unsupported.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_UNSUPPORTED");
});

async function createRegistryProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-operation-registry-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify(
      {
        schema: "threenative.scene",
        version: "0.1.0",
        id: "scene.arena",
        entities: [{ id: "player", transform: { position: [0, 0, 0] } }],
        prefabs: [],
        resources: [],
        systems: [],
        ui: { nodes: [] },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

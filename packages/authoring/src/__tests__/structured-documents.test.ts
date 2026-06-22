import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { loadAuthoringProject, readAuthoringJsonDocument, validateAuthoringProject } from "../index.js";

test("loads mixed authoring source document family", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-docs-"));
  try {
    await writeSourceDocument(root, "content/scenes/arena.scene.json", sceneWithMaterial("mat.kart"));
    await writeSourceDocument(root, "content/ui/hud.ui.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      id: "hud",
      nodes: [{ id: "score-label" }],
    });
    await writeSourceDocument(root, "content/materials/kart.materials.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      id: "kart-materials",
      materials: [
        {
          alphaCutoff: 0.4,
          alphaMode: "mask",
          baseColorTexture: "tex.kart.albedo",
          clearcoat: 0.3,
          clearcoatRoughness: 0.2,
          clearcoatRoughnessTexture: "tex.kart.clearcoatRoughness",
          clearcoatTexture: "tex.kart.clearcoat",
          emissive: "#33ccff",
          emissiveIntensity: 1.4,
          emissiveTexture: "tex.kart.emissive",
          id: "mat.kart",
          metallicRoughnessTexture: "tex.kart.mr",
          metalness: 0.2,
          normalTexture: "tex.kart.normal",
          occlusionTexture: "tex.kart.occlusion",
          opacity: 0.85,
          roughness: 0.5,
          transmission: 0.1,
          transmissionTexture: "tex.kart.transmission",
        },
      ],
    });
    await writeSourceDocument(root, "content/meshes/kart.meshes.json", {
      schema: "threenative.meshes",
      version: "0.1.0",
      id: "kart-meshes",
      meshes: [{ id: "mesh.kart", kind: "primitive", primitive: "box" }],
    });
    await writeSourceDocument(root, "content/assets/kart.assets.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      id: "kart-assets",
      assets: [{ id: "asset.kart", path: "assets/kart.glb" }],
    });
    await writeSourceDocument(root, "content/input/kart.input.json", {
      schema: "threenative.input",
      version: "0.1.0",
      id: "kart-input",
      actions: [{ id: "accelerate", bindings: ["keyboard.w"] }],
      axes: [{ id: "MoveX", negative: ["keyboard.a"], positive: ["keyboard.d"], value: "gamepad.leftStickX" }],
    });
    await writeSourceDocument(root, "content/environment/kart.environment.json", {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      id: "kart-environment",
      sourceAssets: [],
      instances: [],
      path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] },
      skybox: { asset: "tex.sky", mode: "equirect" },
    });
    await writeSourceDocument(root, "content/systems/kart.systems.json", {
      schema: "threenative.systems",
      version: "0.1.0",
      id: "kart-systems",
      systems: [{ id: "race-controller", script: { module: "src/scripts/race.ts", export: "raceController" } }],
    });
    await writeSourceDocument(root, "content/prefabs/kart.prefab.json", {
      schema: "threenative.prefab",
      version: "0.1.0",
      id: "kart-prefab",
      entities: [{ id: "kart-root" }],
    });
    await writeSourceDocument(root, "content/audio/kart.audio.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      id: "kart-audio",
      sounds: [{ id: "engine-loop", asset: "assets/audio/engine.ogg" }],
    });
    await writeSourceDocument(root, "content/project.authoring.json", {
      schema: "threenative.authoring",
      version: "0.1.0",
      id: "kart-project",
      authoringVersion: "0.1.0",
      buildTargets: ["web", "desktop"],
      sourceRoots: ["content", "src"],
    });
    await writeSourceDocument(root, "content/runtime/kart.runtime.json", {
      schema: "threenative.runtime-config",
      version: "0.1.0",
      id: "kart-runtime",
      renderer: { antialias: "msaa4" },
      time: { fixedDelta: 1 / 60, paused: false },
      window: { height: 720, title: "Kart", width: 1280 },
    });
    await writeSourceDocument(root, "src/scripts/race.ts", "export function raceController() {}\n");

    const project = await loadAuthoringProject({ projectPath: root });
    assert.deepEqual(
      project.documents.map((document) => document.kind),
      ["asset", "audio", "environment", "input", "material", "mesh", "prefab", "project", "runtime", "scene", "systems", "ui"],
    );

    const validation = await validateAuthoringProject({ projectPath: root });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated bundle paths as source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-generated-"));
  try {
    await writeSourceDocument(root, "dist/game.bundle/world.ir.json", { entities: [] });

    const result = await readAuthoringJsonDocument(root, "dist/game.bundle/world.ir.json");
    const basenameResult = await readAuthoringJsonDocument(root, "world.ir.json");

    assert.equal(result.document, undefined);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_GENERATED_SOURCE_PATH");
    assert.equal(basenameResult.document, undefined);
    assert.equal(basenameResult.diagnostics[0]?.code, "TN_AUTHORING_GENERATED_SOURCE_PATH");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validates duplicate IDs for structured authoring document families", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-duplicates-"));
  try {
    await writeSourceDocument(root, "content/ui/hud.ui.json", duplicateDoc("threenative.ui", "hud", "nodes", "score-label"));
    await writeSourceDocument(root, "content/materials/kart.materials.json", duplicateDoc("threenative.materials", "materials", "materials", "mat.kart"));
    await writeSourceDocument(root, "content/assets/kart.assets.json", duplicateDoc("threenative.assets", "assets", "assets", "asset.kart"));
    await writeSourceDocument(root, "content/input/kart.input.json", duplicateDoc("threenative.input", "input", "actions", "accelerate"));
    await writeSourceDocument(root, "content/systems/kart.systems.json", duplicateDoc("threenative.systems", "systems", "systems", "race-controller"));
    await writeSourceDocument(root, "content/prefabs/kart.prefab.json", duplicateDoc("threenative.prefab", "prefab", "entities", "kart-root"));
    await writeSourceDocument(root, "content/audio/kart.audio.json", duplicateDoc("threenative.audio", "audio", "sounds", "engine-loop"));

    const result = await validateAuthoringProject({ projectPath: root });

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "TN_AUTHORING_DUPLICATE_ASSET_ID",
      "TN_AUTHORING_DUPLICATE_AUDIO_ID",
      "TN_AUTHORING_DUPLICATE_INPUT_ID",
      "TN_AUTHORING_DUPLICATE_MATERIAL_ID",
      "TN_AUTHORING_DUPLICATE_ENTITY_ID",
      "TN_AUTHORING_DUPLICATE_SYSTEM_ID",
      "TN_AUTHORING_DUPLICATE_UI_NODE_ID",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validates retained UI widget and style source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-ui-fields-"));
  try {
    await writeSourceDocument(root, "content/ui/hud.ui.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      id: "hud",
      nodes: [
        { id: "pause", type: "button", label: "Pause", action: "pause.toggle", style: { backgroundColor: "#101820", color: "#fff", fontSize: 18, textAlign: "center", wrap: true } },
        { id: "bad", type: "textfield", label: "", value: "high", style: { color: "", fontSize: "large", textAlign: "middle", wrap: "yes" } },
      ],
    });

    const result = await validateAuthoringProject({ projectPath: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/nodes/1/type" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/nodes/1/label" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/nodes/1/value" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/nodes/1/style/fontSize" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/nodes/1/style/textAlign" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/nodes/1/style/wrap" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validates input axis source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-input-axis-invalid-"));
  try {
    await writeSourceDocument(root, "content/input/kart.input.json", {
      schema: "threenative.input",
      version: "0.1.0",
      id: "kart-input",
      axes: [{ id: "MoveX", negative: ["keyboard.a"], positive: [42], value: "" }],
    });

    const result = await validateAuthoringProject({ projectPath: root });

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      ["/axes/0/positive", "/axes/0/value"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validates scene material references against material documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-material-ref-"));
  try {
    await writeSourceDocument(root, "content/scenes/arena.scene.json", sceneWithMaterial("mat.kar"));
    await writeSourceDocument(root, "content/materials/kart.materials.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      id: "kart-materials",
      materials: [{ id: "mat.kart" }],
    });

    const result = await validateAuthoringProject({ projectPath: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_REF_MISSING");
    assert.equal(result.diagnostics[0]?.path, "/entities/0/components/MeshRenderer/material");
    assert.equal(result.diagnostics[0]?.suggestion, "Did you mean 'mat.kart'?");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validates material PBR and texture source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-material-pbr-invalid-"));
  try {
    await writeSourceDocument(root, "content/materials/kart.materials.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      id: "kart-materials",
      materials: [
        {
          alphaMode: "screen",
          baseColorTexture: 42,
          id: "mat.kart",
          metalness: 1.5,
          roughness: Number.NaN,
        },
      ],
    });

    const result = await validateAuthoringProject({ projectPath: root });

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.path),
      ["/materials/0/alphaMode", "/materials/0/baseColorTexture", "/materials/0/metalness", "/materials/0/roughness"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function sceneWithMaterial(material: string): unknown {
  return {
    schema: "threenative.scene",
    version: "0.1.0",
    id: "scene.arena",
    entities: [{ id: "kart", components: { MeshRenderer: { material } } }],
    prefabs: [],
    resources: [],
    systems: [],
    ui: { nodes: [], bindings: [] },
  };
}

function duplicateDoc(schema: string, id: string, listName: string, duplicateId: string): unknown {
  return {
    schema,
    version: "0.1.0",
    id,
    [listName]: [{ id: duplicateId }, { id: duplicateId }],
  };
}

async function writeSourceDocument(root: string, file: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
}

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { applyEditorOperationApi } from "./operationApi.js";
import { loadEditorProjectApi } from "./projectApi.js";

test("should expose environment skybox and terrain rows", async () => {
  const root = await copyStarterProject();
  try {
    await mkdir(join(root, "content", "environment"), { recursive: true });
    await mkdir(join(root, "content", "runtime"), { recursive: true });
    await writeFile(
      join(root, "content", "project.authoring.json"),
      `${JSON.stringify({
        schema: "threenative.authoring",
        version: "0.1.0",
        id: "arena-project",
        authoringVersion: "0.1.0",
        buildTargets: ["web", "desktop"],
        sourceRoots: ["content", "src"],
      }, null, 2)}\n`,
    );
    await writeFile(
      join(root, "content", "environment", "arena.environment.json"),
      `${JSON.stringify({
        schema: "threenative.environment-scene",
        version: "0.1.0",
        id: "arena-environment",
        instances: [],
        environmentMap: { asset: "tex.env" },
        path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] },
        skybox: { asset: "tex.sky", mode: "equirect" },
        sourceAssets: [{ id: "env.Tree", lod: [{ asset: "env.Tree.low", maxDistance: 60 }] }],
        terrain: { heightMode: "heightmap", heightmap: "assets/height/arena.png", id: "terrain.arena" },
        walkability: { terrain: { height: 0, surface: "terrain.arena" } },
      }, null, 2)}\n`,
    );
    await writeFile(
      join(root, "content", "runtime", "desktop.runtime.json"),
      `${JSON.stringify({
        schema: "threenative.runtime-config",
        version: "0.1.0",
        id: "desktop",
        renderer: { antialias: "msaa4", bloom: { enabled: true, intensity: 0.3, threshold: 0.8 }, renderPath: "forward" },
        time: { fixedDelta: 1 / 60, paused: false },
        window: { height: 720, title: "Arena", width: 1280 },
      }, null, 2)}\n`,
    );
    const result = await loadEditorProjectApi({ projectPath: root });

    assert.equal(result.ok, true);
    assert.equal(result.documents.some((group) => group.kind === "scene" && group.documents[0]?.path === "content/scenes/arena.scene.json"), true);
    assert.equal(result.sceneLifecycle.activeScene?.documentPath, "content/scenes/arena.scene.json");
    assert.equal(result.sceneLifecycle.state, "build-ready");
    assert.equal(result.documents.some((group) => group.kind === "material"), true);
    assert.equal(result.lod.selected, "original");
    assert.equal(result.lod.loading, false);
    assert.equal(result.lod.triangleCount > 0, true);
    assert.equal(result.lod.loadedTriangles, result.lod.triangleCount);
    assert.equal(result.lod.precision, "estimate");
    assert.equal(result.environment?.skybox?.value, "tex.sky");
    assert.equal(result.environment?.terrain?.id, "terrain.arena");
    assert.equal(result.environment?.terrain?.heightMode, "heightmap");
    assert.equal(result.environment?.terrain?.sourceAsset, "assets/height/arena.png");
    assert.deepEqual(
      result.sceneObjects.map((object) => [object.id, object.primitive, object.color, object.position?.join(",")]),
      [
        ["arena.floor", "plane", "#34373d", "0,-0.05,0"],
        ["player", "box", "#2f80ed", "0,0.35,0"],
        ["goal", "box", "#f2c94c", "1.8,0.3,-1.6"],
        ["camera.main", "camera", undefined, undefined],
      ],
    );
    const camera = result.sceneObjects.find((object) => object.id === "camera.main");
    assert.equal(camera?.inspectorRows?.some((row) => row.component === "Camera" && row.label === "Mode" && row.fieldKind === "enum" && row.operation?.name === "scene.set_camera"), true);
    assert.equal(camera?.inspectorRows?.some((row) => row.component === "Camera" && row.label === "Skybox" && row.fieldKind === "asset" && row.sourceFamily === "environment" && row.value === "tex.sky" && row.operation?.name === "environment.set_skybox"), true);
    assert.equal(result.sceneObjects.find((object) => object.id === "player")?.inspectorRows?.some((row) => row.component === "MeshRenderer" && row.label === "Asset" && row.fieldKind === "asset" && row.operation?.name === "scene.set_prefab"), true);
    const environmentRows = result.documents.flatMap((group) => group.documents).find((document) => document.kind === "environment")?.inspectorRows ?? [];
    assert.equal(environmentRows.some((row) => row.label === "Skybox" && row.sourceFamily === "environment" && row.value === "tex.sky"), true);
    assert.equal(environmentRows.some((row) => row.label === "Environment Map" && row.fieldKind === "asset" && row.operation?.name === "environment.set_map"), true);
    assert.equal(environmentRows.some((row) => row.label === "Terrain Height Mode" && row.fieldKind === "enum" && row.value === "heightmap" && row.operation?.name === "environment.set_terrain"), true);
    assert.equal(environmentRows.some((row) => row.label === "Terrain Heightmap" && row.fieldKind === "asset" && row.value === "assets/height/arena.png" && row.operation?.name === "environment.set_terrain"), true);
    const walkability = environmentRows.find((row) => row.label === "Walkability" && row.fieldKind === "json");
    const path = environmentRows.find((row) => row.label === "Path" && row.fieldKind === "json");
    const lod = environmentRows.find((row) => row.label === "env.Tree LOD" && row.fieldKind === "json");
    assert.equal(walkability?.operation?.name, "environment.set_walkability");
    assert.equal(walkability?.readOnly, false);
    assert.equal(path?.operation?.name, "environment.set_path");
    assert.equal(path?.readOnly, false);
    assert.equal(lod?.operation?.name, "environment.set_source_asset_lod");
    assert.equal(lod?.readOnly, false);
    const pathOperation = path?.operation;
    const walkabilityOperation = walkability?.operation;
    const lodOperation = lod?.operation;
    assert.ok(pathOperation);
    assert.ok(walkabilityOperation);
    assert.ok(lodOperation);
    const pathSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...pathOperation.args, [pathOperation.valueArg ?? "path"]: { id: "path.alt", points: [[2, 0, 2]] } }, name: pathOperation.name },
    });
    assert.equal(pathSave.ok, true);
    const walkabilitySave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...walkabilityOperation.args, [walkabilityOperation.valueArg ?? "walkability"]: { terrain: { height: 1, surface: "terrain.alt" } } }, name: walkabilityOperation.name, projectRevision: pathSave.projectRevision },
    });
    assert.equal(walkabilitySave.ok, true);
    const lodSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...lodOperation.args, [lodOperation.valueArg ?? "lod"]: [{ asset: "env.Tree.mid", maxDistance: 30 }] }, name: lodOperation.name, projectRevision: walkabilitySave.projectRevision },
    });
    assert.equal(lodSave.ok, true);
    const environmentDoc = JSON.parse(await readFile(join(root, "content", "environment", "arena.environment.json"), "utf8")) as {
      path?: unknown;
      sourceAssets?: Array<{ id: string; lod?: unknown }>;
      walkability?: unknown;
    };
    assert.deepEqual(environmentDoc.path, { id: "path.alt", points: [[2, 0, 2]] });
    assert.deepEqual(environmentDoc.walkability, { terrain: { height: 1, surface: "terrain.alt" } });
    assert.deepEqual(environmentDoc.sourceAssets?.find((asset) => asset.id === "env.Tree")?.lod, [{ asset: "env.Tree.mid", maxDistance: 30 }]);
    const runtimeRows = result.documents.flatMap((group) => group.documents).find((document) => document.kind === "runtime")?.inspectorRows ?? [];
    assert.equal(runtimeRows.some((row) => row.label === "Window Width" && row.operation?.name === "runtime.set_window" && row.operation.valueArg === "width"), true);
    assert.equal(runtimeRows.some((row) => row.label === "Renderer Antialias" && row.operation?.name === "runtime.set_rendering" && row.operation.valueArg === "antialias"), true);
    const projectRows = result.documents.flatMap((group) => group.documents).find((document) => document.kind === "project")?.inspectorRows ?? [];
    assert.equal(projectRows.some((row) => row.label === "Source Roots" && row.sourceFamily === "project" && row.operation?.name === "project.create" && row.operation.valueArg === "sourceRoots"), true);
    assert.equal(projectRows.some((row) => row.label === "Build Targets" && row.fieldKind === "stringList" && row.operation?.name === "project.create"), true);
    const sceneRows = result.documents.flatMap((group) => group.documents).find((document) => document.kind === "scene")?.inspectorRows ?? [];
    assert.equal(sceneRows.some((row) => row.label === "Scene Kind" && row.fieldKind === "enum" && row.operation?.name === "scene.set_lifecycle" && row.operation.valueArg === "kind"), true);
    assert.equal(sceneRows.some((row) => row.label === "Activation" && row.fieldKind === "enum" && row.operation?.name === "scene.set_lifecycle" && row.operation.valueArg === "activation"), true);
    assert.equal(sceneRows.some((row) => row.label === "Initial Scene" && row.fieldKind === "boolean" && row.operation?.name === "scene.set_lifecycle" && row.operation.valueArg === "initial"), true);
    const materialRows = result.documents.flatMap((group) => group.documents).find((document) => document.kind === "material")?.inspectorRows ?? [];
    assert.equal(materialRows.some((row) => row.fieldKind === "color" && row.operation?.name === "material.set"), true);
    const allRows = [
      ...result.sceneObjects.flatMap((object) => object.inspectorRows ?? []),
      ...result.documents.flatMap((group) => group.documents.flatMap((document) => document.inspectorRows ?? [])),
    ];
    assert.equal(allRows.filter((row) => !row.readOnly).every((row) => row.operation?.name !== undefined && row.operation.valueArg !== undefined), true);
    assert.equal(allRows.filter((row) => row.readOnly).every((row) => typeof row.readOnlyReason === "string" && row.readOnlyReason.length > 0), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should attach operations to every editable inspector row", async () => {
  const root = await copyStarterProject();
  try {
    await mkdir(join(root, "content", "input"), { recursive: true });
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await mkdir(join(root, "content", "ui"), { recursive: true });
    await writeFile(join(root, "spin.ts"), "export function spin() {}\n");
    await writeFile(
      join(root, "content", "input", "arena.input.json"),
      `${JSON.stringify({ schema: "threenative.input", version: "0.1.0", id: "arena", actions: [{ id: "jump", bindings: ["keyboard.Space"] }] }, null, 2)}\n`,
    );
    await writeFile(
      join(root, "content", "systems", "arena.systems.json"),
      `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "arena", systems: [{ id: "spin", schedule: "update", script: { module: "./spin.ts", export: "spin" } }] }, null, 2)}\n`,
    );
    await writeFile(
      join(root, "content", "ui", "hud.ui.json"),
      `${JSON.stringify({ schema: "threenative.ui", version: "0.1.0", id: "hud", nodes: [{ id: "score-label", text: "Score", type: "text", style: { color: "#ffffff", backgroundColor: "#101820", fontSize: 18 } }], bindings: [{ node: "score-label", resource: "score" }] }, null, 2)}\n`,
    );

    const result = await loadEditorProjectApi({ projectPath: root });
    assert.equal(result.ok, true);
    const rows = [
      ...result.sceneObjects.flatMap((object) => object.inspectorRows ?? []),
      ...result.documents.flatMap((group) => group.documents.flatMap((document) => document.inspectorRows ?? [])),
    ];
    const editableRows = rows.filter((row) => !row.readOnly);
    assert.equal(editableRows.length > 0, true);
    assert.deepEqual(editableRows.filter((row) => row.operation?.name === undefined).map((row) => row.id), []);
    assert.deepEqual(rows.filter((row) => row.readOnly && row.readOnlyReason === undefined).map((row) => row.id), []);
    assert.equal(rows.some((row) => row.sourceFamily === "ui" && row.label === "score-label Type" && row.operation?.name === "ui.add_node"), true);
    assert.equal(rows.some((row) => row.sourceFamily === "ui" && row.label === "score-label Color" && row.operation?.name === "ui.set_style"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose source-backed input and system inspector rows", async () => {
  const root = await copyStarterProject();
  try {
    await mkdir(join(root, "content", "input"), { recursive: true });
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await writeFile(join(root, "spin.ts"), "export function spin() {}\n");
    await writeFile(
      join(root, "content", "input", "arena.input.json"),
      `${JSON.stringify({ schema: "threenative.input", version: "0.1.0", id: "arena", actions: [{ id: "jump", bindings: ["keyboard.Space"] }] }, null, 2)}\n`,
    );
    await writeFile(
      join(root, "content", "systems", "arena.systems.json"),
      `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "arena", systems: [{ id: "spin", schedule: "update", script: { module: "./spin.ts", export: "spin" } }] }, null, 2)}\n`,
    );

    const result = await loadEditorProjectApi({ projectPath: root });
    assert.equal(result.ok, true);
    const rows = result.documents.flatMap((group) => group.documents.flatMap((document) => document.inspectorRows ?? []));
    assert.equal(rows.some((row) => row.sourceFamily === "input" && row.fieldKind === "stringList" && row.operation?.name === "input.add_action"), true);
    assert.equal(rows.some((row) => row.sourceFamily === "system" && row.fieldKind === "script" && row.operation?.name === "system.attach_script"), true);
    assert.equal(rows.some((row) => row.sourceFamily === "system" && row.label.includes("Schedule") && row.readOnlyReason !== undefined), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should surface validation diagnostics", async () => {
  const root = await copyStarterProject();
  try {
    await writeFile(join(root, "content", "materials", "arena.materials.json"), "{ invalid json\n");
    const result = await loadEditorProjectApi({ projectPath: root });

    assert.equal(result.ok, false);
    assert.equal(result.sceneLifecycle.state, "diagnostic");
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_DOCUMENT_READ_FAILED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported operations without writing source", async () => {
  const root = await copyStarterProject();
  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const before = await readFile(scenePath, "utf8");
    const result = await applyEditorOperationApi({ projectPath: root, request: { args: {}, name: "scene.delete_entity" } });
    const after = await readFile(scenePath, "utf8");

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_UNSUPPORTED");
    assert.equal(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject malformed editor operation payloads without writing source", async () => {
  const root = await copyStarterProject();
  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const before = await readFile(scenePath, "utf8");
    const result = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { prefabId: "bad-prefab", sceneId: "" }, name: "scene.add_prefab" },
    });
    const after = await readFile(scenePath, "utf8");

    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_INVALID");
    assert.equal(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should persist scene prefab rows and expose typed light operations", async () => {
  const root = await copyStarterProject();
  try {
    const create = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { sceneId: "lighting-scene" }, name: "scene.create_default" },
    });
    assert.equal(create.ok, true);

    const result = await loadEditorProjectApi({ projectPath: root });
    assert.equal(result.ok, true);
    const playerRows = result.sceneObjects.find((object) => object.id === "player")?.inspectorRows ?? [];
    const primitive = playerRows.find((row) => row.component === "MeshRenderer" && row.label === "Primitive");
    const color = playerRows.find((row) => row.component === "MeshRenderer" && row.label === "Color");
    const asset = playerRows.find((row) => row.component === "MeshRenderer" && row.label === "Asset");
    assert.equal(primitive?.operation?.name, "scene.set_prefab");
    assert.equal(primitive?.readOnly, false);
    assert.equal(color?.operation?.name, "scene.set_prefab");
    assert.equal(color?.readOnly, false);
    assert.equal(asset?.operation?.name, "scene.set_prefab");
    assert.equal(asset?.readOnly, false);

    const primitiveSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...primitive.operation.args, [primitive.operation.valueArg ?? "primitive"]: "sphere" }, name: primitive.operation.name },
    });
    assert.equal(primitiveSave.ok, true);
    const colorSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...color.operation.args, [color.operation.valueArg ?? "color"]: "#00ffaa" }, name: color.operation.name, projectRevision: primitiveSave.projectRevision },
    });
    assert.equal(colorSave.ok, true);
    const assetSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...asset.operation.args, [asset.operation.valueArg ?? "asset"]: "assets/models/player.glb" }, name: asset.operation.name, projectRevision: colorSave.projectRevision },
    });
    assert.equal(assetSave.ok, true);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities?: Array<{ components?: Record<string, unknown>; id: string }>;
      prefabs?: Array<{ asset?: string; color?: string; id: string; primitive?: string }>;
    };
    assert.deepEqual(scene.prefabs?.find((prefab) => prefab.id === "prefab.player"), { asset: "assets/models/player.glb", color: "#00ffaa", id: "prefab.player", primitive: "sphere" });

    const lightRows = result.sceneObjects.find((object) => object.id === "directional-light")?.inspectorRows ?? [];
    for (const label of ["Kind", "Intensity", "Color", "Range", "Angle", "Shadow Bias", "Shadow Normal Bias"]) {
      assert.equal(lightRows.some((row) => row.component === "Light" && row.label === label && row.operation?.name === "scene.set_light" && row.readOnly === false), true);
    }
    const shadowBias = lightRows.find((row) => row.component === "Light" && row.label === "Shadow Bias");
    const shadowBiasOperation = shadowBias?.operation;
    assert.ok(shadowBiasOperation);
    const shadowBiasSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...shadowBiasOperation.args, [shadowBiasOperation.valueArg ?? "shadowBias"]: -0.001 }, name: shadowBiasOperation.name, projectRevision: assetSave.projectRevision },
    });
    assert.equal(shadowBiasSave.ok, true);
    assert.equal(shadowBiasSave.filesWritten.length, 1);
    const sceneAfterLight = JSON.parse(await readFile(join(root, shadowBiasSave.filesWritten[0] ?? ""), "utf8")) as {
      entities?: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    assert.deepEqual(sceneAfterLight.entities?.find((entity) => entity.id === "directional-light")?.components?.Light, { color: "#ffffff", intensity: 1, kind: "directional", shadowBias: -0.001 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should persist asset catalog and scene resource rows through editor operations", async () => {
  const root = await copyStarterProject();
  try {
    await mkdir(join(root, "content", "assets"), { recursive: true });
    await writeFile(
      join(root, "content", "assets", "catalog.assets.json"),
      `${JSON.stringify({ schema: "threenative.assets", version: "0.1.0", id: "catalog", assets: [{ id: "tex.logo", path: "assets/logo.png", type: "texture" }] }, null, 2)}\n`,
    );
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as { resources?: Array<{ id: string; path?: string; value?: unknown }> };
    scene.resources = [
      ...(scene.resources ?? []),
      { id: "config.theme", path: "config/theme.json" },
      { id: "score.default", value: { points: 10 } },
    ];
    await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);

    const result = await loadEditorProjectApi({ projectPath: root });
    assert.equal(result.ok, true);
    const rows = result.documents.flatMap((group) => group.documents.flatMap((document) => document.inspectorRows ?? []));
    const assetPath = rows.find((row) => row.label === "tex.logo Path");
    const assetType = rows.find((row) => row.label === "tex.logo Type");
    const resourcePath = rows.find((row) => row.label === "config.theme Path");
    const resourceValue = rows.find((row) => row.label === "score.default Value");

    assert.equal(assetPath?.readOnly, false);
    assert.equal(assetPath?.operation?.name, "asset.add");
    assert.equal(assetPath.operation.valueArg, "path");
    assert.equal(assetType?.operation?.name, "asset.add");
    assert.equal(resourcePath?.readOnly, false);
    assert.equal(resourcePath?.operation?.name, "scene.set_resource");
    assert.equal(resourceValue?.readOnly, false);
    assert.equal(resourceValue?.operation?.name, "scene.set_resource");

    const assetSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...assetPath.operation.args, [assetPath.operation.valueArg ?? "path"]: "assets/logo-2.png" }, name: assetPath.operation.name },
    });
    assert.equal(assetSave.ok, true);
    const resourceSave = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { ...resourceValue.operation.args, [resourceValue.operation.valueArg ?? "value"]: { points: 42 } }, name: resourceValue.operation.name, projectRevision: assetSave.projectRevision },
    });
    assert.equal(resourceSave.ok, true);

    const assetDoc = JSON.parse(await readFile(join(root, "content", "assets", "catalog.assets.json"), "utf8")) as { assets: Array<{ id: string; path?: string; type?: string }> };
    const sceneDoc = JSON.parse(await readFile(scenePath, "utf8")) as { resources?: Array<{ id: string; path?: string; value?: unknown }> };
    assert.deepEqual(assetDoc.assets[0], { id: "tex.logo", path: "assets/logo-2.png", type: "texture" });
    assert.deepEqual(sceneDoc.resources?.find((resource) => resource.id === "score.default")?.value, { points: 42 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create, save, and reload default editor scene entities", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-default-scene-"));
  try {
    const create = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { sceneId: "sample-scene" }, name: "scene.create_default" },
    });
    assert.equal(create.ok, true);

    const scenePath = join(root, "content", "scenes", "sample-scene.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
      id: string;
    };
    assert.equal(scene.id, "sample-scene");
    assert.deepEqual(scene.entities.map((entity) => entity.id), ["main-camera", "directional-light", "ambient-light"]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "main-camera")?.components?.camera, { mode: "perspective" });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "directional-light")?.components?.Light, { color: "#ffffff", intensity: 1, kind: "directional" });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "ambient-light")?.components?.Light, { color: "#ffffff", intensity: 0.4, kind: "ambient" });

    const save = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { entityId: "main-camera", position: [1, 2, 3], sceneId: "sample-scene" }, name: "scene.set_transform", projectRevision: create.projectRevision },
    });
    assert.equal(save.ok, true);

    const reloaded = await loadEditorProjectApi({ projectPath: root });
    assert.equal(reloaded.ok, true);
    assert.equal(reloaded.sceneLifecycle.activeScene?.documentPath, "content/scenes/sample-scene.scene.json");
    assert.equal(reloaded.sceneLifecycle.state, "build-ready");
    assert.deepEqual(
      reloaded.sceneObjects.map((object) => [object.id, object.kind, object.position?.join(",")]),
      [
        ["main-camera", "camera", "1,2,3"],
        ["directional-light", "light", "2,4,3"],
        ["ambient-light", "light", undefined],
      ],
    );
    assert.equal(reloaded.lod.triangleCount, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should load GLB prefab as scene object", async () => {
  const root = await copyStarterProject();
  try {
    await mkdir(join(root, "content", "assets"), { recursive: true });
    await writeFile(
      join(root, "content", "assets", "models.assets.json"),
      `${JSON.stringify({ schema: "threenative.assets", version: "0.1.0", id: "models", assets: [{ id: "model.house", path: "assets/models/house.glb", type: "model" }] }, null, 2)}\n`,
    );
    const addPrefab = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { asset: "assets/models/house.glb", prefabId: "prefab.house", sceneId: "arena" }, name: "scene.add_prefab" },
    });
    assert.equal(addPrefab.ok, true);
    const addEntity = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { entityId: "house-0", prefabId: "prefab.house", sceneId: "arena" }, name: "scene.add_entity", projectRevision: addPrefab.projectRevision },
    });
    assert.equal(addEntity.ok, true);

    const result = await loadEditorProjectApi({ projectPath: root });
    const modelAsset = result.assets.find((asset) => asset.label === "model.house");
    const object = result.sceneObjects.find((sceneObject) => sceneObject.id === "house-0");

    assert.equal(modelAsset?.path, "assets/models/house.glb");
    assert.equal(modelAsset?.kind, "model");
    assert.equal(modelAsset?.access, "sourcePersistable");
    assert.equal(object?.assetPath, "assets/models/house.glb");
    assert.equal(object?.components?.includes("MeshRenderer"), true);
    assert.equal(object?.inspectorRows?.some((row) => row.component === "MeshRenderer" && row.label === "Asset" && row.value === "assets/models/house.glb"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_EDITOR_MODEL_ASSET_PROJECT_ROUTE" && diagnostic.severity === "info"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should persist added component defaults through source operations", async () => {
  const root = await copyStarterProject();
  try {
    const camera = await applyEditorOperationApi({
      projectPath: root,
      request: {
        args: { componentKind: "camera", entityId: "player", sceneId: "arena", value: { mode: "perspective" } },
        name: "scene.set_component",
      },
    });
    assert.equal(camera.ok, true);

    const light = await applyEditorOperationApi({
      projectPath: root,
      request: {
        args: { componentKind: "Light", entityId: "goal", sceneId: "arena", value: { color: "#ffffff", intensity: 1, kind: "directional" } },
        name: "scene.set_component",
        projectRevision: camera.projectRevision,
      },
    });
    assert.equal(light.ok, true);

    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.camera, { mode: "perspective" });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "goal")?.components?.Light, { color: "#ffffff", intensity: 1, kind: "directional" });

    const reloaded = await loadEditorProjectApi({ projectPath: root });
    assert.equal(reloaded.sceneObjects.find((object) => object.id === "player")?.components?.includes("Camera"), true);
    assert.equal(reloaded.sceneObjects.find((object) => object.id === "goal")?.components?.includes("Light"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function copyStarterProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-project-api-"));
  await mkdir(root, { recursive: true });
  await cp(resolve("../../templates/structured-source-starter"), root, { recursive: true });
  return root;
}

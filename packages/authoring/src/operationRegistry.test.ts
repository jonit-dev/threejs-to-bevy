import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AUTHORING_OPERATION_NAMES,
  buildAuthoringOperationCliArgv,
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  listAuthoringOperationDescriptors,
  renderAuthoringOperationCliUsage,
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

test("should dispatch actor archetype operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: {
        actorId: "hero",
        archetype: "character",
        sceneId: "scene.arena",
        speed: 5,
      },
      name: "archetype.apply",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ archetype?: { id: string }; components?: Record<string, unknown>; id: string }>;
    };
    const descriptor = getAuthoringOperationDescriptor("archetype.apply");

    assert.equal(result.ok, true);
    assert.equal(descriptor?.sourceFamily, "archetype");
    assert.equal(scene.entities.find((entity) => entity.id === "hero")?.archetype?.id, "character");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch existing structured source operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    const operations = [
      await dispatchAuthoringOperation({ args: { assetId: "model.player", path: "assets/player.glb", type: "model" }, name: "asset.add", projectPath: root }),
      await dispatchAuthoringOperation({ args: { assetId: "rt.minimap", format: "rgba16f", height: 256, type: "render-target", usage: "color", width: 512 }, name: "asset.add", projectPath: root }),
      await dispatchAuthoringOperation({ args: { audioDocId: "arena" }, name: "audio.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "sound.hit", audioDocId: "arena", soundId: "hit" }, name: "audio.add_sound", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena" }, name: "environment.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "tex.sky", environmentId: "arena", mode: "equirect" }, name: "environment.set_skybox", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "tex.env", environmentId: "arena" }, name: "environment.set_map", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", heightmap: "tex.height", heightMode: "heightmap", terrainId: "terrain.arena" }, name: "environment.set_terrain", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] } }, name: "environment.set_path", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", walkability: { terrain: { height: 0, surface: "terrain.arena" } } }, name: "environment.set_walkability", projectPath: root }),
      await dispatchAuthoringOperation({ args: { environmentId: "arena", probe: { bounds: { max: [3, 4, 3], min: [-3, 0, -3] }, influenceRadius: 5, source: { asset: "tex.env", mode: "equirect" } }, probeId: "probe.center" }, name: "environment.set_light_probe", projectPath: root }),
      await dispatchAuthoringOperation({ args: { exportName: "generateArena", generatorId: "arena.layout", inputHash: "sha256:inputs", modulePath: "src/generators/arena.ts", outputHash: "sha256:outputs", outputs: ["content/scenes/arena.scene.json"], overwritePolicy: "manual" }, name: "generator.record", projectPath: root }),
      await dispatchAuthoringOperation({ args: { renderProfile: "parity", runtimeId: "desktop" }, name: "runtime.create", projectPath: root }),
      await dispatchAuthoringOperation({
        args: {
          ambientOcclusionEnabled: true,
          ambientOcclusionIntensity: 1.2,
          ambientOcclusionMode: "screen-space",
          ambientOcclusionQuality: "medium",
          ambientOcclusionRadius: 3,
          motionBlurEnabled: true,
          motionBlurShutterAngle: 0.5,
          renderLookContrast: 0.1,
          renderLookExposure: 1.1,
          renderLookShadowQuality: "high",
          renderProfile: "balanced",
          runtimeId: "desktop",
          screenSpaceGlobalIlluminationEnabled: false,
          screenSpaceGlobalIlluminationIntensity: 1.25,
          screenSpaceGlobalIlluminationQuality: "high",
          screenSpaceGlobalIlluminationRadius: 16,
          screenSpaceReflectionsEnabled: true,
          screenSpaceReflectionsQuality: "medium",
          screenSpaceReflectionsRoughnessLimit: 0.45,
        },
        name: "runtime.set_rendering",
        projectPath: root,
      }),
      await dispatchAuthoringOperation({ args: { sceneId: "scene.generated" }, name: "scene.create", projectPath: root }),
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
      await dispatchAuthoringOperation({ args: { materialId: "mat.shader" }, name: "material.create", projectPath: root }),
      await dispatchAuthoringOperation({
        args: {
          materialId: "mat.shader",
          shader: {
            inputs: ["uv0"],
            outputs: ["baseColor"],
            program: {
              fragment: {
                outputs: {
                  baseColor: { kind: "uniform", uniform: "tint" },
                },
              },
            },
            uniforms: [{ default: "#00ffaa", name: "tint", type: "color" }],
          },
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
      await dispatchAuthoringOperation({ args: { file: "content/meshes/mesh.player.meshes.json", kind: "sphere", meshId: "mesh.player" }, name: "mesh.create_primitive", projectPath: root }),
      await dispatchAuthoringOperation({ args: { prefabId: "player" }, name: "prefab.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "RigidBody", prefabId: "player", value: { kind: "dynamic" } }, name: "prefab.add_component", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "Collider", prefabId: "player", value: { kind: "box", size: [1, 1, 1] } }, name: "prefab.set_defaults", projectPath: root }),
      await dispatchAuthoringOperation({ args: { buildTargets: ["web"], projectId: "kart", sourceRoots: ["content", "src"] }, name: "project.create", projectPath: root }),
      await dispatchAuthoringOperation({ args: { budgets: { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] }, targetProfileId: "desktop", targets: ["desktop"] }, name: "target.set_profile", projectPath: root }),
      await dispatchAuthoringOperation({ args: { color: "#2f80ed", prefabId: "prefab.player", primitive: "box", sceneId: "scene.arena" }, name: "scene.add_prefab", projectPath: root }),
      await dispatchAuthoringOperation({ args: { components: { Marker: { value: 1 } }, instanceId: "prefab-player.01", position: [1, 0, 2], prefabId: "prefab.player", sceneId: "scene.arena" }, name: "scene.add_prefab_instance", projectPath: root }),
      await dispatchAuthoringOperation({ args: { origin: [0, 0.6, 0], prefabId: "prefab.player", prefix: "rack", sceneId: "scene.arena", spacing: 0.52 }, name: "scene.layout_ten_pin", projectPath: root }),
      await dispatchAuthoringOperation({ args: { asset: "assets/player.glb", color: "#00ffaa", prefabId: "prefab.player", primitive: "sphere", sceneId: "scene.arena" }, name: "scene.set_prefab", projectPath: root }),
      await dispatchAuthoringOperation({ args: { groupId: "group.lane.red", name: "Red Lane", position: [-2, 0, 0], sceneId: "scene.arena" }, name: "scene.add_group", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", tag: "LaneRed" }, name: "scene.add_tag", projectPath: root }),
      await dispatchAuthoringOperation({ args: { componentKind: "Light", entityId: "player", sceneId: "scene.arena", value: { color: "#ffffff", intensity: 1, kind: "point" } }, name: "scene.set_component", projectPath: root }),
      await dispatchAuthoringOperation({ args: { color: "#ffeeaa", entityId: "player", intensity: 2, kind: "spot", range: 12, angle: 0.6, sceneId: "scene.arena", shadowBias: -0.001, shadowNormalBias: 0.02 }, name: "scene.set_light", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", layers: ["gameplay", "minimap"], sceneId: "scene.arena" }, name: "scene.set_render_layers", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", kind: "dynamic", mass: 3 }, name: "scene.set_rigid_body", projectPath: root }),
      await dispatchAuthoringOperation({ args: { entityId: "player", sceneId: "scene.arena", visible: false }, name: "scene.set_visibility", projectPath: root }),
      await dispatchAuthoringOperation({ args: { activation: "exclusive", initial: true, kind: "level", sceneId: "scene.arena" }, name: "scene.set_lifecycle", projectPath: root }),
    ];
    const material = JSON.parse(await readFile(join(root, "content", "materials", "mat.player.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };
    const shaderMaterial = JSON.parse(await readFile(join(root, "content", "materials", "mat.shader.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };
    const asset = JSON.parse(await readFile(join(root, "content", "assets", "model.player.assets.json"), "utf8")) as {
      assets: Array<{ id: string; path: string; type: string }>;
    };
    const renderTargetAsset = JSON.parse(await readFile(join(root, "content", "assets", "rt.minimap.assets.json"), "utf8")) as {
      assets: Array<{ format: string; height: number; id: string; type: string; usage: string; width: number }>;
    };
    const audio = JSON.parse(await readFile(join(root, "content", "audio", "arena.audio.json"), "utf8")) as {
      sounds: Array<{ asset: string; id: string }>;
    };
    const environment = JSON.parse(await readFile(join(root, "content", "environment", "arena.environment.json"), "utf8")) as {
      environmentMap?: Record<string, unknown>;
      path?: unknown;
      lightProbes?: Array<Record<string, unknown>>;
      skybox?: Record<string, unknown>;
      terrain?: Record<string, unknown>;
      walkability?: unknown;
    };
    const generator = JSON.parse(await readFile(join(root, "content", "generators", "arena.layout.generator.json"), "utf8")) as Record<string, unknown>;
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as {
      nodes: Array<{ action?: string; id: string; label?: string; style?: Record<string, unknown>; text?: string; type: string }>;
    };
    const input = JSON.parse(await readFile(join(root, "content", "input", "arena.input.json"), "utf8")) as {
      actions: Array<{ bindings: string[]; id: string }>;
      axes: Array<{ id: string; negative: string[]; positive: string[]; value?: string }>;
    };
    const mesh = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.player.meshes.json"), "utf8")) as {
      meshes: Array<Record<string, unknown>>;
    };
    const prefab = JSON.parse(await readFile(join(root, "content", "prefabs", "player.prefab.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const target = JSON.parse(await readFile(join(root, "content", "targets", "desktop.target.json"), "utf8")) as {
      budgets?: Record<string, unknown>;
      targets: string[];
    };
    const runtime = JSON.parse(await readFile(join(root, "content", "runtime", "desktop.runtime.json"), "utf8")) as {
      renderer?: Record<string, unknown>;
    };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      activation?: string;
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
      initial?: boolean;
      instances?: Array<{ components?: Record<string, unknown>; id: string; prefab: string; transform?: { position?: number[] } }>;
      kind?: string;
      prefabs: Array<{ asset?: string; color?: string; id: string; primitive?: string }>;
    };

    assert.deepEqual(operations.map((operation) => operation.ok), Array.from({ length: operations.length }, () => true));
    assert.deepEqual(asset.assets, [{ id: "model.player", path: "assets/player.glb", type: "model" }]);
    assert.deepEqual(renderTargetAsset.assets, [{ format: "rgba16f", height: 256, id: "rt.minimap", type: "render-target", usage: "color", width: 512 }]);
    assert.deepEqual(audio.sounds, [{ asset: "sound.hit", id: "hit" }]);
    assert.deepEqual(environment.skybox, { asset: "tex.sky", mode: "equirect" });
    assert.deepEqual(environment.environmentMap, { asset: "tex.env" });
    assert.deepEqual(environment.terrain, { heightMode: "heightmap", heightmap: "tex.height", id: "terrain.arena" });
    assert.deepEqual(environment.path, { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] });
    assert.deepEqual(environment.walkability, { terrain: { height: 0, surface: "terrain.arena" } });
    assert.deepEqual(environment.lightProbes, [{ bounds: { max: [3, 4, 3], min: [-3, 0, -3] }, id: "probe.center", influenceRadius: 5, source: { asset: "tex.env", mode: "equirect" } }]);
    assert.deepEqual(generator, { export: "generateArena", id: "arena.layout", inputHash: "sha256:inputs", module: "src/generators/arena.ts", outputHash: "sha256:outputs", outputs: ["content/scenes/arena.scene.json"], overwritePolicy: "manual", schema: "threenative.generator-provenance", version: "0.1.0" });
    assert.deepEqual(material.materials, [{ alphaMode: "mask", baseColorTexture: "tex.player.albedo", color: "#fff", emissive: "#33ccff", id: "mat.player", metalness: 0.2, normalTexture: "tex.player.normal", roughness: 0.4 }]);
    assert.deepEqual(shaderMaterial.materials, [
      {
        id: "mat.shader",
        inputs: ["uv0"],
        kind: "shader",
        outputs: ["baseColor"],
        program: { fragment: { outputs: { baseColor: { kind: "uniform", uniform: "tint" } } } },
        uniforms: [{ default: "#00ffaa", name: "tint", type: "color" }],
      },
    ]);
    assert.deepEqual(ui.nodes, [
      { id: "score", text: "Score", type: "text" },
      { action: "pause", id: "pause", label: "Pause", style: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, wrap: true }, type: "button" },
    ]);
    assert.deepEqual(input.actions, [{ bindings: ["keyboard.Space"], id: "jump" }]);
    assert.deepEqual(input.axes, [{ id: "MoveX", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"], value: "gamepad.leftStickX" }]);
    assert.deepEqual(mesh.meshes, [{ id: "mesh.player", kind: "primitive", primitive: "sphere" }]);
    assert.deepEqual(prefab.entities[0]?.components, { Collider: { kind: "box", size: [1, 1, 1] }, RigidBody: { kind: "dynamic" } });
    assert.deepEqual(target.targets, ["desktop"]);
    assert.deepEqual(target.budgets, { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] });
    assert.deepEqual(runtime.renderer?.renderLook, { version: 1, profile: "balanced", overrides: { contrast: 0.1, exposure: 1.1, shadowQuality: "high" } });
    assert.deepEqual(runtime.renderer?.ambientOcclusion, { enabled: true, intensity: 1.2, mode: "screen-space", quality: "medium", radius: 3 });
    assert.deepEqual(runtime.renderer?.screenSpaceReflections, { enabled: true, quality: "medium", roughnessLimit: 0.45 });
    assert.deepEqual(runtime.renderer?.motionBlur, { enabled: true, shutterAngle: 0.5 });
    assert.deepEqual(runtime.renderer?.screenSpaceGlobalIllumination, { enabled: false, intensity: 1.25, quality: "high", radius: 16 });
    assert.deepEqual(scene.prefabs, [{ asset: "assets/player.glb", color: "#00ffaa", id: "prefab.player", primitive: "sphere" }]);
    assert.deepEqual(scene.instances?.map((instance) => instance.id), ["prefab-player.01", "rack.01", "rack.02", "rack.03", "rack.04", "rack.05", "rack.06", "rack.07", "rack.08", "rack.09", "rack.10"]);
    assert.deepEqual(scene.instances?.find((instance) => instance.id === "prefab-player.01")?.transform?.position, [1, 0, 2]);
    assert.equal(scene.instances?.some((instance) => instance.id.startsWith("rack.") && instance.components !== undefined), false);
    assert.deepEqual(scene.instances?.find((instance) => instance.id === "rack.10")?.transform?.position, [0.78, 0.6, -1.56]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "group.lane.red"), {
      components: { SceneContainer: { kind: "group", name: "Red Lane" } },
      id: "group.lane.red",
      transform: { position: [-2, 0, 0] },
    });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.LaneRed, {});
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.Light, { angle: 0.6, color: "#ffeeaa", intensity: 2, kind: "spot", range: 12, shadowBias: -0.001, shadowNormalBias: 0.02 });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.RenderLayers, { layers: ["gameplay", "minimap"] });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.RigidBody, { kind: "dynamic", mass: 3 });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.components?.Visibility, { visible: false });
    assert.equal(scene.kind, "level");
    assert.equal(scene.activation, "exclusive");
    assert.equal(scene.initial, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch file-targeted system metadata operations through the registry", async () => {
  const root = await createRegistryProject();
  try {
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await writeFile(join(root, "spin.ts"), "export function spin() {}\n");
    await writeFile(
      join(root, "content", "systems", "arena.systems.json"),
      `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "arena", systems: [{ id: "spin", schedule: "update", script: { module: "spin.ts", export: "spin" }, writes: ["Velocity"] }] }, null, 2)}\n`,
    );

    const script = await dispatchAuthoringOperation({
      args: { exportName: "spin", file: "content/systems/arena.systems.json", modulePath: "spin.ts", systemId: "spin" },
      name: "system.attach_script",
      projectPath: root,
    });
    const metadata = await dispatchAuthoringOperation({
      args: { file: "content/systems/arena.systems.json", reads: ["Transform"], schedule: "fixedUpdate", systemId: "spin", writes: ["Velocity", "AngularVelocity"] },
      name: "system.set_metadata",
      projectPath: root,
    });
    const systems = JSON.parse(await readFile(join(root, "content", "systems", "arena.systems.json"), "utf8")) as {
      systems: Array<{ id: string; reads?: string[]; schedule?: string; script?: Record<string, unknown>; writes?: string[] }>;
    };
    const spin = systems.systems.find((system) => system.id === "spin");

    assert.equal(script.ok, true);
    assert.equal(metadata.ok, true);
    assert.deepEqual(spin?.script, { export: "spin", module: "spin.ts" });
    assert.deepEqual(spin?.reads, ["Transform"]);
    assert.equal(spin?.schedule, "fixedUpdate");
    assert.deepEqual(spin?.writes, ["AngularVelocity", "Velocity"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should dispatch stylized nature defaults from the shared contract", async () => {
  const root = await createRegistryProject();
  try {
    const contract = JSON.parse(await readFile(join(process.cwd(), "../ir/fixtures/stylized-nature-contract.json"), "utf8")) as {
      authoredDefaults: Record<string, unknown>;
      densityDefaults: Record<"high", { grassCount: number; treeCount: number }>;
    };
    const result = await dispatchAuthoringOperation({
      args: {
        density: "high",
        entityId: "player",
        sceneId: "scene.arena",
      },
      name: "scene.set_stylized_nature",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const nature = scene.entities.find((entity) => entity.id === "player")?.components?.StylizedNature as Record<string, unknown> | undefined;

    assert.equal(result.ok, true);
    assert.deepEqual(nature, {
      ...contract.authoredDefaults,
      density: "high",
      grassCount: contract.densityDefaults.high.grassCount,
      treeCount: contract.densityDefaults.high.treeCount,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose operation metadata and registry diagnostics", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const transform = getAuthoringOperationDescriptor("scene.set_transform");
  const camera = getAuthoringOperationDescriptor("scene.set_camera");
  const missing = await dispatchAuthoringOperation({ args: { entityId: "player" }, name: "scene.set_transform", projectPath: "/project" });
  const invalidEnum = await dispatchAuthoringOperation({ args: { cameraId: "camera", mode: "fisheye", sceneId: "scene", targetId: "player" }, name: "scene.set_camera", projectPath: "/project" });
  const unsupported = await dispatchAuthoringOperation({ args: {}, name: "scene.delete_entity", projectPath: "/project" });

  assert.deepEqual(AUTHORING_OPERATION_NAMES, [
    "archetype.apply",
    "archetype.update",
    "archetype.list",
    "asset.add",
    "audio.create",
    "audio.add_sound",
    "environment.create",
    "environment.set_skybox",
    "environment.set_map",
    "environment.set_volumetrics",
    "environment.set_light_probe",
    "environment.set_path",
    "environment.set_terrain",
    "environment.set_walkability",
    "environment.set_source_asset_lod",
    "generator.record",
    "scene.create",
    "input.add_action",
    "input.add_axis",
    "input.set_controls",
    "input.set_override",
    "material.create",
    "material.set",
    "mesh.create_primitive",
    "mesh.create_custom",
    "prefab.create",
    "prefab.add_component",
    "prefab.set_defaults",
    "project.create",
    "resources.create",
    "resources.add",
    "resources.set",
    "flow.create",
    "flow.add_state",
    "flow.add_transition",
    "sequence.create",
    "sequence.add_track",
    "sequence.add_key",
    "schema.create",
    "schema.set",
    "runtime.create",
    "runtime.set_window",
    "runtime.set_rendering",
    "target.set_profile",
    "scene.add_entity",
    "scene.remove_entity",
    "scene.remove_ui_node",
    "scene.remove_resource",
    "scene.add_prefab_instance",
    "scene.add_prefab_instances",
    "scene.layout_ten_pin",
    "scene.add_group",
    "scene.add_prefab",
    "scene.add_tag",
    "scene.add_resource",
    "scene.add_ui_node",
    "scene.set_transform",
    "scene.set_camera",
    "scene.set_component",
    "scene.set_stylized_nature",
    "scene.set_stylized_sparkles",
    "scene.set_ripple_water",
    "scene.set_camera_component",
    "scene.set_light",
    "scene.set_lifecycle",
    "scene.set_prefab",
    "scene.set_mesh_renderer",
    "scene.set_render_layers",
    "scene.set_rigid_body",
    "scene.set_spawner",
    "scene.set_collider",
    "scene.set_character_controller",
    "scene.set_visibility",
    "scene.remove_component",
    "scene.set_resource",
    "scene.attach_script",
    "scene.bind_ui",
    "ui.create",
    "ui.add_text",
    "ui.add_node",
    "ui.add_component",
    "ui.apply_recipe",
    "ui.remove_component",
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
  assert.deepEqual(transform?.adapters?.cli?.path, ["scene", "set-transform"]);
  assert.equal(camera?.arguments.find((argument) => argument.name === "mode")?.constraints?.enumValues?.includes("third-person-follow"), true);
  assert.equal(renderAuthoringOperationCliUsage("material.set")?.includes("--shader-json <json>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--bloom <true|false>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--ambient-occlusion <true|false>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--screen-space-reflections-roughness-limit <n>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--screen-space-global-illumination-intensity <n>"), true);
  assert.equal(renderAuthoringOperationCliUsage("runtime.set_rendering")?.includes("--screen-space-global-illumination-radius <n>"), true);
  assert.deepEqual(
    buildAuthoringOperationCliArgv("scene.set_transform", { entityId: "player", sceneId: "scene.arena", transform: { position: [1, 2, 3] } }, { projectPath: "/project" }),
    ["scene", "set-transform", "scene.arena", "player", "--position", "1,2,3", "--project", "/project", "--json"],
  );
  assert.throws(
    () => buildAuthoringOperationCliArgv("scene.add_entity", { entityId: "player", sceneId: "scene.arena" }, { projectPath: "/project" }),
    /missing CLI adapter metadata/,
  );
  assert.equal("dispatch" in (transform ?? {}), false);
  for (const descriptor of descriptors) {
    const namespace = descriptor.name.split(".")[0];
    assert.equal(descriptor.sourceFamily, namespace, `${descriptor.name} source family should match its namespace`);
    assert.equal("dispatch" in descriptor, false, `${descriptor.name} descriptor should not expose dispatch`);
  }
  descriptors[0]?.arguments.push({ name: "mutated", required: false, type: "string" });
  assert.equal(getAuthoringOperationDescriptor("asset.add")?.arguments.some((argument) => argument.name === "mutated"), false);
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_MISSING");
  assert.equal(missing.diagnostics[0]?.path, "/sceneId");
  assert.equal(invalidEnum.ok, false);
  assert.equal(invalidEnum.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_INVALID");
  assert.equal(invalidEnum.diagnostics[0]?.path, "/mode");
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

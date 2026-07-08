import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { reportWebConformance } from "./conformance.js";
import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

test("should report basic scene conformance semantics", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/basic-scene/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "basic-scene");

  assert.equal(report.fixture, "basic-scene");
  assert.equal(report.runtime, "web-three");
  assert.equal(report.activeCamera, "camera.main");
  assert.deepEqual(report.diagnostics, []);

  const cube = report.entities.find((entity) => entity.id === "cube.child");
  assert.ok(cube);
  assert.deepEqual(cube.components, ["Hierarchy", "MeshRenderer", "Transform"]);
  assert.equal(cube.parent, "scene.root");
  assert.equal(cube.mesh, "mesh.cube");
  assert.equal(cube.material, "mat.cube");
  assert.deepEqual(cube.meshRenderer, { castShadow: undefined, material: "mat.cube", mesh: "mesh.cube", receiveShadow: undefined, visible: undefined });
  assert.equal(cube.visibility?.runtimeVisible, true);

  const cubeMaterial = report.materials.find((material) => material.id === "mat.cube");
  assert.ok(cubeMaterial);
  assert.equal(cubeMaterial.roughness, 0.8);
  assert.equal(cubeMaterial.clearcoat, undefined);
  assert.equal(cubeMaterial.specularIntensity, undefined);
  assert.equal(cubeMaterial.transmission, undefined);
  assert.deepEqual(cubeMaterial.textures, {
    baseColor: undefined,
    clearcoat: undefined,
    clearcoatRoughness: undefined,
    emissive: undefined,
    metallicRoughness: undefined,
    normal: undefined,
    occlusion: undefined,
    specular: undefined,
    transmission: undefined,
  });

  const cubeMesh = report.assets.find((asset) => asset.id === "mesh.cube");
  assert.ok(cubeMesh);
  assert.equal(cubeMesh.kind, "mesh");
  assert.equal(cubeMesh.primitive, "box");
  assert.equal(report.assets.find((asset) => asset.id === "mesh.capsule")?.primitive, "capsule");
  assert.equal(report.assets.find((asset) => asset.id === "mesh.cylinder")?.primitive, "cylinder");
  assert.equal(report.entities.find((entity) => entity.id === "capsule.actor")?.mesh, "mesh.capsule");
  assert.equal(report.entities.find((entity) => entity.id === "cylinder.actor")?.mesh, "mesh.cylinder");

  assert.ok(report.entities.find((entity) => entity.id === "camera.main")?.components.includes("Camera"));
  assert.equal(report.entities.find((entity) => entity.id === "light.key")?.light?.kind, "directional");
});

test("should report promoted glTF material metadata", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/basic-scene/game.bundle"));
  bundle.gltfScene = {
    assets: [
      {
        assetId: "model.hero",
        customAttributes: [],
        materials: [
          {
            extensions: [{
              extension: "KHR_materials_clearcoat",
              path: "/materials/0/extensions/KHR_materials_clearcoat",
              properties: ["clearcoatFactor"],
              status: "promoted",
            }],
            material: "material:HeroVisor",
            textureTransforms: [],
          },
        ],
        morphTargets: [{ mesh: "mesh:Face", path: "/meshes/0/extras/targetNames/0", source: "mesh.extras.targetNames", target: "Smile" }],
        nodes: [],
      },
    ],
    schema: "threenative.gltf-scene",
    version: "0.1.0",
  };

  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "gltf-fidelity");

  assert.equal(report.gltfFidelity?.assets[0]?.assetId, "model.hero");
  assert.equal(report.gltfFidelity?.assets[0]?.materials[0]?.extensions[0]?.extension, "KHR_materials_clearcoat");
  assert.equal(report.gltfFidelity?.assets[0]?.morphTargets[0]?.target, "Smile");
});

test("should report promoted generated primitive mapping semantics", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/primitive-mapping/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "primitive-mapping");

  assert.equal(report.fixture, "primitive-mapping");
  assert.equal(report.runtime, "web-three");
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(primitiveAssets(report), [
    ["mesh.annulus", "annulus"],
    ["mesh.box", "box"],
    ["mesh.capsule", "capsule"],
    ["mesh.circle", "circle"],
    ["mesh.cone", "cone"],
    ["mesh.conical-frustum", "conicalFrustum"],
    ["mesh.cylinder", "cylinder"],
    ["mesh.extruded-rectangle", "extrudedRectangle"],
    ["mesh.plane", "plane"],
    ["mesh.regular-polygon", "regularPolygon"],
    ["mesh.sphere", "sphere"],
    ["mesh.torus", "torus"],
  ]);
  for (const [mesh] of primitiveAssets(report)) {
    const entity = report.entities.find((candidate) => candidate.mesh === mesh);
    assert.equal(entity?.material, "mat.primitive", mesh);
  }
});

test("should report resource and event conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/resources-events/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "resources-events");

  assert.equal(report.fixture, "resources-events");
  assert.deepEqual(report.resources, [{ id: "Score", value: { value: 3 } }]);
  assert.deepEqual(report.events, [{ id: "DamageEvent", values: [{ amount: 2, target: "player" }] }]);
});

test("should report V10 ECS tags and scene groups conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v10-ecs-tags-groups/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v10-ecs-tags-groups");

  assert.equal(report.fixture, "v10-ecs-tags-groups");
  assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.code), []);
  assert.equal(report.activeCamera, "camera.main");
  assert.deepEqual(report.systems, [
    {
      name: "laneTagProbe",
      queries: [
        {
          matchedEntities: ["cube.gold.0", "cube.gold.1", "cube.gold.2", "cube.red.0", "cube.red.1", "cube.red.2", "cube.teal.0", "cube.teal.1", "cube.teal.2"],
          with: ["ParallelMover", "Transform", "MotionLane"],
          without: [],
        },
        { matchedEntities: ["cube.red.0", "cube.red.2"], with: ["LaneRed", "ParallelMover"], without: ["PhaseCooldown"] },
        { matchedEntities: ["cube.teal.0", "cube.teal.2"], with: ["LaneTeal", "ParallelMover", "PhaseCooldown"], without: [] },
        { matchedEntities: ["cube.gold.0", "cube.gold.2", "cube.red.0", "cube.red.2"], with: ["PhaseActive", "ColorPhase"], without: ["LaneTeal"] },
        { matchedEntities: ["group.lane.gold", "group.lane.red", "group.lane.teal"], with: ["SceneContainer", "Transform"], without: ["ParallelMover"] },
      ],
    },
  ]);

  const group = report.entities.find((entity) => entity.id === "group.lane.red");
  assert.ok(group);
  assert.deepEqual(group.components, ["SceneContainer", "Transform"]);
  assert.equal(group.meshRenderer, undefined);
  assert.equal(group.camera, undefined);
  assert.equal(group.light, undefined);

  const redActive = report.entities.find((entity) => entity.id === "cube.red.0");
  assert.ok(redActive);
  assert.equal(redActive.parent, "group.lane.red");
  assert.equal(redActive.material, "mat.red.active");
  assert.deepEqual(redActive.components, ["ColorPhase", "Hierarchy", "LaneRed", "MeshRenderer", "MotionLane", "ParallelMover", "PhaseActive", "Transform"]);

  const tealCooldown = report.entities.find((entity) => entity.id === "cube.teal.0");
  assert.ok(tealCooldown);
  assert.equal(tealCooldown.parent, "group.lane.teal");
  assert.equal(tealCooldown.material, "mat.teal.cooldown");
  assert.deepEqual(tealCooldown.components, ["ColorPhase", "Hierarchy", "LaneTeal", "MeshRenderer", "MotionLane", "ParallelMover", "PhaseCooldown", "Transform"]);
});

test("should report scene lifecycle conformance trace", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/scene-lifecycle/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "scene-lifecycle");

  assert.equal(report.fixture, "scene-lifecycle");
  assert.equal(report.sceneLifecycle?.activeScene, "level");
  assert.deepEqual(
    report.sceneLifecycle?.trace.map((event) => `${event.scene}:${event.phase}:${event.reason}`),
    [
      "menu:preload:initial",
      "menu:enter:initial",
      "menu:active:initial",
      "menu:exit:change",
      "menu:unload:change",
      "level:preload:change",
      "level:enter:change",
      "level:active:change",
      "level:pause:push",
      "pause:preload:push",
      "pause:enter:push",
      "pause:active:push",
      "pause:exit:pop",
      "pause:unload:pop",
      "level:resume:pop",
      "level:active:pop",
    ],
  );
});

function primitiveAssets(report: ReturnType<typeof reportWebConformance>): Array<[string, string | undefined]> {
  return report.assets
    .filter((asset) => asset.kind === "mesh")
    .map((asset) => [asset.id, asset.primitive] as [string, string | undefined])
    .sort(([left], [right]) => left.localeCompare(right));
}

test("should report physics collision and trigger conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/physics-events/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "physics-events");

  assert.equal(report.fixture, "physics-events");
  assert.deepEqual(report.events, [
    {
      id: "CollisionEvent",
      values: [
        { a: "enemy", b: "player", phase: "enter" },
        { a: "crate", b: "worker", phase: "enter" },
      ],
    },
    { id: "TriggerEvent", values: [{ a: "pickup", b: "sensor", phase: "enter" }] },
  ]);
});

test("should report runtime orthographic camera conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v5-drift-surface/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v5-drift-surface");

  const camera = report.entities.find((entity) => entity.id === "camera.ortho")?.camera;
  assert.deepEqual(camera, {
    far: 100,
    fovY: undefined,
    kind: "orthographic",
    near: 0.1,
    runtime: {
      far: 100,
      kind: "orthographic",
      near: 0.1,
      size: 6,
    },
    size: 6,
  });
});

test("should report animation clip conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/animation-clips/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "animation-clips");

  assert.equal(report.fixture, "animation-clips");
  assert.deepEqual(report.assets.find((asset) => asset.id === "model.hero")?.animations, [
    { id: "idle", loop: true, speed: 1 },
    { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 },
  ]);
});

test("should report retained ui conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/retained-ui/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "retained-ui");

  assert.equal(report.fixture, "retained-ui");
  assert.deepEqual(report.ui, {
    root: {
      children: [
        {
          children: [
            { children: [], id: "hud.title", kind: "text", text: "Arena" },
            { accessibilityLabel: "Health", children: [], id: "hud.health", kind: "bar", max: 10, value: 7 },
            { action: "Pause", children: [], focusable: true, id: "hud.pause", kind: "button", label: "Pause" },
          ],
          id: "hud.stack",
          kind: "column",
        },
      ],
      id: "hud",
      kind: "stack",
    },
  });
});

test("should report audio playback conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/audio-playback/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "audio-playback");

  assert.equal(report.fixture, "audio-playback");
  assert.deepEqual(report.audio, {
    commands: [
      { asset: "arena.music", id: "music.arena", kind: "loop", volume: 0.4 },
      { asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot", volume: 0.75 },
    ],
  });
});

test("should report V9 environment lighting, light budgets, and renderer quality observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/rendering-lights/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "rendering-lights");

  assert.equal(report.environment?.skybox?.mode, "cubemap");
  assert.equal(report.environment?.environmentMap?.intent, "reflection-and-irradiance");
  assert.deepEqual(report.environment?.debugGizmos, ["instance:tree.hero", "lightProbe:probe.center", "sourceAsset:env.Tree"]);
  assert.deepEqual(report.environment?.hlodFades, [{ asset: "model.env.TreeLow", endDistance: 32, sourceAsset: "env.Tree", startDistance: 24 }]);
  assert.deepEqual(report.environment?.lodImpostors, [{ asset: "model.env.TreeLow", material: "mat.ground", mode: "cameraFacingQuad", sourceAsset: "env.Tree" }]);
  assert.deepEqual(report.environment?.sourceAssetVisibility, [{ endDistance: 96, id: "env.Tree", maxDistance: 120, minDistance: 0, startDistance: 72 }]);
  assert.deepEqual(report.environment?.instanceVisibility, [{ id: "tree.hero", maxDistance: 90, minDistance: 0 }]);

  assert.deepEqual(report.lightBudget, {
    culledLights: ["light.spot"],
    cullingPolicy: "nearest",
    dynamicLights: ["light.key", "light.point", "light.spot"],
    maximumShadowedPointLights: 0,
    maximumVisibleDynamicLights: 2,
    overBudget: true,
    shadowedPointLights: ["light.point"],
  });
  assert.deepEqual(report.entities.find((entity) => entity.id === "light.point")?.light?.shadowFilter, { mode: "pcf", quality: "high" });
  assert.equal(report.runtimeConfig?.renderer?.renderPath, "forward");
  assert.deepEqual(report.runtimeConfig?.renderer?.colorGrading, { contrast: 0.1, exposure: 1.1, saturation: 0.9, toneMapping: "aces" });
  assert.deepEqual(report.runtimeConfig?.renderer?.depthOfField, { aperture: 0.025, enabled: true, focusDistance: 8, maxBlur: 0.012 });
  assert.deepEqual(report.runtimeConfig?.renderer?.postProcessing?.applied, ["colorGrading", "depthOfField"]);
  assert.deepEqual(report.runtimeConfig?.renderer?.postProcessing?.skipped, []);
});

test("should report promoted render look profile settings", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/basic-scene/game.bundle"));
  bundle.runtimeConfig = {
    schema: "threenative.runtime-config",
    version: "0.1.0",
    renderer: {
      antialias: "msaa4",
      renderLook: {
        version: 1,
        profile: "stylized",
        overrides: { bloomIntensity: 0.4, exposure: 1.1, saturation: 1.15 },
      },
    },
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  };
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "basic-scene");

  assert.deepEqual(report.runtimeConfig?.renderer?.renderLook, {
    appliedProfile: "stylized",
    fallbacks: [],
    overrides: { bloomIntensity: 0.4, exposure: 1.1, saturation: 1.15 },
    requestedProfile: "stylized",
  });
  assert.deepEqual(report.runtimeConfig?.renderer?.bloom, { enabled: true, intensity: 0.4, threshold: 0.85 });
  assert.deepEqual(report.runtimeConfig?.renderer?.postProcessing?.applied, ["bloom", "colorGrading"]);
  assert.deepEqual(report.runtimeConfig?.renderer?.postProcessing?.skipped, []);
});

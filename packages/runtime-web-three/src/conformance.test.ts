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
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v6-resources-events/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v6-resources-events");

  assert.equal(report.fixture, "v6-resources-events");
  assert.deepEqual(report.resources, [{ id: "Score", value: { value: 3 } }]);
  assert.deepEqual(report.events, [{ id: "DamageEvent", values: [{ amount: 2, target: "player" }] }]);
});

function primitiveAssets(report: ReturnType<typeof reportWebConformance>): Array<[string, string | undefined]> {
  return report.assets
    .filter((asset) => asset.kind === "mesh")
    .map((asset) => [asset.id, asset.primitive] as [string, string | undefined])
    .sort(([left], [right]) => left.localeCompare(right));
}

test("should report physics collision and trigger conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v6-physics-events/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v6-physics-events");

  assert.equal(report.fixture, "v6-physics-events");
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
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v6-animation-clips/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v6-animation-clips");

  assert.equal(report.fixture, "v6-animation-clips");
  assert.deepEqual(report.assets.find((asset) => asset.id === "model.hero")?.animations, [
    { id: "idle", loop: true, speed: 1 },
    { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 },
  ]);
});

test("should report retained ui conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v6-retained-ui/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v6-retained-ui");

  assert.equal(report.fixture, "v6-retained-ui");
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
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v6-audio-playback/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v6-audio-playback");

  assert.equal(report.fixture, "v6-audio-playback");
  assert.deepEqual(report.audio, {
    commands: [
      { asset: "arena.music", id: "music.arena", kind: "loop", volume: 0.4 },
      { asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot", volume: 0.75 },
    ],
  });
});

test("should report local data conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v8-local-data/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v8-local-data");

  assert.equal(report.fixture, "v8-local-data");
  assert.deepEqual(report.localData, {
    checkpoints: [{ event: "CheckpointReached", id: "checkpoint.reached", saveSlot: "slot.autosave", schedule: "postUpdate" }],
    migrations: [
      {
        appliesTo: "slot.autosave",
        fromVersion: "0.9.0",
        hint: "Import the old progress value into PlayerProgress.level before loading this slot.",
        id: "progress-v0-to-v1",
        strategy: "diagnostic",
        toVersion: "1.0.0",
      },
    ],
    saveSlots: [
      {
        components: [{ component: "Checkpoint", entity: "player" }],
        id: "slot.autosave",
        label: "Autosave",
        maxBytes: 65536,
        resources: ["PlayerProgress"],
        version: "1.0.0",
      },
    ],
    settings: [
      { default: false, group: "accessibility", id: "accessibility.reducedMotion", kind: "boolean" },
      { default: 0.8, group: "audio", id: "audio.masterVolume", kind: "number", max: 1, min: 0 },
      { default: false, group: "controls", id: "controls.invertY", kind: "boolean" },
      { default: "windowed", group: "video", id: "video.displayMode", kind: "string", values: ["windowed", "fullscreen"] },
    ],
    storage: "local-only",
  });
});

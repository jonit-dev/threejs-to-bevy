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
  assert.deepEqual(report.diagnostics, []);

  const cube = report.entities.find((entity) => entity.id === "cube.child");
  assert.ok(cube);
  assert.deepEqual(cube.components, ["Hierarchy", "MeshRenderer", "Transform"]);
  assert.equal(cube.parent, "scene.root");
  assert.equal(cube.mesh, "mesh.cube");
  assert.equal(cube.material, "mat.cube");
  assert.deepEqual(cube.meshRenderer, { material: "mat.cube", mesh: "mesh.cube", visible: undefined });
  assert.equal(cube.visibility?.runtimeVisible, true);

  const cubeMaterial = report.materials.find((material) => material.id === "mat.cube");
  assert.ok(cubeMaterial);
  assert.equal(cubeMaterial.roughness, 0.8);
  assert.deepEqual(cubeMaterial.textures, {
    baseColor: undefined,
    emissive: undefined,
    metallicRoughness: undefined,
    normal: undefined,
    occlusion: undefined,
  });

  const cubeMesh = report.assets.find((asset) => asset.id === "mesh.cube");
  assert.ok(cubeMesh);
  assert.equal(cubeMesh.kind, "mesh");
  assert.equal(cubeMesh.primitive, "box");

  assert.ok(report.entities.find((entity) => entity.id === "camera.main")?.components.includes("Camera"));
  assert.equal(report.entities.find((entity) => entity.id === "light.key")?.light?.kind, "directional");
});

test("should report resource and event conformance observations", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v6-resources-events/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "v6-resources-events");

  assert.equal(report.fixture, "v6-resources-events");
  assert.deepEqual(report.resources, [{ id: "Score", value: { value: 3 } }]);
  assert.deepEqual(report.events, [{ id: "DamageEvent", values: [{ amount: 2, target: "player" }] }]);
});

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
            { children: [], id: "hud.health", kind: "bar", max: 10, value: 7 },
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
      { asset: "arena.music", id: "music.arena", kind: "loop" },
      { asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot" },
    ],
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { BoxGeometry } from "./geometry/primitives.js";
import { MeshStandardMaterial } from "./materials/MeshStandardMaterial.js";
import { defineEntity, definePrefabModule, defineResourceModule, defineSceneModule, defineWorldModule } from "./authoring.js";
import { defineComponent, defineResource } from "./ecs/schema.js";
import { SdkError } from "./errors.js";
import { primitiveActorPrefab } from "./prefab.js";

test("authoring scene modules should lower to scene lifecycle declarations", () => {
  const scene = defineSceneModule({
    id: "scene.arena",
    kind: "level",
    source: {
      sourceId: "scene.arena",
      sourcePath: "src/scenes/arena.ts",
    },
  });

  assert.equal(scene.id, "scene.arena");
  assert.equal(scene.kind, "level");
  assert.deepEqual(scene.authoring, {
    sourceId: "scene.arena",
    sourcePath: "src/scenes/arena.ts",
  });
});

test("authoring scene modules should reject invalid source metadata", () => {
  assert.throws(
    () => defineSceneModule({ id: "scene", kind: "level", source: { sourceId: "../scene" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_AUTHORING_SOURCE_ID_INVALID",
  );
  assert.throws(
    () => defineSceneModule({ id: "scene", kind: "level", source: { sourcePath: "dist/game.bundle" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_AUTHORING_SOURCE_PATH_INVALID",
  );
});

test("authoring entity and resource modules should lower to world declarations", () => {
  const Health = defineComponent("Health", { current: "number" });
  const Progress = defineResource("Progress", { checkpoint: "string" });
  const player = defineEntity({
    components: [Health({ current: 100 })],
    id: "player",
    source: { sourcePath: "src/entities/player.ts" },
    transform: { position: [1, 2, 3] },
  });
  const progress = defineResourceModule({
    id: "Progress",
    resource: Progress({ checkpoint: "start" }),
    source: { sourceId: "resource.Progress" },
  });
  const world = defineWorldModule({ entities: [player], resources: [progress] }).toJSON();

  assert.deepEqual(Object.keys(world.entities[0]?.components ?? {}), ["Health", "Transform"]);
  assert.deepEqual(world.entities[0]?.components.Transform, { position: [1, 2, 3] });
  assert.deepEqual(world.resources.Progress, { checkpoint: "start" });
});

test("authoring prefab modules should apply deterministic component overrides", () => {
  const Health = defineComponent("Health", { current: "number" });
  const Team = defineComponent("Team", { id: "string" });
  const prefab = primitiveActorPrefab({
    components: [Health({ current: 100 })],
    geometry: new BoxGeometry({ size: [1, 1, 1] }),
    id: "prefab.kart",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  });
  const variant = definePrefabModule({
    componentOverrides: [Team({ id: "blue" }), Health({ current: 150 })],
    id: "prefab.kart.blue",
    prefab,
  });

  assert.deepEqual(
    variant.components.map((component) => [component.schema.name, component.data]),
    [
      ["Health", { current: 150 }],
      ["Team", { id: "blue" }],
      ["Transform", {}],
    ],
  );
});

test("authoring declarations should reject runtime handles in source data", () => {
  const RuntimeBacked = defineComponent("RuntimeBacked", { value: "string" });
  assert.throws(
    () => defineEntity({ components: [RuntimeBacked({ runtimeHandle: { id: 1 } })], id: "bad.entity" }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_AUTHORING_RUNTIME_HANDLE_UNSUPPORTED",
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { BoxGeometry } from "./geometry/primitives.js";
import { MeshStandardMaterial } from "./materials/MeshStandardMaterial.js";
import { World } from "./ecs/World.js";
import { defineComponent } from "./ecs/schema.js";
import { SdkError } from "./errors.js";
import { modelActorPrefab, primitiveActorPrefab } from "./prefab.js";

test("should expand primitive actor prefab into deterministic declarations", () => {
  const Player = defineComponent("Player", { speed: "number" });
  const prefab = primitiveActorPrefab({
    components: [Player({ speed: 2.4 })],
    geometry: new BoxGeometry({ size: [0.5, 0.5, 0.5] }),
    id: "player",
    material: new MeshStandardMaterial({ color: "#2f80ed" }),
    position: [1, 2, 3],
    scale: [0.5, 0.5, 0.5],
  });

  const world = new World().spawn(prefab.id, ...prefab.components);
  const snapshot = world.toJSON();
  const [entity] = snapshot.entities;
  assert.ok(entity);
  const transform = entity.components.Transform;
  assert.ok(transform);

  assert.equal(prefab.mesh.id, "player");
  assert.deepEqual(prefab.mesh.position.toArray(), [1, 2, 3]);
  assert.deepEqual(
    prefab.components.map((component) => component.schema.name),
    ["Player", "Transform"],
  );
  assert.deepEqual(transform.position, [1, 2, 3]);
  assert.deepEqual(transform.scale, [0.5, 0.5, 0.5]);
});

test("should expand model actor prefab into deterministic metadata declarations", () => {
  const prefab = modelActorPrefab({ asset: "model.hero", id: "hero", position: [0, 1, 0] });

  assert.equal(prefab.mesh, undefined);
  assert.deepEqual(
    prefab.components.map((component) => component.schema.name),
    ["ModelAsset", "Transform"],
  );
  assert.deepEqual(prefab.components[0]?.data, { asset: "model.hero" });
});

test("should reject unsupported prefab behavior when runtime contract is missing", () => {
  assert.throws(
    () =>
      primitiveActorPrefab({
        geometry: new BoxGeometry(),
        id: "player",
        material: new MeshStandardMaterial(),
        unsupported: { rawRendererHook: true },
      }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_PREFAB_UNSUPPORTED_RENDERER_HOOK",
  );
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchAuthoringOperation, getAuthoringOperationDescriptor } from "./operationRegistry.js";
import { validateAuthoringProject } from "./operations.js";

const body = {
  dragArea: [1, 0.5, 2],
  maxForce: 5_000,
  surfaces: [{
    area: 2,
    aspectRatio: 5,
    centerOfPressure: [0, 0, 0.5],
    dragCurve: [{ angle: -1, coefficient: 0.1 }, { angle: 1, coefficient: 0.1 }],
    id: "main-wing",
    liftCurve: [{ angle: -1, coefficient: -0.5 }, { angle: 1, coefficient: 0.5 }],
    recoveryAngle: 0.3,
    stallAngle: 0.5,
  }],
};

const volume = { airDensity: 1.1, gust: { amplitude: [1, 0, 0], frequency: 0.5, seed: 7 }, shape: "box", size: [10, 5, 10], velocity: [2, 0, 0] };

test("aerodynamics and wind operations derive CLI/editor metadata and round trip source", async () => {
  assert.deepEqual(getAuthoringOperationDescriptor("physics.aerodynamics.add")?.adapters?.cli?.path, ["physics", "aerodynamics", "add"]);
  assert.deepEqual(getAuthoringOperationDescriptor("physics.wind.add")?.adapters?.cli?.path, ["physics", "wind", "add"]);
  const root = await project();
  try {
    const addBody = await dispatchAuthoringOperation({ args: { body, entityId: "craft", sceneId: "arena" }, name: "physics.aerodynamics.add", projectPath: root });
    const addWind = await dispatchAuthoringOperation({ args: { entityId: "gust", sceneId: "arena", volume }, name: "physics.wind.add", projectPath: root });
    assert.equal(addBody.ok, true, JSON.stringify(addBody.diagnostics));
    assert.equal(addWind.ok, true, JSON.stringify(addWind.diagnostics));
    const inspect = await dispatchAuthoringOperation({ args: { entityId: "craft", sceneId: "arena" }, name: "physics.aerodynamics.inspect", projectPath: root });
    assert.deepEqual("body" in inspect ? inspect.body : undefined, body);
    const validate = await dispatchAuthoringOperation({ args: { entityId: "gust", sceneId: "arena" }, name: "physics.wind.validate", projectPath: root });
    assert.equal("valid" in validate ? validate.valid : false, true);
    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as { entities: Array<{ components?: Record<string, unknown>; id: string }> };
    assert.deepEqual(scene.entities.find((entity) => entity.id === "craft")?.components?.AerodynamicBody, body);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "gust")?.components?.WindVolume, volume);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("aerodynamics operations and project validation reject invalid bounded payloads", async () => {
  const root = await project();
  try {
    const invalidBody = await dispatchAuthoringOperation({ args: { body: { ...body, unknown: true }, entityId: "craft", sceneId: "arena" }, name: "physics.aerodynamics.add", projectPath: root });
    assert.equal(invalidBody.ok, false);
    assert.ok(invalidBody.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_BODY_FIELD_UNSUPPORTED"));
    const invalidWind = await dispatchAuthoringOperation({ args: { entityId: "gust", sceneId: "arena", volume: { shape: "sphere", velocity: [0, 0, 0] } }, name: "physics.wind.add", projectPath: root });
    assert.equal(invalidWind.ok, false);
    assert.ok(invalidWind.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_WIND_RADIUS_INVALID"));
    const scenePath = join(root, "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as { entities: Array<{ components?: Record<string, unknown>; id: string }> };
    scene.entities.find((entity) => entity.id === "gust")!.components = { WindVolume: { shape: "box", size: [-1, 2, 3], velocity: [0, 0, 0] } };
    await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
    const validation = await validateAuthoringProject({ projectPath: root });
    assert.ok(validation.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_WIND_SIZE_INVALID"));
  } finally { await rm(root, { force: true, recursive: true }); }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-aerodynamics-ops-"));
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
    schema: "threenative.scene",
    version: "0.1.0",
    id: "arena",
    entities: [
      { id: "craft", components: { RigidBody: { kind: "dynamic", mass: 80 } } },
      { id: "gust", components: {} },
    ],
  }, null, 2)}\n`);
  return root;
}

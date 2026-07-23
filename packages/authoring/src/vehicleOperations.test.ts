import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { IVehicleControllerComponent } from "@threenative/ir";

import { buildAuthoringOperationCliArgv, dispatchAuthoringOperation, getAuthoringOperationDescriptor, listAuthoringOperationDescriptors, renderAuthoringOperationCliUsage } from "./operationRegistry.js";
import { addVehicleController, inspectVehicleController } from "./operations/physics.js";

const controller = {
  engine: { torqueCurve: [{ rpm: 900, torque: 160 }, { rpm: 6500, torque: 90 }], idleRpm: 900, redlineRpm: 6500, engineBraking: 0.12 },
  transmission: { forwardRatios: [3.1, 1.9], reverseRatio: 3, finalDrive: 3.7, clutchResponse: 0.2, shiftPolicy: "manual" },
  differential: { kind: "limited-slip", limitedSlipRatio: 2.5 },
  steering: { speedCurve: [{ speed: 0, scale: 1 }, { speed: 40, scale: 0.35 }] },
  brakes: { frontBias: 0.62, handbrakeWheelIds: ["rear.left", "rear.right"] },
} satisfies IVehicleControllerComponent;

test("vehicle add clones the typed component at the generic component boundary", async () => {
  const root = await project();
  try {
    const authored = structuredClone(controller);
    const added = await addVehicleController({ controller: authored, entityId: "car", projectPath: root, sceneId: "arena" });
    assert.equal(added.ok, true, JSON.stringify(added.diagnostics));
    authored.engine.idleRpm = 1_100;
    const inspected = await inspectVehicleController({ entityId: "car", projectPath: root, sceneId: "arena" });
    assert.deepEqual("controller" in inspected ? inspected.controller : undefined, controller);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("vehicle operations derive CLI metadata and validate against the complete scene", async () => {
  assert.deepEqual(getAuthoringOperationDescriptor("physics.vehicle.add")?.adapters?.cli?.path, ["physics", "vehicle", "add"]);
  const root = await project();
  try {
    const add = await dispatchAuthoringOperation({ args: { controller, entityId: "car", sceneId: "arena" }, name: "physics.vehicle.add", projectPath: root });
    assert.equal(add.ok, true, JSON.stringify(add.diagnostics));
    const inspect = await dispatchAuthoringOperation({ args: { entityId: "car", sceneId: "arena" }, name: "physics.vehicle.inspect", projectPath: root });
    assert.ok("controller" in inspect);
    assert.deepEqual(inspect.controller, controller);
    const validate = await dispatchAuthoringOperation({ args: { entityId: "car", sceneId: "arena" }, name: "physics.vehicle.validate", projectPath: root });
    assert.ok("valid" in validate);
    assert.equal(validate.valid, true);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("vehicle descriptor cards are the single CLI, editor, MCP, and API metadata owner", () => {
  const cards = listAuthoringOperationDescriptors().filter((item) => item.name.startsWith("physics.vehicle."));
  assert.deepEqual(cards.map((item) => item.name), ["physics.vehicle.add", "physics.vehicle.set", "physics.vehicle.remove", "physics.vehicle.inspect", "physics.vehicle.validate"]);
  for (const card of cards) {
    assert.equal(card.adapters?.editor?.surface, "api");
    assert.deepEqual(getAuthoringOperationDescriptor(card.name), card);
    assert.match(renderAuthoringOperationCliUsage(card.name) ?? "", new RegExp(card.adapters!.cli!.path.join(" ")));
  }
  assert.deepEqual(buildAuthoringOperationCliArgv("physics.vehicle.inspect", { sceneId: "arena", entityId: "car" }, { projectPath: "/project" }), ["physics", "vehicle", "inspect", "arena", "car", "--project", "/project", "--json"]);
});

test("vehicle add rejects invalid normalized drivetrain fields", async () => {
  const root = await project();
  try {
    const result = await dispatchAuthoringOperation({ args: { controller: { ...controller, brakes: { ...controller.brakes, frontBias: 2 } }, entityId: "car", sceneId: "arena" }, name: "physics.vehicle.add", projectPath: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_VEHICLE_BRAKE_BIAS_INVALID"));
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("vehicle add rejects a drivetrain disconnected from every authored wheel", async () => {
  const root = await project(false);
  try {
    const result = await dispatchAuthoringOperation({ args: { controller, entityId: "car", sceneId: "arena" }, name: "physics.vehicle.add", projectPath: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_VEHICLE_DRIVEN_WHEELS_MISSING" && item.path?.endsWith("/WheelAssembly/wheels") === true));
  } finally { await rm(root, { force: true, recursive: true }); }
});

async function project(driven = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-vehicle-ops-"));
  await mkdir(join(root, "content/scenes"), { recursive: true });
  const wheel = (id: string, visual: string, z: number) => ({ id, visual, attachment: [id.endsWith("left") ? -0.8 : 0.8, -0.3, z], radius: 0.35, width: 0.2, suspension: { travel: 0.2, springRate: 30_000, damperRate: 3_500 }, driven, steering: z < 0, braked: true, tire: "tire.default" });
  const entities = [
    { id: "car", components: { Collider: { kind: "box", size: [1.6, 0.4, 3] }, RigidBody: { kind: "dynamic", mass: 1000 }, Transform: { position: [0, 1, 0] }, WheelAssembly: { maxSteeringAngle: 0.6, maxSuspensionForce: 10_000, maxTireForce: 5_000, wheels: [wheel("front.left", "visual.fl", -1.2), wheel("front.right", "visual.fr", -1.2), wheel("rear.left", "visual.rl", 1.2), wheel("rear.right", "visual.rr", 1.2)] } } },
    { id: "tire.default", components: { TireModel: { lateralSlipCurve: [{ slip: 0, grip: 1 }, { slip: 1, grip: 1 }], loadSensitivity: 0, longitudinalSlipCurve: [{ slip: 0, grip: 1 }, { slip: 1, grip: 1 }], rollingResistance: 0 }, Transform: { position: [0, 0, 0] } } },
    ...["visual.fl", "visual.fr", "visual.rl", "visual.rr"].map((id) => ({ id })),
  ];
  await writeFile(join(root, "content/scenes/arena.scene.json"), JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "arena", entities }, null, 2) + "\n");
  return root;
}

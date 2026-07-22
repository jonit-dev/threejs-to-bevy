import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dispatch } from "./index.js";

test("physics vehicle CLI dispatches descriptor-backed add, inspect, validate, and invalid diagnostics as JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-vehicle-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    const world = JSON.parse(await readFile(new URL("../../ir/fixtures/conformance/advanced-physics-drivetrain/game.bundle/world.ir.json", import.meta.url), "utf8"));
    const chassis = world.entities.find((entity: any) => entity.id === "chassis"); const controller = structuredClone(chassis.components.VehicleController); delete chassis.components.VehicleController;
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "arena", entities: world.entities }, null, 2)}\n`);
    const add = await dispatch(["physics", "vehicle", "add", "arena", "chassis", "--controller", JSON.stringify(controller), "--project", root, "--json"]);
    const inspect = await dispatch(["physics", "vehicle", "inspect", "arena", "chassis", "--project", root, "--json"]);
    const validate = await dispatch(["physics", "vehicle", "validate", "arena", "chassis", "--project", root, "--json"]);
    assert.equal(add.exitCode, 0, add.stdout); assert.equal(inspect.exitCode, 0, inspect.stdout); assert.equal(validate.exitCode, 0, validate.stdout);
    assert.deepEqual(JSON.parse(inspect.stdout).controller, controller); assert.equal(JSON.parse(validate.stdout).valid, true);
    const invalid = await dispatch(["physics", "vehicle", "add", "arena", "chassis", "--controller", JSON.stringify({ ...controller, brakes: { ...controller.brakes, frontBias: 2 } }), "--project", root, "--json"]);
    assert.notEqual(invalid.exitCode, 0); assert.ok(JSON.parse(invalid.stdout).diagnostics.some((item: any) => item.code === "TN_IR_PHYSICS_VEHICLE_BRAKE_BIAS_INVALID"));
  } finally { await rm(root, { force: true, recursive: true }); }
});

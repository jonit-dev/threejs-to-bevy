import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatch } from "./index.js";

test("physics aerodynamics CLI dispatches descriptor-backed body and wind operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-aerodynamics-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    const world = JSON.parse(await readFile(new URL("../../ir/fixtures/conformance/advanced-physics-aerodynamics/game.bundle/world.ir.json", import.meta.url), "utf8"));
    const craft = world.entities.find((entity: any) => entity.id === "craft");
    const gust = world.entities.find((entity: any) => entity.id === "wind.gust");
    const body = structuredClone(craft.components.AerodynamicBody);
    const volume = structuredClone(gust.components.WindVolume);
    delete craft.components.AerodynamicBody;
    delete gust.components.WindVolume;
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "arena", entities: world.entities }, null, 2)}\n`);

    const addBody = await dispatch(["physics", "aerodynamics", "add", "arena", "craft", "--body", JSON.stringify(body), "--project", root, "--json"]);
    const inspectBody = await dispatch(["physics", "aerodynamics", "inspect", "arena", "craft", "--project", root, "--json"]);
    const validateBody = await dispatch(["physics", "aerodynamics", "validate", "arena", "craft", "--project", root, "--json"]);
    const addWind = await dispatch(["physics", "wind", "add", "arena", "wind.gust", "--volume", JSON.stringify(volume), "--project", root, "--json"]);
    const inspectWind = await dispatch(["physics", "wind", "inspect", "arena", "wind.gust", "--project", root, "--json"]);
    const validateWind = await dispatch(["physics", "wind", "validate", "arena", "wind.gust", "--project", root, "--json"]);

    for (const result of [addBody, inspectBody, validateBody, addWind, inspectWind, validateWind]) assert.equal(result.exitCode, 0, result.stdout);
    assert.deepEqual(JSON.parse(inspectBody.stdout).body, body);
    assert.deepEqual(JSON.parse(inspectWind.stdout).volume, volume);
    assert.equal(JSON.parse(validateBody.stdout).valid, true);
    assert.equal(JSON.parse(validateWind.stdout).valid, true);

    const invalid = await dispatch(["physics", "wind", "add", "arena", "wind.gust", "--volume", JSON.stringify({ shape: "sphere", velocity: [0, 0, 0] }), "--project", root, "--json"]);
    assert.notEqual(invalid.exitCode, 0);
    assert.ok(JSON.parse(invalid.stdout).diagnostics.some((item: any) => item.code === "TN_IR_PHYSICS_WIND_RADIUS_INVALID"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

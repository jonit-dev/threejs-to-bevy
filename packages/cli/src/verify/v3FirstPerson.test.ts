import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV3FirstPerson } from "./v3FirstPerson.js";

test("v3FirstPerson should include bookmark checks and walkthrough trace", async () => {
  const root = await makeBundle(true);
  try {
    const report = await verifyV3FirstPerson({ artifactDir: root, bundlePath: root });

    assert.equal(report.status, "pass");
    assert.equal(report.moved, true);
    assert.deepEqual(report.bookmarks, ["bend", "mid", "start"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3FirstPerson should fail when camera does not have controller config", async () => {
  const root = await makeBundle(false);
  try {
    const report = await verifyV3FirstPerson({ artifactDir: root, bundlePath: root });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V3_FIRST_PERSON_CONTROLLER_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBundle(includeController: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-first-person-"));
  await mkdir(join(root, "assets/environment"), { recursive: true });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "first-person",
    entry: { world: "world.ir.json", environmentScene: "environment.scene.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    requiredCapabilities: {},
  });
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
  await writeJson(root, "environment.scene.json", {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    path: { id: "path.main", points: [[0, 0, 3], [0, 0, -3]], width: 2 },
    sourceAssets: [],
    instances: [],
    bookmarks: [
      { id: "start", position: [0, 1.7, 4], yaw: 180, pitch: -5 },
      { id: "mid", position: [0, 1.7, 0], yaw: 180, pitch: -5 },
      { id: "bend", position: [1, 1.7, -3], yaw: 180, pitch: -5 },
    ],
    ...(includeController
      ? {
          controller: {
            acceleration: 18,
            camera: "camera.firstPerson",
            height: 1.7,
            input: { backward: "MoveBackward", forward: "MoveForward", left: "MoveLeft", lookX: "LookX", lookY: "LookY", right: "MoveRight" },
            maxSpeed: 4.5,
            pitch: { min: -75, max: 75 },
            pointerLock: "required",
            sensitivity: 0.0025,
          },
        }
      : {}),
  });
  return root;
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "@threenative/sdk";

import { emitBundle } from "./bundle.js";

test("should emit deterministic cube bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-"));
  try {
    await mkdir(join(root, "dist"));
    const scene = makeScene();
    const config = {
      entry: "src/game.ts",
      outDir: "dist/first.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };
    const first = await emitBundle(config, scene);
    const firstWorld = await readFile(join(first, "world.ir.json"), "utf8");
    const second = await emitBundle({ ...config, outDir: "dist/second.bundle" }, scene);
    const secondWorld = await readFile(join(second, "world.ir.json"), "utf8");

    assert.equal(firstWorld, secondWorld);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeScene(): Scene {
  const scene = new Scene({ id: "scene" });
  const mesh = new Mesh({
    id: "cube.main",
    geometry: new BoxGeometry(),
    material: new MeshStandardMaterial({ color: "#2f80ed" }),
  });
  const camera = new PerspectiveCamera({ id: "camera.main", fovY: 60, near: 0.1, far: 100 });
  scene.add(mesh);
  scene.add(camera);
  scene.setActiveCamera(camera);
  return scene;
}

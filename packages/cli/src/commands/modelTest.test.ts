import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { modelTestCommand } from "./modelTest.js";

const fixtureGltf = {
  asset: { version: "2.0", generator: "model-test-command-test" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, translation: [1, 0, -2], scale: [2, 1, 1] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ type: "VEC3", min: [-0.5, 0, -1], max: [0.5, 2, 1] }],
  images: [{ uri: "textures/kart.png" }],
  buffers: [{ uri: "mesh.bin", byteLength: 12 }],
};

test("model-test should generate a one-model proof project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-"));
  try {
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await modelTestCommand([join(root, "kart.gltf"), "--out", "proof", "--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; files: Array<{ path: string; role: string }>; outDir: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.equal(payload.outDir, join(root, "proof"));
    assert.equal(payload.files.some((file) => file.role === "source" && file.path.endsWith("src/game.ts")), true);
    assert.equal(payload.files.some((file) => file.role === "image-dependency" && file.path.endsWith("assets/textures/kart.png")), true);

    const source = await readFile(join(root, "proof", "src", "game.ts"), "utf8");
    assert.match(source, /modelAsset\("model\.under-test", "assets\/kart\.gltf"\)/);
    assert.match(source, /scale\.ruler\.1m/);
    assert.match(source, /model\.bounds\.reference/);

    const readme = await readFile(join(root, "proof", "README.md"), "utf8");
    assert.match(readme, /ThreeNative model test/);
    assert.match(readme, /1 meter orange ruler/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should require an asset path", async () => {
  const result = await modelTestCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_MODEL_TEST_USAGE");
});

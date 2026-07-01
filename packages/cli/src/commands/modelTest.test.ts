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

    const result = await modelTestCommand([join(root, "kart.gltf"), "--out", "proof", "--verify", "--json"], root);
    const payload = JSON.parse(result.stdout) as {
      analysis: {
        cameraFrustum: { fovDegrees: number; near: number; far: number; recommendedDistance: number };
        isolationCaveat: string;
        projectedScreenOccupancy?: number;
        scalePresets: Array<{ name: string; scale: number }>;
        scaleVerdict: string;
      };
      code: string;
      files: Array<{ path: string; role: string }>;
      outDir: string;
      verified?: { bundlePath?: string; ok: boolean };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.equal(payload.outDir, join(root, "proof"));
    assert.deepEqual(payload.analysis.scalePresets.map((preset) => preset.name), ["1x", "fit-target", "gameplay-recommended"]);
    assert.equal(payload.analysis.scaleVerdict, "ok");
    assert.equal(payload.analysis.cameraFrustum.fovDegrees, 50);
    assert.equal(payload.analysis.isolationCaveat.includes("does not prove the model is framed correctly in the final game"), true);
    assert.equal(payload.verified?.ok, true);
    assert.equal(payload.verified?.bundlePath, join(root, "proof", "dist", "model-test.bundle"));
    assert.equal(payload.files.some((file) => file.role === "source" && file.path.endsWith("content/scenes/model-test.scene.json")), true);
    assert.equal(payload.files.some((file) => file.role === "image-dependency" && file.path.endsWith("assets/textures/kart.png")), true);

    const source = JSON.parse(await readFile(join(root, "proof", "content", "scenes", "model-test.scene.json"), "utf8")) as {
      entities: Array<{ id: string }>;
      prefabs: Array<{ asset?: string; id: string }>;
    };
    assert.equal(source.prefabs.some((prefab) => prefab.id === "prefab.model-under-test" && prefab.asset === "assets/kart.gltf"), true);
    assert.equal(source.entities.some((entity) => entity.id === "scale.ruler.1m"), true);
    assert.equal(source.entities.some((entity) => entity.id === "model.bounds.reference"), true);

    const readme = await readFile(join(root, "proof", "README.md"), "utf8");
    assert.match(readme, /ThreeNative model test/);
    assert.match(readme, /1 meter orange ruler/);
    assert.match(readme, /Scale presets: 1x=1, fit-target=/);
    assert.match(readme, /Scale verdict: ok/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should report screenshot unavailable without a preview url", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-screenshot-"));
  try {
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await modelTestCommand([join(root, "kart.gltf"), "--out", "proof", "--screenshot", "--json"], root);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      screenshot: { code: string; nextCommand: string; status: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.equal(payload.screenshot.status, "unavailable");
    assert.equal(payload.screenshot.code, "TN_MODEL_TEST_SCREENSHOT_UNAVAILABLE");
    assert.match(payload.screenshot.nextCommand, /--screenshot --url <preview-url>/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should capture screenshot when a preview url is provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-capture-"));
  try {
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);
    const html = encodeURIComponent("<!doctype html><canvas width=\"320\" height=\"200\"></canvas>");

    const result = await modelTestCommand([
      join(root, "kart.gltf"),
      "--out",
      "proof",
      "--screenshot",
      "--url",
      `data:text/html,${html}`,
      "--json",
    ], root);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      screenshot: { byteSize: number; outPath: string; status: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.equal(payload.screenshot.status, "captured");
    assert.equal(payload.screenshot.outPath, join(root, "proof", "artifacts", "model-test.png"));
    assert.equal(payload.screenshot.byteSize > 0, true);
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

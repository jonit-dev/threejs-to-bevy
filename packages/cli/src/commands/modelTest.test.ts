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

const validPositionBuffer = Buffer.from(new Float32Array([
  -0.5, 0, 0,
  0.5, 0, 0,
  0, 1, 0,
]).buffer).toString("base64");

const validFixtureGltf = {
  asset: { version: "2.0", generator: "model-test-command-valid-test" },
  buffers: [{ byteLength: 36, uri: `data:application/octet-stream;base64,${validPositionBuffer}` }],
  bufferViews: [{ buffer: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, max: [0.5, 1, 0], min: [-0.5, 0, 0], type: "VEC3" }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
  nodes: [{ mesh: 0 }],
  scene: 0,
  scenes: [{ nodes: [0] }],
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
      entities: Array<{ id: string; transform?: { position?: number[]; scale?: number[] } }>;
      prefabs: Array<{ asset?: string; id: string }>;
    };
    assert.equal(source.prefabs.some((prefab) => prefab.id === "prefab.model-under-test" && prefab.asset === "assets/kart.gltf"), true);
    assert.equal(source.entities.some((entity) => entity.id === "scale.ruler.1m"), true);
    assert.equal(source.entities.some((entity) => entity.id === "model.bounds.reference"), true);
    const boundsMarker = source.entities.find((entity) => entity.id === "model.bounds.reference")?.transform;
    assert.equal((boundsMarker?.position?.[2] ?? 0) + (boundsMarker?.scale?.[2] ?? 0) / 2 < 0, true);

    const readme = await readFile(join(root, "proof", "README.md"), "utf8");
    assert.match(readme, /ThreeNative model test/);
    assert.match(readme, /1 meter orange ruler/);
    assert.match(readme, /Scale presets: 1x=1, fit-target=/);
    assert.match(readme, /Scale verdict: ok/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should capture a self-hosted screenshot when url is omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-screenshot-"));
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);

    const result = await modelTestCommand([join(root, "triangle.gltf"), "--out", "proof", "--screenshot", "--json"], root);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      screenshot: { checks: { nonblank?: { ok: boolean } }; diagnostics?: Array<{ code: string }>; outPath: string; status: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.equal(payload.screenshot.status, "captured");
    assert.equal(payload.screenshot.checks.nonblank?.ok, true);
    assert.deepEqual(payload.screenshot.diagnostics, []);
    assert.equal(payload.screenshot.outPath, join(root, "proof", "artifacts", "model-test.png"));
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

test("model-test should apply model yaw when angle is supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-angle-"));
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
      "--angle",
      "45",
      "--url",
      `data:text/html,${html}`,
      "--json",
    ], root);
    const payload = JSON.parse(result.stdout) as { code: string };
    const source = JSON.parse(await readFile(join(root, "proof", "content", "scenes", "model-test.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[]; rotation?: number[]; scale?: number[] } }>;
    };
    const model = source.entities.find((entity) => entity.id === "model.under-test.instance");

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.deepEqual(model?.transform?.position, [-1, 0, 2]);
    assert.deepEqual(model?.transform?.rotation, [0, 0.785398, 0]);
    assert.deepEqual(model?.transform?.scale, [1, 1, 1]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should start an interactive self-hosted preview", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-view-"));
  let server: Awaited<ReturnType<typeof modelTestCommand>>["server"];
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);
    const result = await modelTestCommand([join(root, "triangle.gltf"), "--view", "--out", "proof", "--json"], root);
    server = result.server;
    const payload = JSON.parse(result.stdout) as { code: string; preview?: { bundlePath: string; url: string } };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.match(payload.preview?.url ?? "", /^http:\/\/127\.0\.0\.1:/);
    assert.equal(payload.preview?.bundlePath, join(root, "proof", "dist", "model-test.bundle"));
  } finally {
    await server?.close();
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should reject incompatible inspection modes before source generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-mode-"));
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);
    const result = await modelTestCommand([join(root, "triangle.gltf"), "--view", "--screenshot", "--out", "proof", "--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_MODEL_TEST_MODE_CONFLICT");
    await assert.rejects(readFile(join(root, "proof", "content", "scenes", "model-test.scene.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should capture normalized angles in requested order", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-turntable-"));
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);
    const result = await modelTestCommand([
      join(root, "triangle.gltf"),
      "--angles",
      "0,90,450,-90",
      "--out",
      "proof",
      "--json",
    ], root);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      turntable: { captures: Array<{ angleDegrees: number; byteSize: number; checks: { nonblank?: { ok: boolean } }; outPath: string }>; manifestPath: string };
    };
    const manifest = JSON.parse(await readFile(join(root, "proof", "artifacts", "turntable", "manifest.json"), "utf8")) as {
      angles: number[];
      captures: Array<{ angleDegrees: number; byteSize: number; checks: { nonblank?: { ok: boolean } }; outPath: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_MODEL_TEST_OK");
    assert.deepEqual(payload.turntable.captures.map((capture) => capture.angleDegrees), [0, 90, 270]);
    assert.deepEqual(manifest.angles, [0, 90, 270]);
    assert.deepEqual(manifest.captures.map((capture) => capture.angleDegrees), [0, 90, 270]);
    assert.equal(manifest.captures.every((capture) => capture.byteSize > 0 && capture.checks.nonblank?.ok === true), true);
    assert.equal(payload.turntable.manifestPath, join(root, "proof", "artifacts", "turntable", "manifest.json"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should reject invalid or excessive turntable angles without captures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-turntable-invalid-"));
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);
    const invalid = await modelTestCommand([join(root, "triangle.gltf"), "--angles", "0,,90", "--out", "proof", "--json"], root);
    const excessive = await modelTestCommand([
      join(root, "triangle.gltf"),
      "--angles",
      Array.from({ length: 37 }, (_, index) => String(index)).join(","),
      "--out",
      "proof-2",
      "--json",
    ], root);

    assert.equal(JSON.parse(invalid.stdout).code, "TN_MODEL_TEST_ANGLES_INVALID");
    assert.equal(JSON.parse(excessive.stdout).code, "TN_MODEL_TEST_ANGLES_INVALID");
    await assert.rejects(readFile(join(root, "proof", "content", "scenes", "model-test.scene.json")));
    await assert.rejects(readFile(join(root, "proof-2", "content", "scenes", "model-test.scene.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should restore zero-yaw source and bundle after turntable capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-turntable-restore-"));
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);
    const result = await modelTestCommand([join(root, "triangle.gltf"), "--angles", "45,135", "--out", "proof", "--json"], root);
    const source = JSON.parse(await readFile(join(root, "proof", "content", "scenes", "model-test.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { rotation?: number[] } }>;
    };
    const world = JSON.parse(await readFile(join(root, "proof", "dist", "model-test.bundle", "world.ir.json"), "utf8")) as {
      entities: Array<{ id: string; components?: { Transform?: { rotation?: number[] } } }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(source.entities.find((entity) => entity.id === "model.under-test.instance")?.transform?.rotation, [0, 0, 0]);
    assert.deepEqual(world.entities.find((entity) => entity.id === "model.under-test.instance")?.components?.Transform?.rotation, [0, 0, 0, 1]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("model-test should close preview and report completed captures when a later capture fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-model-test-turntable-failure-"));
  try {
    await writeFile(join(root, "triangle.gltf"), `${JSON.stringify(validFixtureGltf, null, 2)}\n`);
    await mkdir(join(root, "proof", "artifacts", "turntable", "model-test-yaw-090.png"), { recursive: true });
    const result = await modelTestCommand([join(root, "triangle.gltf"), "--angles", "0,90", "--out", "proof", "--json"], root);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      turntable: { captures: Array<{ angleDegrees: number; outPath: string }> };
    };
    const source = JSON.parse(await readFile(join(root, "proof", "content", "scenes", "model-test.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { rotation?: number[] } }>;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_MODEL_TEST_CAPTURE_FAILED");
    assert.deepEqual(payload.turntable.captures.map((capture) => capture.angleDegrees), [0]);
    assert.equal(payload.turntable.captures[0]?.outPath.endsWith("model-test-yaw-000.png"), true);
    assert.deepEqual(source.entities.find((entity) => entity.id === "model.under-test.instance")?.transform?.rotation, [0, 0, 0]);
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

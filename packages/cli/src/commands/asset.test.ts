import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assetCommand } from "./asset.js";

const fixtureGltf = {
  asset: { version: "2.0", generator: "asset-command-test" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, translation: [1, 0, -2], scale: [2, 1, 1] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ type: "VEC3", min: [-0.5, 0, -1], max: [0.5, 2, 1] }],
  images: [{ uri: "textures/kart.png" }],
  buffers: [{ uri: "mesh.bin", byteLength: 12 }],
  materials: [{}],
  textures: [{}],
};

test("should inspect glTF bounds, dependencies, and scale calibration", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-gltf-"));
  const previousInitCwd = process.env.INIT_CWD;
  try {
    process.env.INIT_CWD = root;
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", "kart.gltf", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      bounds: { center: number[]; min: number[]; max: number[]; size: number[] };
      calibration: { camera: { recommendedDistance: number }; fitScales: { targetHeight2m: number; targetLength4m: number }; gameplay: { verdict: string; widthToLaneRatio: number } };
      code: string;
      counts: { images: number; meshes: number; nodes: number };
      dependencies: Array<{ kind: string; missing?: boolean; uri?: string }>;
      diagnostics: Array<{ code: string }>;
      file: { type: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ASSET_INSPECT_OK");
    assert.equal(payload.file.type, "gltf");
    assert.deepEqual(payload.bounds.min, [0, 0, -3]);
    assert.deepEqual(payload.bounds.max, [2, 2, -1]);
    assert.deepEqual(payload.bounds.size, [2, 2, 2]);
    assert.equal(payload.counts.meshes, 1);
    assert.equal(payload.counts.images, 1);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.uri === "textures/kart.png" && dependency.missing !== true), true);
    assert.equal(payload.calibration.fitScales.targetHeight2m, 1);
    assert.equal(payload.calibration.fitScales.targetLength4m, 2);
    assert.equal(payload.calibration.camera.recommendedDistance, 3.6);
    assert.equal(payload.calibration.gameplay.verdict, "ok");
    assert.equal(payload.calibration.gameplay.widthToLaneRatio, 0.571429);
    assert.deepEqual(payload.diagnostics, []);
  } finally {
    restoreInitCwd(previousInitCwd);
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect GLB JSON chunk and report embedded dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-glb-"));
  try {
    const glbGltf = {
      ...fixtureGltf,
      buffers: [{ byteLength: 12 }],
      images: [{ bufferView: 0, mimeType: "image/png" }],
    };
    await writeFile(join(root, "kart.glb"), makeGlb(glbGltf));

    const result = await assetCommand(["inspect", join(root, "kart.glb"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      bounds: { size: number[] };
      code: string;
      dependencies: Array<{ embedded: boolean; kind: string }>;
      file: { type: string };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ASSET_INSPECT_OK");
    assert.equal(payload.file.type, "glb");
    assert.deepEqual(payload.bounds.size, [2, 2, 2]);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.embedded), true);
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "buffer" && dependency.embedded), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report missing external texture with stable diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-missing-"));
  try {
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "kart.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      dependencies: Array<{ kind: string; missing?: boolean; uri?: string }>;
      diagnostics: Array<{ code: string; severity: string }>;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_INSPECT_FAILED");
    assert.equal(payload.dependencies.some((dependency) => dependency.kind === "image" && dependency.uri === "textures/kart.png" && dependency.missing === true), true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_IMAGE_MISSING" && diagnostic.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject missing inspect path", async () => {
  const result = await assetCommand(["inspect", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; severity: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_ASSET_PATH_MISSING");
  assert.equal(payload.severity, "error");
});

function makeGlb(json: unknown): Buffer {
  const jsonText = JSON.stringify(json);
  const jsonBuffer = Buffer.from(jsonText.padEnd(jsonText.length + ((4 - (jsonText.length % 4)) % 4), " "), "utf8");
  const totalLength = 12 + 8 + jsonBuffer.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonBuffer.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, jsonBuffer]);
}

function restoreInitCwd(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.INIT_CWD;
  } else {
    process.env.INIT_CWD = previous;
  }
}

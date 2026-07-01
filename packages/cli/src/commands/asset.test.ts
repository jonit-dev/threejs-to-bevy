import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      modular: {
        footprint: { center: number[]; size: number[] };
        originCorrection: number[];
        placement: { cardinalYaw: Array<{ entityPositionForFootprintCenterAtOrigin: number[]; yawDegrees: number }> };
        pivotOffsetFromFootprintCenter: number[];
        snap: { suggestedCellSize: number };
      };
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
    assert.deepEqual(payload.modular.footprint.center, [1, -2]);
    assert.deepEqual(payload.modular.footprint.size, [2, 2]);
    assert.deepEqual(payload.modular.originCorrection, [-1, -1, 2]);
    assert.deepEqual(payload.modular.placement.cardinalYaw.map((placement) => placement.yawDegrees), [0, 90, 180, 270]);
    assert.deepEqual(payload.modular.placement.cardinalYaw[0]?.entityPositionForFootprintCenterAtOrigin, [-1, -1, 2]);
    assert.deepEqual(payload.modular.placement.cardinalYaw[1]?.entityPositionForFootprintCenterAtOrigin, [2, -1, 1]);
    assert.deepEqual(payload.modular.pivotOffsetFromFootprintCenter, [1, -2]);
    assert.equal(payload.modular.snap.suggestedCellSize, 2);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_MODULAR_PIVOT_OFFSET"), true);
  } finally {
    restoreInitCwd(previousInitCwd);
    await rm(root, { force: true, recursive: true });
  }
});

test("should render modular placement guidance in text inspect output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-modular-text-"));
  try {
    await mkdir(join(root, "textures"), { recursive: true });
    await writeFile(join(root, "textures", "kart.png"), "png");
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "kart.gltf"), `${JSON.stringify(fixtureGltf, null, 2)}\n`);

    const result = await assetCommand(["inspect", join(root, "kart.gltf")]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Modular: footprint X\/Z size \[2, 2\], center \[1, -2\], origin correction \[-1, -1, 2\], yaw0 \[-1, -1, 2\], yaw90 \[2, -1, 1\], suggested cell 2/);
    assert.match(result.stdout, /TN_ASSET_MODULAR_PIVOT_OFFSET/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should omit modular pivot diagnostic for centered model footprints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-centered-modular-"));
  try {
    await writeFile(join(root, "centered.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      nodes: [{ mesh: 0 }],
      accessors: [{ type: "VEC3", min: [-1, 0, -1], max: [1, 0.1, 1] }],
      images: [],
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "mesh.bin"), "bin");

    const result = await assetCommand(["inspect", join(root, "centered.gltf"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string }>;
      modular: { originCorrection: number[]; pivotOffsetFromFootprintCenter: number[] };
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.modular.pivotOffsetFromFootprintCenter, [0, 0]);
    assert.deepEqual(payload.modular.originCorrection, [0, -0.05, 0]);
    assert.deepEqual(payload.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect a directory as a modular asset catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-catalog-"));
  try {
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "road.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      images: [],
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "nested", "corner.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      nodes: [{ mesh: 0 }],
      accessors: [{ type: "VEC3", min: [-1, 0, -1], max: [1, 0.1, 1] }],
      images: [],
      buffers: [{ uri: "../mesh.bin", byteLength: 12 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "mesh.bin"), "bin");
    await writeFile(join(root, "notes.txt"), "ignored");

    const shallow = await assetCommand(["inspect", root, "--json"]);
    const shallowPayload = JSON.parse(shallow.stdout) as {
      assets: Array<{ file: { path: string }; modular: { footprint: { size: number[] } } }>;
      code: string;
      directory: { recursive: boolean };
      summary: { inspected: number; warnings: number };
    };

    assert.equal(shallow.exitCode, 0);
    assert.equal(shallowPayload.code, "TN_ASSET_CATALOG_OK");
    assert.equal(shallowPayload.directory.recursive, false);
    assert.equal(shallowPayload.summary.inspected, 1);
    assert.equal(shallowPayload.summary.warnings, 1);
    assert.equal(shallowPayload.assets[0]?.file.path, join(root, "road.gltf"));
    assert.deepEqual(shallowPayload.assets[0]?.modular.footprint.size, [2, 2]);

    const recursive = await assetCommand(["inspect", root, "--recursive", "--json"]);
    const recursivePayload = JSON.parse(recursive.stdout) as {
      assets: Array<{ file: { path: string } }>;
      directory: { recursive: boolean };
      summary: { inspected: number };
    };

    assert.equal(recursive.exitCode, 0);
    assert.equal(recursivePayload.directory.recursive, true);
    assert.equal(recursivePayload.summary.inspected, 2);
    assert.deepEqual(recursivePayload.assets.map((asset) => asset.file.path), [join(root, "nested", "corner.gltf"), join(root, "road.gltf")].sort((a, b) => a.localeCompare(b)));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should render modular asset catalog guidance as text", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-catalog-text-"));
  try {
    await writeFile(join(root, "road.gltf"), `${JSON.stringify({
      ...fixtureGltf,
      images: [],
      buffers: [],
    }, null, 2)}\n`);

    const result = await assetCommand(["inspect", root]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Asset catalog inspection completed/);
    assert.match(result.stdout, /Inspected: 1, warnings: 1, errors: 0/);
    assert.match(result.stdout, /road\.gltf: size \[2, 2\], center \[1, -2\], correction \[-1, -1, 2\], yaw0 \[-1, -1, 2\], yaw90 \[2, -1, 1\], cell 2/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail directory inspection when no glTF assets are present", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-empty-catalog-"));
  try {
    await writeFile(join(root, "notes.txt"), "ignored");

    const result = await assetCommand(["inspect", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      diagnostics: Array<{ code: string; severity: string }>;
      summary: { inspected: number; errors: number };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ASSET_CATALOG_FAILED");
    assert.equal(payload.summary.inspected, 0);
    assert.equal(payload.summary.errors, 1);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_ASSET_CATALOG_EMPTY" && diagnostic.severity === "error"), true);
  } finally {
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

test("should infer modular road connectors from road material geometry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-inspect-road-connectors-"));
  try {
    await writeFile(join(root, "road.glb"), makeRoadGlb("straight"));

    const result = await assetCommand(["inspect", join(root, "road.glb"), "--json"]);
    const payload = JSON.parse(result.stdout) as {
      modular: {
        connectors: {
          cardinalYaw: Array<{ edges: string[]; yawDegrees: number }>;
          local: string[];
          source: string;
        };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.modular.connectors.source, "material:road");
    assert.deepEqual(payload.modular.connectors.local, ["north", "south"]);
    assert.deepEqual(payload.modular.connectors.cardinalYaw.find((placement) => placement.yawDegrees === 90)?.edges, ["east", "west"]);
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

test("should add structured asset source document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-add-source-"));
  try {
    const result = await assetCommand(["add", "model.kart", "--type", "model", "--path", "assets/kart.glb", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "model.kart.assets.json"), "utf8")) as {
      assets: Array<{ id: string; path: string; type: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/assets/model.kart.assets.json"]);
    assert.deepEqual(doc.assets, [{ id: "model.kart", path: "assets/kart.glb", type: "model" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add structured render target asset source document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-add-render-target-"));
  try {
    const result = await assetCommand(["add", "rt.minimap", "--type", "render-target", "--width", "512", "--height", "256", "--usage", "depth", "--format", "depth24plus", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "rt.minimap.assets.json"), "utf8")) as {
      assets: Array<{ format: string; height: number; id: string; type: string; usage: string; width: number }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/assets/rt.minimap.assets.json"]);
    assert.deepEqual(doc.assets, [{ format: "depth24plus", height: 256, id: "rt.minimap", type: "render-target", usage: "depth", width: 512 }]);
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

function makeGlb(json: unknown, binaryChunk?: Buffer): Buffer {
  const jsonText = JSON.stringify(json);
  const jsonBuffer = Buffer.from(jsonText.padEnd(jsonText.length + ((4 - (jsonText.length % 4)) % 4), " "), "utf8");
  const binPadding = binaryChunk === undefined ? 0 : ((4 - (binaryChunk.length % 4)) % 4);
  const paddedBinary = binaryChunk === undefined ? undefined : Buffer.concat([binaryChunk, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + jsonBuffer.length + (paddedBinary === undefined ? 0 : 8 + paddedBinary.length);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonBuffer.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (paddedBinary === undefined) {
    return Buffer.concat([header, jsonBuffer]);
  }
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBuffer, binHeader, paddedBinary]);
}

function makeRoadGlb(kind: "corner" | "straight"): Buffer {
  const grass = [[0, 0, -2], [2, 0, -2], [2, 0, 0], [0, 0, 0]];
  const road = kind === "straight"
    ? [[0.65, 0.01, -2], [1.35, 0.01, -2], [1.35, 0.01, 0], [0.65, 0.01, 0]]
    : [[0.65, 0.01, -1.35], [2, 0.01, -1.35], [2, 0.01, 0], [0.65, 0.01, 0]];
  const roadMin = kind === "straight" ? [0.65, 0.01, -2] : [0.65, 0.01, -1.35];
  const roadMax = kind === "straight" ? [1.35, 0.01, 0] : [2, 0.01, 0];
  const grassBytes = positionsBuffer(grass);
  const roadBytes = positionsBuffer(road);
  const indexBytes = indicesBuffer([0, 1, 2, 0, 2, 3]);
  const roadOffset = grassBytes.length;
  const grassIndexOffset = roadOffset + roadBytes.length;
  const roadIndexOffset = grassIndexOffset + indexBytes.length;
  const binary = Buffer.concat([grassBytes, roadBytes, indexBytes, indexBytes]);
  return makeGlb({
    asset: { version: "2.0", generator: "asset-road-connectors-test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [-0.35, -0.01, -0.65] }],
    meshes: [{
      primitives: [
        { attributes: { POSITION: 0 }, indices: 2, material: 0, mode: 4 },
        { attributes: { POSITION: 1 }, indices: 3, material: 1, mode: 4 },
      ],
    }],
    materials: [{ name: "grass" }, { name: "road" }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: grassBytes.length },
      { buffer: 0, byteOffset: roadOffset, byteLength: roadBytes.length },
      { buffer: 0, byteOffset: grassIndexOffset, byteLength: indexBytes.length },
      { buffer: 0, byteOffset: roadIndexOffset, byteLength: indexBytes.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, -2], max: [2, 0, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3", min: roadMin, max: roadMax },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  }, binary);
}

function positionsBuffer(positions: number[][]): Buffer {
  const buffer = Buffer.alloc(positions.length * 12);
  positions.forEach((position, index) => {
    buffer.writeFloatLE(position[0] ?? 0, index * 12);
    buffer.writeFloatLE(position[1] ?? 0, index * 12 + 4);
    buffer.writeFloatLE(position[2] ?? 0, index * 12 + 8);
  });
  return buffer;
}

function indicesBuffer(indices: number[]): Buffer {
  const buffer = Buffer.alloc(indices.length * 2);
  indices.forEach((index, offset) => buffer.writeUInt16LE(index, offset * 2));
  return buffer;
}

function restoreInitCwd(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.INIT_CWD;
  } else {
    process.env.INIT_CWD = previous;
  }
}

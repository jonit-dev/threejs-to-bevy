import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { copyAssetFiles, planAssetCopies, resolveBundlePath } from "./asset-copy.js";

test("resolveBundlePath should reject unsafe bundle asset paths", () => {
  assert.throws(() => resolveBundlePath("/tmp/bundle", "/tmp/escape.png"), /must be relative/);
  assert.throws(() => resolveBundlePath("/tmp/bundle", "../escape.png"), /parent traversal/);
  assert.throws(() => resolveBundlePath("/tmp/bundle", "assets/../escape.png"), /parent traversal/);
});

test("copyAssetFiles should copy only file-backed bundle assets inside outDir", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-copy-"));
  try {
    await writeFile(join(root, "source.png"), "texture");

    await copyAssetFiles(root, join(root, "bundle"), [
      { id: "generated.mesh" },
      { id: "tex.source", kind: "texture", path: "assets/source.png", sourcePath: "source.png" },
    ]);

    assert.equal(await readFile(join(root, "bundle/assets/source.png"), "utf8"), "texture");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("copyAssetFiles should copy external image dependencies referenced by GLB model assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-glb-copy-"));
  try {
    await mkdir(join(root, "assets/Textures"), { recursive: true });
    await writeFile(join(root, "assets/model.glb"), minimalGlbWithImages(["Textures/colormap.png"]));
    await writeFile(join(root, "assets/Textures/colormap.png"), "png-bytes");

    await copyAssetFiles(root, join(root, "bundle"), [
      { id: "model.car", kind: "model", path: "assets/model.glb", sourceMode: "bundle" },
    ]);

    assert.deepEqual(await readFile(join(root, "bundle/assets/model.glb")), await readFile(join(root, "assets/model.glb")));
    assert.equal(await readFile(join(root, "bundle/assets/Textures/colormap.png"), "utf8"), "png-bytes");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("planAssetCopies should discover glb dependencies without copying files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-glb-plan-"));
  try {
    await mkdir(join(root, "assets/Textures"), { recursive: true });
    await writeFile(join(root, "assets/model.glb"), minimalGlbWithImages(["Textures/colormap.png"]));
    await writeFile(join(root, "assets/Textures/colormap.png"), "png-bytes");

    const copies = await planAssetCopies(root, [
      { id: "model.car", kind: "model", path: "bundle/model.glb", sourcePath: "assets/model.glb", sourceMode: "bundle" },
    ]);

    assert.deepEqual(copies, [
      { path: "bundle/model.glb", sourcePath: "assets/model.glb" },
      { path: "bundle/Textures/colormap.png", sourcePath: "assets/Textures/colormap.png" },
    ]);
    await assert.rejects(() => readFile(join(root, "bundle/Textures/colormap.png"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function minimalGlbWithImages(uris: string[]): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 0 }],
    images: uris.map((uri) => ({ uri })),
  });
  const jsonChunk = paddedBuffer(Buffer.from(json, "utf8"), 0x20);
  const totalLength = 12 + 8 + jsonChunk.length;
  const glb = Buffer.alloc(totalLength);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  return glb;
}

function paddedBuffer(buffer: Buffer, padByte: number): Buffer {
  const padding = (4 - (buffer.length % 4)) % 4;
  if (padding === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

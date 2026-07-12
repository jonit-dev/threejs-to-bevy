import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { assetImportCommand } from "./assetImport.js";

test("should convert dae fixture to glb and register model asset", async () => {
  const root = await importFixture();
  try {
    const result = await assetImportCommand(["import", "piece.dae", "--id", "piece", "--license", "CC0", "--attribution", "Fixture", "--variant", "white=#f0f0f0", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { assets: Array<{ id: string; path: string }>; code: string };
    const document = JSON.parse(await readFile(join(root, "content/assets/piece.assets.json"), "utf8")) as { assets: Array<Record<string, unknown>> };

    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.code, "TN_ASSET_IMPORT_OK");
    assert.deepEqual(payload.assets.map((asset) => asset.id), ["piece", "piece.white"]);
    assert.deepEqual(document.assets[0], { attribution: "Fixture", id: "piece", license: "CC0", path: "assets/imported/piece.glb", source: "piece.dae", type: "model" });
    assert.equal((await readFile(join(root, "assets/imported/piece.glb"))).toString("ascii", 0, 4), "glTF");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should strip absolute texture uris during import", async () => {
  const root = await importFixture();
  try {
    const result = await assetImportCommand(["import", "piece.dae", "--id", "piece", "--project", root, "--json"], process.cwd(), { loadConverter: async () => converter() });
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(JSON.stringify(readGlbJson(await readFile(join(root, "assets/imported/piece.glb")))).includes("C:/"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit variant glbs with base color factors", async () => {
  const root = await importFixture();
  try {
    const result = await assetImportCommand(["import", "piece.dae", "--id", "piece", "--variant", "white=#f0f0f0", "--project", root, "--json"], process.cwd(), { loadConverter: async () => converter() });
    assert.equal(result.exitCode, 0, result.stdout);
    const json = readGlbJson(await readFile(join(root, "assets/imported/piece-white.glb"))) as { materials: Array<{ pbrMetallicRoughness: { baseColorFactor: number[] } }> };
    assert.deepEqual(json.materials[0]?.pbrMetallicRoughness.baseColorFactor.map((value) => Number(value.toFixed(4))), [0.9412, 0.9412, 0.9412, 1]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail with converter-missing diagnostic when assimpjs absent", async () => {
  const root = await importFixture();
  try {
    const result = await assetImportCommand(["import", "piece.dae", "--id", "piece", "--project", root, "--json"], process.cwd(), { loadConverter: async () => { throw new Error("missing"); } });
    assert.equal(result.exitCode, 1);
    assert.equal((JSON.parse(result.stdout) as { code: string }).code, "TN_ASSET_IMPORT_CONVERTER_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function importFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-import-"));
  await copyFile(resolve(process.cwd(), "src/commands/fixtures/minimal.dae"), join(root, "piece.dae"));
  return root;
}

function converter() {
  return {
    FileList: class { AddFile(): void {} },
    ConvertFileList() {
      const bytes = makeGlb({
        asset: { version: "2.0" },
        images: [{ uri: "C:/3D Work/piece.png" }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        samplers: [{}],
        textures: [{ source: 0 }],
      });
      return { FileCount: () => 1, GetErrorCode: () => 0, GetFile: () => ({ GetContent: () => bytes }), IsSuccess: () => true };
    },
  };
}

function makeGlb(json: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(json));
  const padded = Math.ceil(bytes.length / 4) * 4;
  const output = Buffer.alloc(20 + padded, 0x20);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  bytes.copy(output, 20);
  return output;
}

function readGlbJson(bytes: Buffer): unknown {
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8").trim());
}

import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assetRepairCommand } from "./assetRepair.js";

test("should strip unsupported material extensions from glb", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-repair-"));
  const path = join(root, "material.glb");
  try {
    await writeFile(path, makeGlb());
    const result = await assetRepairCommand(["repair", path, "--strip-extensions", "--json"]);
    const document = readGlbJson(await readFile(path)) as { extensionsUsed: string[]; materials: Array<{ extensions: Record<string, unknown> }> };
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(document.materials[0]?.extensions.KHR_materials_ior, undefined);
    assert.notEqual(document.materials[0]?.extensions.KHR_materials_clearcoat, undefined);
    assert.deepEqual(document.extensionsUsed, ["KHR_materials_clearcoat"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write backup before repairing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-repair-backup-"));
  const path = join(root, "material.glb");
  try {
    const original = makeGlb();
    await writeFile(path, original);
    const result = await assetRepairCommand(["repair", path, "--strip-extensions", "--json"]);
    assert.equal(result.exitCode, 0, result.stdout);
    await access(`${path}.bak`);
    assert.deepEqual(await readFile(`${path}.bak`), original);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_materials_clearcoat", "KHR_materials_ior"],
    materials: [{ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1 }, KHR_materials_ior: { ior: 1.5 } } }],
  }));
  const padded = Math.ceil(json.length / 4) * 4;
  const output = Buffer.alloc(20 + padded, 0x20);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  return output;
}

function readGlbJson(bytes: Buffer): unknown {
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8").trim());
}

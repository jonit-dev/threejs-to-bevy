import assimpjs from "assimpjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceDir = resolve(root, "assets/source/viliami-3d-chess");
const outputDir = resolve(root, "assets/models/chess");
const pieces = ["pawn", "rook", "knight", "bishop", "queen", "king"];
const assimp = await assimpjs();

await mkdir(outputDir, { recursive: true });
for (const piece of pieces) {
  const sourcePath = resolve(sourceDir, `${piece}.dae`);
  const files = new assimp.FileList();
  files.AddFile(basename(sourcePath), await readFile(sourcePath));
  const result = assimp.ConvertFileList(files, "glb2");
  if (!result.IsSuccess() || result.FileCount() !== 1) {
    throw new Error(`Failed to convert ${piece}.dae: ${result.GetErrorCode()}`);
  }
  const converted = Buffer.from(result.GetFile(0).GetContent());
  for (const [color, baseColorFactor] of [
    ["white", [0.91, 0.84, 0.7, 1]],
    ["black", [0.035, 0.055, 0.08, 1]],
  ]) {
    await writeFile(resolve(outputDir, `${color}-${piece}.glb`), recolor(converted, baseColorFactor));
  }
}

function recolor(glb, baseColorFactor) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString().replace(/\0+$/u, ""));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    material.pbrMetallicRoughness ??= {};
    delete material.pbrMetallicRoughness.baseColorTexture;
    material.pbrMetallicRoughness.baseColorFactor = baseColorFactor;
    material.pbrMetallicRoughness.metallicFactor = colorMetalness(baseColorFactor);
    material.pbrMetallicRoughness.roughnessFactor = 0.3;
    delete material.extensions;
  }
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((extension) => extension !== "KHR_materials_ior" && extension !== "KHR_materials_volume");
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const binaryOffset = 20 + jsonLength;
  const binaryLength = glb.readUInt32LE(binaryOffset);
  const binary = glb.subarray(binaryOffset + 8, binaryOffset + 8 + binaryLength);
  const output = Buffer.alloc(20 + paddedJsonLength + 8 + binary.length, 0x20);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + paddedJsonLength);
  output.writeUInt32LE(0x004e4942, 24 + paddedJsonLength);
  binary.copy(output, 28 + paddedJsonLength);
  return output;
}

function colorMetalness(baseColorFactor) {
  return baseColorFactor[0] < 0.1 ? 0.18 : 0.06;
}

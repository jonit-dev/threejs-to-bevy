import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const positions = new Float32Array([
  -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, -0.5, 1, -0.5,
  -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
]);
const indices = new Uint16Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
  1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3,
]);
const positionBytes = Buffer.from(positions.buffer);
const indexBytes = Buffer.from(indices.buffer);
const binary = Buffer.concat([positionBytes, indexBytes]);
const json = {
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, max: [0.5, 1, 0.5], min: [-0.5, 0, -0.5], type: "VEC3" },
    { bufferView: 1, componentType: 5123, count: 36, max: [7], min: [0], type: "SCALAR" },
  ],
  asset: { generator: "ThreeNative deterministic colored-metallic fixture", version: "2.0" },
  bufferViews: [
    { buffer: 0, byteLength: positionBytes.byteLength, byteOffset: 0, target: 34962 },
    { buffer: 0, byteLength: indexBytes.byteLength, byteOffset: positionBytes.byteLength, target: 34963 },
  ],
  buffers: [{ byteLength: binary.byteLength }],
  materials: [{
    name: "CobaltMetal",
    pbrMetallicRoughness: { baseColorFactor: [0.08, 0.35, 0.9, 1], metallicFactor: 0.82, roughnessFactor: 0.24 },
  }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }] }],
  nodes: [
    { mesh: 0, name: "CobaltMetalBox" },
    { mesh: 0, name: "AsymmetricMarker", scale: [0.25, 0.35, 0.25], translation: [0.62, 0.3, 0.25] },
  ],
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
};

const jsonBytes = Buffer.from(JSON.stringify(json));
const paddedJsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
const paddedBinaryLength = Math.ceil(binary.byteLength / 4) * 4;
const output = Buffer.alloc(12 + 8 + paddedJsonLength + 8 + paddedBinaryLength, 0);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.byteLength, 8);
output.writeUInt32LE(paddedJsonLength, 12);
output.writeUInt32LE(0x4e4f534a, 16);
jsonBytes.copy(output, 20);
output.fill(0x20, 20 + jsonBytes.byteLength, 20 + paddedJsonLength);
const binaryHeader = 20 + paddedJsonLength;
output.writeUInt32LE(paddedBinaryLength, binaryHeader);
output.writeUInt32LE(0x004e4942, binaryHeader + 4);
binary.copy(output, binaryHeader + 8);

const target = resolve(dirname(fileURLToPath(import.meta.url)), "colored-metallic.glb");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output);

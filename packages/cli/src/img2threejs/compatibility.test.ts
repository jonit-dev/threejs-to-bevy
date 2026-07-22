import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import { inspectImg2ThreejsGlbContract } from "./compatibility.js";
import { exportImg2ThreejsPage, type IImg2ThreejsBrowserResource } from "./exporterPage.js";
import { img2ThreejsVisualThresholds, measureImg2ThreejsVisualParity } from "./visualParity.js";

test("should embed supported PBR and canvas texture channels", async () => {
  const resource = pngResource("content/references/albedo.png", [49, 91, 112, 255]);
  const result = await exportFactory(`
    globalThis.postMessage({ type: "unrelated-message-before-blob-unlock" });
    const root = new THREE.Group(); root.name = "fixture";
    const imageMap = await new THREE.TextureLoader().loadAsync("/${resource.path}"); imageMap.colorSpace = THREE.SRGBColorSpace; imageMap.offset.set(0.125, 0.25); imageMap.repeat.set(0.5, 0.5);
    const canvasTexture = (color, colorSpace = THREE.NoColorSpace) => { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 4; const context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, 4, 4); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = colorSpace; return texture; };
    const emissiveMap = canvasTexture("#552211", THREE.SRGBColorSpace);
    const metalRoughMap = canvasTexture("#88bb66");
    const normalMap = canvasTexture("#8080ff");
    const aoMap = canvasTexture("#dddddd"); aoMap.channel = 1;
    const material = new THREE.MeshStandardMaterial({ alphaTest: 0.2, aoMap, color: 0x88aacc, emissive: 0x220000, emissiveIntensity: 1.5, emissiveMap, map: imageMap, metalness: 0.3, metalnessMap: metalRoughMap, name: "pbr", normalMap, normalScale: new THREE.Vector2(0.8, 0.8), opacity: 0.9, roughness: 0.7, roughnessMap: metalRoughMap, side: THREE.DoubleSide, vertexColors: true });
    const geometry = new THREE.BoxGeometry(); const uv = geometry.getAttribute("uv"); geometry.setAttribute("uv1", uv.clone()); geometry.setAttribute("uv2", uv.clone()); geometry.setAttribute("uv3", uv.clone()); geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(geometry.getAttribute("position").count * 3).fill(1), 3)); geometry.computeTangents();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = "body"; root.add(mesh);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0x334455, name: "trim", opacity: 0.5, side: THREE.DoubleSide, transparent: true })); trim.name = "trim"; trim.position.x = 0.75; root.add(trim); return root;
  `, { resources: [resource] });
  try {
    const bytes = await readFile(result.outputPath);
    const contract = inspectImg2ThreejsGlbContract(bytes);
    assert.equal(contract.images.length, 5);
    assert.ok(contract.extensions.includes("KHR_materials_emissive_strength"));
    assert.ok(contract.extensions.includes("KHR_materials_unlit"));
    assert.ok(contract.extensions.includes("KHR_texture_transform"));
    const json = readGlbJson(bytes);
    const material = json.materials?.find((candidate) => candidate.name === "pbr");
    const trim = json.materials?.find((candidate) => candidate.name === "trim");
    assert.equal(material?.doubleSided, true);
    assert.equal(material?.alphaMode, "MASK");
    assert.equal(material?.alphaCutoff, 0.2);
    assert.equal(material?.pbrMetallicRoughness?.metallicFactor, 0.3);
    assert.equal(material?.pbrMetallicRoughness?.roughnessFactor, 0.7);
    assert.deepEqual(material?.pbrMetallicRoughness?.baseColorFactor, [0.24620132669705552, 0.4019777798219466, 0.6038273388475408, 0.9]);
    assert.deepEqual(material?.emissiveFactor, [0.015996293361446288, 0, 0]);
    assert.equal(material?.extensions?.KHR_materials_emissive_strength?.emissiveStrength, 1.5);
    assert.equal(material?.normalTexture?.scale, 0.8);
    assert.ok(material?.pbrMetallicRoughness?.baseColorTexture);
    assert.ok(material?.pbrMetallicRoughness?.metallicRoughnessTexture);
    assert.ok(material?.normalTexture);
    assert.ok(material?.occlusionTexture);
    assert.ok(material?.emissiveTexture);
    assert.deepEqual(material?.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform, { offset: [0.125, 0.25], scale: [0.5, 0.5] });
    assert.ok((json.meshes?.[0]?.primitives?.[0]?.attributes?.TEXCOORD_3 ?? -1) >= 0);
    assert.ok((json.meshes?.[0]?.primitives?.[0]?.attributes?.COLOR_0 ?? -1) >= 0);
    assert.ok((json.meshes?.[0]?.primitives?.[0]?.attributes?.TANGENT ?? -1) >= 0);
    assert.equal(trim?.alphaMode, "BLEND");
    assert.equal(json.images?.every((image) => image.uri === undefined && Number.isInteger(image.bufferView)), true);
  } finally {
    await result.cleanup();
  }
});

test("should preserve unique named nodes sockets colliders and destruction groups as extras", async () => {
  const result = await exportFactory(`
    const root = new THREE.Group(); root.name = "fixture";
    const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "paint" })); body.name = "body"; root.add(body);
    const socket = new THREE.Group(); socket.name = "socket.tool"; root.add(socket);
    root.userData.sculptRuntime = { sourceId: "fixture", sockets: { tool: socket }, colliders: [{ id: "body", node: body, kind: "box", size: [1, 1, 1] }], destructionGroups: { shell: [body] } };
    return root;
  `, { includeRuntimeExtras: true });
  try {
    const json = readGlbJson(await readFile(result.outputPath));
    const runtime = result.browser.reload.runtime as { colliders?: unknown; destructionGroups?: unknown; schema?: string; sockets?: unknown } | undefined;
    assert.ok(result.browser.reload.names.includes("body"));
    assert.ok(result.browser.reload.names.includes("socket.tool"));
    assert.deepEqual(runtime?.sockets, [{ id: "tool", node: "socket.tool" }]);
    assert.deepEqual(runtime?.colliders, [{ id: "body", kind: "box", node: "body", size: [1, 1, 1] }]);
    assert.deepEqual(runtime?.destructionGroups, [{ id: "shell", nodes: ["body"] }]);
    assert.equal(runtime?.schema, "threenative.img2threejs-runtime");
  } finally {
    await result.cleanup();
  }
  await assert.rejects(exportFactory(`
    const root = new THREE.Group(); root.name = "fixture"; const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); body.name = "body"; root.add(body);
    root.userData.sculptRuntime = { sockets: [], colliders: [{ id: "body", node: body, kind: "box", isTrigger: "false" }] }; return root;
  `, { includeRuntimeExtras: true }), (error: unknown) => (error as { code?: string }).code === "TN_IMG2THREEJS_RUNTIME_METADATA_INVALID");
});

test("should reject shader material unbaked displacement and review-only nodes", async () => {
  const cases = [
    `const root = new THREE.Group(); root.name = "fixture"; const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial()); mesh.name = "body"; root.add(mesh); return root;`,
    `const root = new THREE.Group(); root.name = "fixture"; const material = new THREE.MeshStandardMaterial(); material.displacementMap = new THREE.Texture(); const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.name = "body"; root.add(mesh); return root;`,
    `const root = new THREE.Group(); root.name = "fixture"; const light = new THREE.DirectionalLight(); light.name = "review.light"; root.add(light); return root;`,
  ];
  for (const body of cases) await assert.rejects(exportFactory(body), (error: unknown) => (error as { code?: string }).code === "TN_IMG2THREEJS_FEATURE_UNSUPPORTED");
});

test("should reject malformed geometry groups and typed runtime fields", async () => {
  await assert.rejects(exportFactory(`
    const root = new THREE.Group(); root.name = "fixture"; const geometry = new THREE.BoxGeometry(); geometry.clearGroups(); geometry.addGroup(1, 5, 0);
    const mesh = new THREE.Mesh(geometry, [new THREE.MeshStandardMaterial()]); mesh.name = "body"; root.add(mesh); return root;
  `), (error: unknown) => (error as { code?: string }).code === "TN_IMG2THREEJS_FACTORY_EXPORT_INVALID");
});

test("should classify malformed GLB JSON at the compatibility boundary", () => {
  const bytes = Buffer.alloc(24);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(4, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.write("{bad", 20, "ascii");
  assert.throws(() => inspectImg2ThreejsGlbContract(bytes), (error: unknown) => (error as { code?: string }).code === "TN_IMG2THREEJS_GLTF_INVALID");
});

test("should apply fixed visual parity threshold boundaries", () => {
  const data = new Uint8Array(8 * 8 * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([32, 64, 96, 255], offset);
  const frame = { data, height: 8, width: 8 };
  const identical = measureImg2ThreejsVisualParity(frame, frame).metrics;
  assert.equal(identical.passed, true);
  assert.equal(identical.silhouetteIou, 1);
  assert.equal(identical.ssim, 1);
  assert.equal(img2ThreejsVisualThresholds.meanNormalizedRgbDelta, 3 / 255);
  const changedData = new Uint8Array(data.length); for (let offset = 0; offset < changedData.length; offset += 4) changedData.set([255, 255, 255, 255], offset);
  const changed = measureImg2ThreejsVisualParity(frame, { ...frame, data: changedData }).metrics;
  assert.equal(changed.passed, false);
});

async function exportFactory(body: string, options: { includeRuntimeExtras?: boolean; resources?: IImg2ThreejsBrowserResource[] } = {}): Promise<{ browser: Awaited<ReturnType<typeof exportImg2ThreejsPage>>; cleanup(): Promise<void>; outputPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "tn-img2threejs-compatibility-"));
  const outputPath = join(directory, "output.glb");
  try {
    const browser = await exportImg2ThreejsPage({
      exportName: "createFixture",
      includeRuntimeExtras: options.includeRuntimeExtras ?? false,
      maxOutputBytes: 4_000_000,
      moduleJavaScript: `import * as THREE from "three"; export async function createFixture() { ${body} }`,
      outputPath,
      resources: options.resources ?? [],
      rootName: "fixture",
      timeoutMs: 20_000,
    });
    return { browser, cleanup: () => rm(directory, { force: true, recursive: true }), outputPath };
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
}

function pngResource(path: string, color: [number, number, number, number]): IImg2ThreejsBrowserResource {
  const png = new PNG({ height: 4, width: 4 });
  for (let offset = 0; offset < png.data.length; offset += 4) png.data.set(color, offset);
  return { bytes: PNG.sync.write(png), mimeType: "image/png", path };
}

function readGlbJson(bytes: Buffer): {
  images?: Array<{ bufferView?: number; uri?: string }>;
  materials?: Array<{ alphaCutoff?: number; alphaMode?: string; doubleSided?: boolean; emissiveFactor?: number[]; emissiveTexture?: unknown; extensions?: { KHR_materials_emissive_strength?: { emissiveStrength?: number } }; name?: string; normalTexture?: { scale?: number }; occlusionTexture?: unknown; pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { extensions?: { KHR_texture_transform?: { offset?: number[]; scale?: number[] } } }; metallicFactor?: number; metallicRoughnessTexture?: unknown; roughnessFactor?: number } }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>;
  nodes?: Array<{ extras?: { threenative?: { colliders?: unknown; destructionGroups?: unknown; schema?: string; sockets?: unknown } }; name?: string }>;
} {
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8")) as ReturnType<typeof readGlbJson>;
}

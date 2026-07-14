import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fetchSketchfabPreview, importSketchfabModel, searchSketchfab, sketchfabStatus, type ISketchfabDependencies } from "./sketchfab.js";

const uid = "0123456789abcdef0123456789abcdef";
const credential = "never-print-this-token";

test("should report missing or invalid credential without leaking it", async () => {
  const missing = await sketchfabStatus(false, { credential: "" });
  let authorization = "";
  const invalid = await sketchfabStatus(true, { credential, fetch: (async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ detail: credential }), { status: 401 });
  }) as typeof fetch });
  const authUsage = "Personal user-authorized first-party CLI workflow; third-party apps require their own Sketchfab OAuth integration and applicable agreement.";
  assert.deepEqual(missing, { authentication: "user-oauth-bearer", authUsage, available: false, credential: "missing", liveRequested: false, provider: "sketchfab" });
  assert.deepEqual(invalid, { authentication: "user-oauth-bearer", authUsage, available: false, credential: "invalid", liveRequested: true, provider: "sketchfab" });
  assert.equal(authorization, `Bearer ${credential}`);
  assert.equal(JSON.stringify(invalid).includes(credential), false);
});

test("should ignore the retired generic token environment name", async () => {
  const previousGeneric = process.env.THREENATIVE_SKETCHFAB_TOKEN;
  const previousOauth = process.env.THREENATIVE_SKETCHFAB_OAUTH_TOKEN;
  try {
    process.env.THREENATIVE_SKETCHFAB_TOKEN = credential;
    delete process.env.THREENATIVE_SKETCHFAB_OAUTH_TOKEN;
    const status = await sketchfabStatus();
    assert.equal(status.credential, "missing");
    assert.equal(status.authentication, "user-oauth-bearer");
  } finally {
    if (previousGeneric === undefined) delete process.env.THREENATIVE_SKETCHFAB_TOKEN; else process.env.THREENATIVE_SKETCHFAB_TOKEN = previousGeneric;
    if (previousOauth === undefined) delete process.env.THREENATIVE_SKETCHFAB_OAUTH_TOKEN; else process.env.THREENATIVE_SKETCHFAB_OAUTH_TOKEN = previousOauth;
  }
});

test("should return bounded downloadable search rows with license and faces", async () => {
  let requested = "";
  const result = await searchSketchfab({ limit: 1, query: "chair" }, { fetch: (async (input) => {
    requested = String(input);
    return jsonResponse({ results: [searchModel(true), { ...searchModel(false), uid: "fedcba9876543210fedcba9876543210" }] });
  }) as typeof fetch });
  assert.match(requested, /type=models/);
  assert.match(requested, /downloadable=true/);
  assert.match(requested, /count=1/);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0], {
    author: { name: "Fixture Artist", profileUrl: "https://sketchfab.com/fixture" },
    faceCount: 1200,
    formats: ["gltf"],
    license: { id: "cc-by", label: "CC Attribution", providerUid: "license-uid", url: "https://creativecommons.org/licenses/by/4.0/" },
    name: "Fixture Chair",
    preview: { height: 512, url: "https://media.sketchfab.com/chair.jpeg", width: 512 },
    sourceUrl: `https://sketchfab.com/3d-models/fixture-${uid}`,
    uid,
  });
});

test("should normalize a recorded official search shape and expose only the bounded next cursor", async () => {
  let requested = "";
  const recorded = {
    cursors: { next: "18", previous: "16" },
    next: "https://api.sketchfab.com/v3/search?count=1&cursor=18&downloadable=true&q=chair&type=models",
    previous: "https://api.sketchfab.com/v3/search?count=1&cursor=16&downloadable=true&q=chair&type=models",
    results: [{ ...searchModel(true), archives: { glb: { faceCount: 999786, size: 34741352, textureCount: 0, textureMaxResolution: 0, type: "glb", vertexCount: 567902 }, gltf: { faceCount: 999786, size: 16567803, textureCount: 0, textureMaxResolution: 0, type: "gltf", vertexCount: 567902 } }, license: { label: "CC Attribution-NonCommercial-NoDerivs", uid: "34b725081a6a4184957efaec2cb84ed3" } }],
  };
  const result = await searchSketchfab({ cursor: "17", limit: 1, query: "chair" }, { fetch: (async (input) => { requested = String(input); return jsonResponse(recorded); }) as typeof fetch });
  assert.match(requested, /cursor=17/);
  assert.equal(result.nextCursor, "18");
  assert.equal(result.results[0]?.license.id, "cc-by-nc-nd");
  assert.equal(result.results[0]?.faceCount, 999786);
  assert.deepEqual(result.results[0]?.formats, ["glb", "gltf"]);
  assert.equal(JSON.stringify(result).includes("api.sketchfab.com/v3/search?"), false);
  await assert.rejects(searchSketchfab({ cursor: "../unsafe" }, { fetch: (async () => { throw new Error("must not fetch"); }) as typeof fetch }), /cursor is invalid/);
});

test("should return selected preview bytes within image budget", async () => {
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("threenative-sketchfab-preview-")));
  const result = await fetchSketchfabPreview(uid, { fetch: (async (input) => String(input).startsWith("https://api.sketchfab.com/")
    ? jsonResponse(searchModel(true))
    : new Response(image, { headers: { "content-length": String(image.byteLength), "content-type": "image/jpeg" }, status: 200 })) as typeof fetch });
  const after = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("threenative-sketchfab-preview-")));
  assert.deepEqual([...result.bytes], [...image]);
  assert.equal(result.mimeType, "image/jpeg");
  assert.deepEqual(after, before);
  await assert.rejects(fetchSketchfabPreview(uid, { fetch: (async () => jsonResponse({ ...searchModel(true), thumbnails: { images: [] } })) as typeof fetch }), /no preview thumbnail/);
});

test("should normalize rate limits and timeouts without exposing provider payloads", async () => {
  await assert.rejects(searchSketchfab({ query: "chair" }, { fetch: (async () => new Response(JSON.stringify({ secret: credential }), { status: 429 })) as typeof fetch }), /rate limit/);
  const timeout = new Error(`timeout ${credential}`); timeout.name = "TimeoutError";
  await assert.rejects(searchSketchfab({ query: "chair" }, { fetch: (async () => { throw timeout; }) as typeof fetch }), (error: unknown) => error instanceof Error && error.message === "Sketchfab request timed out." && !error.message.includes(credential));
});

test("should reject download without explicit license acceptance and target size", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sketchfab-reject-")); let calls = 0;
  const fetch = (async () => { calls += 1; throw new Error("provider must not be called"); }) as typeof globalThis.fetch;
  try {
    await assert.rejects(importSketchfabModel({ acceptedLicense: "", assetId: "chair", modelUid: uid, projectPath: root, targetSize: 1 }, { credential, fetch }), /license acceptance/);
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc-by", assetId: "chair", modelUid: uid, projectPath: root, targetSize: Number.NaN }, { credential, fetch }), /target size/);
    assert.equal(calls, 0);
    const urls: string[] = [];
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc0", assetId: "chair", modelUid: uid, projectPath: root, targetSize: 1 }, { credential, fetch: (async (input) => { urls.push(String(input)); return jsonResponse(searchModel(true)); }) as typeof globalThis.fetch }), /does not match/);
    assert.equal(urls.some((url) => url.endsWith("/download")), false);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should normalize combined hierarchy to requested meter size", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sketchfab-import-"));
  const scene = JSON.stringify({
    accessors: [{ max: [2, 3, 4], min: [-2, 0, -4], type: "VEC3" }], asset: { version: "2.0" },
    materials: [{ name: "Authored fabric", pbrMetallicRoughness: { baseColorFactor: [0.4, 0.2, 0.1, 1], metallicFactor: 0.1, roughnessFactor: 0.8 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], nodes: [{ children: [1], translation: [10, 0, 0] }, { mesh: 0, scale: [2, 1, 0.5] }], scene: 0, scenes: [{ nodes: [0] }],
  });
  const archive = zip([{ name: "scene.gltf", bytes: Buffer.from(scene) }, { name: "textures/albedo.png", bytes: Buffer.from([1, 2, 3]) }]);
  try {
    const result = await importSketchfabModel({ acceptedLicense: "cc-by", assetId: "chair", modelUid: uid, projectPath: root, targetSize: 1 }, fixtureDependencies(archive));
    const asset = JSON.parse(await readFile(join(root, "content/assets/chair.assets.json"), "utf8")) as { assets: Array<Record<string, unknown>> };
    const provenanceText = await readFile(join(root, "assets/imported/sketchfab/chair/provenance.json"), "utf8");
    const normalized = JSON.parse(await readFile(join(root, "assets/imported/sketchfab/chair/files/scene.gltf"), "utf8")) as { materials: Array<Record<string, unknown>>; nodes: Array<{ children?: number[]; name?: string; scale?: number[] }>; scenes: Array<{ nodes: number[] }> };
    const bounds = result.bounds as { size: number[] };
    assert.ok(Math.abs(Math.max(...bounds.size) - 1) < 0.001);
    assert.equal(result.appliedScale, 0.125);
    assert.equal(normalized.nodes.at(-1)?.name, "ThreeNativeScaleRoot");
    assert.deepEqual(normalized.nodes.at(-1)?.children, [0]);
    assert.deepEqual(normalized.scenes[0]?.nodes, [2]);
    assert.deepEqual(normalized.materials[0], { name: "Authored fabric", pbrMetallicRoughness: { baseColorFactor: [0.4, 0.2, 0.1, 1], metallicFactor: 0.1, roughnessFactor: 0.8 } });
    assert.equal(asset.assets[0]?.source, `sketchfab:${uid}`);
    assert.equal(asset.assets[0]?.license, "cc-by");
    assert.match(String(asset.assets[0]?.attribution), /Fixture Artist/);
    assert.equal(provenanceText.includes(credential), false);
    assert.equal(provenanceText.includes("signed-secret"), false);
    assert.match(provenanceText, /"sha256"/);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should normalize a GLB scene root while preserving authored material data", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sketchfab-glb-"));
  const glb = makeTestGlb({ accessors: [{ max: [2, 1, 1], min: [-2, 0, -1], type: "VEC3" }], asset: { version: "2.0" }, materials: [{ name: "Metal", pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 1], metallicFactor: 0.9, roughnessFactor: 0.25 } }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], nodes: [{ mesh: 0 }], scene: 0, scenes: [{ nodes: [0] }] });
  try {
    const result = await importSketchfabModel({ acceptedLicense: "cc-by", assetId: "glb-chair", modelUid: uid, projectPath: root, targetSize: 2 }, fixtureDependencies(zip([{ name: "model.glb", bytes: glb }])));
    const output = await readFile(join(root, "assets/imported/sketchfab/glb-chair/files/model.glb"));
    const normalized = JSON.parse(output.subarray(20, 20 + output.readUInt32LE(12)).toString("utf8").replace(/[\0 ]+$/u, "")) as { materials: Array<Record<string, unknown>>; nodes: Array<{ children?: number[]; name?: string; scale?: number[] }>; scenes: Array<{ nodes: number[] }> };
    assert.equal(result.appliedScale, 0.5);
    assert.deepEqual(normalized.nodes.at(-1), { children: [0], name: "ThreeNativeScaleRoot", scale: [0.5, 0.5, 0.5] });
    assert.deepEqual(normalized.scenes[0]?.nodes, [1]);
    assert.deepEqual(normalized.materials[0], { name: "Metal", pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 1], metallicFactor: 0.9, roughnessFactor: 0.25 } });
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should roll back promoted files and partial source when registration faults", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sketchfab-registration-fault-"));
  const scene = Buffer.from(JSON.stringify({ accessors: [{ max: [1, 1, 1], min: [0, 0, 0], type: "VEC3" }], asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scene: 0, scenes: [{ nodes: [0] }] }));
  const dependencies = fixtureDependencies(zip([{ name: "scene.gltf", bytes: scene }]));
  dependencies.addAsset = async (args) => {
    const path = join(args.projectPath, "content/assets/fault.assets.json");
    await mkdir(join(args.projectPath, "content/assets"), { recursive: true });
    await writeFile(path, "partial\n");
    throw new Error("injected registration fault");
  };
  try {
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc-by", assetId: "fault", modelUid: uid, projectPath: root, targetSize: 1 }, dependencies), /injected registration fault/);
    await assert.rejects(readFile(join(root, "content/assets/fault.assets.json")));
    await assert.rejects(readFile(join(root, "assets/imported/sketchfab/fault/provenance.json")));
    await assert.rejects(readFile(join(root, ".threenative/staging")));
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should reject unsafe archive entries and unsupported formats", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sketchfab-unsafe-"));
  try {
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc-by", assetId: "unsafe", modelUid: uid, projectPath: root, targetSize: 1 }, fixtureDependencies(zip([{ name: "../escape.gltf", bytes: Buffer.from("{}") }]))), /unsafe path/);
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc-by", assetId: "link", modelUid: uid, projectPath: root, targetSize: 1 }, fixtureDependencies(zip([{ externalAttributes: (0o120777 << 16) >>> 0, name: "scene.gltf", bytes: Buffer.from("target") }]))), /symbolic link/);
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc-by", assetId: "text", modelUid: uid, projectPath: root, targetSize: 1 }, fixtureDependencies(zip([{ name: "readme.txt", bytes: Buffer.from("no model") }]))), /no supported GLB or glTF/);
    const remote = Buffer.from(JSON.stringify({ accessors: [{ max: [1, 1, 1], min: [0, 0, 0], type: "VEC3" }], asset: { version: "2.0" }, buffers: [{ byteLength: 12, uri: "https://example.com/mesh.bin" }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scene: 0, scenes: [{ nodes: [0] }] }));
    await assert.rejects(importSketchfabModel({ acceptedLicense: "cc-by", assetId: "remote", modelUid: uid, projectPath: root, targetSize: 1 }, fixtureDependencies(zip([{ name: "scene.gltf", bytes: remote }]))), /non-data remote dependency URI/);
    await assert.rejects(readFile(join(root, "escape.gltf")));
    await assert.rejects(readFile(join(root, "content/assets/unsafe.assets.json")));
    await assert.rejects(readFile(join(root, "content/assets/text.assets.json")));
    await assert.rejects(readFile(join(root, "content/assets/remote.assets.json")));
  } finally { await rm(root, { force: true, recursive: true }); }
});

function searchModel(downloadable: boolean): Record<string, unknown> {
  return { archives: { gltf: { faceCount: 1200 } }, isDownloadable: downloadable, license: { label: "CC Attribution", uid: "license-uid", url: "https://creativecommons.org/licenses/by/4.0/" }, name: "Fixture Chair", thumbnails: { images: [{ height: 128, url: "https://media.sketchfab.com/small.jpeg", width: 128 }, { height: 512, url: "https://media.sketchfab.com/chair.jpeg", width: 512 }] }, uid, user: { displayName: "Fixture Artist", profileUrl: "https://sketchfab.com/fixture", username: "fixture" }, viewerUrl: `https://sketchfab.com/3d-models/fixture-${uid}` };
}

function fixtureDependencies(archive: Buffer): ISketchfabDependencies {
  return { credential, now: () => new Date("2026-07-14T00:00:00.000Z"), fetch: (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/download")) return jsonResponse({ gltf: { expires: 300, size: archive.byteLength, url: "https://sketchfab-prod-media.s3.amazonaws.com/archive.zip?signed-secret=1" } });
    if (url.startsWith("https://api.sketchfab.com/")) return jsonResponse(searchModel(true));
    if (url.startsWith("https://sketchfab-prod-media.s3.amazonaws.com/")) return new Response(archive, { headers: { "content-length": String(archive.byteLength), "content-type": "application/zip" }, status: 200 });
    return new Response(null, { status: 404 });
  }) as typeof fetch };
}

function jsonResponse(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status: 200 }); }

function makeTestGlb(document: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(document)); const paddedLength = Math.ceil(json.length / 4) * 4; const output = Buffer.alloc(20 + paddedLength, 0x20);
  output.write("glTF", 0, "ascii"); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(paddedLength, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20); return output;
}

function zip(files: Array<{ bytes: Buffer; externalAttributes?: number; name: string }>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name); const local = Buffer.alloc(30);
    const crc = testCrc32(file.bytes);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(file.bytes.length, 18); local.writeUInt32LE(file.bytes.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.bytes);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(file.bytes.length, 20); central.writeUInt32LE(file.bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(file.externalAttributes ?? 0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name); offset += local.length + name.length + file.bytes.length;
  }
  const centralBytes = Buffer.concat(centrals); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(centralBytes.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

function testCrc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }

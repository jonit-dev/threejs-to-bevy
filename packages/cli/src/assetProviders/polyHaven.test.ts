import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { addAsset } from "@threenative/authoring";
import sharp from "sharp";

import { importPolyHavenAsset, listPolyHavenCategories, searchPolyHaven } from "./polyHaven.js";

test("should list normalized categories without Blender", async () => {
  const result = await listPolyHavenCategories({ limit: 5, type: "all" });
  assert.equal(result.source, "snapshot");
  assert.equal(result.categories.length <= 5, true);
  assert.deepEqual([...result.categories].sort((a, b) => a.id.localeCompare(b.id)), result.categories);
  const hdris = await listPolyHavenCategories({ limit: 50, type: "hdris" });
  const textures = await listPolyHavenCategories({ limit: 50, type: "textures" });
  assert.equal(hdris.categories.some((category) => category.id === "abandoned"), true);
  assert.equal(textures.categories.some((category) => category.id === "abandoned"), false);
});

test("should search snapshot before optional live API", async () => {
  let called = false;
  const offline = await searchPolyHaven({ limit: 3, query: "texture", type: "textures" }, { fetch: async () => { called = true; throw new Error("network should remain disabled"); } });
  assert.equal(offline.source, "snapshot");
  assert.equal(called, false);
  const live = await searchPolyHaven({ live: true, limit: 2, query: "rock", type: "models" }, { fetch: async () => jsonResponse({ rock_b: liveAsset("Rock B", 5), rock_a: liveAsset("Rock A", 10), chair: { ...liveAsset("Chair", 100), categories: ["furniture"], tags: ["chair"] } }) });
  assert.deepEqual(live.results.map((asset) => asset.id), ["rock_a", "rock_b"]);
  assert.equal(live.source, "live");
});

test("should stage inspect and register a selected model", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-polyhaven-model-"));
  const gltf = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
  try {
    const result = await importPolyHavenAsset({ assetId: "rock", format: "gltf", projectPath: root, providerAssetId: "rock_01", resolution: "1k", type: "models" }, dependencies({ gltf: { "1k": { gltf: file("https://dl.polyhaven.org/rock.gltf", gltf) } } }, { "https://dl.polyhaven.org/rock.gltf": gltf }));
    const asset = JSON.parse(await readFile(join(root, "content/assets/rock.assets.json"), "utf8")) as { assets: Array<Record<string, unknown>> };
    const provenance = JSON.parse(await readFile(join(root, "assets/imported/polyhaven/rock/provenance.json"), "utf8")) as Record<string, unknown>;
    assert.equal(result.code, "TN_POLY_HAVEN_IMPORT_OK");
    assert.equal(asset.assets[0]?.source, "poly-haven:rock_01");
    assert.equal(asset.assets[0]?.license, "CC0-1.0");
    assert.equal(provenance.providerAssetId, "rock_01");
    assert.equal(Array.isArray(provenance.files), true);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should register all required maps in a PBR texture set", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-polyhaven-texture-"));
  const images = { diff: await solidPng(180), normal: await solidPng(128), rough: await solidPng(96), metal: await solidPng(32), ao: await solidPng(220) };
  const files = { Diff: { "1k": { png: file("https://dl.polyhaven.org/brick_diff_1k.png", images.diff) } }, nor_gl: { "1k": { png: file("https://dl.polyhaven.org/brick_nor_gl_1k.png", images.normal) } }, Rough: { "1k": { png: file("https://dl.polyhaven.org/brick_rough_1k.png", images.rough) } }, Metal: { "1k": { png: file("https://dl.polyhaven.org/brick_metal_1k.png", images.metal) } }, AO: { "1k": { png: file("https://dl.polyhaven.org/brick_ao_1k.png", images.ao) } } };
  const urls = Object.fromEntries(Object.values(files).map((entry) => { const leaf = entry["1k"].png; return [leaf.url!, images[leaf.url!.includes("diff") ? "diff" : leaf.url!.includes("nor") ? "normal" : leaf.url!.includes("rough") ? "rough" : leaf.url!.includes("metal") ? "metal" : "ao"]]; }));
  try {
    await importPolyHavenAsset({ assetId: "brick", format: "png", projectPath: root, providerAssetId: "brick_01", resolution: "1k", type: "textures" }, dependencies(files, urls, "image/png"));
    const material = JSON.parse(await readFile(join(root, "content/materials/brick.materials.json"), "utf8")) as { materials: Array<Record<string, unknown>> };
    assert.deepEqual(material.materials[0], { baseColorTexture: "brick.base-color", id: "brick", metallicRoughnessTexture: "brick.metallic-roughness", normalTexture: "brick.normal", occlusionTexture: "brick.occlusion" });
    for (const id of ["base-color", "normal", "metallic-roughness", "occlusion"]) await readFile(join(root, `content/assets/brick.${id}.assets.json`));
    const packed = await sharp(join(root, "assets/imported/polyhaven/brick/metallic-roughness.png")).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([...packed.data.slice(0, 4)], [255, 96, 32, 255]);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should register HDRI through environment asset boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-polyhaven-hdri-"));
  const bytes = await sharp({ create: { background: { b: 40, g: 80, r: 120 }, channels: 3, height: 2, width: 4 } }).jpeg().toBuffer();
  try {
    await importPolyHavenAsset({ assetId: "studio", format: "jpg", projectPath: root, providerAssetId: "studio_01", resolution: "1k", type: "hdris" }, dependencies({ hdri: { "1k": { jpg: file("https://dl.polyhaven.org/studio.jpg", bytes) } } }, { "https://dl.polyhaven.org/studio.jpg": bytes }, "image/jpeg"));
    const asset = JSON.parse(await readFile(join(root, "content/assets/studio.assets.json"), "utf8")) as { assets: Array<Record<string, unknown>> };
    const environment = JSON.parse(await readFile(join(root, "content/environment/studio.environment.json"), "utf8")) as { environmentMap: { asset: string }; skybox: { asset: string; mode: string } };
    assert.equal(asset.assets[0]?.type, "texture");
    assert.equal(asset.assets[0]?.path, "assets/imported/polyhaven/studio/environment.png");
    assert.deepEqual(environment.environmentMap, { asset: "studio" });
    assert.deepEqual(environment.skybox, { asset: "studio", mode: "equirect" });
    assert.equal((await sharp(join(root, "assets/imported/polyhaven/studio/environment.png")).metadata()).format, "png");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should use unique same-process staging and roll back registration faults", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-polyhaven-transaction-"));
  const gltf = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
  const modelFiles = { gltf: { "1k": { gltf: file("https://dl.polyhaven.org/rock.gltf", gltf) } } };
  const modelDependencies = dependencies(modelFiles, { "https://dl.polyhaven.org/rock.gltf": gltf });
  try {
    await Promise.all(["rock-a", "rock-b"].map((assetId) => importPolyHavenAsset({ assetId, format: "gltf", projectPath: root, providerAssetId: "rock_01", resolution: "1k", type: "models" }, modelDependencies)));
    assert.deepEqual(await readdir(join(root, ".threenative/staging")), []);

    const image = await solidPng(128);
    const textureFiles = { Diff: { "1k": { png: file("https://dl.polyhaven.org/fault_diff.png", image) } }, nor_gl: { "1k": { png: file("https://dl.polyhaven.org/fault_nor_gl.png", image) } }, Rough: { "1k": { png: file("https://dl.polyhaven.org/fault_rough.png", image) } } };
    let registrations = 0;
    const faultDependencies = { ...dependencies(textureFiles, { "https://dl.polyhaven.org/fault_diff.png": image, "https://dl.polyhaven.org/fault_nor_gl.png": image, "https://dl.polyhaven.org/fault_rough.png": image }, "image/png"), addAsset: async (options: Parameters<typeof addAsset>[0]) => {
      const result = await addAsset(options); registrations += 1;
      return registrations === 2 ? { ...result, diagnostics: [{ code: "TN_TEST_FAULT", message: "injected registration fault", severity: "error" as const }], ok: false } : result;
    } };
    await assert.rejects(importPolyHavenAsset({ assetId: "fault", format: "png", projectPath: root, providerAssetId: "fault_01", resolution: "1k", type: "textures" }, faultDependencies), /registration failed/);
    await assert.rejects(readFile(join(root, "assets/imported/polyhaven/fault/provenance.json")));
    const assetDocs = await readdir(join(root, "content/assets"));
    assert.equal(assetDocs.some((name) => name.startsWith("fault.")), false);
    await assert.rejects(readFile(join(root, "content/materials/fault.materials.json")));
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should reject oversized redirecting or mismatched downloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-polyhaven-reject-"));
  const prior = new TextEncoder().encode("prior");
  try {
    await assert.rejects(importPolyHavenAsset({ assetId: "unsafe", format: "gltf", maxBytes: 4, projectPath: root, providerAssetId: "unsafe_01", resolution: "1k", type: "models" }, dependencies({ gltf: { "1k": { gltf: file("https://dl.polyhaven.org/unsafe.gltf", prior) } } }, { "https://dl.polyhaven.org/unsafe.gltf": prior })), /budget/);
    await assert.rejects(importPolyHavenAsset({ assetId: "mismatch", format: "gltf", projectPath: root, providerAssetId: "mismatch_01", resolution: "1k", type: "models" }, dependencies({ gltf: { "1k": { gltf: file("https://dl.polyhaven.org/mismatch.gltf", prior) } } }, { "https://dl.polyhaven.org/mismatch.gltf": prior }, "text/plain")), /MIME/);
    const redirectFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/info/")) return jsonResponse({ authors: { Artist: "All" } });
      if (url.includes("/files/")) return jsonResponse({ gltf: { "1k": { gltf: file("https://dl.polyhaven.org/redirect.gltf", prior) } } });
      return new Response(null, { headers: { location: "https://example.com/escaped.gltf" }, status: 302 });
    }) as typeof fetch;
    await assert.rejects(importPolyHavenAsset({ assetId: "redirect", format: "gltf", projectPath: root, providerAssetId: "redirect_01", resolution: "1k", type: "models" }, { fetch: redirectFetch }), /not allowed/);
    await assert.rejects(readFile(join(root, "assets/imported/polyhaven/unsafe/provenance.json")));
    await assert.rejects(readFile(join(root, "content/assets/unsafe.assets.json")));
    await assert.rejects(readFile(join(root, "content/assets/mismatch.assets.json")));
    await assert.rejects(readFile(join(root, "content/assets/redirect.assets.json")));
  } finally { await rm(root, { force: true, recursive: true }); }
});

function liveAsset(name: string, downloads: number): Record<string, unknown> { return { authors: { Artist: "All" }, categories: ["rocks"], download_count: downloads, name, tags: ["rock"], thumbnail_url: "https://cdn.polyhaven.com/thumb.webp", type: 2 }; }
function file(url: string, bytes: Uint8Array): { md5: string; size: number; url: string } { return { md5: createHash("md5").update(bytes).digest("hex"), size: bytes.byteLength, url }; }
function jsonResponse(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status: 200 }); }
function dependencies(files: unknown, downloads: Record<string, Uint8Array>, mime = "model/gltf+json") {
  return { now: () => new Date("2026-07-14T00:00:00.000Z"), fetch: (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("/info/")) return jsonResponse({ authors: { "Test Artist": "All" }, name: "Fixture" });
    if (href.includes("/files/")) return jsonResponse(files);
    const bytes = downloads[href]; if (bytes === undefined) return new Response("missing", { status: 404 });
    return new Response(bytes, { headers: { "content-length": String(bytes.byteLength), "content-type": mime }, status: 200 });
  }) as typeof fetch };
}
async function solidPng(value: number): Promise<Uint8Array> { return sharp({ create: { background: { b: value, g: value, r: value }, channels: 3, height: 2, width: 2 } }).png().toBuffer(); }

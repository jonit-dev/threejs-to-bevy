import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import { addAsset, createEnvironmentDocument, createMaterial, setEnvironmentMap, setEnvironmentSkybox, setMaterial, type IAuthoringOperationResult } from "@threenative/authoring";
import sharp from "sharp";

import { searchAssetSources } from "../assetSourceCatalog/catalog.js";

// Official contract: https://api.polyhaven.com/api-docs/swagger.json
// Asset license: https://polyhaven.com/license
export const POLY_HAVEN_API = "https://api.polyhaven.com";
const POLY_HAVEN_LICENSE = "CC0-1.0";
const POLY_HAVEN_LICENSE_URL = "https://polyhaven.com/license";
const allowedDownloadHosts = new Set(["cdn.polyhaven.com", "dl.polyhaven.org"]);
const validTypes = new Set(["all", "hdris", "models", "textures"]);
const maxPageSize = 50;

export type PolyHavenAssetType = "all" | "hdris" | "models" | "textures";

export interface IPolyHavenAsset {
  authors: string[];
  categories: string[];
  downloadCount: number;
  id: string;
  name: string;
  previewUrl?: string;
  score: number;
  source: "live" | "snapshot";
  tags: string[];
  type: Exclude<PolyHavenAssetType, "all">;
}

export interface IPolyHavenDependencies {
  addAsset?: typeof addAsset;
  createEnvironmentDocument?: typeof createEnvironmentDocument;
  createMaterial?: typeof createMaterial;
  fetch?: typeof fetch;
  now?: () => Date;
  setEnvironmentMap?: typeof setEnvironmentMap;
  setEnvironmentSkybox?: typeof setEnvironmentSkybox;
  setMaterial?: typeof setMaterial;
}

export interface IPolyHavenImportOptions {
  assetId: string;
  format: string;
  maxBytes?: number;
  projectPath: string;
  providerAssetId: string;
  resolution: string;
  type: Exclude<PolyHavenAssetType, "all">;
}

interface ProviderFile { md5?: string; size?: number; url?: string; include?: Record<string, ProviderFile> }
interface DownloadedFile { bytes: number; md5: string; path: string; sha256: string; url: string }
interface DerivedFile { bytes: number; inputs: string[]; kind: "environment-png" | "metallic-roughness-png" | "model-glb"; path: string; sha256: string }
interface IAssimpResult { FileCount(): number; GetErrorCode(): unknown; GetFile(index: number): { GetContent(): Uint8Array }; IsSuccess(): boolean }
interface IAssimpModule { ConvertFileList(files: unknown, format: string): IAssimpResult; FileList: new () => { AddFile(name: string, bytes: Uint8Array): void } }

export async function polyHavenStatus(live = false, dependencies: IPolyHavenDependencies = {}): Promise<Record<string, unknown>> {
  const snapshot = await searchAssetSources({ limit: 1, query: "poly haven" });
  if (!live) return { available: snapshot.length > 0, liveRequested: false, provider: "poly-haven", source: "snapshot" };
  await requestJson(`${POLY_HAVEN_API}/types`, dependencies);
  return { available: true, liveRequested: true, provider: "poly-haven", source: "live" };
}

export async function listPolyHavenCategories(options: { live?: boolean; limit?: number; type: PolyHavenAssetType }, dependencies: IPolyHavenDependencies = {}): Promise<{ categories: Array<{ count: number; id: string }>; source: "live" | "snapshot" }> {
  assertType(options.type);
  const limit = boundedCount(options.limit);
  if (options.live !== true) {
    const rows = (await searchAssetSources({ limit: 100, query: "poly haven" })).filter((row) => {
      const type = normalizeType(row.sourceMetadata.polyhavenType);
      return type !== undefined && (options.type === "all" || type === options.type);
    });
    const counts = new Map<string, number>();
    for (const row of rows) for (const tag of [row.gameCategory, ...row.tags]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return { categories: [...counts].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([id, count]) => ({ count, id })), source: "snapshot" };
  }
  const payload = asRecord(await requestJson(`${POLY_HAVEN_API}/categories/${options.type}`, dependencies), "category response");
  return { categories: Object.entries(payload).filter(([, count]) => Number.isFinite(Number(count))).map(([id, count]) => ({ count: Number(count), id })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, limit), source: "live" };
}

export async function searchPolyHaven(options: { live?: boolean; limit?: number; page?: number; query?: string; type: PolyHavenAssetType }, dependencies: IPolyHavenDependencies = {}): Promise<{ page: number; results: IPolyHavenAsset[]; source: "live" | "snapshot" }> {
  assertType(options.type);
  const limit = boundedCount(options.limit);
  const page = Math.max(1, Math.min(Math.trunc(options.page ?? 1), 100));
  const query = options.query?.trim().toLowerCase() ?? "";
  let normalized: IPolyHavenAsset[];
  if (options.live === true) {
    const payload = asRecord(await requestJson(`${POLY_HAVEN_API}/assets?type=${encodeURIComponent(options.type)}`, dependencies), "asset response");
    normalized = Object.entries(payload).map(([id, value]) => normalizeLiveAsset(id, asRecord(value, `asset '${id}'`), query));
  } else {
    const rows = await searchAssetSources({ limit: 100, query: ["poly haven", query].filter(Boolean).join(" ") });
    normalized = rows.flatMap((row) => {
      const type = normalizeType(row.sourceMetadata.polyhavenType);
      return type === undefined ? [] : [{ authors: row.creator === null ? [] : [row.creator], categories: [row.gameCategory], downloadCount: 0, id: row.sourceMetadata.polyhavenId ?? row.id, name: row.directName || row.name, previewUrl: row.previewUrl ?? undefined, score: sourceScore(`${row.name} ${row.directName} ${row.tags.join(" ")}`, query), source: "snapshot" as const, tags: row.tags, type }];
    });
  }
  const ranked = normalized.filter((asset) => (options.type === "all" || asset.type === options.type) && (query === "" || asset.score > 0)).sort((a, b) => b.score - a.score || b.downloadCount - a.downloadCount || a.id.localeCompare(b.id));
  return { page, results: ranked.slice((page - 1) * limit, page * limit), source: options.live === true ? "live" : "snapshot" };
}

export async function importPolyHavenAsset(options: IPolyHavenImportOptions, dependencies: IPolyHavenDependencies = {}): Promise<Record<string, unknown>> {
  assertSafeId(options.assetId, "asset ID");
  assertSafeId(options.providerAssetId, "provider asset ID");
  const projectPath = resolve(options.projectPath);
  const destination = contained(projectPath, `assets/imported/polyhaven/${options.assetId}`);
  const staging = contained(projectPath, `.threenative/staging/polyhaven-${options.assetId}-${process.pid}-${randomUUID()}`);
  const provenancePath = resolve(destination, "provenance.json");
  const maxBytes = Math.max(1, Math.min(options.maxBytes ?? 256 * 1024 * 1024, 1024 * 1024 * 1024));
  const info = asRecord(await requestJson(`${POLY_HAVEN_API}/info/${encodeURIComponent(options.providerAssetId)}`, dependencies), "asset info");
  const files = asRecord(await requestJson(`${POLY_HAVEN_API}/files/${encodeURIComponent(options.providerAssetId)}`, dependencies), "asset files");
  const selected = selectProviderFiles(files, options.type, options.resolution, options.format);
  if (selected.length === 0) throw new Error(`Poly Haven asset '${options.providerAssetId}' has no provider-declared ${options.resolution} ${options.format} files for ${options.type}.`);
  if (selected.length > 128 || new Set(selected.map((entry) => entry.path)).size !== selected.length) throw new Error("Poly Haven file selection is oversized or contains duplicate durable paths.");
  if (await exists(destination)) throw new Error(`Poly Haven destination '${relative(projectPath, destination)}' already exists; choose a new asset ID.`);
  await rm(staging, { force: true, recursive: true });
  await mkdir(staging, { recursive: true });
  try {
    let consumed = 0;
    const downloaded: DownloadedFile[] = [];
    for (const entry of selected) {
      const remaining = maxBytes - consumed;
      const result = await downloadProviderFile(entry.file, resolve(staging, entry.path), remaining, dependencies);
      consumed += result.bytes;
      downloaded.push(result);
    }
    const derived = await deriveProviderFiles(options, downloaded, staging);
    if (consumed + derived.reduce((total, file) => total + file.bytes, 0) > maxBytes) throw new Error("Downloaded and derived Poly Haven files exceed the bounded import byte budget.");
    const provenance = {
      schema: "threenative.asset-provider-provenance", version: "0.1.0", provider: "poly-haven", providerAssetId: options.providerAssetId,
      sourceUrl: `https://polyhaven.com/a/${options.providerAssetId}`, apiInfoUrl: `${POLY_HAVEN_API}/info/${options.providerAssetId}`, license: POLY_HAVEN_LICENSE,
      licenseUrl: POLY_HAVEN_LICENSE_URL, authors: Object.keys(asRecord(info.authors ?? {}, "authors")), resolution: options.resolution, format: options.format,
      retrievedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      files: downloaded.map((file) => ({ ...file, path: relative(staging, file.path).split(sep).join("/") })),
      derived: derived.map((file) => ({ ...file, inputs: file.inputs.map((input) => relative(staging, input).split(sep).join("/")), path: relative(staging, file.path).split(sep).join("/") })),
    };
    await writeFile(resolve(staging, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
    await mkdir(dirname(destination), { recursive: true });
    await rename(staging, destination);

    const durableFiles = [...downloaded, ...derived].map((file) => `assets/imported/polyhaven/${options.assetId}/${relative(staging, file.path).split(sep).join("/")}`);
    const sourcePaths = registrationSourcePaths(options, projectPath, durableFiles);
    if ((await Promise.all(sourcePaths.map(exists))).some(Boolean)) {
      await rm(destination, { force: true, recursive: true });
      throw new Error("Poly Haven import would replace existing asset or material source; choose a new asset ID.");
    }
    const snapshots = await Promise.all(sourcePaths.map(async (path) => ({ bytes: await readOptional(path), path })));
    let registration;
    try {
      registration = await registerImportedAsset(options, projectPath, durableFiles, info, dependencies);
      if (!registration.ok) throw new Error(`Poly Haven asset registration failed: ${registration.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
    } catch (error) {
      await Promise.all(snapshots.map(restoreSnapshot));
      await rm(destination, { force: true, recursive: true });
      throw error;
    }
    return { assetId: options.assetId, code: "TN_POLY_HAVEN_IMPORT_OK", files: durableFiles, filesWritten: [...registration.filesWritten, relative(projectPath, provenancePath).split(sep).join("/")], provenance, source: "live" };
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }
}

async function registerImportedAsset(options: IPolyHavenImportOptions, projectPath: string, files: string[], info: Record<string, unknown>, dependencies: IPolyHavenDependencies): Promise<IAuthoringOperationResult> {
  const attribution = Object.keys(asRecord(info.authors ?? {}, "authors")).join(", ") || "Poly Haven";
  const registerAsset = dependencies.addAsset ?? addAsset;
  if (options.type === "models") {
    const path = files.find((file) => file.endsWith("/model.glb")) ?? files.find((file) => file.endsWith(`.${options.format}`)) ?? files[0];
    if (path === undefined) throw new Error("Poly Haven model import has no durable model file.");
    const inspection = await (await import("../commands/asset.js")).inspectAsset(resolve(projectPath, path));
    if (inspection.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw new Error(`Poly Haven model inspection failed: ${inspection.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
    return registerAsset({ assetId: options.assetId, attribution, license: POLY_HAVEN_LICENSE, path, projectPath, source: `poly-haven:${options.providerAssetId}`, type: "model" });
  }
  if (options.type === "hdris") {
    const path = files.find((file) => file.endsWith("/environment.png"));
    if (path === undefined) throw new Error("Poly Haven HDRI conversion did not produce a runtime-supported environment PNG.");
    const registered = await registerAsset({ assetId: options.assetId, attribution, license: POLY_HAVEN_LICENSE, path, projectPath, source: `poly-haven:${options.providerAssetId}`, type: "texture" });
    if (!registered.ok) return registered;
    const created = await (dependencies.createEnvironmentDocument ?? createEnvironmentDocument)({ environmentId: options.assetId, projectPath });
    if (!created.ok) return created;
    const environmentMap = await (dependencies.setEnvironmentMap ?? setEnvironmentMap)({ asset: options.assetId, environmentId: options.assetId, projectPath });
    if (!environmentMap.ok) return environmentMap;
    const skybox = await (dependencies.setEnvironmentSkybox ?? setEnvironmentSkybox)({ asset: options.assetId, environmentId: options.assetId, mode: "equirect", projectPath });
    if (!skybox.ok) return skybox;
    return { ...skybox, filesWritten: [...new Set([...registered.filesWritten, ...created.filesWritten, ...environmentMap.filesWritten, ...skybox.filesWritten])] };
  }
  const slots = textureSlots(files, options.assetId);
  const results: IAuthoringOperationResult[] = [];
  for (const [path, assetId] of Object.entries(slots.assets)) {
    const result = await registerAsset({ assetId, attribution, license: POLY_HAVEN_LICENSE, path, projectPath, source: `poly-haven:${options.providerAssetId}`, type: "texture" });
    results.push(result);
    if (!result.ok) return { ...result, filesWritten: results.flatMap((entry) => entry.filesWritten) };
  }
  const created = await (dependencies.createMaterial ?? createMaterial)({ materialId: options.assetId, projectPath });
  if (!created.ok) return created;
  const material = await (dependencies.setMaterial ?? setMaterial)({ materialId: options.assetId, projectPath, ...slots.material });
  if (!material.ok) return material;
  return { ...material, filesWritten: [...new Set([...results.flatMap((result) => result.filesWritten), ...created.filesWritten, ...material.filesWritten])] };
}

function textureSlots(files: string[], id: string): { assets: Record<string, string>; material: Record<string, string> } {
  const assets: Record<string, string> = {}; const material: Record<string, string> = {};
  for (const path of files) {
    const name = basename(path).toLowerCase();
    const mapping = name.includes("diff") ? ["baseColorTexture", "base-color"] : name.includes("nor_gl") || name.includes("normal_gl") ? ["normalTexture", "normal"] : name === "metallic-roughness.png" ? ["metallicRoughnessTexture", "metallic-roughness"] : name.includes("ao") ? ["occlusionTexture", "occlusion"] : undefined;
    if (mapping !== undefined && material[mapping[0]!] === undefined) {
      const assetId = `${id}.${mapping[1]}`; assets[path] = assetId; material[mapping[0]!] = assetId;
      continue;
    }
    if (/\.(?:jpe?g|png|webp)$/u.test(name) && name !== "metallic-roughness.png") assets[path] = `${id}.source-${safeAssetSuffix(name.replace(/\.[^.]+$/u, ""))}`;
  }
  if (material.baseColorTexture === undefined || material.normalTexture === undefined || material.metallicRoughnessTexture === undefined) throw new Error("Poly Haven texture set is missing required diffuse, OpenGL normal, or roughness/metallic maps.");
  return { assets, material };
}

async function deriveProviderFiles(options: IPolyHavenImportOptions, files: DownloadedFile[], staging: string): Promise<DerivedFile[]> {
  if (options.type === "models") return packExternalGltf(files, staging);
  if (options.type === "hdris") {
    const input = files.find((file) => /\.(?:jpe?g|png|webp)$/iu.test(file.path))?.path;
    if (input === undefined) throw new Error("Raw HDR/EXR cannot enter the current ThreeNative environment texture boundary and this asset has no provider-declared tonemapped image fallback.");
    const path = resolve(staging, "environment.png");
    await sharp(input).removeAlpha().toColourspace("srgb").png({ compressionLevel: 9 }).toFile(path);
    return [await derivedFile(path, "environment-png", [input])];
  }
  const roughness = files.find((file) => /(?:^|[_-])rough(?:ness)?(?:[_-]|\.)/iu.test(basename(file.path)))?.path;
  const metallic = files.find((file) => /(?:^|[_-])metal(?:lic)?(?:[_-]|\.)/iu.test(basename(file.path)))?.path;
  if (roughness === undefined) throw new Error("Poly Haven texture set is missing its provider-declared roughness map.");
  const rough = await sharp(roughness).greyscale().raw().toBuffer({ resolveWithObject: true });
  const metal = metallic === undefined ? undefined : await sharp(metallic).greyscale().resize(rough.info.width, rough.info.height, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const packed = Buffer.alloc(rough.info.width * rough.info.height * 4);
  for (let pixel = 0; pixel < rough.info.width * rough.info.height; pixel += 1) {
    packed[pixel * 4] = 255;
    packed[pixel * 4 + 1] = rough.data[pixel * rough.info.channels] ?? 255;
    packed[pixel * 4 + 2] = metal?.data[pixel * (metal.info.channels ?? 1)] ?? 0;
    packed[pixel * 4 + 3] = 255;
  }
  const path = resolve(staging, "metallic-roughness.png");
  await sharp(packed, { raw: { channels: 4, height: rough.info.height, width: rough.info.width } }).png({ compressionLevel: 9 }).toFile(path);
  return [await derivedFile(path, "metallic-roughness-png", [roughness, ...(metallic === undefined ? [] : [metallic])])];
}

async function packExternalGltf(files: DownloadedFile[], staging: string): Promise<DerivedFile[]> {
  const gltf = files.find((file) => file.path.endsWith(".gltf"));
  if (gltf === undefined) return [];
  const document = JSON.parse(await readFile(gltf.path, "utf8")) as { buffers?: Array<{ uri?: unknown }>; images?: Array<{ uri?: unknown }> };
  const external = [...(document.buffers ?? []), ...(document.images ?? [])].some((entry) => typeof entry.uri === "string" && !entry.uri.startsWith("data:"));
  if (!external) return [];
  const moduleName = "assimpjs";
  const loaded = await import(moduleName) as { default?: () => Promise<IAssimpModule> };
  if (loaded.default === undefined) throw new Error("Poly Haven glTF packing requires the CLI optional assimpjs dependency.");
  const assimp = await loaded.default(); const input = new assimp.FileList();
  for (const file of files) input.AddFile(relative(staging, file.path).split(sep).join("/"), await readFile(file.path));
  const converted = assimp.ConvertFileList(input, "glb2");
  if (!converted.IsSuccess() || converted.FileCount() !== 1) throw new Error(`Poly Haven glTF packing failed: ${String(converted.GetErrorCode())}`);
  const bytes = Buffer.from(converted.GetFile(0).GetContent());
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("Poly Haven glTF packing produced an invalid GLB.");
  const path = resolve(staging, "model.glb"); await writeFile(path, bytes);
  return [await derivedFile(path, "model-glb", files.map((file) => file.path))];
}

async function derivedFile(path: string, kind: DerivedFile["kind"], inputs: string[]): Promise<DerivedFile> {
  const bytes = await readFile(path);
  return { bytes: bytes.byteLength, inputs, kind, path, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function safeAssetSuffix(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "texture"; }

function selectProviderFiles(tree: Record<string, unknown>, type: IPolyHavenImportOptions["type"], resolution: string, format: string): Array<{ file: ProviderFile; path: string }> {
  const rootKey = type === "hdris" ? "hdri" : type === "models" ? "gltf" : undefined;
  const selected: Array<{ file: ProviderFile; path: string }> = [];
  if (rootKey !== undefined) {
    const leaf = asOptionalFile(asRecord(asRecord(tree[rootKey] ?? {}, rootKey)[resolution] ?? {}, resolution)[format]);
    if (leaf !== undefined) appendFile(selected, leaf, basename(new URL(leaf.url!).pathname));
    if (type === "hdris" && (format === "hdr" || format === "exr")) {
      const tonemapped = asOptionalFile(tree.tonemapped);
      if (tonemapped !== undefined) appendFile(selected, tonemapped, "tonemapped.jpg");
    }
    return selected;
  }
  for (const [map, resolutions] of Object.entries(tree).sort(([a], [b]) => a.localeCompare(b))) {
    if (["blend", "gltf", "mtlx"].includes(map)) continue;
    const leaf = asOptionalFile(asRecord(asRecord(resolutions, map)[resolution] ?? {}, resolution)[format]);
    if (leaf !== undefined) appendFile(selected, leaf, basename(new URL(leaf.url!).pathname));
  }
  return selected;
}

function appendFile(selected: Array<{ file: ProviderFile; path: string }>, file: ProviderFile, path: string): void {
  selected.push({ file, path: safeRelativePath(path) });
  for (const [includePath, included] of Object.entries(file.include ?? {}).sort(([a], [b]) => a.localeCompare(b))) appendFile(selected, included, safeRelativePath(includePath));
}

async function downloadProviderFile(file: ProviderFile, path: string, maxBytes: number, dependencies: IPolyHavenDependencies): Promise<DownloadedFile> {
  if (file.url === undefined || file.size === undefined || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes) throw new Error("Provider-declared file size exceeds the bounded download budget.");
  const expectedExtension = extname(new URL(file.url).pathname).toLowerCase();
  if (expectedExtension === "" || extname(path).toLowerCase() !== expectedExtension) throw new Error("Provider file extension does not match its durable path.");
  const response = await fetchWithRedirects(file.url, dependencies, 3);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("Download Content-Length exceeds the bounded download budget.");
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mimeMatches(expectedExtension, contentType)) throw new Error(`Download MIME '${contentType ?? "missing"}' does not match '${expectedExtension}'.`);
  const bytes = await readResponseBytes(response, maxBytes);
  if (bytes.byteLength > maxBytes || bytes.byteLength !== file.size) throw new Error("Downloaded byte count does not match the provider declaration or budget.");
  const md5 = createHash("md5").update(bytes).digest("hex");
  if (file.md5 !== undefined && md5 !== file.md5.toLowerCase()) throw new Error("Downloaded file MD5 does not match the provider declaration.");
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  return { bytes: bytes.byteLength, md5, path, sha256: createHash("sha256").update(bytes).digest("hex"), url: response.url || file.url };
}

async function fetchWithRedirects(url: string, dependencies: IPolyHavenDependencies, remaining: number): Promise<Response> {
  const parsed = new URL(url); if (parsed.protocol !== "https:" || !allowedDownloadHosts.has(parsed.hostname)) throw new Error(`Poly Haven download host '${parsed.hostname}' is not allowed.`);
  const response = await (dependencies.fetch ?? fetch)(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (response.status >= 300 && response.status < 400) {
    if (remaining === 0) throw new Error("Poly Haven download exceeded the redirect limit.");
    const location = response.headers.get("location"); if (location === null) throw new Error("Poly Haven redirect is missing Location.");
    return fetchWithRedirects(new URL(location, url).href, dependencies, remaining - 1);
  }
  if (!response.ok) throw new Error(`Poly Haven download failed with HTTP ${response.status}.`);
  return response;
}

async function requestJson(url: string, dependencies: IPolyHavenDependencies): Promise<unknown> {
  const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.hostname !== "api.polyhaven.com") throw new Error("Poly Haven API request escaped the official API host.");
  const response = await (dependencies.fetch ?? fetch)(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Poly Haven API failed with HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length")); if (Number.isFinite(length) && length > 16 * 1024 * 1024) throw new Error("Poly Haven API response is oversized.");
  const bytes = await readResponseBytes(response, 16 * 1024 * 1024);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > maxBytes) throw new Error("Response body exceeds the bounded byte budget.");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function registrationSourcePaths(options: IPolyHavenImportOptions, projectPath: string, files: string[]): string[] {
  if (options.type === "models") return [resolve(projectPath, `content/assets/${options.assetId}.assets.json`)];
  if (options.type === "hdris") return [resolve(projectPath, `content/assets/${options.assetId}.assets.json`), resolve(projectPath, `content/environment/${options.assetId}.environment.json`)];
  const slots = textureSlots(files, options.assetId);
  return [...Object.values(slots.assets).map((id) => resolve(projectPath, `content/assets/${id}.assets.json`)), resolve(projectPath, `content/materials/${options.assetId}.materials.json`)];
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
async function readOptional(path: string): Promise<Uint8Array | undefined> { try { return await readFile(path); } catch { return undefined; } }
async function restoreSnapshot(snapshot: { bytes: Uint8Array | undefined; path: string }): Promise<void> { if (snapshot.bytes === undefined) { await rm(snapshot.path, { force: true }); return; } await mkdir(dirname(snapshot.path), { recursive: true }); await writeFile(snapshot.path, snapshot.bytes); }

function normalizeLiveAsset(id: string, value: Record<string, unknown>, query: string): IPolyHavenAsset {
  const type = value.type === 0 ? "hdris" : value.type === 1 ? "textures" : "models";
  const name = typeof value.name === "string" ? value.name : id; const tags = stringArray(value.tags); const categories = stringArray(value.categories);
  return { authors: Object.keys(asRecord(value.authors ?? {}, "authors")), categories, downloadCount: Number(value.download_count) || 0, id, name, previewUrl: typeof value.thumbnail_url === "string" ? value.thumbnail_url : undefined, score: sourceScore(`${id} ${name} ${tags.join(" ")} ${categories.join(" ")}`, query), source: "live", tags, type };
}
function sourceScore(text: string, query: string): number {
  if (query === "") return 1;
  const tokens = new Set(text.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean));
  return query.split(/\s+/u).reduce((score, term) => score + (tokens.has(term) ? 3 : 0), 0);
}
function normalizeType(value: string | undefined): Exclude<PolyHavenAssetType, "all"> | undefined { return value === "hdri" || value === "hdris" ? "hdris" : value === "model" || value === "models" ? "models" : value === "texture" || value === "textures" ? "textures" : undefined; }
function boundedCount(value: number | undefined): number { return Math.max(1, Math.min(Math.trunc(value ?? 20), maxPageSize)); }
function assertType(type: string): asserts type is PolyHavenAssetType { if (!validTypes.has(type)) throw new Error(`Unsupported Poly Haven asset type '${type}'.`); }
function assertSafeId(value: string, label: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) throw new Error(`Poly Haven ${label} is invalid.`); }
function contained(root: string, path: string): string { const result = resolve(root, path); const rel = relative(resolve(root), result); if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Poly Haven output path escaped the project."); return result; }
function safeRelativePath(path: string): string { const normalized = path.replace(/\\/gu, "/"); if (normalized === "" || normalized.startsWith("/") || normalized.split("/").includes("..")) throw new Error("Provider include path is unsafe."); return normalized; }
function asRecord(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Poly Haven ${label} must be an object.`); return value as Record<string, unknown>; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function asOptionalFile(value: unknown): ProviderFile | undefined { if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined; const file = value as ProviderFile; return typeof file.url === "string" && Number.isSafeInteger(file.size) ? file : undefined; }
function mimeMatches(extension: string, mime: string | undefined): boolean { const expected: Record<string, string[]> = { ".exr": ["image/x-exr", "application/octet-stream"], ".gltf": ["model/gltf+json", "application/json", "application/octet-stream"], ".hdr": ["image/vnd.radiance", "application/octet-stream"], ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"], ".png": ["image/png"], ".bin": ["application/octet-stream"] }; return mime !== undefined && (expected[extension]?.includes(mime) ?? false); }

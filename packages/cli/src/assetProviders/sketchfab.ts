import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

import { addAsset } from "@threenative/authoring";

// Official API and download contracts:
// https://docs.sketchfab.com/data-api/v3/index.html
// https://sketchfab.com/developers/download-api/downloading-models
// Authenticated downloads use an end user's OAuth Bearer token. This CLI path
// is for the user's own first-party workflow; distributed third-party apps must
// implement Sketchfab OAuth and satisfy the Download API agreement/guidelines.
export const SKETCHFAB_API = "https://api.sketchfab.com/v3";
const maxApiBytes = 8 * 1024 * 1024;
const maxPreviewBytes = 5 * 1024 * 1024;
const maxArchiveBytes = 256 * 1024 * 1024;
const maxExtractedBytes = 512 * 1024 * 1024;
const maxArchiveEntries = 256;
const maxSearchRows = 24;
const maxTriangles = 2_000_000;
const authUsage = "Personal user-authorized first-party CLI workflow; third-party apps require their own Sketchfab OAuth integration and applicable agreement.";

export interface ISketchfabDependencies {
  addAsset?: typeof addAsset;
  credential?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface ISketchfabSearchRow {
  author: { name: string; profileUrl?: string };
  faceCount?: number;
  formats: string[];
  license: { id: string; label: string; providerUid?: string; url?: string };
  name: string;
  preview?: { height?: number; url: string; width?: number };
  sourceUrl: string;
  uid: string;
}

export interface ISketchfabImportOptions {
  acceptedLicense: string;
  assetId: string;
  maxBytes?: number;
  modelUid: string;
  projectPath: string;
  targetSize: number;
}

interface IZipEntry { compressedSize: number; compression: number; crc32: number; externalAttributes: number; localOffset: number; name: string; size: number }

export async function sketchfabStatus(live = false, dependencies: ISketchfabDependencies = {}): Promise<Record<string, unknown>> {
  const credential = resolveCredential(dependencies);
  if (credential === undefined) return { authentication: "user-oauth-bearer", authUsage, available: false, credential: "missing", liveRequested: live, provider: "sketchfab" };
  if (!live) return { authentication: "user-oauth-bearer", authUsage, available: true, credential: "configured", liveRequested: false, provider: "sketchfab" };
  try {
    asRecord(await requestJson(`${SKETCHFAB_API}/me`, dependencies, true), "account response");
    return { authentication: "user-oauth-bearer", authUsage, available: true, credential: "valid", liveRequested: true, provider: "sketchfab" };
  } catch (error) {
    if (error instanceof SketchfabHttpError && (error.status === 401 || error.status === 403)) {
      return { authentication: "user-oauth-bearer", authUsage, available: false, credential: "invalid", liveRequested: true, provider: "sketchfab" };
    }
    throw error;
  }
}

export async function searchSketchfab(options: { cursor?: string; limit?: number; query?: string }, dependencies: ISketchfabDependencies = {}): Promise<{ nextCursor?: string; results: ISketchfabSearchRow[] }> {
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 12), maxSearchRows));
  const query = options.query?.trim() ?? "";
  const url = new URL(`${SKETCHFAB_API}/search`);
  url.searchParams.set("type", "models");
  url.searchParams.set("downloadable", "true");
  url.searchParams.set("count", String(limit));
  if (query !== "") url.searchParams.set("q", query);
  if (options.cursor !== undefined) {
    if (!/^[A-Za-z0-9._~-]{1,128}$/u.test(options.cursor)) throw new Error("Sketchfab search cursor is invalid.");
    url.searchParams.set("cursor", options.cursor);
  }
  const payload = asRecord(await requestJson(url.href, dependencies, false), "search response");
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const cursors = isRecord(payload.cursors) ? payload.cursors : {};
  return {
    ...(typeof cursors.next === "string" && cursors.next.length <= 128 ? { nextCursor: cursors.next } : {}),
    results: rows.map(normalizeSearchRow).filter((row): row is ISketchfabSearchRow => row !== undefined).slice(0, limit),
  };
}

export async function fetchSketchfabPreview(modelUid: string, dependencies: ISketchfabDependencies = {}): Promise<{ bytes: Uint8Array; mimeType: string; sha256: string; uid: string }> {
  assertUid(modelUid);
  const model = asRecord(await requestJson(`${SKETCHFAB_API}/models/${encodeURIComponent(modelUid)}`, dependencies, false), "model response");
  const preview = selectThumbnail(model.thumbnails);
  if (preview === undefined) throw new Error(`Sketchfab model '${modelUid}' has no preview thumbnail.`);
  const response = await fetchBounded(preview.url, dependencies, maxPreviewBytes, "preview");
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") throw new Error("Sketchfab preview has an unsupported image MIME type.");
  const artifact = await mkdtemp(resolve(tmpdir(), "threenative-sketchfab-preview-"));
  const path = resolve(artifact, `preview${mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg"}`);
  try {
    const bytes = await readResponseBytes(response, maxPreviewBytes);
    await writeFile(path, bytes);
    const verified = await readFile(path);
    return { bytes: verified, mimeType, sha256: createHash("sha256").update(verified).digest("hex"), uid: modelUid };
  } finally {
    await rm(artifact, { force: true, recursive: true });
  }
}

export async function importSketchfabModel(options: ISketchfabImportOptions, dependencies: ISketchfabDependencies = {}): Promise<Record<string, unknown>> {
  assertUid(options.modelUid);
  assertSafeId(options.assetId, "asset ID");
  if (options.acceptedLicense.trim() === "") throw new Error("Sketchfab import requires explicit license acceptance.");
  if (!Number.isFinite(options.targetSize) || options.targetSize <= 0 || options.targetSize > 10_000) throw new Error("Sketchfab target size must be a finite value greater than zero and at most 10000 meters.");
  if (resolveCredential(dependencies) === undefined) throw new Error("Sketchfab download requires THREENATIVE_SKETCHFAB_OAUTH_TOKEN or an injected user OAuth access token.");

  const projectPath = resolve(options.projectPath);
  const destination = contained(projectPath, `assets/imported/sketchfab/${options.assetId}`);
  const assetDocument = contained(projectPath, `content/assets/${options.assetId}.assets.json`);
  if (await exists(destination) || await exists(assetDocument)) throw new Error(`Sketchfab asset '${options.assetId}' already exists; choose a new asset ID.`);
  const staging = contained(projectPath, `.threenative/staging/sketchfab-${options.assetId}-${process.pid}-${Date.now()}`);
  await mkdir(staging, { recursive: true });
  try {
    const model = asRecord(await requestJson(`${SKETCHFAB_API}/models/${encodeURIComponent(options.modelUid)}`, dependencies, false), "model response");
    const license = normalizeLicense(model.license);
    if (license.id === "unknown" || !sameLicense(options.acceptedLicense, license)) {
      throw new Error(`Sketchfab license acceptance '${options.acceptedLicense}' does not match the selected model license '${license.id}'.`);
    }
    if (model.isDownloadable !== true) throw new Error(`Sketchfab model '${options.modelUid}' is not downloadable.`);

    const download = asRecord(await requestJson(`${SKETCHFAB_API}/models/${encodeURIComponent(options.modelUid)}/download`, dependencies, true), "download response");
    const gltfArchive = asRecord(download.gltf, "glTF download");
    const signedUrl = typeof gltfArchive.url === "string" ? gltfArchive.url : undefined;
    const declaredSize = finiteInteger(gltfArchive.size);
    const byteBudget = Math.max(1, Math.min(Math.trunc(options.maxBytes ?? maxArchiveBytes), maxArchiveBytes));
    if (signedUrl === undefined) throw new Error("Sketchfab did not provide a glTF archive for this model.");
    if (declaredSize !== undefined && declaredSize > byteBudget) throw new Error("Sketchfab archive exceeds the requested byte budget.");
    const archiveResponse = await fetchBounded(signedUrl, dependencies, byteBudget, "archive");
    const archiveMime = archiveResponse.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    if (archiveMime !== undefined && archiveMime !== "application/zip" && archiveMime !== "application/octet-stream") throw new Error("Sketchfab archive has an unsupported MIME type.");
    const archive = await readResponseBytes(archiveResponse, byteBudget);
    const archiveHash = createHash("sha256").update(archive).digest("hex");
    const extracted = resolve(staging, "files");
    await mkdir(extracted, { recursive: true });
    await extractSafeZip(archive, extracted);
    const modelPath = await selectModelFile(extracted);
    const inspectionModule = await import("../commands/asset.js");
    const before = await inspectionModule.inspectAsset(modelPath);
    const originalBounds = requireBounds(before);
    const originalLargest = Math.max(...originalBounds.size);
    if (!Number.isFinite(originalLargest) || originalLargest <= 0) throw new Error("Sketchfab model has empty or invalid combined hierarchy bounds.");
    const appliedScale = options.targetSize / originalLargest;
    await applyUniformSceneRootScale(modelPath, appliedScale);
    const after = await inspectionModule.inspectAsset(modelPath);
    const normalizedBounds = requireBounds(after);
    const normalizedLargest = Math.max(...normalizedBounds.size);
    if (Math.abs(normalizedLargest - options.targetSize) > Math.max(0.001, options.targetSize * 0.001)) throw new Error("Sketchfab normalized bounds did not match the requested target size.");
    if ((after.counts?.triangles ?? 0) > maxTriangles) throw new Error(`Sketchfab model exceeds the ${maxTriangles} triangle import budget.`);
    for (const dependency of after.dependencies ?? []) {
      if (dependency.embedded) continue;
      const uri = dependency.uri;
      if (uri !== undefined && (uri.startsWith("//") || (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(uri) && !uri.startsWith("data:")))) throw new Error("Sketchfab model contains a non-data remote dependency URI.");
      if (dependency.path === undefined) throw new Error("Sketchfab model dependency could not be resolved inside the extracted archive.");
      const dependencyRelative = relative(extracted, dependency.path);
      if (dependencyRelative.startsWith("..") || isAbsolute(dependencyRelative)) throw new Error("Sketchfab model dependency escapes the extracted archive root.");
    }
    if (after.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw new Error(`Sketchfab model inspection failed: ${after.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);

    const user = asRecord(model.user ?? {}, "model author");
    const author = typeof user.displayName === "string" ? user.displayName : typeof user.username === "string" ? user.username : "Sketchfab creator";
    const publicSourceUrl = typeof model.viewerUrl === "string" ? model.viewerUrl : `https://sketchfab.com/3d-models/${options.modelUid}`;
    const relativeModelPath = relative(extracted, modelPath).split(sep).join("/");
    const extractedFiles: Array<{ bytes: number; path: string; sha256: string }> = [];
    for (const path of (await listFiles(extracted)).sort()) {
      const bytes = await readFile(path);
      extractedFiles.push({ bytes: bytes.byteLength, path: relative(extracted, path).split(sep).join("/"), sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const provenance = {
      appliedScale,
      archive: { bytes: archive.byteLength, sha256: archiveHash },
      author: { name: author, profileUrl: typeof user.profileUrl === "string" ? user.profileUrl : undefined },
      files: extractedFiles,
      license: { ...license, accepted: true },
      modelPath: relativeModelPath,
      originalBounds,
      provider: "sketchfab",
      providerAssetId: options.modelUid,
      retrievedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      schema: "threenative.asset-provider-provenance",
      sourceUrl: publicSourceUrl,
      targetSizeMeters: options.targetSize,
      version: "0.1.0",
    };
    await writeFile(resolve(staging, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
    await mkdir(dirname(destination), { recursive: true });
    await rename(staging, destination);
    const durableModelPath = `assets/imported/sketchfab/${options.assetId}/files/${relativeModelPath}`;
    let registration;
    try {
      registration = await (dependencies.addAsset ?? addAsset)({ assetId: options.assetId, attribution: `${author} (${publicSourceUrl})`, license: license.id, path: durableModelPath, projectPath, source: `sketchfab:${options.modelUid}`, type: "model" });
      if (!registration.ok) throw new Error(`Sketchfab asset registration failed: ${registration.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
    } catch (error) {
      await rm(destination, { force: true, recursive: true });
      await rm(assetDocument, { force: true });
      throw error;
    }
    return {
      appliedScale,
      assetId: options.assetId,
      bounds: normalizedBounds,
      code: "TN_SKETCHFAB_IMPORT_OK",
      filesWritten: [...registration.filesWritten, ...extractedFiles.map((file) => `assets/imported/sketchfab/${options.assetId}/files/${file.path}`), `assets/imported/sketchfab/${options.assetId}/provenance.json`],
      inspection: { counts: after.counts, diagnostics: after.diagnostics },
      modelPath: durableModelPath,
      provenance,
    };
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }
}

function resolveCredential(dependencies: ISketchfabDependencies): string | undefined {
  const value = dependencies.credential ?? process.env.THREENATIVE_SKETCHFAB_OAUTH_TOKEN;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function requestJson(url: string, dependencies: ISketchfabDependencies, authenticated: boolean): Promise<unknown> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.sketchfab.com" || !parsed.pathname.startsWith("/v3/")) throw new Error("Sketchfab API request escaped the official v3 API host.");
  const credential = resolveCredential(dependencies);
  if (authenticated && credential === undefined) throw new Error("Sketchfab authenticated operation requires a user OAuth access token.");
  const response = await safeFetch(dependencies, url, { headers: authenticated ? { Authorization: `Bearer ${credential}` } : undefined, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new SketchfabHttpError(response.status);
  return JSON.parse(new TextDecoder().decode(await readResponseBytes(response, maxApiBytes)));
}

async function fetchBounded(url: string, dependencies: ISketchfabDependencies, maxBytes: number, kind: "archive" | "preview", redirects = 3): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !allowedContentHost(parsed.hostname, kind)) throw new Error(`Sketchfab ${kind} host is not allowed.`);
  const response = await safeFetch(dependencies, url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (response.status >= 300 && response.status < 400) {
    if (redirects === 0) throw new Error(`Sketchfab ${kind} exceeded the redirect limit.`);
    const location = response.headers.get("location");
    if (location === null) throw new Error(`Sketchfab ${kind} redirect is missing Location.`);
    return fetchBounded(new URL(location, url).href, dependencies, maxBytes, kind, redirects - 1);
  }
  if (!response.ok) throw new SketchfabHttpError(response.status);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error(`Sketchfab ${kind} exceeds the bounded byte budget.`);
  return response;
}

function allowedContentHost(hostname: string, kind: "archive" | "preview"): boolean {
  if (kind === "preview") return hostname === "media.sketchfab.com" || hostname.endsWith(".sketchfab.com");
  return hostname === "sketchfab-prod-media.s3.amazonaws.com" || hostname === "sketchfab-prod-media.s3-accelerate.amazonaws.com" || hostname.endsWith(".sketchfab.com");
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > maxBytes) throw new Error("Sketchfab response exceeds the bounded byte budget.");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function safeFetch(dependencies: ISketchfabDependencies, input: string, init: RequestInit): Promise<Response> {
  try { return await (dependencies.fetch ?? fetch)(input, init); }
  catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new Error(name === "AbortError" || name === "TimeoutError" ? "Sketchfab request timed out." : "Sketchfab request could not be reached.");
  }
}

async function extractSafeZip(bytes: Uint8Array, destination: string): Promise<void> {
  const buffer = Buffer.from(bytes);
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== buffer.length || buffer.readUInt16LE(eocd + 4) !== 0 || buffer.readUInt16LE(eocd + 6) !== 0 || buffer.readUInt16LE(eocd + 8) !== entryCount || entryCount > maxArchiveEntries || centralOffset + centralSize > eocd) throw new Error("Sketchfab archive directory is invalid or oversized.");
  const entries: IZipEntry[] = []; const names = new Set<string>(); let cursor = centralOffset; let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) throw new Error("Sketchfab archive central directory is truncated.");
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Sketchfab archive central directory is malformed.");
    const flags = buffer.readUInt16LE(cursor + 8); const compression = buffer.readUInt16LE(cursor + 10);
    const crc32 = buffer.readUInt32LE(cursor + 16); const compressedSize = buffer.readUInt32LE(cursor + 20); const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28); const extraLength = buffer.readUInt16LE(cursor + 30); const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38); const localOffset = buffer.readUInt32LE(cursor + 42);
    if ((flags & 1) !== 0 || (compression !== 0 && compression !== 8) || compressedSize === 0xffffffff || size === 0xffffffff) throw new Error("Sketchfab archive uses an unsupported ZIP feature.");
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"); const safe = safeArchivePath(name);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error("Sketchfab archive contains a symbolic link.");
    if (safe !== "" && !safe.endsWith("/")) {
      const folded = safe.toLowerCase(); if (names.has(folded)) throw new Error("Sketchfab archive contains duplicate paths."); names.add(folded);
      total += size; if (total > maxExtractedBytes) throw new Error("Sketchfab archive exceeds the extracted byte budget.");
      entries.push({ compressedSize, compression, crc32, externalAttributes, localOffset, name: safe, size });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("Sketchfab archive central directory size is inconsistent.");
  for (const entry of entries) {
    if (entry.localOffset + 30 > buffer.length) throw new Error("Sketchfab archive local header is truncated.");
    if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error("Sketchfab archive local header is malformed.");
    const localFlags = buffer.readUInt16LE(entry.localOffset + 6); const localCompression = buffer.readUInt16LE(entry.localOffset + 8); const nameLength = buffer.readUInt16LE(entry.localOffset + 26); const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const localName = safeArchivePath(buffer.subarray(entry.localOffset + 30, entry.localOffset + 30 + nameLength).toString("utf8"));
    if ((localFlags & 1) !== 0 || localCompression !== entry.compression || localName !== entry.name) throw new Error("Sketchfab archive local and central headers do not match.");
    const start = entry.localOffset + 30 + nameLength + extraLength; const end = start + entry.compressedSize;
    if (end > buffer.length) throw new Error("Sketchfab archive entry exceeds the archive boundary.");
    const decoded = entry.compression === 0 ? buffer.subarray(start, end) : inflateRawSync(buffer.subarray(start, end), { maxOutputLength: entry.size });
    if (decoded.byteLength !== entry.size) throw new Error("Sketchfab archive entry size does not match its directory record.");
    if (crc32(decoded) !== entry.crc32) throw new Error("Sketchfab archive entry failed its CRC check.");
    const output = contained(destination, entry.name); await mkdir(dirname(output), { recursive: true }); await writeFile(output, decoded);
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const lower = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= lower; offset -= 1) if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  throw new Error("Sketchfab download is not a supported ZIP archive.");
}

function safeArchivePath(value: string): string {
  const normalized = value.replace(/\\/gu, "/");
  const parts = normalized.split("/");
  if (normalized.length > 512 || parts.length > 32 || normalized.includes("\0") || normalized.includes("�") || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized) || parts.some((part) => part === "..")) throw new Error("Sketchfab archive contains an unsafe path.");
  return normalized.replace(/^\.\//u, "");
}

async function selectModelFile(root: string): Promise<string> {
  const files = await listFiles(root);
  const candidates = files.filter((path) => extname(path).toLowerCase() === ".glb" || extname(path).toLowerCase() === ".gltf").sort();
  const preferred = candidates.find((path) => /(?:^|[/\\])scene\.gltf$/iu.test(path)) ?? candidates[0];
  if (preferred === undefined) throw new Error("Sketchfab archive contains no supported GLB or glTF model.");
  return preferred;
}

async function listFiles(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises"); const entries = await readdir(root, { withFileTypes: true }); const files: string[] = [];
  for (const entry of entries) { const path = resolve(root, entry.name); if (entry.isDirectory()) files.push(...await listFiles(path)); else if (entry.isFile()) files.push(path); }
  return files;
}

async function applyUniformSceneRootScale(path: string, scale: number): Promise<void> {
  const bytes = await readFile(path); const glb = extname(path).toLowerCase() === ".glb";
  let document: Record<string, unknown>; let suffix: Buffer | undefined;
  if (glb) {
    if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("Sketchfab GLB is malformed.");
    const length = bytes.readUInt32LE(12); document = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8").replace(/[\0 ]+$/u, "")) as Record<string, unknown>; suffix = bytes.subarray(20 + length);
  } else document = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  const nodes = Array.isArray(document.nodes) ? document.nodes : []; const scenes = Array.isArray(document.scenes) ? document.scenes : [];
  if (scenes.length === 0) throw new Error("Sketchfab model has no glTF scene to normalize.");
  for (const scene of scenes) {
    if (!isRecord(scene)) continue; const roots = Array.isArray(scene.nodes) ? scene.nodes.filter((node): node is number => Number.isSafeInteger(node)) : [];
    const rootIndex = nodes.length; nodes.push({ children: roots, name: "ThreeNativeScaleRoot", scale: [scale, scale, scale] }); scene.nodes = [rootIndex];
  }
  document.nodes = nodes;
  if (!glb) { await writeFile(path, `${JSON.stringify(document, null, 2)}\n`); return; }
  const json = Buffer.from(JSON.stringify(document)); const paddedLength = Math.ceil(json.length / 4) * 4; const output = Buffer.alloc(20 + paddedLength + (suffix?.length ?? 0), 0x20);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(paddedLength, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20); suffix?.copy(output, 20 + paddedLength); await writeFile(path, output);
}

function normalizeSearchRow(value: unknown): ISketchfabSearchRow | undefined {
  if (!isRecord(value) || value.isDownloadable !== true || typeof value.uid !== "string" || typeof value.name !== "string") return undefined;
  const user = asRecord(value.user ?? {}, "search author"); const license = normalizeLicense(value.license); const preview = selectThumbnail(value.thumbnails);
  return { author: { name: typeof user.displayName === "string" ? user.displayName : typeof user.username === "string" ? user.username : "Unknown", profileUrl: typeof user.profileUrl === "string" ? user.profileUrl : undefined }, faceCount: findFaceCount(value.archives), formats: isRecord(value.archives) ? Object.keys(value.archives).sort() : [], license, name: value.name, preview, sourceUrl: typeof value.viewerUrl === "string" ? value.viewerUrl : `https://sketchfab.com/3d-models/${value.uid}`, uid: value.uid };
}

function normalizeLicense(value: unknown): { id: string; label: string; providerUid?: string; url?: string } {
  if (typeof value === "string") return { id: value, label: value };
  if (!isRecord(value)) return { id: "unknown", label: "Unknown" };
  const label = typeof value.label === "string" ? value.label : "Unknown";
  const rawSlug = typeof value.slug === "string" ? value.slug : licenseSlugFromLabel(label);
  const id = rawSlug === "cc0" || rawSlug.startsWith("cc-") ? rawSlug : rawSlug.startsWith("by-") || rawSlug === "by" ? `cc-${rawSlug}` : rawSlug || "unknown";
  const url = typeof value.url === "string" ? value.url.replace(/^http:/u, "https:") : undefined;
  return { id, label, providerUid: typeof value.uid === "string" ? value.uid : undefined, url };
}

function licenseSlugFromLabel(label: string): string {
  const normalized = label.toLowerCase().replace(/^cc\s+/u, "").replace(/attribution/gu, "by").replace(/noncommercial/gu, "nc").replace(/noderivs/gu, "nd").replace(/sharealike/gu, "sa").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  return normalized === "public-domain" || normalized === "zero" ? "cc0" : normalized === "unknown" ? "unknown" : `cc-${normalized}`;
}

function selectThumbnail(value: unknown): { height?: number; url: string; width?: number } | undefined {
  const images = isRecord(value) && Array.isArray(value.images) ? value.images.filter(isRecord) : [];
  const selected = images.filter((image) => typeof image.url === "string").sort((a, b) => (finiteInteger(b.width) ?? 0) - (finiteInteger(a.width) ?? 0))[0];
  return selected === undefined ? undefined : { height: finiteInteger(selected.height), url: String(selected.url), width: finiteInteger(selected.width) };
}

function findFaceCount(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  for (const archive of Object.values(value)) {
    if (!isRecord(archive)) continue;
    const count = finiteInteger(archive.faceCount) ?? finiteInteger(archive.face_count); if (count !== undefined) return count;
  }
  return undefined;
}

function requireBounds(report: Awaited<ReturnType<typeof import("../commands/asset.js")["inspectAsset"]>>): { center: [number, number, number]; max: [number, number, number]; min: [number, number, number]; size: [number, number, number] } {
  if (report.bounds === undefined) throw new Error("Sketchfab model inspection did not produce hierarchy bounds.");
  return { center: report.bounds.center, max: report.bounds.max, min: report.bounds.min, size: report.bounds.size };
}

function sameLicense(accepted: string, license: { id: string; label: string; providerUid?: string; url?: string }): boolean { const value = accepted.trim().toLowerCase(); return [license.id, license.label, license.providerUid, license.url].some((entry) => entry?.toLowerCase() === value); }
function assertUid(value: string): void { if (!/^[A-Za-z0-9]{8,64}$/u.test(value)) throw new Error("Sketchfab model UID is invalid."); }
function assertSafeId(value: string, label: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) throw new Error(`Sketchfab ${label} is invalid.`); }
function contained(root: string, path: string): string { const result = resolve(root, path); const rel = relative(resolve(root), result); if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Sketchfab path escaped its allowed root."); return result; }
function finiteInteger(value: unknown): number | undefined { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined; }
function asRecord(value: unknown, label: string): Record<string, unknown> { if (!isRecord(value)) throw new Error(`Sketchfab ${label} must be an object.`); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

class SketchfabHttpError extends Error { constructor(readonly status: number) { super(status === 429 ? "Sketchfab API rate limit reached; wait before retrying." : status === 401 || status === 403 ? "Sketchfab credential was rejected." : `Sketchfab request failed with HTTP ${status}.`); } }

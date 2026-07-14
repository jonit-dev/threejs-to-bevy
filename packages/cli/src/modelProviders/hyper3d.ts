import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

import { addAsset } from "@threenative/authoring";

import { inspectAsset } from "../commands/asset.js";

// Official contracts reviewed 2026-07-14:
// https://developer.hyper3d.ai/api-specification/rodin-generation-gen2
// https://developer.hyper3d.ai/api-specification/check-status
// https://developer.hyper3d.ai/api-specification/download-results
// https://developer.hyper3d.ai/legal/data-policy
// https://hyper3d.ai/legal/terms
export const HYPER3D_API = "https://api.hyper3d.com/api/v2";
const maximumImageBytes = 16 * 1024 * 1024;
const maximumOutputBytes = 256 * 1024 * 1024;
const jobIdPattern = /^[a-z][a-z0-9._-]{0,63}$/u;

export type ModelJobState = "completed" | "expired" | "failed" | "queued" | "running";

export interface IHyper3dDependencies {
  allowedDownloadHosts?: readonly string[];
  fetch?: typeof fetch;
  now?: () => Date;
  token?: string;
  uniqueId?: () => string;
}

export interface IHyper3dJobArtifact {
  currentState: ModelJobState;
  diagnostics: Array<{ code: string; message: string }>;
  expiresAt: string;
  inputHash: string;
  jobId: string;
  provider: "hyper3d";
  providerTaskId: string;
  schema: "threenative.model-provider-job";
  submittedAt: string;
  version: "0.1.0";
}

export type IHyper3dPublicJobArtifact = IHyper3dJobArtifact;

interface IHyper3dJobSecret {
  jobId: string;
  provider: "hyper3d";
  providerTaskId: string;
  schema: "threenative.model-provider-job-secret";
  subscriptionKey: string;
  version: "0.1.0";
}

export async function hyper3dStatus(live = false, dependencies: IHyper3dDependencies = {}): Promise<Record<string, unknown>> {
  const token = providerToken(dependencies);
  if (token === undefined) return { liveRequested: live, provider: "hyper3d", state: "missing-credential" };
  if (!live) return { liveRequested: false, provider: "hyper3d", state: "available" };
  try {
    await requestJson(`${HYPER3D_API}/check_balance`, { method: "GET", headers: jsonHeaders(token) }, dependencies);
    return { liveRequested: true, provider: "hyper3d", state: "available" };
  } catch (error) {
    const message = safeError(error);
    return { diagnostics: [{ code: "TN_HYPER3D_UNREACHABLE", message }], liveRequested: true, provider: "hyper3d", state: /401|403|invalid.*key/iu.test(message) ? "missing-credential" : "unreachable" };
  }
}

export async function submitHyper3dJob(
  options: { acceptCost: boolean; acceptTerms: boolean; bbox?: readonly number[]; confirmInputRights: boolean; image?: string; jobId: string; projectPath: string; prompt?: string },
  dependencies: IHyper3dDependencies = {},
): Promise<{ code: string; job: IHyper3dPublicJobArtifact; jobPath: string }> {
  assertJobId(options.jobId);
  if (!options.acceptCost) throw new Error("TN_MODEL_PROVIDER_COST_ACK_REQUIRED: Rodin Gen-2 has a documented 0.5-credit base cost and requires a Business subscription; review https://hyper3d.ai/pricing and pass --accept-cost.");
  if (!options.acceptTerms) throw new Error("TN_MODEL_PROVIDER_TERMS_ACK_REQUIRED: review https://hyper3d.ai/legal/terms and pass --accept-provider-terms.");
  if (!options.confirmInputRights) throw new Error("TN_MODEL_PROVIDER_INPUT_RIGHTS_REQUIRED: Hyper3D requires you to hold the rights needed for submitted inputs; review https://hyper3d.ai/legal/terms and pass --confirm-input-rights.");
  const prompt = options.prompt?.trim();
  const hasPrompt = prompt !== undefined && prompt.length > 0;
  const hasImage = options.image !== undefined;
  if (hasPrompt === hasImage) throw new Error("TN_MODEL_PROVIDER_INPUT_INVALID: provide exactly one of a text prompt or one project-local image.");
  if (prompt !== undefined && (prompt.length < 3 || prompt.length > 2_000)) throw new Error("TN_MODEL_PROVIDER_PROMPT_INVALID: prompt length must be between 3 and 2000 characters.");
  const bbox = normalizeBbox(options.bbox);
  const projectPath = resolve(options.projectPath);
  const token = requireToken(dependencies);
  const form = new FormData();
  form.set("tier", "Gen-2");
  form.set("geometry_file_format", "glb");
  form.set("material", "PBR");
  form.set("mesh_mode", "Quad");
  if (bbox !== undefined) for (const value of bbox) form.append("bbox_condition", String(value));
  let inputBytes: Uint8Array;
  if (prompt !== undefined) {
    form.set("prompt", prompt);
    inputBytes = Buffer.from(prompt, "utf8");
  } else {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(options.image!)) throw new Error("TN_MODEL_PROVIDER_IMAGE_INVALID: remote image URLs are forbidden; use a project-local image path.");
    const imagePath = contained(projectPath, options.image!);
    await assertRealpathContained(projectPath, imagePath);
    const extension = extname(imagePath).toLowerCase();
    const mime = extension === ".png" ? "image/png" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : undefined;
    if (mime === undefined) throw new Error("TN_MODEL_PROVIDER_IMAGE_INVALID: image must be project-local PNG, JPEG, or WebP.");
    inputBytes = await readFile(imagePath);
    if (inputBytes.byteLength === 0 || inputBytes.byteLength > maximumImageBytes) throw new Error(`TN_MODEL_PROVIDER_IMAGE_INVALID: image must be 1-${maximumImageBytes} bytes.`);
    if (!matchesImageSignature(inputBytes, mime)) throw new Error(`TN_MODEL_PROVIDER_IMAGE_INVALID: image bytes do not match ${mime}.`);
    form.set("images", new Blob([inputBytes], { type: mime }), basename(imagePath));
  }
  const submittedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const expiresAt = new Date(Date.parse(submittedAt) + 7 * 24 * 60 * 60 * 1_000).toISOString();
  const normalizedRequest = { bbox: bbox ?? null, geometryFileFormat: "glb", inputHash: createHash("sha256").update(inputBytes).digest("hex"), material: "PBR", meshMode: "Quad", tier: "Gen-2" };
  const inputHash = `sha256:${createHash("sha256").update(canonicalJson(normalizedRequest)).digest("hex")}`;
  const jobPath = modelJobPath(projectPath, options.jobId);
  const secretPath = modelJobSecretPath(projectPath, options.jobId);
  const reservationPath = `${jobPath}.reserve`;
  const responsePath = `${jobPath}.response-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const secretResponsePath = `${secretPath}.response-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await mkdir(dirname(jobPath), { recursive: true });
  await assertRealpathContained(projectPath, jobPath);
  if (await exists(jobPath)) throw new Error(`TN_MODEL_PROVIDER_JOB_CONFLICT: job '${options.jobId}' already exists; no paid request was submitted.`);
  if (await exists(secretPath)) throw new Error(`TN_MODEL_PROVIDER_JOB_RECOVERY_REQUIRED: job '${options.jobId}' has a retained local polling handle; inspect and recover it before any paid retry.`);
  if (await exists(reservationPath)) throw new Error(`TN_MODEL_PROVIDER_JOB_RECOVERY_REQUIRED: job '${options.jobId}' has a retained submission reservation; inspect and recover it before any paid retry.`);
  const reservation = `${JSON.stringify({ inputHash, jobId: options.jobId, provider: "hyper3d", submittedAt }, null, 2)}\n`;
  await writeFile(reservationPath, reservation, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await writeFile(jobPath, reservation, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(reservationPath, { force: true });
    throw error;
  }
  const payload = asRecord(await requestJson(`${HYPER3D_API}/rodin`, { method: "POST", body: form, headers: { Authorization: `Bearer ${token}` } }, dependencies));
  const providerTaskId = requiredString(payload.uuid, "Rodin response uuid");
  const jobs = asRecord(payload.jobs);
  const subscriptionKey = requiredString(jobs.subscription_key, "Rodin response subscription key");
  const job: IHyper3dJobArtifact = {
    currentState: "queued", diagnostics: [], expiresAt, inputHash,
    jobId: options.jobId, provider: "hyper3d", providerTaskId,
    schema: "threenative.model-provider-job", submittedAt, version: "0.1.0",
  };
  const secret: IHyper3dJobSecret = { jobId: options.jobId, provider: "hyper3d", providerTaskId, schema: "threenative.model-provider-job-secret", subscriptionKey, version: "0.1.0" };
  await writeSyncedExclusive(secretResponsePath, secret);
  await writeSyncedExclusive(responsePath, job);
  try {
    await rename(secretResponsePath, secretPath);
    await rename(responsePath, jobPath);
  } catch (error) {
    throw new Error(`TN_MODEL_PROVIDER_JOB_PERSIST_FAILED: the paid provider response is retained in the project-local model-jobs recovery area; ${safeError(error)}`);
  }
  await rm(reservationPath);
  return { code: "TN_MODEL_PROVIDER_JOB_SUBMITTED", job: publicJob(job), jobPath: portable(relative(projectPath, jobPath)) };
}

export async function pollHyper3dJob(options: { jobId: string; projectPath: string }, dependencies: IHyper3dDependencies = {}): Promise<{ code: string; job: IHyper3dPublicJobArtifact }> {
  const projectPath = resolve(options.projectPath);
  const job = await readJob(projectPath, options.jobId);
  const expiration = Date.parse(job.expiresAt);
  if (!Number.isFinite(expiration)) throw new Error("TN_MODEL_PROVIDER_JOB_INVALID: durable job expiration is invalid.");
  if (expiration <= (dependencies.now?.() ?? new Date()).getTime()) job.currentState = "expired";
  else {
    const token = requireToken(dependencies);
    const secret = await readJobSecret(projectPath, options.jobId);
    const payload = asRecord(await requestJson(`${HYPER3D_API}/status`, { method: "POST", body: JSON.stringify({ subscription_key: secret.subscriptionKey }), headers: jsonHeaders(token) }, dependencies));
    const rows = Array.isArray(payload.jobs) ? payload.jobs.map(asRecord) : [];
    job.currentState = normalizeState(rows.map((row) => row.status));
    job.diagnostics = job.currentState === "failed" ? [{ code: "TN_MODEL_PROVIDER_JOB_FAILED", message: "Hyper3D reported that the generation job failed." }] : [];
  }
  await writeFile(modelJobPath(projectPath, options.jobId), `${JSON.stringify(job, null, 2)}\n`, "utf8");
  return { code: "TN_MODEL_PROVIDER_JOB_POLLED", job: publicJob(job) };
}

export async function importHyper3dJob(
  options: { assetId: string; jobId: string; projectPath: string; targetSize?: number },
  dependencies: IHyper3dDependencies = {},
): Promise<Record<string, unknown>> {
  assertJobId(options.jobId);
  assertJobId(options.assetId);
  if (options.targetSize !== undefined && (!Number.isFinite(options.targetSize) || options.targetSize <= 0 || options.targetSize > 10_000)) throw new Error("TN_MODEL_PROVIDER_TARGET_SIZE_INVALID: target size must be a finite positive meter value no greater than 10000.");
  const projectPath = resolve(options.projectPath);
  const job = await readJob(projectPath, options.jobId);
  if (job.currentState !== "completed") throw new Error(`TN_MODEL_PROVIDER_JOB_NOT_COMPLETE: job '${options.jobId}' is '${job.currentState}'. Poll it explicitly before import.`);
  const token = requireToken(dependencies);
  const runId = dependencies.uniqueId?.() ?? `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const destination = contained(projectPath, `assets/imported/hyper3d/${options.assetId}.glb`);
  const staging = contained(projectPath, `.threenative/staging/hyper3d-${options.assetId}-${runId}.glb`);
  const provenancePath = contained(projectPath, `assets/imported/hyper3d/${options.assetId}.provenance.json`);
  if (await exists(destination) || await exists(provenancePath)) throw new Error(`TN_MODEL_PROVIDER_OUTPUT_CONFLICT: asset '${options.assetId}' already has imported output; choose a new asset ID.`);
  await mkdir(dirname(staging), { recursive: true });
  await Promise.all([assertRealpathContained(projectPath, staging), assertRealpathContained(projectPath, destination), assertRealpathContained(projectPath, provenancePath)]);
  const payload = asRecord(await requestJson(`${HYPER3D_API}/download`, { method: "POST", body: JSON.stringify({ task_uuid: job.providerTaskId }), headers: jsonHeaders(token) }, dependencies));
  const files = Array.isArray(payload.list) ? payload.list.map(asRecord) : [];
  const glb = files.find((file) => typeof file.name === "string" && file.name.toLowerCase().endsWith(".glb") && typeof file.url === "string");
  if (glb === undefined) throw new Error("TN_MODEL_PROVIDER_OUTPUT_MISSING: completed job has no provider-declared GLB result.");
  try {
    const bytes = await downloadSignedGlb(requiredString(glb.url, "download URL"), dependencies);
    await writeFile(staging, bytes);
    const before = await inspectAsset(staging);
    if (before.code !== "TN_ASSET_INSPECT_OK" || before.bounds === undefined) throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: downloaded GLB failed inspection or has no bounds.");
    let scale = 1;
    if (options.targetSize !== undefined) {
      const largest = Math.max(...before.bounds.size);
      if (!(largest > 0)) throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: downloaded GLB has zero-sized bounds.");
      scale = options.targetSize / largest;
      await writeFile(staging, scaleGlbRoot(bytes, scale));
    }
    const inspection = await inspectAsset(staging);
    if (inspection.code !== "TN_ASSET_INSPECT_OK") throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: normalized GLB failed inspection.");
    if (options.targetSize !== undefined && inspection.bounds !== undefined && Math.abs(Math.max(...inspection.bounds.size) - options.targetSize) > Math.max(0.001, options.targetSize * 0.001)) throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: normalized GLB bounds do not match the requested target size.");
    await mkdir(dirname(destination), { recursive: true });
    await rename(staging, destination);
    const provenance = {
      schema: "threenative.model-provider-provenance", version: "0.1.0", provider: "hyper3d", providerTaskId: job.providerTaskId,
      sourceUrl: "https://hyper3d.ai/", termsUrl: "https://hyper3d.ai/legal/terms", retrievedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      inputHash: job.inputHash, outputHash: `sha256:${createHash("sha256").update(await readFile(destination)).digest("hex")}`,
      targetSize: options.targetSize, appliedScale: scale,
    };
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
    const registration = await addAsset({ assetId: options.assetId, attribution: "Generated with Hyper3D Rodin", license: "Hyper3D Terms", path: portable(relative(projectPath, destination)), projectPath, source: `hyper3d:${job.providerTaskId}`, type: "model" });
    if (!registration.ok) throw new Error(registration.diagnostics.map((row) => `${row.code}: ${row.message}`).join("; "));
    return { assetId: options.assetId, code: "TN_MODEL_PROVIDER_IMPORT_OK", filesWritten: [...registration.filesWritten, portable(relative(projectPath, destination)), portable(relative(projectPath, provenancePath))], inspection, provenance };
  } catch (error) {
    await Promise.all([rm(staging, { force: true }), rm(destination, { force: true }), rm(provenancePath, { force: true })]);
    throw error;
  }
}

function providerToken(dependencies: IHyper3dDependencies): string | undefined { return dependencies.token ?? process.env.HYPER3D_API_KEY ?? process.env.RODIN_API_KEY; }
function requireToken(dependencies: IHyper3dDependencies): string { const token = providerToken(dependencies); if (token === undefined || token.trim() === "") throw new Error("TN_MODEL_PROVIDER_CREDENTIAL_MISSING: set HYPER3D_API_KEY or RODIN_API_KEY outside source control."); return token; }
function jsonHeaders(token: string): Record<string, string> { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", accept: "application/json" }; }
function modelJobPath(projectPath: string, jobId: string): string { assertJobId(jobId); return contained(projectPath, `.threenative/model-jobs/${jobId}.json`); }
function modelJobSecretPath(projectPath: string, jobId: string): string { assertJobId(jobId); return contained(projectPath, `.threenative/model-jobs/${jobId}.secret.json`); }
function assertJobId(value: string): void { if (!jobIdPattern.test(value)) throw new Error(`TN_MODEL_PROVIDER_ID_INVALID: '${value}' must match ${jobIdPattern.source}.`); }
function contained(root: string, path: string): string { const target = resolve(root, path); const rel = relative(root, target); if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || resolve(target) === resolve(root)) throw new Error(`TN_MODEL_PROVIDER_PATH_INVALID: '${path}' escapes the project root.`); return target; }
function portable(value: string): string { return value.split(sep).join("/"); }
function normalizeBbox(value: readonly number[] | undefined): number[] | undefined { if (value === undefined) return undefined; if (value.length !== 3 || value.some((item) => !Number.isFinite(item) || item <= 0 || item > 10_000)) throw new Error("TN_MODEL_PROVIDER_BBOX_INVALID: bbox must be three finite positive values in provider order y,z,x."); return [...value]; }
function requiredString(value: unknown, label: string): string { if (typeof value !== "string" || value.trim() === "") throw new Error(`TN_MODEL_PROVIDER_RESPONSE_INVALID: ${label} is missing.`); return value; }
function asRecord(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("TN_MODEL_PROVIDER_RESPONSE_INVALID: provider response must be an object."); return value as Record<string, unknown>; }
function normalizeState(values: unknown[]): ModelJobState {
  const states = values.map((value) => String(value).toLowerCase());
  if (states.length === 0 || states.some((state) => !["done", "failed", "generating", "waiting"].includes(state))) throw new Error("TN_MODEL_PROVIDER_RESPONSE_INVALID: provider returned an empty or unknown job state.");
  if (states.some((state) => state === "failed")) return "failed";
  if (states.every((state) => state === "done")) return "completed";
  if (states.some((state) => state === "generating")) return "running";
  return "queued";
}
function publicJob(job: IHyper3dJobArtifact): IHyper3dPublicJobArtifact { return job; }
async function readJob(projectPath: string, jobId: string): Promise<IHyper3dJobArtifact> {
  const path = modelJobPath(projectPath, jobId); await assertRealpathContained(projectPath, path);
  const parsed = JSON.parse(await readFile(path, "utf8")) as IHyper3dJobArtifact;
  if (parsed.schema !== "threenative.model-provider-job" || parsed.version !== "0.1.0" || parsed.provider !== "hyper3d" || parsed.jobId !== jobId || !jobIdPattern.test(parsed.jobId) || !["completed", "expired", "failed", "queued", "running"].includes(parsed.currentState) || typeof parsed.providerTaskId !== "string" || parsed.providerTaskId === "" || !/^sha256:[a-f0-9]{64}$/u.test(parsed.inputHash) || !Number.isFinite(Date.parse(parsed.submittedAt)) || !Number.isFinite(Date.parse(parsed.expiresAt)) || !Array.isArray(parsed.diagnostics)) throw new Error("TN_MODEL_PROVIDER_JOB_INVALID: durable job artifact is malformed.");
  return parsed;
}

async function readJobSecret(projectPath: string, jobId: string): Promise<IHyper3dJobSecret> {
  const path = modelJobSecretPath(projectPath, jobId); await assertRealpathContained(projectPath, path);
  let parsed: IHyper3dJobSecret;
  try { parsed = JSON.parse(await readFile(path, "utf8")) as IHyper3dJobSecret; }
  catch { throw new Error("TN_MODEL_PROVIDER_JOB_SECRET_MISSING: the local polling handle is missing or malformed; recover it before polling again."); }
  if (parsed.schema !== "threenative.model-provider-job-secret" || parsed.version !== "0.1.0" || parsed.provider !== "hyper3d" || parsed.jobId !== jobId || typeof parsed.providerTaskId !== "string" || parsed.providerTaskId === "" || typeof parsed.subscriptionKey !== "string" || parsed.subscriptionKey === "") throw new Error("TN_MODEL_PROVIDER_JOB_SECRET_MISSING: the local polling handle is missing or malformed; recover it before polling again.");
  return parsed;
}

async function writeSyncedExclusive(path: string, value: unknown): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await file.sync(); }
  finally { await file.close(); }
}

async function requestJson(url: string, init: RequestInit, dependencies: IHyper3dDependencies): Promise<unknown> {
  let response: Response;
  try { response = await (dependencies.fetch ?? fetch)(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) }); }
  catch (error) { throw new Error(`TN_MODEL_PROVIDER_HTTP_FAILED: ${safeError(error)}`); }
  const text = new TextDecoder().decode(await readBoundedResponse(response, 1024 * 1024));
  if (!response.ok) throw new Error(`TN_MODEL_PROVIDER_HTTP_FAILED: provider returned HTTP ${response.status}.`);
  try {
    const payload = JSON.parse(text) as unknown;
    const record = asRecord(payload);
    if (record.error !== undefined && record.error !== null && record.error !== "") throw new Error(`TN_MODEL_PROVIDER_FAILED: ${safeError(record.error)}`);
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TN_MODEL_PROVIDER_FAILED:")) throw error;
    throw new Error("TN_MODEL_PROVIDER_RESPONSE_INVALID: provider returned malformed JSON.");
  }
}

async function downloadSignedGlb(url: string, dependencies: IHyper3dDependencies, redirects = 3): Promise<Uint8Array> {
  const parsed = new URL(url); if (parsed.protocol !== "https:" || !allowedDownloadHost(parsed.hostname, dependencies)) throw new Error("TN_MODEL_PROVIDER_DOWNLOAD_INVALID: provider output URL host is not allowed.");
  const response = await (dependencies.fetch ?? fetch)(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  if (response.status >= 300 && response.status < 400) {
    if (redirects === 0) throw new Error("TN_MODEL_PROVIDER_DOWNLOAD_INVALID: provider output exceeded the redirect limit.");
    const location = response.headers.get("location"); if (location === null) throw new Error("TN_MODEL_PROVIDER_DOWNLOAD_INVALID: provider redirect is missing Location.");
    return downloadSignedGlb(new URL(location, url).href, dependencies, redirects - 1);
  }
  if (!response.ok) throw new Error(`TN_MODEL_PROVIDER_DOWNLOAD_FAILED: provider returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== undefined && contentType !== "model/gltf-binary" && contentType !== "application/octet-stream") throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: provider output MIME is not GLB-compatible.");
  const length = Number(response.headers.get("content-length")); if (Number.isFinite(length) && length > maximumOutputBytes) throw new Error("TN_MODEL_PROVIDER_OUTPUT_OVERSIZED: Content-Length exceeds the output budget.");
  const reader = response.body?.getReader(); if (reader === undefined) throw new Error("TN_MODEL_PROVIDER_DOWNLOAD_FAILED: response has no body.");
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const row = await reader.read(); if (row.done) break; total += row.value.byteLength; if (total > maximumOutputBytes) { await reader.cancel(); throw new Error("TN_MODEL_PROVIDER_OUTPUT_OVERSIZED: streamed output exceeds the output budget."); } chunks.push(row.value); }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: provider output is not a GLB file.");
  return bytes;
}

function scaleGlbRoot(bytes: Uint8Array, scale: number): Buffer {
  const source = Buffer.from(bytes); const jsonLength = source.readUInt32LE(12); const jsonEnd = 20 + jsonLength;
  const json = JSON.parse(source.toString("utf8", 20, jsonEnd).replace(/\0+$/u, "").trimEnd()) as { nodes?: Array<Record<string, unknown>>; scenes?: Array<{ nodes?: number[] }>; scene?: number };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  json.nodes ??= [];
  const wrapper = json.nodes.length;
  json.nodes.push({ children: [...roots], name: "ThreeNativeScaleRoot", scale: [scale, scale, scale] });
  if (json.scenes?.[json.scene ?? 0] === undefined) throw new Error("TN_MODEL_PROVIDER_OUTPUT_INVALID: GLB has no default scene for scale normalization.");
  json.scenes[json.scene ?? 0]!.nodes = [wrapper];
  const encoded = Buffer.from(JSON.stringify(json), "utf8"); const paddedLength = (encoded.length + 3) & ~3; const jsonChunk = Buffer.alloc(paddedLength, 0x20); encoded.copy(jsonChunk);
  const tail = source.subarray(jsonEnd); const output = Buffer.alloc(20 + paddedLength + tail.length); source.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(paddedLength, 12); source.copy(output, 16, 16, 20); jsonChunk.copy(output, 20); tail.copy(output, 20 + paddedLength); return output;
}

function safeError(error: unknown): string { const value = error instanceof Error ? error.message : String(error); return value.replace(/Bearer\s+\S+/giu, "Bearer [redacted]").replace(/[A-Za-z0-9_-]{24,}/gu, "[redacted]").slice(0, 1_024); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`; return JSON.stringify(value); }
function matchesImageSignature(bytes: Uint8Array, mime: string): boolean { const buffer = Buffer.from(bytes); if (mime === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); if (mime === "image/jpeg") return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9; return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"; }
async function assertRealpathContained(root: string, target: string): Promise<void> { const realRoot = await realpath(root); let ancestor = target; while (!(await exists(ancestor))) { const parent = dirname(ancestor); if (parent === ancestor) break; ancestor = parent; } const realAncestor = await realpath(ancestor); const rel = relative(realRoot, realAncestor); if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("TN_MODEL_PROVIDER_PATH_INVALID: path resolves outside the project root through a symlink."); }
function allowedDownloadHost(host: string, dependencies: IHyper3dDependencies): boolean { const configured = dependencies.allowedDownloadHosts ?? ["hyper3d.ai", "deemos.com"]; return configured.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)); }
async function readBoundedResponse(response: Response, maximumBytes: number): Promise<Uint8Array> { const reader = response.body?.getReader(); if (reader === undefined) return new Uint8Array(); const chunks: Uint8Array[] = []; let total = 0; while (true) { const row = await reader.read(); if (row.done) break; total += row.value.byteLength; if (total > maximumBytes) { await reader.cancel(); throw new Error("TN_MODEL_PROVIDER_RESPONSE_OVERSIZED: provider response exceeded the byte budget."); } chunks.push(row.value); } return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total); }

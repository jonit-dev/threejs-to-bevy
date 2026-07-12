import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { addAsset, addAudioSound, createAudioDocument, type IAuthoringOperationResult } from "@threenative/authoring";

import { type ICommandResult } from "../diagnostics.js";
import { ELEVENLABS_SFX_MODEL, ELEVENLABS_SFX_OUTPUT_FORMAT, ElevenLabsSfxError, requestElevenLabsSfx } from "./elevenLabsSfx.js";

export interface IGenerateSfxOptions {
  apiKey?: string;
  assetId?: string;
  audioDocId?: string;
  durationSeconds?: number;
  fetch?: typeof fetch;
  force?: boolean;
  json?: boolean;
  loop?: boolean;
  modelId?: string;
  out?: string;
  outputFormat?: string;
  projectPath: string;
  prompt?: string;
  promptInfluence?: number;
  soundId?: string;
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const maximumAudioBytes = 25 * 1024 * 1024;
const supportedFormats = new Map([["mp3_44100_128", ".mp3"], ["mp3_44100_192", ".mp3"]]);

export async function generateSfx(options: IGenerateSfxOptions): Promise<ICommandResult> {
  const json = options.json ?? false;
  const invalid = validateOptions(options);
  if (invalid !== undefined) return failure(invalid.code, invalid.message, json, 2);
  const assetId = options.assetId!;
  const prompt = options.prompt!.trim();
  const outputFormat = options.outputFormat ?? ELEVENLABS_SFX_OUTPUT_FORMAT;
  const modelId = options.modelId ?? ELEVENLABS_SFX_MODEL;
  const projectPath = resolve(options.projectPath);
  const outputPath = resolveOutputPath(projectPath, options.out ?? `assets/generated/audio/${assetId}.mp3`);
  if (outputPath === undefined) return failure("TN_AUDIO_SFX_PATH_INVALID", "Output path must remain inside the selected project.", json, 2);
  if (!outputPath.endsWith(supportedFormats.get(outputFormat)!)) return failure("TN_AUDIO_SFX_OUTPUT_EXTENSION_INVALID", `Output path must end in '${supportedFormats.get(outputFormat)}'.`, json, 2);
  if (!options.force && await exists(outputPath)) return failure("TN_AUDIO_SFX_DESTINATION_CONFLICT", `Output '${relative(projectPath, outputPath)}' already exists. Use --force to replace it.`, json);
  const assetDoc = resolve(projectPath, "content/assets", `${assetId}.assets.json`);
  const audioDoc = options.audioDocId === undefined ? undefined : resolve(projectPath, "content/audio", `${options.audioDocId}.audio.json`);
  const provenanceDoc = resolve(projectPath, "content/assets", `${assetId}.sfx-generation.json`);
  const preflight = await preflightSourceDocuments({ assetDoc, assetId, audioDoc, force: options.force ?? false, soundId: options.soundId });
  if (preflight !== undefined) return failure(preflight.code, preflight.message, json);
  const snapshots = await Promise.all([snapshot(assetDoc), audioDoc === undefined ? undefined : snapshot(audioDoc), snapshot(provenanceDoc)]);
  const outputSnapshot = options.force ? await snapshot(outputPath) : undefined;

  let response;
  try {
    response = await requestElevenLabsSfx({
      apiKey: options.apiKey!, durationSeconds: options.durationSeconds, fetch: options.fetch, loop: options.loop,
      maximumResponseBytes: maximumAudioBytes, modelId, outputFormat, prompt, promptInfluence: options.promptInfluence,
    });
  } catch (error) {
    const normalized = error instanceof ElevenLabsSfxError ? error : new ElevenLabsSfxError("TN_AUDIO_SFX_PROVIDER_FAILED", "ElevenLabs request failed.");
    return failure(normalized.code, normalized.message, json, 1, normalized.billingMayBeUnknown ? { billingMayBeUnknown: true } : undefined);
  }
  if (!/^audio\/(?:mpeg|mp3)(?:;|$)/iu.test(response.contentType)) return failure("TN_AUDIO_SFX_RESPONSE_CONTENT_TYPE_INVALID", `ElevenLabs returned unsupported content type '${response.contentType || "missing"}'.`, json);
  if (response.bytes.byteLength === 0 || response.bytes.byteLength > maximumAudioBytes || !isMp3(response.bytes)) return failure("TN_AUDIO_SFX_RESPONSE_INVALID", "ElevenLabs returned an empty, oversized, or malformed MP3 response.", json);

  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  const provenanceTemporaryPath = `${provenanceDoc}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(temporaryPath, response.bytes, { flag: "wx" });
    await rename(temporaryPath, outputPath);
    const sourcePath = relative(projectPath, outputPath).split("\\").join("/");
    requireOperation(await addAsset({ assetId, path: sourcePath, projectPath, source: "generated:elevenlabs", type: "audio" }));
    if (options.audioDocId !== undefined) {
      if (!await exists(audioDoc!)) requireOperation(await createAudioDocument({ audioDocId: options.audioDocId, projectPath }));
      requireOperation(await addAudioSound({ asset: assetId, audioDocId: options.audioDocId, projectPath, soundId: options.soundId! }));
    }
    const provenance = { schema: "threenative/sfx-generation", version: "0.1.0", assetId, generation: { characterCost: response.characterCost, durationSeconds: options.durationSeconds, generatedAt: new Date().toISOString(), loop: options.loop ?? false, model: modelId, outputFormat, prompt, promptInfluence: options.promptInfluence, provider: "elevenlabs", requestId: response.requestId } };
    await mkdir(dirname(provenanceDoc), { recursive: true });
    await writeFile(provenanceTemporaryPath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });
    await rename(provenanceTemporaryPath, provenanceDoc);
    const filesWritten = [sourcePath, relative(projectPath, assetDoc).split("\\").join("/")];
    if (audioDoc !== undefined) filesWritten.push(relative(projectPath, audioDoc).split("\\").join("/"));
    filesWritten.push(relative(projectPath, provenanceDoc).split("\\").join("/"));
    const payload = { assetId, audioDocId: options.audioDocId, characterCost: response.characterCost, code: "TN_AUDIO_SFX_GENERATED", durationSeconds: options.durationSeconds, filesWritten, loop: options.loop ?? false, message: `Generated sound effect '${assetId}'.`, model: modelId, nextCommands: ["tn authoring validate --json", "tn build"], outputFormat, path: sourcePath, promptInfluence: options.promptInfluence, provider: "elevenlabs", requestId: response.requestId, soundId: options.soundId };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
  } catch {
    await rm(temporaryPath, { force: true });
    await rm(provenanceTemporaryPath, { force: true });
    try {
      await restore(assetDoc, snapshots[0]);
      if (audioDoc !== undefined) await restore(audioDoc, snapshots[1]);
      await restore(provenanceDoc, snapshots[2]);
      await restore(outputPath, outputSnapshot);
    } catch {
      return failure("TN_AUDIO_SFX_ROLLBACK_FAILED", "Sound registration failed and rollback could not fully restore the project. Inspect the reported paths before retrying.", json);
    }
    return failure("TN_AUDIO_SFX_REGISTRATION_FAILED", "Generated audio could not be registered; source documents and the destination were restored.", json);
  }
}

async function preflightSourceDocuments(options: { assetDoc: string; assetId: string; audioDoc?: string; force: boolean; soundId?: string }): Promise<{ code: string; message: string } | undefined> {
  const asset = await readJsonIfPresent(options.assetDoc);
  if (asset === null || (asset !== undefined && !Array.isArray(asset.assets))) return { code: "TN_AUDIO_SFX_ASSET_SOURCE_INVALID", message: "The target asset source document is malformed; fix it before generating a billable sound effect." };
  const assets = asset?.assets as unknown[] | undefined;
  if (!options.force && assets?.some((entry: unknown) => isRecord(entry) && entry.id === options.assetId)) return { code: "TN_AUDIO_SFX_ASSET_CONFLICT", message: `Asset '${options.assetId}' is already registered. Use --force to replace it.` };
  if (options.audioDoc !== undefined) {
    const audio = await readJsonIfPresent(options.audioDoc);
    if (audio === null || (audio !== undefined && !Array.isArray(audio.sounds))) return { code: "TN_AUDIO_SFX_AUDIO_SOURCE_INVALID", message: "The target audio source document is malformed; fix it before generating a billable sound effect." };
    const sounds = audio?.sounds as unknown[] | undefined;
    if (!options.force && sounds?.some((entry: unknown) => isRecord(entry) && entry.id === options.soundId)) return { code: "TN_AUDIO_SFX_SOUND_CONFLICT", message: `Sound '${options.soundId}' is already registered. Use --force to replace it.` };
  }
  return undefined;
}

async function readJsonIfPresent(path: string): Promise<Record<string, unknown> | undefined | null> {
  try { const value: unknown = JSON.parse(await readFile(path, "utf8")); return isRecord(value) ? value : null; }
  catch (error) { if (error instanceof SyntaxError) return null; if (isNodeError(error) && error.code === "ENOENT") return undefined; return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isNodeError(value: unknown): value is NodeJS.ErrnoException { return value instanceof Error && "code" in value; }

function validateOptions(o: IGenerateSfxOptions): { code: string; message: string } | undefined {
  if (!o.apiKey?.trim()) return { code: "TN_AUDIO_SFX_CREDENTIAL_MISSING", message: "ELEVENLABS_API_KEY is missing from the selected project environment." };
  if (!o.assetId || !idPattern.test(o.assetId)) return { code: "TN_AUDIO_SFX_ASSET_ID_INVALID", message: "Asset ID must be 1-128 safe identifier characters." };
  if (!o.prompt?.trim() || o.prompt.trim().length > 2_000) return { code: "TN_AUDIO_SFX_PROMPT_INVALID", message: "Prompt must contain 1-2000 characters." };
  if (o.durationSeconds !== undefined && (!Number.isFinite(o.durationSeconds) || o.durationSeconds < 0.5 || o.durationSeconds > 30)) return { code: "TN_AUDIO_SFX_DURATION_INVALID", message: "Duration must be between 0.5 and 30 seconds." };
  if (o.promptInfluence !== undefined && (!Number.isFinite(o.promptInfluence) || o.promptInfluence < 0 || o.promptInfluence > 1)) return { code: "TN_AUDIO_SFX_PROMPT_INFLUENCE_INVALID", message: "Prompt influence must be between 0 and 1." };
  if (!supportedFormats.has(o.outputFormat ?? ELEVENLABS_SFX_OUTPUT_FORMAT)) return { code: "TN_AUDIO_SFX_OUTPUT_FORMAT_INVALID", message: `Output format must be one of: ${[...supportedFormats.keys()].join(", ")}.` };
  if ((o.audioDocId === undefined) !== (o.soundId === undefined) || (o.audioDocId !== undefined && (!idPattern.test(o.audioDocId) || !idPattern.test(o.soundId!)))) return { code: "TN_AUDIO_SFX_SOUND_BINDING_INVALID", message: "--audio-doc and --sound-id must be supplied together with safe identifiers." };
  return undefined;
}

function resolveOutputPath(project: string, value: string): string | undefined { const path = isAbsolute(value) ? resolve(value) : resolve(project, value); const rel = relative(project, path); return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? path : undefined; }
function isMp3(bytes: Uint8Array): boolean { return bytes.byteLength >= 3 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)); }
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
async function snapshot(path: string): Promise<Uint8Array | undefined> { try { return await readFile(path); } catch { return undefined; } }
async function restore(path: string, value: Uint8Array | undefined): Promise<void> { if (value === undefined) await rm(path, { force: true }); else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); } }
function requireOperation(result: IAuthoringOperationResult): void { if (!result.ok) throw new Error("authoring operation failed"); }
function failure(code: string, message: string, json: boolean, exitCode = 1, extra?: Record<string, unknown>): ICommandResult { const payload = { code, ...extra, message, severity: "error" }; return { exitCode, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${message}\n` }; }

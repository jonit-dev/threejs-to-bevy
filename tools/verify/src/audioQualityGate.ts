import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";

const SOURCE_RMS_FLOOR_DBFS = -36;
const SOURCE_PEAK_FLOOR_DBFS = -18;
const EFFECTIVE_PEAK_FLOOR_DBFS = -18;
const CLIPPING_WARNING_DBFS = -0.1;
const LOOP_MINIMUM_SECONDS = 1;
const LOOP_EDGE_RMS_LIMIT_DB = 12;
const LOOP_SEAM_DELTA_LIMIT = 0.25;
const SAMPLE_RATE = 44_100;
const EDGE_SECONDS = 0.05;

export interface AudioMetrics {
  durationSeconds: number;
  edgeRmsDeltaDb: number;
  endToStartDelta: number;
  peakDbfs: number;
  rmsDbfs: number;
}

export interface AudioQualityAsset {
  assetId: string;
  metrics: AudioMetrics;
  path: string;
  provenanceLoop?: boolean;
}

export interface AudioQualitySound {
  assetId: string;
  soundId: string;
}

export interface AudioQualityUsage {
  loop: boolean;
  path: string;
  soundId: string;
  volume: number;
}

export interface AudioQualityInput {
  assets: AudioQualityAsset[];
  sounds: AudioQualitySound[];
  usages: AudioQualityUsage[];
}

export interface ParsedScriptAudioUsages {
  dynamicCallCount: number;
  usages: AudioQualityUsage[];
}

export interface AudioQualityGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export function evaluateAudioQuality(input: AudioQualityInput): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  const assets = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const sounds = new Map(input.sounds.map((sound) => [sound.soundId, sound]));
  const loopSoundIds = new Set(
    input.sounds
      .filter((sound) => sound.soundId.startsWith("music.") || input.usages.some((usage) => usage.soundId === sound.soundId && usage.loop))
      .map((sound) => sound.soundId),
  );
  const loopAssetIds = new Set(
    [...loopSoundIds]
      .map((soundId) => sounds.get(soundId)?.assetId)
      .filter((assetId): assetId is string => assetId !== undefined),
  );

  for (const asset of input.assets) {
    if (asset.metrics.rmsDbfs < SOURCE_RMS_FLOOR_DBFS || asset.metrics.peakDbfs < SOURCE_PEAK_FLOOR_DBFS) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_SOURCE_INTENSITY_LOW",
        `Audio asset '${asset.assetId}' is too quiet (RMS ${formatDb(asset.metrics.rmsDbfs)}, peak ${formatDb(asset.metrics.peakDbfs)}).`,
        asset.path,
        `Normalize the source above ${SOURCE_RMS_FLOOR_DBFS} dBFS RMS and ${SOURCE_PEAK_FLOOR_DBFS} dBFS peak, then rerun verify:audio-quality.`,
      ));
    }
    if (asset.metrics.peakDbfs >= CLIPPING_WARNING_DBFS) {
      diagnostics.push(warning(
        "TN_VERIFY_AUDIO_SOURCE_CLIPPING_RISK",
        `Audio asset '${asset.assetId}' peaks at ${formatDb(asset.metrics.peakDbfs)} and has no true-peak headroom.`,
        asset.path,
        "Limit the source below -0.1 dBFS before final mastering.",
      ));
    }

    const expectsLoop = loopAssetIds.has(asset.assetId);
    if (asset.provenanceLoop === false && expectsLoop) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_LOOP_PROVENANCE_MISMATCH",
        `Audio asset '${asset.assetId}' is played as a loop but generation provenance declares loop=false.`,
        asset.path,
        "Regenerate or replace the asset with loop intent enabled, or remove loop playback.",
      ));
    } else if (asset.provenanceLoop === true && !expectsLoop) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_ONESHOT_PROVENANCE_MISMATCH",
        `Audio asset '${asset.assetId}' declares loop=true but no structured sound or script usage treats it as a loop.`,
        asset.path,
        "Mark the owning playback as a loop or replace the asset with one-shot generation provenance.",
      ));
    }
    if (!expectsLoop) continue;
    if (asset.metrics.durationSeconds < LOOP_MINIMUM_SECONDS) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_LOOP_TOO_SHORT",
        `Loop asset '${asset.assetId}' is ${asset.metrics.durationSeconds.toFixed(3)}s; loops must be at least ${LOOP_MINIMUM_SECONDS}s.`,
        asset.path,
        "Use a longer loop source so repetition does not chatter.",
      ));
    }
    if (asset.metrics.edgeRmsDeltaDb > LOOP_EDGE_RMS_LIMIT_DB) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_LOOP_EDGE_IMBALANCE",
        `Loop asset '${asset.assetId}' first/last edge intensity differs by ${asset.metrics.edgeRmsDeltaDb.toFixed(2)} dB.`,
        asset.path,
        `Match the first and last ${Math.round(EDGE_SECONDS * 1_000)}ms within ${LOOP_EDGE_RMS_LIMIT_DB} dB.`,
      ));
    }
    if (asset.metrics.endToStartDelta > LOOP_SEAM_DELTA_LIMIT) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_LOOP_SEAM_DISCONTINUITY",
        `Loop asset '${asset.assetId}' has an end-to-start sample jump of ${asset.metrics.endToStartDelta.toFixed(4)}.`,
        asset.path,
        `Crossfade or trim the loop seam below ${LOOP_SEAM_DELTA_LIMIT}.`,
      ));
    }
  }

  for (const usage of input.usages) {
    const sound = sounds.get(usage.soundId);
    if (sound === undefined) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_SOUND_UNRESOLVED",
        `Script audio cue '${usage.soundId}' does not resolve through content/audio.`,
        usage.path,
        "Declare the sound ID in a structured audio document and bind it to an audio asset.",
      ));
      continue;
    }
    const asset = assets.get(sound.assetId);
    if (asset === undefined) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_ASSET_UNRESOLVED",
        `Sound '${usage.soundId}' references missing audio asset '${sound.assetId}'.`,
        usage.path,
        "Register the asset in content/assets and keep its file project-local.",
      ));
      continue;
    }
    const effectivePeak = asset.metrics.peakDbfs + gainDb(usage.volume);
    if (effectivePeak < EFFECTIVE_PEAK_FLOOR_DBFS) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_PLAYBACK_INTENSITY_LOW",
        `Cue '${usage.soundId}' effective peak is ${formatDb(effectivePeak)} at volume ${usage.volume.toFixed(3)}.`,
        usage.path,
        `Raise source level or playback gain so effective peak is at least ${EFFECTIVE_PEAK_FLOOR_DBFS} dBFS.`,
      ));
    }
    if (usage.soundId.startsWith("music.") && !usage.loop) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_MUSIC_LOOP_MISSING",
        `Music cue '${usage.soundId}' is played without loop=true.`,
        usage.path,
        "Set loop: true so script playback agrees with structured music semantics.",
      ));
    }
  }
  return diagnostics;
}

export async function runAudioQualityGate(options: {
  projectPath?: string;
  reportPath?: string;
  root?: string;
} = {}): Promise<AudioQualityGateResult> {
  const root = resolve(options.root ?? fileURLToPath(new URL("../../..", import.meta.url)));
  const projectPath = resolve(root, options.projectPath ?? "examples/battle-of-pacific");
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/audio-quality/verification-report.json");
  const discoveryDiagnostics: VerificationDiagnostic[] = [];
  const sounds = await discoverSounds(projectPath, discoveryDiagnostics);
  const assetSources = await discoverAssetSources(projectPath, discoveryDiagnostics);
  const provenance = await discoverLoopProvenance(projectPath, discoveryDiagnostics);
  const usages = await discoverScriptUsages(projectPath, discoveryDiagnostics);
  const assets: AudioQualityAsset[] = [];

  for (const source of assetSources) {
    const path = resolveProjectPath(projectPath, source.path);
    if (path === undefined) {
      discoveryDiagnostics.push(error(
        "TN_VERIFY_AUDIO_ASSET_PATH_INVALID",
        `Audio asset '${source.assetId}' path escapes the project: ${source.path}.`,
        source.documentPath,
        "Use a project-relative asset path.",
      ));
      continue;
    }
    const metrics = decodeAudioMetrics(path);
    if (metrics instanceof Error) {
      discoveryDiagnostics.push(error(
        "TN_VERIFY_AUDIO_DECODE_FAILED",
        `Audio asset '${source.assetId}' could not be decoded: ${metrics.message}`,
        relative(root, path).replaceAll("\\", "/"),
        "Install ffmpeg or replace the malformed audio file, then rerun verify:audio-quality.",
      ));
      continue;
    }
    assets.push({
      assetId: source.assetId,
      metrics,
      path: relative(root, path).replaceAll("\\", "/"),
      ...(provenance.has(source.assetId) ? { provenanceLoop: provenance.get(source.assetId) } : {}),
    });
  }

  const diagnostics = [...discoveryDiagnostics, ...evaluateAudioQuality({ assets, sounds, usages })];
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    assets,
    code: ok ? "TN_VERIFY_AUDIO_QUALITY_OK" : "TN_VERIFY_AUDIO_QUALITY_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools audioQualityGate",
    ok,
    projectPath: relative(root, projectPath).replaceAll("\\", "/"),
    schema: "threenative.verify.audio-quality",
    sounds,
    status: ok ? "pass" : "fail",
    usages,
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

function decodeAudioMetrics(path: string): AudioMetrics | Error {
  const decoded = spawnSync("ffmpeg", [
    "-v", "error",
    "-i", path,
    "-ac", "1",
    "-ar", String(SAMPLE_RATE),
    "-f", "f32le",
    "pipe:1",
  ], {
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (decoded.error !== undefined) return decoded.error;
  if (decoded.status !== 0 || !Buffer.isBuffer(decoded.stdout)) {
    const stderr = Buffer.isBuffer(decoded.stderr) ? decoded.stderr.toString("utf8").trim() : "";
    return new Error(stderr || `ffmpeg exited with status ${decoded.status ?? "unknown"}`);
  }
  const sampleCount = Math.floor(decoded.stdout.byteLength / 4);
  if (sampleCount === 0) return new Error("decoded PCM is empty");
  const samples = new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, sampleCount);
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const edgeSampleCount = Math.max(1, Math.min(Math.floor(SAMPLE_RATE * EDGE_SECONDS), Math.floor(sampleCount / 2)));
  const firstRms = windowRms(samples, 0, edgeSampleCount);
  const lastRms = windowRms(samples, sampleCount - edgeSampleCount, sampleCount);
  return {
    durationSeconds: sampleCount / SAMPLE_RATE,
    edgeRmsDeltaDb: Math.abs(amplitudeDb(firstRms) - amplitudeDb(lastRms)),
    endToStartDelta: Math.abs(samples[sampleCount - 1]! - samples[0]!),
    peakDbfs: amplitudeDb(peak),
    rmsDbfs: amplitudeDb(Math.sqrt(sumSquares / sampleCount)),
  };
}

async function discoverSounds(projectPath: string, diagnostics: VerificationDiagnostic[]): Promise<AudioQualitySound[]> {
  const sounds: AudioQualitySound[] = [];
  for (const path of await collectFiles(resolve(projectPath, "content/audio"), ".audio.json")) {
    const document = await readJson(path, diagnostics, "TN_VERIFY_AUDIO_DOCUMENT_INVALID");
    for (const value of Array.isArray(document?.sounds) ? document.sounds : []) {
      if (!isRecord(value) || typeof value.id !== "string" || typeof value.asset !== "string") continue;
      sounds.push({ assetId: value.asset, soundId: value.id });
    }
  }
  return sounds.sort((left, right) => left.soundId.localeCompare(right.soundId));
}

async function discoverAssetSources(
  projectPath: string,
  diagnostics: VerificationDiagnostic[],
): Promise<Array<{ assetId: string; documentPath: string; path: string }>> {
  const assets: Array<{ assetId: string; documentPath: string; path: string }> = [];
  for (const path of await collectFiles(resolve(projectPath, "content/assets"), ".assets.json")) {
    const document = await readJson(path, diagnostics, "TN_VERIFY_AUDIO_ASSET_DOCUMENT_INVALID");
    for (const value of Array.isArray(document?.assets) ? document.assets : []) {
      if (!isRecord(value) || value.type !== "audio" || typeof value.id !== "string" || typeof value.path !== "string") continue;
      assets.push({
        assetId: value.id,
        documentPath: relative(projectPath, path).replaceAll("\\", "/"),
        path: value.path,
      });
    }
  }
  return assets.sort((left, right) => left.assetId.localeCompare(right.assetId));
}

async function discoverLoopProvenance(
  projectPath: string,
  diagnostics: VerificationDiagnostic[],
): Promise<Map<string, boolean>> {
  const provenance = new Map<string, boolean>();
  for (const path of await collectFiles(resolve(projectPath, "content/assets"), ".sfx-generation.json")) {
    const document = await readJson(path, diagnostics, "TN_VERIFY_AUDIO_PROVENANCE_INVALID");
    const generation = isRecord(document?.generation) ? document.generation : undefined;
    if (typeof document?.assetId === "string" && typeof generation?.loop === "boolean") {
      provenance.set(document.assetId, generation.loop);
    }
  }
  return provenance;
}

async function discoverScriptUsages(projectPath: string, diagnostics: VerificationDiagnostic[]): Promise<AudioQualityUsage[]> {
  const usages: AudioQualityUsage[] = [];
  for (const path of await collectFiles(resolve(projectPath, "src/scripts"), ".ts")) {
    const source = await readFile(path, "utf8");
    const relativePath = relative(projectPath, path).replaceAll("\\", "/");
    const parsed = parseScriptAudioUsages(source, relativePath);
    if (parsed.dynamicCallCount > 0) {
      diagnostics.push(error(
        "TN_VERIFY_AUDIO_DYNAMIC_SOUND_ID_UNSUPPORTED",
        `${relativePath} contains dynamic or unsupported audio.play calls that cannot be audited deterministically.`,
        relativePath,
        "Use literal structured sound IDs at audio.play call sites.",
      ));
    }
    usages.push(...parsed.usages);
  }
  return usages.sort((left, right) => left.soundId.localeCompare(right.soundId) || left.path.localeCompare(right.path));
}

export function parseScriptAudioUsages(source: string, path: string): ParsedScriptAudioUsages {
  const allCalls = [...source.matchAll(/audio\.play\(\s*([^,\r\n)]+)/gu)];
  const literalCalls = [...source.matchAll(/audio\.play\(\s*(["'])([^"']+)\1\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/gu)];
  return {
    dynamicCallCount: allCalls.length - literalCalls.length,
    usages: literalCalls.map((match) => {
      const options = match[3] ?? "";
      const volumeMatch = /(?:^|[,;])\s*volume\s*:\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/u.exec(options);
      return {
        loop: /(?:^|[,;])\s*loop\s*:\s*true(?:\s*[,}]|$)/u.test(options),
        path,
        soundId: match[2]!,
        volume: volumeMatch === null ? 1 : Number(volumeMatch[1]),
      };
    }),
  };
}

async function collectFiles(directory: string, suffix: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path);
  }
  return files.sort();
}

async function readJson(
  path: string,
  diagnostics: VerificationDiagnostic[],
  code: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (isRecord(value)) return value;
  } catch (cause) {
    diagnostics.push(error(code, `Unable to read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`, path, "Fix the structured JSON document."));
    return undefined;
  }
  diagnostics.push(error(code, `${path} must contain a JSON object.`, path, "Fix the structured JSON document."));
  return undefined;
}

function resolveProjectPath(projectPath: string, value: string): string | undefined {
  const path = resolve(projectPath, value);
  const rel = relative(projectPath, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? path : undefined;
}

function windowRms(samples: Float32Array, start: number, end: number): number {
  let sumSquares = 0;
  for (let index = start; index < end; index += 1) sumSquares += samples[index]! * samples[index]!;
  return Math.sqrt(sumSquares / Math.max(1, end - start));
}

function gainDb(gain: number): number {
  return amplitudeDb(Math.max(0, gain));
}

function amplitudeDb(amplitude: number): number {
  return amplitude <= 0 ? -120 : 20 * Math.log10(amplitude);
}

function formatDb(value: number): string {
  return `${value.toFixed(2)} dBFS`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(code: string, message: string, path: string, suggestedFix: string): VerificationDiagnostic {
  return { code, message, path, severity: "error", suggestedFix };
}

function warning(code: string, message: string, path: string, suggestedFix: string): VerificationDiagnostic {
  return { code, message, path, severity: "warning", suggestedFix };
}

function readProjectArgument(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--project");
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runAudioQualityGate({ projectPath: readProjectArgument(process.argv.slice(2)) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

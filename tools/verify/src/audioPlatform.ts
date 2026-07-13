import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const sourceDir = resolve(root, "tools/verify/artifacts/production-hardening");
const artifactDir = resolve(root, "tools/verify/artifacts/feature-parity-audio-platform");
const reportPath = resolve(artifactDir, "verification-report.json");
const nativeAudioExecutionTestPath = resolve(root, "runtime-bevy/crates/threenative_runtime/tests/audio.rs");

export const NATIVE_AUDIO_EXECUTION_EVIDENCE = {
  cargoPackage: "threenative_runtime",
  cases: [
    { id: "event-one-shot", testFilter: "native_audio_execution_event_one_shot" },
    { id: "script-playback", testFilter: "native_audio_execution_script_playback" },
  ],
} as const;

export function nativeAudioExecutionCommands(): readonly (readonly [command: string, ...args: string[]])[] {
  return NATIVE_AUDIO_EXECUTION_EVIDENCE.cases.map(({ testFilter }) => [
    "cargo",
    "test",
    "--manifest-path",
    "runtime-bevy/Cargo.toml",
    "-p",
    NATIVE_AUDIO_EXECUTION_EVIDENCE.cargoPackage,
    "--test",
    "audio",
    testFilter,
    "--",
    "--exact",
    "--nocapture",
  ]);
}

export function validateNativeAudioExecutionEnrollment(source: string): string[] {
  return NATIVE_AUDIO_EXECUTION_EVIDENCE.cases
    .filter(({ testFilter }) => !source.includes(`fn ${testFilter}()`))
    .map(({ id }) => `native-audio-execution:missing:${id}`);
}

const platformCodes = [
  "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
  "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
  "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
  "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
];

const audioBoundaryCodes = [
  "TN_AUDIO_RAW_NATIVE_HANDLE_UNSUPPORTED",
  "TN_AUDIO_CUSTOM_DECODER_UNSUPPORTED",
  "TN_AUDIO_NETWORK_STREAM_UNSUPPORTED",
];

export interface AudioPlatformGateResult {
  diagnostics: string[];
  ok: boolean;
  reportPath: string;
}

export function validateAudioPlatformEvidence(production: any, web: any, native: any): string[] {
  const diagnostics: string[] = [];
  if (production?.ok !== true || production?.status !== "passed") diagnostics.push("production-hardening:not-pass");
  if (JSON.stringify(normalize(web?.audio)) !== JSON.stringify(normalize(native?.audio))) diagnostics.push("audio:adapter-drift");
  if (JSON.stringify(normalize(web?.platform)) !== JSON.stringify(normalize(native?.platform))) diagnostics.push("platform:adapter-drift");

  const lifecycleKinds = new Set((web?.audio?.lifecycle?.lifecycle ?? []).map((row: any) => row.kind));
  for (const kind of ["start", "pause", "query", "seek", "resume", "stop"]) {
    if (!lifecycleKinds.has(kind)) diagnostics.push(`audio-lifecycle:missing:${kind}`);
  }
  if ((web?.audio?.support?.tones ?? []).length === 0) diagnostics.push("audio-support:missing:generated-tone");
  if ((web?.audio?.support?.musicTransitions ?? []).length === 0) diagnostics.push("audio-support:missing:music-transition");
  if ((web?.audio?.support?.attenuation ?? []).length < 2) diagnostics.push("audio-support:missing:listener-movement");
  if ((web?.audio?.mixer?.ducking ?? []).length === 0) diagnostics.push("audio-mixer:missing:ducking");

  const boundaryCodes = new Set((web?.boundaries ?? []).map((row: any) => row.code));
  for (const code of audioBoundaryCodes) {
    if (!boundaryCodes.has(code)) diagnostics.push(`audio-boundary:missing:${code}`);
  }
  const reportedPlatformCodes = (web?.platform?.diagnostics ?? []).map((row: any) => row.code);
  if (JSON.stringify(reportedPlatformCodes) !== JSON.stringify(platformCodes)) diagnostics.push("platform-policy:registry-drift");
  if (web?.platform?.resize?.width !== 1280 || web?.platform?.resize?.height !== 720 || web?.platform?.resize?.scaleFactor !== 2) {
    diagnostics.push("platform-resize:observation-drift");
  }
  return diagnostics;
}

function normalize(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(6));
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export async function runAudioPlatformGate(): Promise<AudioPlatformGateResult> {
  const [production, web, native, nativeExecutionTests] = await Promise.all([
    readJson(resolve(sourceDir, "verification-report.json")),
    readJson(resolve(sourceDir, "web-report.json")),
    readJson(resolve(sourceDir, "native-report.json")),
    readFile(nativeAudioExecutionTestPath, "utf8"),
  ]);
  const diagnostics = [
    ...validateAudioPlatformEvidence(production, web, native),
    ...validateNativeAudioExecutionEnrollment(nativeExecutionTests),
  ];
  const report = {
    artifacts: {
      native: resolve(sourceDir, "native-report.json"),
      nativeExecution: {
        cases: NATIVE_AUDIO_EXECUTION_EVIDENCE.cases,
        cargoPackage: NATIVE_AUDIO_EXECUTION_EVIDENCE.cargoPackage,
        source: nativeAudioExecutionTestPath,
      },
      productionHardening: resolve(sourceDir, "verification-report.json"),
      report: reportPath,
      web: resolve(sourceDir, "web-report.json"),
    },
    boundaries: [...audioBoundaryCodes, ...platformCodes],
    code: diagnostics.length === 0 ? "TN_VERIFY_AUDIO_PLATFORM_OK" : "TN_VERIFY_AUDIO_PLATFORM_FAILED",
    diagnostics: diagnostics.map((message) => ({ code: "TN_VERIFY_AUDIO_PLATFORM_EVIDENCE_MISSING", message, severity: "error" })),
    generatedBy: "tools/verify/src/audioPlatform.ts",
    ok: diagnostics.length === 0,
    schema: "threenative.verify.feature-parity-audio-platform",
    status: diagnostics.length === 0 ? "pass" : "fail",
    version: "0.1.0",
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { diagnostics, ok: report.ok, reportPath };
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

if (process.argv[1]?.endsWith("audioPlatform.js")) {
  const result = await runAudioPlatformGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

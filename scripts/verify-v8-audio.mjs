import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8AudioSpatialTrace(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/v7-spatial-audio-buses/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v8/audio");
  const webTracePath = options.webTracePath ?? resolve(artifactDir, "web-audio-spatial.json");
  const nativeTracePath = options.nativeTracePath ?? resolve(artifactDir, "native-audio-spatial.json");
  const diffPath = options.diffPath ?? resolve(artifactDir, "audio-spatial-diff.json");
  await mkdir(artifactDir, { recursive: true });

  const web = await runWebTrace(root, bundlePath);
  await writeFile(webTracePath, `${JSON.stringify(web, null, 2)}\n`);
  await runNativeTrace(root, bundlePath, nativeTracePath, options.runNativeTrace);
  const native = normalizeReport(JSON.parse(await readFile(nativeTracePath, "utf8")));
  const comparison = compareReports(web, native);
  const metrics = summarizeMetrics(web);
  await writeFile(diffPath, `${JSON.stringify({ comparison, metrics, nativeTracePath, webTracePath }, null, 2)}\n`);

  return {
    artifacts: { diffPath, nativeTracePath, webTracePath },
    comparison,
    metrics,
    ok: comparison.status === "pass",
  };
}

async function runWebTrace(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  return normalizeReport({
    schema: "threenative.audio-spatial-trace",
    trace: runtime.traceWebAudioSpatialAttenuation(bundle.audio, [{ event: "DamageEvent", payload: { amount: 10 } }]),
    version: "0.1.0",
  });
}

async function runNativeTrace(root, bundlePath, nativeTracePath, runner) {
  if (runner !== undefined) {
    await runner({ bundlePath, nativeTracePath, root });
    return;
  }
  await execFileAsync(
    "cargo",
    [
      "run",
      "--quiet",
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_audio_spatial_trace",
      "--",
      resolve(bundlePath),
      resolve(nativeTracePath),
    ],
    { cwd: resolve(root, "runtime-bevy") },
  );
}

function compareReports(web, native) {
  const firstMismatch = JSON.stringify(web) === JSON.stringify(native) ? undefined : { actual: native, expected: web, message: "V8 audio spatial attenuation trace mismatch.", path: "$" };
  return {
    diagnostics:
      firstMismatch === undefined
        ? []
        : [{ code: "TN_VERIFY_V8_AUDIO_SPATIAL_TRACE_MISMATCH", message: firstMismatch.message, path: firstMismatch.path, severity: "error" }],
    firstMismatch,
    status: firstMismatch === undefined ? "pass" : "fail",
  };
}

function summarizeMetrics(report) {
  const observations = report.trace.observations ?? [];
  return {
    attenuation: observations.map((item) => ({ attenuation: item.attenuation, distance: item.distance, effectiveVolume: item.effectiveVolume, id: item.id })),
    observationCount: observations.length,
  };
}

function normalizeReport(report) {
  return sortObjectKeys(report);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]));
  }
  if (typeof value === "number") {
    return Number(value.toFixed(6));
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const result = await verifyV8AudioSpatialTrace({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V8 audio spatial trace passed. Diff: ${result.artifacts.diffPath}\n`);
    process.stdout.write(`Observations: ${result.metrics.observationCount}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V8 audio spatial trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV7EnvironmentContentTrace(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/renderer-dense-content/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "packages/ir/artifacts/conformance/renderer-dense-content");
  const webTracePath = options.webTracePath ?? resolve(artifactDir, "web-environment-content.json");
  const nativeTracePath = options.nativeTracePath ?? resolve(artifactDir, "native-environment-content.json");
  const diffPath = options.diffPath ?? resolve(artifactDir, "environment-content-diff.json");
  await mkdir(artifactDir, { recursive: true });

  const web = await runWebTrace(root, bundlePath);
  await writeFile(webTracePath, `${JSON.stringify(web, null, 2)}\n`);
  await runNativeTrace(root, bundlePath, nativeTracePath, options.runNativeTrace);
  const native = normalizeReport(JSON.parse(await readFile(nativeTracePath, "utf8")));
  const comparison = compareReports(web, native);
  await writeFile(diffPath, `${JSON.stringify({ comparison, nativeTracePath, webTracePath }, null, 2)}\n`);

  return {
    artifacts: { diffPath, nativeTracePath, webTracePath },
    comparison,
    ok: comparison.status === "pass",
  };
}

async function runWebTrace(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  return normalizeReport({
    schema: "threenative.environment-content-trace",
    trace: runtime.traceEnvironmentContent(bundle),
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
      "threenative_environment_content_trace",
      "--",
      resolve(bundlePath),
      resolve(nativeTracePath),
    ],
    { cwd: resolve(root, "runtime-bevy") },
  );
}

function compareReports(web, native) {
  const firstMismatch = findFirstMismatch(web, native);
  return {
    diagnostics:
      firstMismatch === undefined
        ? []
        : [{ code: "TN_VERIFY_V7_ENVIRONMENT_CONTENT_TRACE_MISMATCH", message: firstMismatch.message, path: firstMismatch.path, severity: "error" }],
    firstMismatch,
    status: firstMismatch === undefined ? "pass" : "fail",
  };
}

function findFirstMismatch(web, native) {
  for (const key of ["schema", "version", "trace"]) {
    if (JSON.stringify(web[key]) !== JSON.stringify(native[key])) {
      return mismatch(key, web[key], native[key]);
    }
  }
  return undefined;
}

function mismatch(path, expected, actual) {
  return {
    actual,
    expected,
    message: `V7 environment content trace mismatch at ${path}: expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    path,
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
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const result = await verifyV7EnvironmentContentTrace({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V7 environment content trace passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V7 environment content trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

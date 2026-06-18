import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8AnimationControls(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/v8-animation-controls/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/animation-controls");
  const webEffectsPath = options.webEffectsPath ?? resolve(artifactDir, "web-animation-controls.json");
  const nativeEffectsPath = options.nativeEffectsPath ?? resolve(artifactDir, "native-animation-controls.json");
  const diffPath = options.diffPath ?? resolve(artifactDir, "animation-controls-diff.json");
  await mkdir(artifactDir, { recursive: true });

  const web = await runWebTrace(root, bundlePath);
  await writeFile(webEffectsPath, `${JSON.stringify(web, null, 2)}\n`);
  await runNativeTrace(root, bundlePath, nativeEffectsPath, options.runNativeTrace);
  const native = normalizeServiceLog(JSON.parse(await readFile(nativeEffectsPath, "utf8")));
  const comparison = compareLogs(web, native);
  await writeFile(diffPath, `${JSON.stringify({ comparison, nativeEffectsPath, webEffectsPath }, null, 2)}\n`);

  return {
    artifacts: { diffPath, nativeEffectsPath, webEffectsPath },
    comparison,
    ok: comparison.status === "pass",
  };
}

async function runWebTrace(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  const module = await runtime.loadSystemModule(bundlePath, bundle.manifest);
  const effectLog = runtime.createSystemEffectLog();
  const result = await runtime.runSchedule({
    componentSchemas: bundle.componentSchemas,
    delta: 1 / 60,
    effectLog,
    elapsed: 1,
    fixedDelta: 1 / 60,
    frame: 1,
    input: fixedInputState(),
    module,
    schedule: "update",
    systems: bundle.systems,
    tick: 1,
    world: bundle.world,
  });
  if (result.diagnostics.length > 0) {
    throw new Error(result.diagnostics[0]?.message ?? "V8 animation controls web trace failed.");
  }
  return normalizeServiceLog(runtime.stableSystemEffectLog(effectLog));
}

async function runNativeTrace(root, bundlePath, nativeEffectsPath, runner) {
  if (runner !== undefined) {
    await runner({ bundlePath, nativeEffectsPath, root });
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
      "threenative_systems_log",
      "--",
      resolve(bundlePath),
      resolve(nativeEffectsPath),
    ],
    { cwd: resolve(root, "runtime-bevy") },
  );
}

function compareLogs(web, native) {
  const firstMismatch = findFirstMismatch(web, native);
  return {
    diagnostics:
      firstMismatch === undefined
        ? []
        : [{ code: "TN_VERIFY_V8_ANIMATION_SERVICE_PAYLOAD_MISMATCH", message: firstMismatch.message, path: firstMismatch.path, severity: "error" }],
    firstMismatch,
    status: firstMismatch === undefined ? "pass" : "fail",
    summary: {
      nativeServices: native.entries.length,
      services: web.entries.map((entry) => entry.service),
      webServices: web.entries.length,
    },
  };
}

function findFirstMismatch(web, native) {
  if (web.schema !== native.schema) {
    return mismatch("schema", web.schema, native.schema);
  }
  if (web.version !== native.version) {
    return mismatch("version", web.version, native.version);
  }
  if (web.entries.length !== native.entries.length) {
    return mismatch("entries.length", web.entries.length, native.entries.length);
  }
  for (let index = 0; index < web.entries.length; index += 1) {
    if (JSON.stringify(web.entries[index]) !== JSON.stringify(native.entries[index])) {
      return mismatch(`entries/${index}`, web.entries[index], native.entries[index]);
    }
  }
  return undefined;
}

function mismatch(path, expected, actual) {
  return {
    actual,
    expected,
    message: `V8 animation command-shape/service-payload trace mismatch at ${path}: expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    path,
  };
}

function normalizeServiceLog(log) {
  return {
    entries: (log.entries ?? [])
      .filter((entry) => entry.kind === "service" && (entry.service === "animation.query" || entry.service === "animation.stop"))
      .map((entry) => ({
        kind: entry.kind,
        payload: sortObjectKeys(entry.payload),
        schedule: entry.schedule,
        service: entry.service,
        system: entry.system,
      }))
      .sort((left, right) => left.service.localeCompare(right.service)),
    schema: log.schema,
    version: log.version,
  };
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

function fixedInputState() {
  return {
    action() {
      return false;
    },
    axis() {
      return 0;
    },
    beginFrame() {},
    handleKeyDown() {},
    handleKeyUp() {},
    handlePointerDown() {},
    handlePointerMove() {},
    handlePointerUp() {},
    pressed() {
      return false;
    },
    released() {
      return false;
    },
  };
}

async function main() {
  const result = await verifyV8AnimationControls({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V8 animation command-shape/service-payload trace passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V8 animation command-shape/service-payload trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

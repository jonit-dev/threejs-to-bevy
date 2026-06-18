import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV6ResourceEventTrace(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/resources-events/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "packages/ir/artifacts/conformance/resources-events");
  const webEffectsPath = options.webEffectsPath ?? resolve(artifactDir, "web-effects.json");
  const nativeEffectsPath = options.nativeEffectsPath ?? resolve(artifactDir, "native-effects.json");
  const diffPath = options.diffPath ?? resolve(artifactDir, "effects-diff.json");
  const mismatchCode = options.mismatchCode ?? "TN_VERIFY_V6_RESOURCE_EVENT_TRACE_MISMATCH";
  const mismatchLabel = options.mismatchLabel ?? "V6 resource/event trace";
  await mkdir(artifactDir, { recursive: true });

  const web = await runWebTrace(root, bundlePath);
  await writeFile(webEffectsPath, `${JSON.stringify(web, null, 2)}\n`);
  await runNativeTrace(root, bundlePath, nativeEffectsPath, options.runNativeTrace);
  const native = normalizeLog(JSON.parse(await readFile(nativeEffectsPath, "utf8")));
  const comparison = compareLogs(web, native, { mismatchCode, mismatchLabel });
  await writeFile(
    diffPath,
    `${JSON.stringify(
      {
        comparison,
        nativeEffectsPath,
        webEffectsPath,
      },
      null,
      2,
    )}\n`,
  );

  return {
    artifacts: {
      diffPath,
      nativeEffectsPath,
      webEffectsPath,
    },
    comparison,
    ok: comparison.status === "pass",
  };
}

async function runWebTrace(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  const module = await runtime.loadSystemModule(bundlePath, bundle.manifest);
  const effectLog = runtime.createSystemEffectLog();
  for (const schedule of ["startup", "fixedUpdate", "update", "postUpdate"]) {
    const result = await runtime.runSchedule({
      componentSchemas: bundle.componentSchemas,
      delta: 1 / 60,
      effectLog,
      elapsed: 1,
      fixedDelta: 1 / 60,
      frame: 1,
      input: fixedInputState(),
      module,
      schedule,
      systems: bundle.systems,
      tick: 1,
      world: bundle.world,
    });
    if (result.diagnostics.length > 0) {
      throw new Error(result.diagnostics[0]?.message ?? "V6 web resource/event trace failed.");
    }
  }
  return normalizeLog(runtime.stableSystemEffectLog(effectLog));
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

function compareLogs(web, native, options = {}) {
  const mismatchCode = options.mismatchCode ?? "TN_VERIFY_V6_RESOURCE_EVENT_TRACE_MISMATCH";
  const mismatchLabel = options.mismatchLabel ?? "V6 resource/event trace";
  const firstMismatch = findFirstMismatch(web, native, mismatchLabel);
  return {
    diagnostics:
      firstMismatch === undefined
        ? []
        : [
            {
              code: mismatchCode,
              message: firstMismatch.message,
              path: firstMismatch.path,
              severity: "error",
            },
          ],
    firstMismatch,
    status: firstMismatch === undefined ? "pass" : "fail",
    summary: {
      comparedEntries: Math.min(web.entries.length, native.entries.length),
      nativeEntries: native.entries.length,
      webEntries: web.entries.length,
    },
  };
}

function findFirstMismatch(web, native, mismatchLabel) {
  if (web.schema !== native.schema) {
    return mismatch(mismatchLabel, "schema", web.schema, native.schema);
  }
  if (web.version !== native.version) {
    return mismatch(mismatchLabel, "version", web.version, native.version);
  }
  if (web.entries.length !== native.entries.length) {
    return mismatch(mismatchLabel, "entries.length", web.entries.length, native.entries.length);
  }
  for (let index = 0; index < web.entries.length; index += 1) {
    const expected = web.entries[index];
    const actual = native.entries[index];
    const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})].sort());
    for (const key of keys) {
      if (JSON.stringify(expected?.[key]) !== JSON.stringify(actual?.[key])) {
        return mismatch(mismatchLabel, `entries/${index}/${key}`, expected?.[key], actual?.[key]);
      }
    }
  }
  return undefined;
}

function mismatch(label, path, expected, actual) {
  return {
    actual,
    expected,
    message: `${label} mismatch at ${path}: expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    path,
  };
}

function normalizeLog(log) {
  return {
    entries: (log.entries ?? []).map(sortObjectKeys).sort(compareEntries),
    schema: log.schema,
    version: log.version,
  };
}

function compareEntries(left, right) {
  return entryKey(left).localeCompare(entryKey(right));
}

function entryKey(entry) {
  return [
    String(entry.frame).padStart(12, "0"),
    String(entry.tick).padStart(12, "0"),
    entry.schedule,
    entry.system,
    entry.kind,
    entry.command ?? "",
    entry.entity ?? "",
    entry.component ?? "",
    entry.event ?? "",
    entry.resource ?? "",
    entry.service ?? "",
    JSON.stringify(entry.payload ?? entry.value ?? null),
  ].join("\u0000");
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
  const result = await verifyV6ResourceEventTrace({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V6 resource/event trace passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V6 resource/event trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

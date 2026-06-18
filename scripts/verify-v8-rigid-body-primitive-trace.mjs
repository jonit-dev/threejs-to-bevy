import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8RigidBodyPrimitiveTrace(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/v8-rigid-body-primitive/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "packages/ir/artifacts/conformance/rigid-body-primitive");
  const webTracePath = options.webTracePath ?? resolve(artifactDir, "web-rigid-body.json");
  const nativeTracePath = options.nativeTracePath ?? resolve(artifactDir, "native-rigid-body.json");
  const diffPath = options.diffPath ?? resolve(artifactDir, "rigid-body-diff.json");
  await mkdir(artifactDir, { recursive: true });

  const web = await runWebTrace(root, bundlePath);
  await writeFile(webTracePath, `${JSON.stringify(web, null, 2)}\n`);
  await runNativeTrace(root, bundlePath, nativeTracePath, options.runNativeTrace);
  const native = normalizeReport(JSON.parse(await readFile(nativeTracePath, "utf8")));
  const comparison = compareReports(web, native);
  await writeFile(
    diffPath,
    `${JSON.stringify(
      {
        comparison,
        nativeTracePath,
        webTracePath,
      },
      null,
      2,
    )}\n`,
  );

  return {
    artifacts: {
      diffPath,
      nativeTracePath,
      webTracePath,
    },
    comparison,
    ok: comparison.status === "pass",
  };
}

async function runWebTrace(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  return normalizeReport({
    observations: runtime.traceRigidBodyPrimitive(bundle.world, {
      fixedDelta: 0.25,
      steps: 4,
    }),
    schema: "threenative.rigid-body-trace",
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
      "threenative_rigid_body_trace",
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
        : [
            {
              code: "TN_VERIFY_V8_RIGID_BODY_PRIMITIVE_TRACE_MISMATCH",
              message: firstMismatch.message,
              path: firstMismatch.path,
              severity: "error",
            },
          ],
    firstMismatch,
    status: firstMismatch === undefined ? "pass" : "fail",
    summary: {
      nativeObservations: native.observations.length,
      webObservations: web.observations.length,
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
  if (web.observations.length !== native.observations.length) {
    return mismatch("observations.length", web.observations.length, native.observations.length);
  }
  for (let index = 0; index < web.observations.length; index += 1) {
    const expected = web.observations[index];
    const actual = native.observations[index];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      return mismatch(`observations/${index}`, expected, actual);
    }
  }
  return undefined;
}

function mismatch(path, expected, actual) {
  return {
    actual,
    expected,
    message: `V8 rigid-body primitive trace mismatch at ${path}: expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    path,
  };
}

function normalizeReport(report) {
  return {
    observations: (report.observations ?? []).map(sortObjectKeys).sort((left, right) => left.step - right.step || left.entity.localeCompare(right.entity)),
    schema: report.schema,
    version: report.version,
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

async function main() {
  const result = await verifyV8RigidBodyPrimitiveTrace({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V8 rigid-body primitive trace passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V8 rigid-body primitive trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

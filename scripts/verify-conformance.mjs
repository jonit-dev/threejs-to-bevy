import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyConformance(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const reportPath = options.reportPath ?? resolve(root, "artifacts/conformance/verification-report.json");
  const artifactDir = options.artifactDir ?? resolve(reportPath, "..");
  const basicSceneBundlePath = resolve(root, "packages/ir/fixtures/conformance/basic-scene/game.bundle");
  const nativeBasicSceneReportPath = options.nativeBasicSceneReportPath ?? resolve(artifactDir, "basic-scene/bevy.report.json");
  const artifacts = {
    nativeBasicSceneReportPath,
  };
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  const commands = [
    ["ir conformance fixtures", "pnpm", ["--filter", "@threenative/ir", "test", "--", "--run", "conformance"]],
    [
      "web runtime conformance",
      "pnpm",
      ["--filter", "@threenative/runtime-web-three", "test", "--", "--run", "conformance"],
      { timeoutMs: 120000 },
    ],
    ["bevy runtime conformance", "cargo", ["test", "-p", "threenative_runtime", "conformance"], { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 }],
    [
      "bevy native observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        basicSceneBundlePath,
        "basic-scene",
        nativeBasicSceneReportPath,
      ],
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
    ],
  ];

  for (const [name, command, args, commandOptions] of commands) {
    if (!(await step(name, command, args, commandOptions))) {
      await writeGateReport(reportPath, false, steps, artifacts);
      return { artifacts, ok: false, reportPath, steps };
    }
  }

  await writeGateReport(reportPath, true, steps, artifacts);
  return { artifacts, ok: true, reportPath, steps };
}

export function compareConformanceReports(left, right, options = {}) {
  const diagnostics = [];
  const fixture = left.fixture ?? right.fixture ?? "unknown";
  const artifactPaths = options.artifactPaths ?? {};
  const bundlePath = options.bundlePath;
  if (left.fixture !== right.fixture) {
    diagnostics.push(mismatch(fixture, "$.fixture", left.runtime, right.runtime, left.fixture, right.fixture, { artifactPaths, bundlePath }));
  }

  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.assets", left.assets, right.assets, { artifactPaths, bundlePath });
  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.materials", left.materials, right.materials, { artifactPaths, bundlePath });
  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.entities", left.entities, right.entities, { artifactPaths, bundlePath });
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.diagnostics", left.diagnostics ?? [], right.diagnostics ?? [], { artifactPaths, bundlePath });

  return {
    artifactPaths,
    bundlePath,
    diagnostics,
    ok: diagnostics.length === 0,
  };
}

function compareCatalog(diagnostics, fixture, leftRuntime, rightRuntime, path, leftItems = [], rightItems = [], context) {
  const rightById = new Map((rightItems ?? []).map((item) => [item.id, item]));
  for (const leftItem of leftItems ?? []) {
    const itemPath = `${path}[${JSON.stringify(leftItem.id)}]`;
    const rightItem = rightById.get(leftItem.id);
    if (rightItem === undefined) {
      diagnostics.push(mismatch(fixture, itemPath, leftRuntime, rightRuntime, "present", "missing", context));
      continue;
    }
    compareValue(diagnostics, fixture, leftRuntime, rightRuntime, itemPath, leftItem, rightItem, context);
    rightById.delete(leftItem.id);
  }

  for (const rightItem of rightById.values()) {
    diagnostics.push(mismatch(fixture, `${path}[${JSON.stringify(rightItem.id)}]`, leftRuntime, rightRuntime, "missing", "present", context));
  }
}

function compareValue(diagnostics, fixture, leftRuntime, rightRuntime, path, left, right, context) {
  if (JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))) {
    return;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      diagnostics.push(mismatch(fixture, path, leftRuntime, rightRuntime, left, right, context));
      return;
    }
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      compareValue(diagnostics, fixture, leftRuntime, rightRuntime, `${path}[${index}]`, left[index], right[index], context);
    }
    return;
  }

  if (!isRecord(left) || !isRecord(right)) {
    diagnostics.push(mismatch(fixture, path, leftRuntime, rightRuntime, left, right, context));
    return;
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    compareValue(diagnostics, fixture, leftRuntime, rightRuntime, `${path}.${key}`, left[key], right[key], context);
  }
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mismatch(fixture, path, leftRuntime, rightRuntime, left, right, context = {}) {
  return {
    artifactPaths: context.artifactPaths ?? {},
    bundlePath: context.bundlePath,
    code: "TN_CONFORMANCE_MISMATCH",
    fixture,
    left,
    leftRuntime,
    message: `Conformance mismatch for '${fixture}' at '${path}'.`,
    path,
    right,
    rightRuntime,
    severity: "error",
  };
}

async function writeGateReport(reportPath, ok, steps, artifacts = {}) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        artifacts,
        code: ok ? "TN_CONFORMANCE_OK" : "TN_CONFORMANCE_FAILED",
        status: ok ? "pass" : "fail",
        steps,
      },
      null,
      2,
    )}\n`,
  );
}

export function runCommand({ args, command, cwd, timeoutMs = 60000 }) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        durationMs: Date.now() - startedAt,
        exitCode: code ?? (signal === null ? 1 : 124),
        stderr,
        stdout,
      });
    });
  });
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyConformance();
  const payload = {
    artifacts: result.artifacts,
    code: result.ok ? "TN_CONFORMANCE_OK" : "TN_CONFORMANCE_FAILED",
    reportPath: result.reportPath,
    status: result.ok ? "pass" : "fail",
    steps: result.steps,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`Conformance gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`Conformance gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

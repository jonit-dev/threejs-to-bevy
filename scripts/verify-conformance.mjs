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
  ];

  for (const [name, command, args, commandOptions] of commands) {
    if (!(await step(name, command, args, commandOptions))) {
      await writeGateReport(reportPath, false, steps);
      return { ok: false, reportPath, steps };
    }
  }

  await writeGateReport(reportPath, true, steps);
  return { ok: true, reportPath, steps };
}

export function compareConformanceReports(left, right) {
  const diagnostics = [];
  const fixture = left.fixture ?? right.fixture ?? "unknown";
  if (left.fixture !== right.fixture) {
    diagnostics.push(mismatch(fixture, "fixture", left.runtime, right.runtime, left.fixture, right.fixture));
  }

  const rightEntities = new Map((right.entities ?? []).map((entity) => [entity.id, entity]));
  for (const leftEntity of left.entities ?? []) {
    const rightEntity = rightEntities.get(leftEntity.id);
    if (rightEntity === undefined) {
      diagnostics.push(mismatch(fixture, `entities.${leftEntity.id}`, left.runtime, right.runtime, "present", "missing"));
      continue;
    }
    compareValue(diagnostics, fixture, left.runtime, right.runtime, `entities.${leftEntity.id}`, leftEntity, rightEntity);
    rightEntities.delete(leftEntity.id);
  }

  for (const rightEntity of rightEntities.values()) {
    diagnostics.push(mismatch(fixture, `entities.${rightEntity.id}`, left.runtime, right.runtime, "missing", "present"));
  }

  return {
    diagnostics,
    ok: diagnostics.length === 0,
  };
}

function compareValue(diagnostics, fixture, leftRuntime, rightRuntime, path, left, right) {
  if (JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))) {
    return;
  }

  if (!isRecord(left) || !isRecord(right)) {
    diagnostics.push(mismatch(fixture, path, leftRuntime, rightRuntime, left, right));
    return;
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    compareValue(diagnostics, fixture, leftRuntime, rightRuntime, `${path}.${key}`, left[key], right[key]);
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

function mismatch(fixture, path, leftRuntime, rightRuntime, left, right) {
  return {
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

async function writeGateReport(reportPath, ok, steps) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
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

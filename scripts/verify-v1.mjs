import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliBin = resolve(repoRoot, "packages/cli/dist/index.js");

export async function verifyV1(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const runReady = options.runReady ?? runReadyCommand;
  const tempRoot = options.tempRoot ?? (await mkdtemp(join(tmpdir(), "tn-v1-gate-")));
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    if (result.exitCode !== 0) {
      return false;
    }
    return true;
  }

  try {
    const scaffoldPath = join(tempRoot, "scaffolded-v1-game");
    const canonicalPath = resolve(root, "examples/v1-canonical");
    const node = process.execPath;

    const regularSteps = [
      ["build cli", "pnpm", ["--filter", "@threenative/cli", "build"]],
      ["create scaffold", node, [cliBin, "create", scaffoldPath, "--json"]],
      ["validate scaffold", node, [cliBin, "validate", "--project", scaffoldPath, "--json"]],
      ["build scaffold", node, [cliBin, "build", "--project", scaffoldPath, "--json"]],
      ["verify scaffold web", node, [cliBin, "verify", "--project", scaffoldPath, "--frames", "2", "--json"], { timeoutMs: 90000 }],
      ["validate canonical", node, [cliBin, "validate", "--project", canonicalPath, "--json"]],
      ["build canonical", node, [cliBin, "build", "--project", canonicalPath, "--json"]],
      ["verify canonical web", node, [cliBin, "verify", "--project", canonicalPath, "--frames", "2", "--json"], { timeoutMs: 90000 }],
      ["check v1 docs", node, [resolve(root, "scripts/check-docs-v1.mjs"), "--json"]],
    ];

    for (const [name, command, args, commandOptions] of regularSteps) {
      if (!(await step(name, command, args, commandOptions))) {
        return { ok: false, steps };
      }
    }

    const nativeSmoke = await runReady({
      args: [cliBin, "dev", "--target", "desktop", "--project", canonicalPath, "--json"],
      command: node,
      cwd: root,
      name: "native desktop smoke",
      readyPattern: "TN_DEV_DESKTOP_READY",
      timeoutMs: 30000,
    });
    steps.push({ ...summarize(nativeSmoke), name: "native desktop smoke" });
    if (nativeSmoke.exitCode !== 0) {
      return { ok: false, steps };
    }

    return { ok: true, steps };
  } finally {
    if (options.keepTemp !== true) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }
}

export function summarize(result) {
  return {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    stderr: tail(result.stderr),
    stdout: tail(result.stdout),
  };
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

export function runReadyCommand({ args, command, cwd, readyPattern, timeoutMs = 30000 }) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stopProcess(child);
      resolveResult({
        durationMs: Date.now() - startedAt,
        exitCode,
        stderr,
        stdout,
      });
    };

    const timer = setTimeout(() => finish(124), timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes(readyPattern)) {
        finish(0);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (!settled) {
        finish(code ?? 1);
      }
    });
  });
}

function stopProcess(child) {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGINT");
      return;
    } catch {
      // Fall through to killing the direct child.
    }
  }
  child.kill("SIGINT");
}

function tail(value) {
  return value.length <= 4000 ? value : value.slice(-4000);
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV1({ keepTemp: process.argv.includes("--keep-temp") });
  const payload = {
    code: result.ok ? "TN_VERIFY_V1_OK" : "TN_VERIFY_V1_FAILED",
    status: result.ok ? "pass" : "fail",
    steps: result.steps,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V1 release gate passed.\n");
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V1 release gate failed at '${failed?.name ?? "unknown"}'.\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

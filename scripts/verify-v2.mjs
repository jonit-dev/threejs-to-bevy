import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand, verifyConformance } from "./verify-conformance.mjs";
import { runReadyCommand, summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV2(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const runReady = options.runReady ?? runReadyCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v2");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const arenaPath = resolve(root, "examples/v2-arena");
  const arenaBundlePath = resolve(arenaPath, "dist/game.bundle");
  const arenaGameplayTestPath = resolve(arenaPath, "dist/tests/examples/v2-arena/src/gameplay.test.js");
  const arenaWebReportPath = resolve(arenaPath, "artifacts/verify/verification-report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v2 docs", process.execPath, [resolve(root, "scripts/check-docs-v2.mjs"), "--json"]))) {
    return writeV2Report({ arenaBundlePath, arenaWebReportPath, ok: false, reportPath, steps });
  }

  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV2Report({ arenaBundlePath, arenaWebReportPath, ok: false, reportPath, steps });
  }

  const conformance = await verifyConformance({
    reportPath: resolve(artifactDir, "conformance-report.json"),
    repoRoot: root,
    run,
  });
  steps.push({
    durationMs: conformance.steps.reduce((total, current) => total + current.durationMs, 0),
    exitCode: conformance.ok ? 0 : 1,
    stderr: "",
    stdout: conformance.reportPath,
    name: "verify conformance",
  });
  if (!conformance.ok) {
    return writeV2Report({ arenaBundlePath, arenaWebReportPath, ok: false, reportPath, steps });
  }

  const node = process.execPath;
  const regularSteps = [
    ["rebuild v2 arena", node, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", arenaPath, "--json"], { timeoutMs: 120000 }],
    ["validate v2 arena bundle", node, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", arenaPath, "--json"]],
    ["compile v2 arena tests", "pnpm", ["exec", "tsc", "-p", resolve(arenaPath, "tsconfig.json"), "--outDir", resolve(arenaPath, "dist/tests")], { timeoutMs: 120000 }],
    ["test v2 arena gameplay", node, ["--test", arenaGameplayTestPath]],
    [
      "verify v2 arena web",
      node,
      [resolve(root, "packages/cli/dist/index.js"), "verify", "--project", arenaPath, "--frames", "2", "--json"],
      { timeoutMs: 120000 },
    ],
    ["native v2 runtime tests", "cargo", ["test", "-p", "threenative_runtime"], { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 }],
  ];

  for (const [name, command, args, commandOptions] of regularSteps) {
    if (!(await step(name, command, args, commandOptions))) {
      return writeV2Report({ arenaBundlePath, arenaWebReportPath, ok: false, reportPath, steps });
    }
  }

  const nativeSmoke = await runReady({
    args: [resolve(root, "packages/cli/dist/index.js"), "dev", "--target", "desktop", "--project", arenaPath, "--json"],
    command: node,
    cwd: root,
    name: "native v2 desktop smoke",
    readyPattern: "TN_DEV_DESKTOP_READY",
    timeoutMs: 30000,
  });
  steps.push({ ...summarize(nativeSmoke), name: "native v2 desktop smoke" });
  if (nativeSmoke.exitCode !== 0) {
    return writeV2Report({ arenaBundlePath, arenaWebReportPath, ok: false, reportPath, steps });
  }

  return writeV2Report({ arenaBundlePath, arenaWebReportPath, ok: true, reportPath, steps });
}

async function writeV2Report({ arenaBundlePath, arenaWebReportPath, ok, reportPath, steps }) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const report = {
    artifacts: {
      arenaBundlePath,
      conformanceReportPath: resolve(resolve(reportPath, ".."), "conformance-report.json"),
      reportPath,
      webReportPath: arenaWebReportPath,
    },
    capabilities: capabilityStatuses(steps),
    code: ok ? "TN_VERIFY_V2_OK" : "TN_VERIFY_V2_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    ...report,
    ok,
    reportPath,
  };
}

function capabilityStatuses(steps) {
  const passed = (name) => steps.some((step) => step.name === name && step.exitCode === 0);
  return [
    { artifact: "artifacts/v2/conformance-report.json", capability: "cross-runtime conformance", status: passed("verify conformance") ? "pass" : "fail" },
    { artifact: "examples/v2-arena/dist/game.bundle", capability: "bundle validation", status: passed("validate v2 arena bundle") ? "pass" : "fail" },
    { artifact: "examples/v2-arena/artifacts/verify/verification-report.json", capability: "web visual", status: passed("verify v2 arena web") ? "pass" : "fail" },
    { artifact: "examples/v2-arena/dist/tests/examples/v2-arena/src/gameplay.test.js", capability: "input", status: passed("test v2 arena gameplay") ? "pass" : "fail" },
    { artifact: "examples/v2-arena/dist/tests/examples/v2-arena/src/gameplay.test.js", capability: "movement", status: passed("test v2 arena gameplay") ? "pass" : "fail" },
    { artifact: "runtime-bevy", capability: "physics", status: passed("native v2 runtime tests") ? "pass" : "fail" },
    { artifact: "examples/v2-arena/artifacts/verify/verification-report.json", capability: "ui", status: passed("verify v2 arena web") ? "pass" : "fail" },
    { artifact: "runtime-bevy", capability: "audio", status: passed("native v2 runtime tests") ? "pass" : "fail" },
    { artifact: "runtime-bevy", capability: "native load", status: passed("native v2 desktop smoke") ? "pass" : "fail" },
  ];
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV2();
  const payload = {
    code: result.ok ? "TN_VERIFY_V2_OK" : "TN_VERIFY_V2_FAILED",
    reportPath: result.reportPath,
    status: result.ok ? "pass" : "fail",
    steps: result.steps,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V2 release gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V2 release gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

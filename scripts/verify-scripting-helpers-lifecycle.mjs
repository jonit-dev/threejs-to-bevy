import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = resolve(root, "examples/racing-kit-rally");
const bundleRoot = resolve(exampleRoot, "dist/racing-kit-rally.bundle");
const targets = resolveArtifactTargets({
  gate: "scripting-helpers-lifecycle",
  owner: { kind: "aggregate", name: "scripting-helpers-lifecycle" },
  root,
});

const commands = [];
const diagnostics = [];

await mkdir(targets.absoluteDir, { recursive: true });

run("build sdk", "pnpm", ["--filter", "@threenative/sdk", "build"]);
run("test sdk lifecycle facade", process.execPath, ["--test", "packages/sdk/dist/scriptLifecycle.test.js"]);
run("test racing kit", "pnpm", ["--filter", "@threenative/racing-kit", "test"]);
run("build compiler", "pnpm", ["--filter", "@threenative/compiler", "build"]);
run("test compiler scripting", process.execPath, [
  "--test",
  "dist/examples.test.js",
  "dist/scripts/bundle.test.js",
  "dist/scripts/sourceRefs.test.js",
], { cwd: resolve(root, "packages/compiler") });
run("build racing kit rally", "pnpm", ["tn", "build", "--project", "examples/racing-kit-rally"]);
run("playtest racing kit rally", "pnpm", [
  "--filter",
  "@threenative/cli",
  "tn",
  "playtest",
  "--project",
  "examples/racing-kit-rally",
  "--entity",
  "player.car",
  "--press",
  "KeyW",
  "--frames",
  "30",
  "--expect-moved",
  "--json",
]);
run("test bevy context helper bridge", "cargo", [
  "test",
  "--manifest-path",
  "runtime-bevy/Cargo.toml",
  "-p",
  "threenative_runtime",
  "systems_host_should_expose_context_ergonomics_helpers",
]);

const artifactChecks = commands.every((command) => command.status === "pass")
  ? await inspectBundle()
  : { ok: false, summary: {} };

const ok = commands.every((command) => command.status === "pass") && artifactChecks.ok && diagnostics.length === 0;
await writeReport({
  artifacts: {
    exampleBundle: "examples/racing-kit-rally/dist/racing-kit-rally.bundle",
    playtest: "examples/racing-kit-rally/artifacts/playtest/player.car-KeyW.png",
    report: targets.relativeReportPath,
  },
  checks: artifactChecks.summary,
  commands,
  diagnostics,
  generatedBy: "scripts/verify-scripting-helpers-lifecycle.mjs",
  ok,
  promoted: [
    "portable stdlib helper import bundling",
    "optional racing-kit helper import bundling",
    "script lifecycle facade lowering",
    "context helper bridge parity evidence",
    "structured-source racing example rebuild",
  ],
  schema: "threenative.scripting-helpers-lifecycle-verification",
  status: ok ? "passed" : "failed",
});

if (!ok) {
  process.exitCode = 1;
}

function run(name, command, args, options = {}) {
  if (commands.some((entry) => entry.status === "fail")) {
    commands.push({ args, command, name, skipped: true, status: "skipped" });
    return;
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: "pipe",
    timeout: options.timeoutMs ?? 180_000,
  });
  const status = result.status === 0 ? "pass" : "fail";
  commands.push({
    args,
    command,
    name,
    status,
    stderr: trimOutput(result.stderr),
    stdout: trimOutput(result.stdout),
  });
  if (status === "fail") {
    diagnostics.push({
      code: "TN_VERIFY_SCRIPTING_HELPERS_LIFECYCLE_COMMAND_FAILED",
      message: `Verification command failed: ${name}`,
      path: `commands.${commands.length - 1}`,
      severity: "error",
    });
  }
}

async function inspectBundle() {
  const systems = await readJson(resolve(bundleRoot, "systems.ir.json"));
  const scripts = await readJson(resolve(bundleRoot, "scripts.manifest.json"));
  const bundle = await readFile(resolve(bundleRoot, "scripts.bundle.js"), "utf8");

  const expectedSchedules = new Map([
    ["rally.awake", "startup"],
    ["rally.fixedUpdate", "fixedUpdate"],
    ["rally.lateUpdate", "postUpdate"],
  ]);
  const actualSchedules = new Map((systems.systems ?? []).map((system) => [system.name, system.schedule]));
  for (const [name, schedule] of expectedSchedules) {
    if (actualSchedules.get(name) !== schedule) {
      diagnostics.push({
        code: "TN_VERIFY_SCRIPTING_HELPERS_LIFECYCLE_SCHEDULE_MISMATCH",
        message: `Expected lifecycle system '${name}' to lower to schedule '${schedule}'.`,
        path: "examples/racing-kit-rally/dist/racing-kit-rally.bundle/systems.ir.json",
        severity: "error",
      });
    }
  }

  const helperImports = new Set();
  for (const system of scripts.systems ?? []) {
    for (const helper of system.source?.helperImports ?? []) {
      helperImports.add(helper.module);
    }
  }
  for (const module of ["@threenative/script-stdlib", "@threenative/racing-kit"]) {
    if (!helperImports.has(module)) {
      diagnostics.push({
        code: "TN_VERIFY_SCRIPTING_HELPERS_LIFECYCLE_HELPER_IMPORT_MISSING",
        message: `Expected scripts manifest to record helper import '${module}'.`,
        path: "examples/racing-kit-rally/dist/racing-kit-rally.bundle/scripts.manifest.json",
        severity: "error",
      });
    }
  }

  for (const symbol of ["NumberEx", "Vec3", "Quat", "Track2D", "CheckpointRace"]) {
    if (!bundle.includes(`const ${symbol}`)) {
      diagnostics.push({
        code: "TN_VERIFY_SCRIPTING_HELPERS_LIFECYCLE_SYMBOL_MISSING",
        message: `Expected scripts bundle to contain injected helper '${symbol}'.`,
        path: "examples/racing-kit-rally/dist/racing-kit-rally.bundle/scripts.bundle.js",
        severity: "error",
      });
    }
  }

  return {
    ok: diagnostics.length === 0,
    summary: {
      helperImports: [...helperImports].sort(),
      lifecycleSchedules: Object.fromEntries([...expectedSchedules].map(([name]) => [name, actualSchedules.get(name)])),
      scriptSystemCount: scripts.systems?.length ?? 0,
    },
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeReport(report) {
  await mkdir(dirname(targets.reportPath), { recursive: true });
  await writeFile(targets.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function trimOutput(output) {
  const value = String(output ?? "").trim();
  return value.length > 4000 ? `${value.slice(0, 4000)}\n...<truncated>` : value;
}

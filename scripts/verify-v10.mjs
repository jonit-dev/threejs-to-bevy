import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const V10_PLANNED_FOCUSED_GATES = [
  "verify:v10:advanced-renderer",
  "verify:v10:visual-calibration",
  "verify:v10:production-support",
];

export async function verifyV10(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v10");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const focusedGates = options.focusedGates ?? [];
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const commands = [];
  const steps = [];
  const artifacts = {
    boundaryReportPath: resolve(artifactDir, "boundaries/verification-report.json"),
    reportPath,
  };
  const promoted = ["v10-ownership-map", "v10-aggregate-planning-gate", "v10-boundary-diagnostics"];
  const deferred = [...V10_PLANNED_FOCUSED_GATES, "editor-ui-and-visual-inspector-ux"];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    const summary = { ...summarize(result), name };
    steps.push(summary);
    commands.push({ args, command, durationMs: summary.durationMs, exitCode: summary.exitCode, name, stderr: summary.stderr, stdout: summary.stdout });
    return result.exitCode === 0;
  }

  const testArgs = [
    "--test",
    resolve(root, "scripts/check-docs-v10.test.mjs"),
    resolve(root, "scripts/check-quality-v10.test.mjs"),
    resolve(root, "scripts/verify-v10.test.mjs"),
  ];

  if (!(await step("check v10 docs", process.execPath, [resolve(root, "scripts/check-docs-v10.mjs"), "--json"], { timeoutMs: 120000 }))) {
    return writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("check v10 quality", process.execPath, [resolve(root, "scripts/check-quality-v10.mjs"), "--json"], { timeoutMs: 120000 }))) {
    return writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test v10 gate scripts", process.execPath, testArgs, { timeoutMs: 120000 }))) {
    return writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (options.skipIrBuild !== true && !(await step("build ir package", "pnpm", ["--filter", "@threenative/ir", "build"], { timeoutMs: 120000 }))) {
    return writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  const boundary = await (options.boundaryValidator ?? verifyBoundaryFixtures)(root, artifacts.boundaryReportPath);
  steps.push(boundary.step);
  commands.push(boundary.command);
  if (!boundary.ok) {
    return writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics: boundary.diagnostics, ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  for (const gate of focusedGates) {
    if (gate.script !== undefined && !(await step(gate.name, "pnpm", [gate.script], { timeoutMs: gate.timeoutMs ?? 600000 }))) {
      return writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
    }
    const artifactCheck = await checkFocusedArtifact(root, gate);
    steps.push(artifactCheck.step);
    commands.push(artifactCheck.command);
    if (!artifactCheck.ok) {
      return writeV10Report({ artifactDir, artifacts: { ...artifacts, failedFocusedReportPath: resolve(root, gate.reportPath) }, commands, deferred, diagnostics: artifactCheck.diagnostics, ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
    }
    artifacts[gate.name] = resolve(root, gate.reportPath);
  }

  return writeV10Report({
    artifactDir,
    artifacts,
    commands,
    deferred,
    diagnostics: [],
    ok: true,
    promoted,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
  });
}

async function verifyBoundaryFixtures(root, reportPath) {
  const startedAtMs = Date.now();
  const catalogPath = resolve(root, "packages/ir/fixtures/rejected/v10-boundaries/catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const { validateBundle } = await import(pathToFileURL(resolve(root, "packages/ir/dist/validate.js")).href);
  const tempRoot = await mkdtemp(join(tmpdir(), "tn-v10-boundaries-"));
  const results = [];
  const diagnostics = [];
  try {
    for (const fixture of catalog.fixtures ?? []) {
      const bundlePath = join(tempRoot, fixture.id);
      await writeSyntheticBundle(bundlePath, fixture.requiredCapabilities ?? {});
      const result = await validateBundle(bundlePath);
      const matched = result.diagnostics.some((diagnostic) => diagnostic.code === fixture.expectedDiagnostic);
      results.push({ diagnostics: result.diagnostics, expectedDiagnostic: fixture.expectedDiagnostic, id: fixture.id, ok: !result.ok && matched });
      if (!matched) {
        diagnostics.push({
          code: "TN_VERIFY_V10_BOUNDARY_DIAGNOSTIC_MISSING",
          expectedDiagnostic: fixture.expectedDiagnostic,
          fixture: fixture.id,
          message: `V10 boundary fixture '${fixture.id}' did not produce expected diagnostic '${fixture.expectedDiagnostic}'.`,
          path: "packages/ir/fixtures/rejected/v10-boundaries/catalog.json",
          severity: "error",
        });
      }
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const ok = diagnostics.length === 0;
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        code: ok ? "TN_VERIFY_V10_BOUNDARIES_OK" : "TN_VERIFY_V10_BOUNDARIES_FAILED",
        diagnostics,
        fixtures: results,
        generatedBy: "scripts/verify-v10.mjs",
        ok,
        schema: "threenative.verify.v10.boundaries",
        status: ok ? "pass" : "fail",
      },
      null,
      2,
    )}\n`,
  );
  return {
    command: {
      args: ["packages/ir/fixtures/rejected/v10-boundaries/catalog.json"],
      command: "validateBundle",
      durationMs: Date.now() - startedAtMs,
      exitCode: ok ? 0 : 1,
      name: "verify v10 boundary fixtures",
      stderr: ok ? "" : diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
      stdout: reportPath,
    },
    diagnostics,
    ok,
    step: {
      durationMs: Date.now() - startedAtMs,
      exitCode: ok ? 0 : 1,
      name: "verify v10 boundary fixtures",
      stderr: ok ? "" : diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
      stdout: reportPath,
    },
  };
}

async function writeSyntheticBundle(root, requiredCapabilities) {
  await mkdir(join(root, "schemas"), { recursive: true });
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify(
      {
        entry: { world: "world.ir.json" },
        files: {
          assets: "assets.manifest.json",
          componentSchemas: "schemas/components.schema.json",
          materials: "materials.ir.json",
          targetProfile: "target.profile.json",
        },
        name: "v10-boundary-fixture",
        requiredCapabilities,
        schema: "threenative.bundle",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "world.ir.json"), `${JSON.stringify({ entities: [], events: {}, prefabs: [], resources: {}, schema: "threenative.world", version: "0.1.0" }, null, 2)}\n`);
  await writeFile(join(root, "assets.manifest.json"), `${JSON.stringify({ assets: [], schema: "threenative.assets", version: "0.1.0" }, null, 2)}\n`);
  await writeFile(join(root, "materials.ir.json"), `${JSON.stringify({ materials: [], schema: "threenative.materials", version: "0.1.0" }, null, 2)}\n`);
  await writeFile(join(root, "target.profile.json"), `${JSON.stringify({ schema: "threenative.target-profile", targets: ["web", "native"], version: "0.1.0" }, null, 2)}\n`);
  await writeFile(join(root, "schemas/components.schema.json"), `${JSON.stringify({ schema: "threenative.component-schemas", schemas: {}, version: "0.1.0" }, null, 2)}\n`);
}

async function checkFocusedArtifact(root, gate) {
  const path = resolve(root, gate.reportPath);
  const startedAtMs = Date.now();
  try {
    await access(path);
    return {
      command: { command: "access", durationMs: Date.now() - startedAtMs, exitCode: 0, name: `check focused artifact ${gate.name}`, stderr: "", stdout: gate.reportPath },
      diagnostics: [],
      ok: true,
      step: { durationMs: Date.now() - startedAtMs, exitCode: 0, name: `check focused artifact ${gate.name}`, stderr: "", stdout: gate.reportPath },
    };
  } catch {
    const diagnostic = {
      artifactPath: gate.reportPath,
      code: "TN_VERIFY_V10_ARTIFACT_MISSING",
      command: gate.script,
      message: `Focused V10 gate '${gate.name}' did not write required artifact '${gate.reportPath}'.`,
      path: gate.reportPath,
      severity: "error",
    };
    return {
      command: { command: "access", durationMs: Date.now() - startedAtMs, exitCode: 1, name: `check focused artifact ${gate.name}`, stderr: diagnostic.message, stdout: gate.reportPath },
      diagnostics: [diagnostic],
      ok: false,
      step: { durationMs: Date.now() - startedAtMs, exitCode: 1, name: `check focused artifact ${gate.name}`, stderr: diagnostic.message, stdout: gate.reportPath },
    };
  }
}

function stepDiagnostics(steps) {
  const failedStep = steps.find((step) => step.exitCode !== 0);
  if (failedStep === undefined) {
    return [];
  }
  return [
    {
      code: "TN_VERIFY_V10_STEP_FAILED",
      command: failedStep.name,
      exitCode: failedStep.exitCode,
      message: `V10 verification failed at '${failedStep.name}'.`,
      path: `steps.${steps.indexOf(failedStep)}`,
      severity: "error",
      step: failedStep.name,
    },
  ];
}

async function writeV10Report({ artifactDir, artifacts, commands, deferred, diagnostics, ok, promoted, reportPath, startedAt, startedAtMs, steps }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      ...artifacts,
      plannedFocusedGates: V10_PLANNED_FOCUSED_GATES,
    },
    code: ok ? "TN_VERIFY_V10_OK" : "TN_VERIFY_V10_FAILED",
    commands,
    deferred,
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    generatedBy: "scripts/verify-v10.mjs",
    ok,
    promoted,
    schema: "threenative.verify.v10",
    status: ok ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    steps,
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV10();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, ok: result.ok, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V10 verification passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V10 verification failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

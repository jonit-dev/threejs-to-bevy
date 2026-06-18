import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const V9_FOCUSED_GATES = [
  {
    name: "verify v9 animation state",
    reportPath: "tools/verify/artifacts/animation-state/state-diff.json",
    script: "verify:v9:animation-state",
  },
  {
    name: "verify v9 animation blending",
    reportPath: "tools/verify/artifacts/animation-blending/blend-report.json",
    script: "verify:v9:animation-blending",
  },
  {
    name: "verify v9 animation particles",
    reportPath: "tools/verify/artifacts/animation-particles/verification-report.json",
    script: "verify:v9:animation-particles",
  },
  {
    name: "verify v9 physics character",
    reportPath: "packages/ir/artifacts/conformance/physics-character/verification-report.json",
    script: "verify:v9:physics-character",
  },
  {
    name: "verify v9 assets gltf scene workflow",
    reportPath: "examples/assets-gltf-scene-workflow/artifacts/assets-gltf-scene-workflow/diff.json",
    script: "verify:v9:assets-gltf-scene-workflow",
  },
  {
    name: "verify v9 rendering lights",
    reportPath: "examples/rendering-lights/artifacts/rendering-lights/verification-report.json",
    script: "verify:v9:rendering-lights",
  },
  {
    name: "verify animation physics navigation residuals",
    reportPath: "tools/verify/artifacts/animation-physics-residuals/verification-report.json",
    script: "verify:animation-physics-residuals",
  },
  {
    name: "verify input ui polish",
    reportPath: "tools/verify/artifacts/input-ui-polish/verification-report.json",
    script: "verify:input-ui-polish",
  },
];

export const V9_RELEASE_ARTIFACTS = [
  "tools/verify/artifacts/release/verification-report.json",
  "tools/verify/artifacts/sample-scenes/verification-report.json",
  "tools/verify/artifacts/visual-matrix/verification-report.json",
  "packages/ir/artifacts/conformance/verification-report.json",
];

export async function verifyV9(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "release", owner: { kind: "aggregate", name: "release" }, root });
  const sampleScenesTargets = resolveArtifactTargets({ gate: "sample-scenes", owner: { kind: "aggregate", name: "sample-scenes" }, root });
  const visualMatrixTargets = resolveArtifactTargets({ gate: "visual-matrix", owner: { kind: "aggregate", name: "visual-matrix" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const focusedGates = options.focusedGates ?? V9_FOCUSED_GATES;
  const steps = [];
  const commands = [];
  const artifacts = {
    conformanceReportPath: resolve(root, "packages/ir/artifacts/conformance/verification-report.json"),
    reportPath,
    sampleScenesReportPath: sampleScenesTargets.reportPath,
    visualMatrixReportPath: visualMatrixTargets.reportPath,
  };
  const promoted = [];
  const deferred = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    const summary = { ...summarize(result), name };
    steps.push(summary);
    commands.push({
      args,
      command,
      durationMs: summary.durationMs,
      exitCode: summary.exitCode,
      name,
      stderr: summary.stderr,
      stdout: summary.stdout,
    });
    return result.exitCode === 0;
  }

  if (!(await step("check v9 quality gates", process.execPath, [resolve(root, "scripts/check-v9-quality-gates.mjs"), "--json"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  if (!(await step("test v9 quality gate scripts", process.execPath, ["--test", resolve(root, "scripts/check-v9-quality-gates.test.mjs"), resolve(root, "scripts/verify-v9.test.mjs"), resolve(root, "scripts/verify-v9-sample-scenes.test.mjs"), resolve(root, "scripts/verify-v9-visual-matrix.test.mjs")], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  if (!(await step("build ir package", "pnpm", ["--filter", "@threenative/ir", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test ir package", "pnpm", ["--filter", "@threenative/ir", "test"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build sdk package", "pnpm", ["--filter", "@threenative/sdk", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build ui package", "pnpm", ["--filter", "@threenative/ui", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build r3f package", "pnpm", ["--filter", "@threenative/r3f", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build compiler package", "pnpm", ["--filter", "@threenative/compiler", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build web runtime package", "pnpm", ["--filter", "@threenative/runtime-web-three", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build cli package", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  for (const gate of focusedGates) {
    if (!(await step(gate.name, "pnpm", [gate.script], { timeoutMs: 600000 }))) {
      return writeV9Report({
        artifactDir,
        artifacts: { ...artifacts, failedFocusedReportPath: resolve(root, gate.reportPath) },
        commands,
        deferred,
        diagnostics: stepDiagnostics(steps),
        ok: false,
        promoted,
        reportPath,
        startedAt,
        startedAtMs,
        steps,
      });
    }
    const artifactCheck = await checkFocusedArtifact(root, gate);
    steps.push(artifactCheck.step);
    commands.push(artifactCheck.command);
    if (artifactCheck.step.exitCode !== 0) {
      return writeV9Report({
        artifactDir,
        artifacts: { ...artifacts, failedFocusedReportPath: resolve(root, gate.reportPath) },
        commands,
        deferred,
        diagnostics: artifactCheck.diagnostics,
        ok: false,
        promoted,
        reportPath,
        startedAt,
        startedAtMs,
        steps,
      });
    }
    artifacts[gate.script] = resolve(root, gate.reportPath);
  }

  if (!(await step("verify conformance gate", process.execPath, [resolve(root, "scripts/verify-conformance.mjs"), "--json"], { timeoutMs: 900000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  if (!(await step("verify v9 sample scenes", process.execPath, [resolve(root, "scripts/verify-v9-sample-scenes.mjs"), "--json"], { timeoutMs: 600000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  if (!(await step("verify v9 visual matrix", process.execPath, [resolve(root, "scripts/verify-v9-visual-matrix.mjs"), "--json"], { timeoutMs: 1200000 }))) {
    return writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics: stepDiagnostics(steps), ok: false, promoted, reportPath, startedAt, startedAtMs, steps });
  }

  const releaseArtifactCheck = await checkReleaseArtifacts(root, artifacts);
  steps.push(releaseArtifactCheck.step);
  commands.push(releaseArtifactCheck.command);
  promoted.push(
    "aggregate-v9-gate",
    "focused-v9-gates",
    "conformance-latest-merge",
    "sample-scene-matrix",
    "visual-matrix-smoke",
    "merge-drift-guard",
  );
  deferred.push("full-verify-all-on-every-pr", "ci-artifact-upload");

  return writeV9Report({
    artifactDir,
    artifacts,
    commands,
    deferred,
    diagnostics: releaseArtifactCheck.diagnostics,
    ok: releaseArtifactCheck.step.exitCode === 0,
    promoted,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
  });
}

async function checkFocusedArtifact(root, gate) {
  const path = resolve(root, gate.reportPath);
  const startedAtMs = Date.now();
  try {
    await access(path);
    return {
      command: {
        command: "access",
        durationMs: Date.now() - startedAtMs,
        exitCode: 0,
        name: `check focused artifact ${gate.script}`,
        stderr: "",
        stdout: gate.reportPath,
      },
      diagnostics: [],
      step: {
        durationMs: Date.now() - startedAtMs,
        exitCode: 0,
        name: `check focused artifact ${gate.script}`,
        stderr: "",
        stdout: gate.reportPath,
      },
    };
  } catch {
    return {
      command: {
        command: "access",
        durationMs: Date.now() - startedAtMs,
        exitCode: 1,
        name: `check focused artifact ${gate.script}`,
        stderr: `Missing focused gate artifact: ${gate.reportPath}`,
        stdout: gate.reportPath,
      },
      diagnostics: [
        {
          artifactPath: gate.reportPath,
          code: "TN_VERIFY_V9_ARTIFACT_MISSING",
          command: gate.script,
          message: `Focused V9 gate '${gate.script}' did not write required artifact '${gate.reportPath}'.`,
          path: gate.reportPath,
          severity: "error",
        },
      ],
      step: {
        durationMs: Date.now() - startedAtMs,
        exitCode: 1,
        name: `check focused artifact ${gate.script}`,
        stderr: `Missing focused gate artifact: ${gate.reportPath}`,
        stdout: gate.reportPath,
      },
    };
  }
}

async function checkReleaseArtifacts(root, artifacts) {
  const startedAtMs = Date.now();
  const required = [
    artifacts.sampleScenesReportPath,
    artifacts.visualMatrixReportPath,
    artifacts.conformanceReportPath,
    ...V9_FOCUSED_GATES.map((gate) => resolve(root, gate.reportPath)),
  ];
  const missing = [];
  for (const path of required) {
    try {
      await access(path);
    } catch {
      missing.push(path.replace(`${root}/`, ""));
    }
  }
  return {
    command: {
      command: "access",
      durationMs: Date.now() - startedAtMs,
      exitCode: missing.length === 0 ? 0 : 1,
      name: "check v9 release artifacts",
      stderr: missing.length === 0 ? "" : `Missing V9 release artifact(s): ${missing.join(", ")}`,
      stdout: artifacts.reportPath,
    },
    diagnostics:
      missing.length === 0
        ? []
        : missing.map((path) => ({
            artifactPath: path,
            code: "TN_VERIFY_V9_ARTIFACT_MISSING",
            message: `Required V9 release artifact is missing: ${path}`,
            path,
            severity: "error",
          })),
    step: {
      durationMs: Date.now() - startedAtMs,
      exitCode: missing.length === 0 ? 0 : 1,
      name: "check v9 release artifacts",
      stderr: missing.length === 0 ? "" : `Missing V9 release artifact(s): ${missing.join(", ")}`,
      stdout: artifacts.reportPath,
    },
  };
}

function stepDiagnostics(steps) {
  const failedStep = steps.find((step) => step.exitCode !== 0);
  if (failedStep === undefined) {
    return [];
  }
  return [
    {
      code: "TN_VERIFY_V9_STEP_FAILED",
      command: failedStep.name,
      exitCode: failedStep.exitCode,
      message: `V9 verification failed at '${failedStep.name}'.`,
      path: `steps.${steps.indexOf(failedStep)}`,
      severity: "error",
      step: failedStep.name,
    },
  ];
}

async function writeV9Report({ artifactDir, artifacts, commands, deferred, diagnostics, ok, promoted, reportPath, startedAt, startedAtMs, steps }) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const report = {
    artifacts: {
      ...artifacts,
      focusedReports: Object.fromEntries(V9_FOCUSED_GATES.map((gate) => [gate.script, gate.reportPath])),
    },
    code: ok ? "TN_VERIFY_V9_OK" : "TN_VERIFY_V9_FAILED",
    commands,
    deferred,
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    generatedBy: "scripts/verify-v9.mjs",
    ok,
    promoted,
    schema: "threenative.verify.v9",
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
  const result = await verifyV9();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, ok: result.ok, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V9 verification passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V9 verification failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { runCommand, summarize, type CommandResult, type StepSummary, type VerificationDiagnostic } from "./runner.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

interface FocusedGate {
  name: string;
  reportPath: string;
  script: string;
}

export const RELEASE_FOCUSED_GATES: readonly FocusedGate[] = [
  { name: "verify v9 animation state", reportPath: "tools/verify/artifacts/animation-state/state-diff.json", script: "verify:v9:animation-state" },
  { name: "verify v9 animation blending", reportPath: "tools/verify/artifacts/animation-blending/blend-report.json", script: "verify:v9:animation-blending" },
  { name: "verify v9 animation particles", reportPath: "tools/verify/artifacts/animation-particles/verification-report.json", script: "verify:v9:animation-particles" },
  { name: "verify v9 physics character", reportPath: "packages/ir/artifacts/conformance/physics-character/verification-report.json", script: "verify:v9:physics-character" },
  { name: "verify v9 assets gltf scene workflow", reportPath: "examples/assets-gltf-scene-workflow/artifacts/assets-gltf-scene-workflow/diff.json", script: "verify:v9:assets-gltf-scene-workflow" },
  { name: "verify v9 rendering lights", reportPath: "examples/rendering-lights/artifacts/rendering-lights/verification-report.json", script: "verify:v9:rendering-lights" },
  { name: "verify animation physics navigation residuals", reportPath: "tools/verify/artifacts/animation-physics-residuals/verification-report.json", script: "verify:animation-physics-residuals" },
  { name: "verify input ui polish", reportPath: "tools/verify/artifacts/input-ui-polish/verification-report.json", script: "verify:input-ui-polish" },
  { name: "verify persistence reload", reportPath: "tools/verify/artifacts/persistence-reload/verification-report.json", script: "verify:persistence-reload" },
  { name: "verify production hardening", reportPath: "tools/verify/artifacts/production-hardening/verification-report.json", script: "verify:production-hardening" },
  { name: "verify rendering residuals", reportPath: "tools/verify/artifacts/rendering-residuals/verification-report.json", script: "verify:rendering-residuals" },
  { name: "verify runtime gameplay host", reportPath: "tools/verify/artifacts/runtime-gameplay-host/verification-report.json", script: "verify:runtime-gameplay-host" },
  { name: "verify bundle safety hardening", reportPath: "tools/verify/artifacts/bundle-safety-hardening/verification-report.json", script: "verify:bundle-safety-hardening" },
];

interface CommandSummary extends StepSummary {
  args?: readonly string[];
  command?: string;
}

export interface ReleaseGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

interface ReleaseGateOptions {
  artifactDir?: string;
  focusedGates?: readonly FocusedGate[];
  repoRoot?: string;
  reportPath?: string;
  run?: typeof runCommand;
}

export async function runReleaseGate(options: ReleaseGateOptions = {}): Promise<ReleaseGateResult> {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "release", owner: { kind: "aggregate", name: "release" }, root });
  const sampleScenesTargets = resolveArtifactTargets({ gate: "sample-scenes", owner: { kind: "aggregate", name: "sample-scenes" }, root });
  const visualMatrixTargets = resolveArtifactTargets({ gate: "visual-matrix", owner: { kind: "aggregate", name: "visual-matrix" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const focusedGates = options.focusedGates ?? RELEASE_FOCUSED_GATES;
  const steps: StepSummary[] = [];
  const commands: CommandSummary[] = [];
  const artifacts: Record<string, unknown> = {
    conformanceReportPath: resolve(root, "packages/ir/artifacts/conformance/verification-report.json"),
    reportPath,
    sampleScenesReportPath: sampleScenesTargets.reportPath,
    visualMatrixReportPath: visualMatrixTargets.reportPath,
  };
  const promoted: string[] = [];
  const deferred: string[] = [];

  async function step(name: string, command: string, args: readonly string[], commandOptions: { cwd?: string; timeoutMs?: number } = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    const summary = { ...summarize(result), name };
    steps.push(summary);
    commands.push({ ...summary, args, command });
    return result.exitCode === 0;
  }

  const fail = async (diagnostics = stepDiagnostics(steps)) => writeReleaseReport({
    artifactDir,
    artifacts,
    commands,
    deferred,
    diagnostics,
    ok: false,
    promoted,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
  });

  if (!(await step("check v9 quality gates", process.execPath, [resolve(root, "scripts/check-v9-quality-gates.mjs"), "--json"], { timeoutMs: 120000 }))) {
    return fail();
  }
  if (!(await step("test v9 quality gate scripts", process.execPath, [
    "--test",
    resolve(root, "scripts/check-v9-quality-gates.test.mjs"),
    resolve(root, "scripts/verify-v9.test.mjs"),
    resolve(root, "scripts/verify-v9-sample-scenes.test.mjs"),
    resolve(root, "scripts/verify-v9-visual-matrix.test.mjs"),
  ], { timeoutMs: 120000 }))) {
    return fail();
  }

  for (const [name, command, args] of [
    ["build ir package", "pnpm", ["--filter", "@threenative/ir", "build"]],
    ["test ir package", "pnpm", ["--filter", "@threenative/ir", "test"]],
    ["build sdk package", "pnpm", ["--filter", "@threenative/sdk", "build"]],
    ["build ui package", "pnpm", ["--filter", "@threenative/ui", "build"]],
    ["build r3f package", "pnpm", ["--filter", "@threenative/r3f", "build"]],
    ["build compiler package", "pnpm", ["--filter", "@threenative/compiler", "build"]],
    ["build web runtime package", "pnpm", ["--filter", "@threenative/runtime-web-three", "build"]],
    ["build cli package", "pnpm", ["--filter", "@threenative/cli", "build"]],
  ] as const) {
    if (!(await step(name, command, args, { timeoutMs: 120000 }))) {
      return fail();
    }
  }

  for (const gate of focusedGates) {
    if (!(await step(gate.name, "pnpm", [gate.script], { timeoutMs: 600000 }))) {
      artifacts.failedFocusedReportPath = resolve(root, gate.reportPath);
      return fail();
    }
    const artifactCheck = await checkFocusedArtifact(root, gate);
    steps.push(artifactCheck.step);
    commands.push(artifactCheck.command);
    if (artifactCheck.step.exitCode !== 0) {
      artifacts.failedFocusedReportPath = resolve(root, gate.reportPath);
      return fail(artifactCheck.diagnostics);
    }
    artifacts[gate.script] = resolve(root, gate.reportPath);
  }

  if (!(await step("verify conformance gate", process.execPath, [resolve(root, "tools/verify/dist/cli/conformance.js"), "--json"], { timeoutMs: 900000 }))) {
    return fail();
  }
  if (!(await step("verify v9 sample scenes", process.execPath, [resolve(root, "scripts/verify-v9-sample-scenes.mjs"), "--json"], { timeoutMs: 600000 }))) {
    return fail();
  }
  if (!(await step("verify v9 visual matrix", process.execPath, [resolve(root, "scripts/verify-v9-visual-matrix.mjs"), "--json"], { timeoutMs: 1200000 }))) {
    return fail();
  }

  const releaseArtifactCheck = await checkReleaseArtifacts(root, artifacts, focusedGates);
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

  const report = await writeReleaseReport({
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
  return {
    diagnostics: report.diagnostics,
    ok: report.ok,
    reportPath: report.reportPath,
    steps: report.steps,
  };
}

async function checkFocusedArtifact(root: string, gate: FocusedGate): Promise<{
  command: CommandSummary;
  diagnostics: VerificationDiagnostic[];
  step: StepSummary;
}> {
  const path = resolve(root, gate.reportPath);
  const startedAtMs = Date.now();
  try {
    await access(path);
    const summary = {
      durationMs: Date.now() - startedAtMs,
      exitCode: 0,
      name: `check focused artifact ${gate.script}`,
      stderr: "",
      stdout: gate.reportPath,
    };
    return { command: { ...summary, command: "access" }, diagnostics: [], step: summary };
  } catch {
    const summary = {
      durationMs: Date.now() - startedAtMs,
      exitCode: 1,
      name: `check focused artifact ${gate.script}`,
      stderr: `Missing focused gate artifact: ${gate.reportPath}`,
      stdout: gate.reportPath,
    };
    return {
      command: { ...summary, command: "access" },
      diagnostics: [{
        code: "TN_VERIFY_RELEASE_ARTIFACT_MISSING",
        message: `Focused release gate '${gate.script}' did not write required artifact '${gate.reportPath}'.`,
        path: gate.reportPath,
        severity: "error",
      }],
      step: summary,
    };
  }
}

async function checkReleaseArtifacts(root: string, artifacts: Record<string, unknown>, focusedGates: readonly FocusedGate[]): Promise<{
  command: CommandSummary;
  diagnostics: VerificationDiagnostic[];
  step: StepSummary;
}> {
  const startedAtMs = Date.now();
  const required = [
    String(artifacts.sampleScenesReportPath),
    String(artifacts.visualMatrixReportPath),
    String(artifacts.conformanceReportPath),
    ...focusedGates.map((gate) => resolve(root, gate.reportPath)),
  ];
  const missing = [];
  for (const path of required) {
    try {
      await access(path);
    } catch {
      missing.push(path.replace(`${root}/`, ""));
    }
  }
  const summary = {
    durationMs: Date.now() - startedAtMs,
    exitCode: missing.length === 0 ? 0 : 1,
    name: "check release artifacts",
    stderr: missing.length === 0 ? "" : `Missing release artifact(s): ${missing.join(", ")}`,
    stdout: String(artifacts.reportPath),
  };
  return {
    command: { ...summary, command: "access" },
    diagnostics: missing.map((path) => ({
      code: "TN_VERIFY_RELEASE_ARTIFACT_MISSING",
      message: `Required release artifact is missing: ${path}`,
      path,
      severity: "error" as const,
    })),
    step: summary,
  };
}

function stepDiagnostics(steps: StepSummary[]): VerificationDiagnostic[] {
  const failedStep = steps.find((step) => step.exitCode !== 0);
  if (!failedStep) {
    return [];
  }
  return [{
    code: "TN_VERIFY_RELEASE_STEP_FAILED",
    message: `Release verification failed at '${failedStep.name}'.`,
    path: `steps.${steps.indexOf(failedStep)}`,
    severity: "error",
    step: failedStep.name,
  }];
}

async function writeReleaseReport(input: {
  artifactDir: string;
  artifacts: Record<string, unknown>;
  commands: CommandSummary[];
  deferred: string[];
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  promoted: string[];
  reportPath: string;
  startedAt: Date;
  startedAtMs: number;
  steps: StepSummary[];
}): Promise<ReleaseGateResult> {
  await mkdir(resolve(input.reportPath, ".."), { recursive: true });
  await mkdir(input.artifactDir, { recursive: true });
  const payload = {
    artifacts: {
      ...input.artifacts,
      focusedReports: Object.fromEntries(RELEASE_FOCUSED_GATES.map((gate) => [gate.script, gate.reportPath])),
    },
    code: input.ok ? "TN_VERIFY_RELEASE_OK" : "TN_VERIFY_RELEASE_FAILED",
    commands: input.commands,
    deferred: input.deferred,
    diagnostics: input.diagnostics,
    durationMs: Date.now() - input.startedAtMs,
    generatedBy: "@threenative/verify-tools/release",
    ok: input.ok,
    promoted: input.promoted,
    reportPath: input.reportPath,
    schema: "threenative.verify.release",
    startedAt: input.startedAt.toISOString(),
    status: input.ok ? "pass" : "fail",
    steps: input.steps,
    version: "0.1.0",
  };
  await writeFile(input.reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    diagnostics: input.diagnostics,
    ok: input.ok,
    reportPath: input.reportPath,
    steps: input.steps,
  };
}

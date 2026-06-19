import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { FOCUSED_GATES } from "./cli/run.js";
import { runCommand, summarize, type CommandResult, type StepSummary, type VerificationDiagnostic } from "./runner.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

interface FocusedGate {
  name: string;
  reportPath: string;
  script: string;
}

type ReleaseStepCategory = "artifact" | "conformance" | "focused-gate" | "setup" | "test" | "visual-native";

const DEFAULT_TIMING_BUDGETS_MS: Record<ReleaseStepCategory, number> = {
  artifact: 5_000,
  conformance: 900_000,
  "focused-gate": 600_000,
  setup: 120_000,
  test: 120_000,
  "visual-native": 1_200_000,
};

const CONFORMANCE_ARTIFACT_CONFLICT_GATES = new Set(["verify:v9:physics-character"]);

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
  timingBudgetsMs?: Partial<Record<ReleaseStepCategory, number>>;
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
  const timingBudgetsMs = { ...DEFAULT_TIMING_BUDGETS_MS, ...options.timingBudgetsMs };
  const steps: StepSummary[] = [];
  const commands: CommandSummary[] = [];
  const timingDiagnostics: VerificationDiagnostic[] = [];
  const artifacts: Record<string, unknown> = {
    conformanceReportPath: resolve(root, "packages/ir/artifacts/conformance/verification-report.json"),
    reportPath,
    sampleScenesReportPath: sampleScenesTargets.reportPath,
    visualMatrixReportPath: visualMatrixTargets.reportPath,
  };
  const promoted: string[] = [];
  const deferred: string[] = [];

  async function step(
    name: string,
    command: string,
    args: readonly string[],
    commandOptions: { category: ReleaseStepCategory; cwd?: string; timeoutMs?: number } = { category: "test" },
  ) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    const budgetMs = timingBudgetsMs[commandOptions.category];
    const summary = {
      ...summarize(result),
      budgetMs,
      budgetStatus: result.durationMs > budgetMs ? "over-budget" as const : "within-budget" as const,
      category: commandOptions.category,
      name,
    };
    steps.push(summary);
    commands.push({ ...summary, args, command });
    if (summary.budgetStatus === "over-budget") {
      timingDiagnostics.push(timingBudgetDiagnostic(summary));
    }
    return result.exitCode === 0;
  }

  const fail = async (diagnostics = stepDiagnostics(steps)) => writeReleaseReport({
    artifactDir,
    artifacts,
    commands,
    deferred,
    diagnostics: [...timingDiagnostics, ...diagnostics],
    ok: false,
    promoted,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
  });

  if (!(await step("check v9 quality gates", process.execPath, [resolve(root, "scripts/check-v9-quality-gates.mjs"), "--json"], { category: "test", timeoutMs: 120000 }))) {
    return fail();
  }

  for (const [name, command, args] of [
    ["build release packages", "pnpm", [
      "-r",
      "--filter", "@threenative/ir",
      "--filter", "@threenative/sdk",
      "--filter", "@threenative/ui",
      "--filter", "@threenative/r3f",
      "--filter", "@threenative/compiler",
      "--filter", "@threenative/runtime-web-three",
      "--filter", "@threenative/cli",
      "build",
    ]],
    ["test ir package", "pnpm", ["--filter", "@threenative/ir", "test"]],
  ] as const) {
    if (!(await step(name, command, args, { category: "setup", timeoutMs: 120000 }))) {
      return fail();
    }
  }

  for (const gate of focusedGates) {
    if (!CONFORMANCE_ARTIFACT_CONFLICT_GATES.has(gate.script)) {
      continue;
    }
    const ok = await runFocusedGateStep(gate);
    if (!ok) {
      return fail();
    }
  }

  const parallelFocusedGates = focusedGates.filter((gate) => !CONFORMANCE_ARTIFACT_CONFLICT_GATES.has(gate.script));
  const proofResults = await Promise.all([
    ...parallelFocusedGates.map((gate) => runFocusedGateStep(gate)),
    step("verify conformance gate", process.execPath, [resolve(root, "tools/verify/dist/cli/conformance.js"), "--json"], { category: "conformance", timeoutMs: 900000 }),
    step("verify v9 sample scenes", process.execPath, [resolve(root, "scripts/verify-v9-sample-scenes.mjs"), "--json"], { category: "visual-native", timeoutMs: 600000 }),
    step("verify v9 visual matrix", process.execPath, [resolve(root, "scripts/verify-v9-visual-matrix.mjs"), "--json"], { category: "visual-native", timeoutMs: 1200000 }),
  ]);
  if (proofResults.some((ok) => !ok)) {
    return fail();
  }

  async function runFocusedGateStep(gate: FocusedGate): Promise<boolean> {
    const focusedCommand = focusedGateCommand(root, gate);
    if (!(await step(gate.name, focusedCommand.command, focusedCommand.args, { category: "focused-gate", timeoutMs: 600000 }))) {
      artifacts.failedFocusedReportPath = resolve(root, gate.reportPath);
      return false;
    }
    const artifactCheck = await checkFocusedArtifact(root, gate, timingBudgetsMs.artifact);
    if (artifactCheck.step.budgetStatus === "over-budget") {
      timingDiagnostics.push(timingBudgetDiagnostic(artifactCheck.step));
    }
    steps.push(artifactCheck.step);
    commands.push(artifactCheck.command);
    if (artifactCheck.step.exitCode !== 0) {
      artifacts.failedFocusedReportPath = resolve(root, gate.reportPath);
      timingDiagnostics.push(...artifactCheck.diagnostics);
      return false;
    }
    artifacts[gate.script] = resolve(root, gate.reportPath);
    return true;
  }

  const releaseArtifactCheck = await checkReleaseArtifacts(root, artifacts, focusedGates, timingBudgetsMs.artifact);
  if (releaseArtifactCheck.step.budgetStatus === "over-budget") {
    timingDiagnostics.push(timingBudgetDiagnostic(releaseArtifactCheck.step));
  }
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
    diagnostics: [...timingDiagnostics, ...releaseArtifactCheck.diagnostics],
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

function focusedGateCommand(root: string, gate: FocusedGate): { args: readonly string[]; command: string } {
  if (FOCUSED_GATES[gate.script]) {
    return {
      args: [resolve(root, "tools/verify/dist/cli/run.js"), gate.script, "--no-setup"],
      command: process.execPath,
    };
  }
  return { args: [gate.script], command: "pnpm" };
}

async function checkFocusedArtifact(root: string, gate: FocusedGate, budgetMs: number): Promise<{
  command: CommandSummary;
  diagnostics: VerificationDiagnostic[];
  step: StepSummary;
}> {
  const path = resolve(root, gate.reportPath);
  const startedAtMs = Date.now();
  try {
    await access(path);
    const durationMs = Date.now() - startedAtMs;
    const summary = {
      budgetMs,
      budgetStatus: durationMs > budgetMs ? "over-budget" as const : "within-budget" as const,
      category: "artifact",
      durationMs,
      exitCode: 0,
      name: `check focused artifact ${gate.script}`,
      stderr: "",
      stdout: gate.reportPath,
    };
    return { command: { ...summary, command: "access" }, diagnostics: [], step: summary };
  } catch {
    const durationMs = Date.now() - startedAtMs;
    const summary = {
      budgetMs,
      budgetStatus: durationMs > budgetMs ? "over-budget" as const : "within-budget" as const,
      category: "artifact",
      durationMs,
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

async function checkReleaseArtifacts(root: string, artifacts: Record<string, unknown>, focusedGates: readonly FocusedGate[], budgetMs: number): Promise<{
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
  const durationMs = Date.now() - startedAtMs;
  const summary = {
    budgetMs,
    budgetStatus: durationMs > budgetMs ? "over-budget" as const : "within-budget" as const,
    category: "artifact",
    durationMs,
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

function timingBudgetDiagnostic(step: StepSummary): VerificationDiagnostic {
  return {
    code: "TN_VERIFY_RELEASE_TIMING_BUDGET_WARNING",
    message: `Release step '${step.name}' exceeded the ${step.category ?? "uncategorized"} timing budget (${step.durationMs}ms > ${step.budgetMs ?? 0}ms).`,
    path: `steps.${step.name}`,
    severity: "warning",
    step: step.name,
  };
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
    timing: summarizeTiming(input.steps, input.diagnostics),
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

function summarizeTiming(steps: readonly StepSummary[], diagnostics: readonly VerificationDiagnostic[]) {
  const categories: Record<string, { durationMs: number; stepCount: number }> = {};
  for (const step of steps) {
    const category = step.category ?? "uncategorized";
    const summary = categories[category] ?? { durationMs: 0, stepCount: 0 };
    summary.durationMs += step.durationMs;
    summary.stepCount += 1;
    categories[category] = summary;
  }
  return {
    budgetWarnings: diagnostics.filter((diagnostic) => diagnostic.code === "TN_VERIFY_RELEASE_TIMING_BUDGET_WARNING"),
    categories,
  };
}

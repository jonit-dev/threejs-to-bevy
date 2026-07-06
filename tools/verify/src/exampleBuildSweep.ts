import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveArtifactTargets } from "./artifacts.js";
import { GENERATED_GAME_BUILD_ONLY_PROJECTS } from "./gameProductionGate.js";
import { runStep, type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface IExampleBuildSweepResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export async function runExampleBuildSweep(options: {
  projects?: readonly string[];
  reportPath?: string;
  root?: string;
  timeoutMs?: number;
  usePackageScript?: boolean;
} = {}): Promise<IExampleBuildSweepResult> {
  const root = resolve(options.root ?? process.cwd());
  const projects = [...(options.projects ?? GENERATED_GAME_BUILD_ONLY_PROJECTS)];
  const targets = resolveArtifactTargets({ gate: "example-build-sweep", owner: { kind: "aggregate", name: "example-build-sweep" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const diagnostics: VerificationDiagnostic[] = [];
  const steps: StepSummary[] = [];

  for (const project of projects) {
    const command = options.usePackageScript === true ? "pnpm" : process.execPath;
    const args = options.usePackageScript === true
      ? ["--dir", project, "run", "build"]
      : ["packages/cli/dist/index.js", "build", "--project", project, "--json"];
    const step = await runStep(`build-only example: ${project}`, command, args, {
      cwd: root,
      timeoutMs: options.timeoutMs ?? 120_000,
    });
    steps.push(step.summary);
    if (!step.ok) {
      diagnostics.push({
        code: "TN_VERIFY_EXAMPLE_BUILD_ONLY_FAILED",
        message: `${project}: build-only example failed '${step.summary.name}' with exit code ${step.summary.exitCode}.`,
        path: project,
        severity: "error",
        step: step.summary.name,
        suggestedFix: step.summary.stderr.trim() || step.summary.stdout.trim() || "Run the example build locally and fix the durable source.",
      });
    }
  }

  const ok = diagnostics.length === 0;
  const payload = {
    artifacts: { projectPaths: projects, reportPath },
    code: ok ? "TN_VERIFY_EXAMPLE_BUILD_SWEEP_OK" : "TN_VERIFY_EXAMPLE_BUILD_SWEEP_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools exampleBuildSweep",
    ok,
    schema: "threenative.verify.example-build-sweep",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    summary: {
      failedProjectCount: diagnostics.length,
      projectCount: projects.length,
      projectPaths: projects,
    },
    version: "0.1.0",
  };
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath, steps };
}

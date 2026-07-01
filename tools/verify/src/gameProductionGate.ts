import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createGameQualityReport, validateGameQualityReport } from "@threenative/authoring";

import { resolveArtifactTargets } from "./artifacts.js";
import { type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface IGameProductionGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

interface IGameProductionGateOptions {
  projectPath?: string;
  reportPath?: string;
  root?: string;
}

export async function runGameProductionGate(options: IGameProductionGateOptions = {}): Promise<IGameProductionGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const projectPath = resolve(root, options.projectPath ?? "tools/verify/fixtures/game-production");
  const targets = resolveArtifactTargets({ gate: "game-production", owner: { kind: "aggregate", name: "game-production" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const startedAtMs = Date.now();
  const report = await createGameQualityReport({ mode: "release", projectPath });
  const reportDiagnostics = validateGameQualityReport(report);
  const diagnostics: VerificationDiagnostic[] = [
    ...reportDiagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
      severity: "error" as const,
      suggestedFix: diagnostic.suggestedFix ?? diagnostic.suggestion,
    })),
    ...report.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
      severity: diagnostic.severity === "error" ? "error" as const : "warning" as const,
      suggestedFix: diagnostic.suggestedFix ?? diagnostic.suggestion,
    })),
  ];
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const step: StepSummary = {
    durationMs: Date.now() - startedAtMs,
    exitCode: ok ? 0 : 1,
    name: "game production report validation",
    stderr: "",
    stdout: JSON.stringify({ blockers: report.blockers.length, projectPath, reportPath }),
  };
  const payload = {
    artifacts: {
      gameQualityReportPath: reportPath,
      projectPath,
    },
    code: ok ? "TN_VERIFY_GAME_PRODUCTION_OK" : "TN_VERIFY_GAME_PRODUCTION_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools gameProductionGate",
    ok,
    report,
    schema: "threenative.verify.game-production",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps: [step],
    version: "0.1.0",
  };

  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    diagnostics,
    ok,
    reportPath,
    steps: [step],
  };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";
import type { StepSummary } from "./runner.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export interface ReleaseGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export async function runReleaseGate(options: { repoRoot?: string } = {}): Promise<ReleaseGateResult> {
  const root = options.repoRoot ?? repoRoot;
  const reportPath = resolve(root, "artifacts/release/verification-report.json");
  // @ts-expect-error legacy mjs gate consumed during typed-tools migration
  const verifyModule = (await import("../../../scripts/verify-v9.mjs")) as {
    verifyV9: (options?: Record<string, unknown>) => Promise<{
      diagnostics?: Array<{ code?: string; message?: string; path?: string }>;
      ok: boolean;
      promoted?: string[];
      steps: StepSummary[];
    }>;
  };
  const legacyResult = await verifyModule.verifyV9({ repoRoot: root });
  const steps = legacyResult.steps as StepSummary[];
  const diagnostics: VerificationDiagnostic[] = (legacyResult.diagnostics ?? []).map((diagnostic: {
    code?: string;
    message?: string;
    path?: string;
  }) => ({
    code: String(diagnostic.code ?? "TN_VERIFY_RELEASE_FAILED").replaceAll("TN_VERIFY_V9", "TN_VERIFY_RELEASE"),
    message: String(diagnostic.message ?? "Release gate failed."),
    path: typeof diagnostic.path === "string" ? diagnostic.path : undefined,
    severity: "error" as const,
  }));
  const ok = legacyResult.ok === true;

  await writeReleaseReport(root, reportPath, {
    artifacts: {
      conformanceReportPath: resolve(root, "artifacts/conformance/verification-report.json"),
      legacyReportPath: resolve(root, "artifacts/v9/verification-report.json"),
      reportPath,
    },
    diagnostics,
    ok,
    promoted: legacyResult.promoted ?? [],
    steps,
  });

  return { diagnostics, ok, reportPath, steps };
}

async function writeReleaseReport(
  root: string,
  reportPath: string,
  input: {
    artifacts: Record<string, string>;
    diagnostics: VerificationDiagnostic[];
    ok: boolean;
    promoted: string[];
    steps: StepSummary[];
  },
): Promise<void> {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const payload = {
    artifacts: input.artifacts,
    code: input.ok ? "TN_VERIFY_RELEASE_OK" : "TN_VERIFY_RELEASE_FAILED",
    diagnostics: input.diagnostics,
    generatedBy: "@threenative/verify-tools/release",
    ok: input.ok,
    promoted: input.promoted,
    schema: "threenative.verify.release",
    startedAt: new Date().toISOString(),
    status: input.ok ? "pass" : "fail",
    steps: input.steps,
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  try {
    const legacyPath = resolve(root, "artifacts/v9/verification-report.json");
    const legacyReport = JSON.parse(await readFile(legacyPath, "utf8")) as Record<string, unknown>;
    legacyReport.canonicalReleaseReportPath = reportPath;
    legacyReport.generatedBy = "@threenative/verify-tools/release";
    await writeFile(legacyPath, `${JSON.stringify(legacyReport, null, 2)}\n`, "utf8");
  } catch {
    // Legacy report is written by verify-v9 when the gate completes.
  }
}

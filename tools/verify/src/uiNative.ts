import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { VerificationDiagnostic } from "./runner.js";

export interface UiNativeGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export async function validateUiNativeReport(report: unknown, accessFile: (path: string) => Promise<void> = access): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  if (!isRecord(report) || report.ok !== true || !isRecord(report.artifacts)) {
    return [diagnostic("TN_VERIFY_UI_NATIVE_REPORT_INVALID", "UI native report must be a passing artifact report.", "verification-report.json")];
  }
  for (const key of ["webScreenshot", "bevyScreenshot", "contactSheet", "webReport", "nativeReport"]) {
    const path = report.artifacts[key];
    if (typeof path !== "string") {
      diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_ARTIFACT_MISSING", `UI native report must declare artifacts.${key}.`, `artifacts/${key}`));
      continue;
    }
    try {
      await accessFile(path);
    } catch {
      diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_ARTIFACT_MISSING", `UI native artifact does not exist: ${path}.`, path));
    }
  }
  const scope = isRecord(report.capabilityScope) ? report.capabilityScope : {};
  if (scope.ime !== "platform-diagnostic" || scope.virtualKeyboard !== "platform-diagnostic") {
    diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_CAPABILITY_SCOPE_INVALID", "IME and virtual keyboard claims must remain target-scoped diagnostics.", "capabilityScope"));
  }
  return diagnostics;
}

export async function runUiNativeGate(options: { reportPath?: string; root?: string } = {}): Promise<UiNativeGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/feature-parity-ui-native/verification-report.json");
  let report: unknown;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  } catch {
    report = undefined;
  }
  const diagnostics = await validateUiNativeReport(report);
  return { diagnostics, ok: diagnostics.length === 0, reportPath };
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return { code, message, path, severity: "error", suggestedFix: "Regenerate the feature-parity UI native evidence and inspect the referenced artifact." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runUiNativeGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

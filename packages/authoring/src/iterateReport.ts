export const ITERATE_REPORT_SCHEMA = "threenative.iterate-report";
export const ITERATE_REPORT_VERSION = "0.2.0";

export type IterateStepStatus = "pass" | "fail" | "skipped";
export type IterateVerdict = "pass" | "fail";
export type IterateGameplayVerdict = IterateVerdict | "skipped";

export interface IIterateDiagnostic {
  code: string;
  message: string;
  path?: string;
  severity?: "error" | "warning" | "info";
  suggestion?: string;
  [key: string]: unknown;
}

export interface IIterateStepReport {
  artifacts?: Record<string, unknown>;
  diagnostics: IIterateDiagnostic[];
  durationMs: number;
  id: "validate" | "build" | "screenshot" | "playtest";
  output?: unknown;
  status: IterateStepStatus;
}

export interface IIterateReport {
  acceptanceCoverage?: {
    missing: string[];
    observed: string[];
    required: string[];
    unrelated: string[];
  };
  activeRenderProfile?: string;
  artifacts: {
    directory: string;
    keptDirectory?: string;
    report: string;
    screenshot?: string;
  };
  code: "TN_ITERATE_OK" | "TN_ITERATE_FAILED";
  diagnostics: IIterateDiagnostic[];
  durationMs: number;
  ok: boolean;
  projectPath: string;
  promptCoverage?: "fail" | "pass" | "skipped";
  schema: typeof ITERATE_REPORT_SCHEMA;
  steps: IIterateStepReport[];
  verdicts: {
    gameplay: IterateGameplayVerdict;
    visual: IterateVerdict;
  };
  version: typeof ITERATE_REPORT_VERSION;
}

export function validateIterateReport(report: unknown): { diagnostics: IIterateDiagnostic[]; ok: boolean } {
  const diagnostics: IIterateDiagnostic[] = [];
  if (!isRecord(report)) {
    return {
      diagnostics: [{ code: "TN_ITERATE_REPORT_INVALID", message: "Iterate report must be an object.", path: "/", severity: "error" }],
      ok: false,
    };
  }
  if (report.schema !== ITERATE_REPORT_SCHEMA) {
    diagnostics.push({
      code: "TN_ITERATE_REPORT_SCHEMA_INVALID",
      message: `Iterate report schema must be '${ITERATE_REPORT_SCHEMA}'.`,
      path: "/schema",
      severity: "error",
    });
  }
  if (report.version !== ITERATE_REPORT_VERSION) {
    diagnostics.push({
      code: "TN_ITERATE_REPORT_VERSION_INVALID",
      message: `Iterate report version must be '${ITERATE_REPORT_VERSION}'.`,
      path: "/version",
      severity: "error",
    });
  }
  if (!Array.isArray(report.steps) || report.steps.length === 0) {
    diagnostics.push({
      code: "TN_ITERATE_REPORT_STEPS_INVALID",
      message: "Iterate report must include ordered steps.",
      path: "/steps",
      severity: "error",
    });
  }
  if (report.activeRenderProfile !== undefined && (typeof report.activeRenderProfile !== "string" || report.activeRenderProfile.trim() === "")) {
    diagnostics.push({
      code: "TN_ITERATE_REPORT_RENDER_PROFILE_INVALID",
      message: "Iterate report activeRenderProfile must be a non-empty string when present.",
      path: "/activeRenderProfile",
      severity: "error",
    });
  }
  if (report.acceptanceCoverage !== undefined && (!isRecord(report.acceptanceCoverage)
    || !stringArray(report.acceptanceCoverage.required)
    || !stringArray(report.acceptanceCoverage.observed)
    || !stringArray(report.acceptanceCoverage.missing)
    || !stringArray(report.acceptanceCoverage.unrelated))) {
    diagnostics.push({ code: "TN_ITERATE_REPORT_ACCEPTANCE_COVERAGE_INVALID", message: "Iterate acceptanceCoverage must contain required/observed/missing/unrelated string arrays.", path: "/acceptanceCoverage", severity: "error" });
  }
  if (report.promptCoverage !== undefined && report.promptCoverage !== "pass" && report.promptCoverage !== "fail" && report.promptCoverage !== "skipped") {
    diagnostics.push({ code: "TN_ITERATE_REPORT_PROMPT_COVERAGE_INVALID", message: "Iterate promptCoverage must be pass, fail, or skipped.", path: "/promptCoverage", severity: "error" });
  }
  if (!isRecord(report.verdicts)
    || (report.verdicts.visual !== "pass" && report.verdicts.visual !== "fail")
    || (report.verdicts.gameplay !== "pass" && report.verdicts.gameplay !== "fail" && report.verdicts.gameplay !== "skipped")) {
    diagnostics.push({
      code: "TN_ITERATE_REPORT_VERDICTS_INVALID",
      message: "Iterate report must include visual and gameplay verdicts.",
      path: "/verdicts",
      severity: "error",
    });
  }
  return { diagnostics, ok: diagnostics.length === 0 };
}

function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

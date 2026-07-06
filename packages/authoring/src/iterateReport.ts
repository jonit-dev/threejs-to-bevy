export const ITERATE_REPORT_SCHEMA = "threenative.iterate-report";
export const ITERATE_REPORT_VERSION = "0.1.0";

export type IterateStepStatus = "pass" | "fail" | "skipped";

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
  schema: typeof ITERATE_REPORT_SCHEMA;
  steps: IIterateStepReport[];
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
  return { diagnostics, ok: diagnostics.length === 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type DiagnosticSeverity = "error" | "warning";

export interface ICompilerDiagnostic {
  code: string;
  file?: string;
  limit?: number | readonly string[];
  message: string;
  path: string;
  severity: DiagnosticSeverity;
  suggestion?: string;
  target?: string;
  value?: unknown;
}

export interface IValidationReport {
  diagnostics: ICompilerDiagnostic[];
  ok: boolean;
}

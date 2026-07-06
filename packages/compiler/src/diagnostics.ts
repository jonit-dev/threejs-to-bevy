export type DiagnosticSeverity = "error" | "warning";

export interface ICompilerDiagnostic {
  code: string;
  file?: string;
  fix?: {
    allowed?: readonly string[];
    cookbook?: string;
    docs?: string;
    instruction: string;
    snippet?: string;
  };
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

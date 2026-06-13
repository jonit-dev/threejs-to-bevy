export interface IRuntimeDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
}

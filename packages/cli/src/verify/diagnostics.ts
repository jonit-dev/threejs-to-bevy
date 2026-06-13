import type { IVerificationDiagnostic } from "./report.js";

export function likelyDiagnostic(
  code: string,
  message: string,
  likelyArea: IVerificationDiagnostic["likelyArea"],
  severity: IVerificationDiagnostic["severity"] = "error",
): IVerificationDiagnostic {
  return {
    code,
    likelyArea,
    message,
    severity,
  };
}

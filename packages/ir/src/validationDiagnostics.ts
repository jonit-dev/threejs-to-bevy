import type { IIrDiagnostic } from "./validate.js";

export function validateUnsupportedFields(
  diagnostics: IIrDiagnostic[],
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  buildDiagnostic: (field: string) => IIrDiagnostic,
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      diagnostics.push(buildDiagnostic(field));
    }
  }
}

export type AuthoringDiagnosticSeverity = "error" | "warning" | "info";

export interface IAuthoringDiagnosticRelated {
  file?: string;
  path?: string;
  message: string;
}

export interface IAuthoringDiagnostic {
  code: string;
  severity: AuthoringDiagnosticSeverity;
  message: string;
  file?: string;
  path?: string;
  value?: unknown;
  suggestion?: string;
  related?: IAuthoringDiagnosticRelated[];
}

export interface IAuthoringDiagnosticInput {
  code: string;
  message: string;
  severity?: AuthoringDiagnosticSeverity;
  file?: string;
  path?: string;
  value?: unknown;
  suggestion?: string;
  related?: IAuthoringDiagnosticRelated[];
}

export function authoringDiagnostic(input: IAuthoringDiagnosticInput): IAuthoringDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? "error",
    message: input.message,
    ...(input.file === undefined ? {} : { file: input.file }),
    ...(input.path === undefined ? {} : { path: input.path }),
    ...(input.value === undefined ? {} : { value: input.value }),
    ...(input.suggestion === undefined ? {} : { suggestion: input.suggestion }),
    ...(input.related === undefined || input.related.length === 0 ? {} : { related: sortRelated(input.related) }),
  };
}

export function unsupportedOperationDiagnostic(operation: string, suggestion?: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_UNSUPPORTED_OPERATION",
    message: `Scene authoring operation '${operation}' is not supported for the current source document shape.`,
    suggestion: suggestion ?? "Run scene validation and use a supported structured authoring document.",
  });
}

export function sortAuthoringDiagnostics(diagnostics: readonly IAuthoringDiagnostic[]): IAuthoringDiagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      (left.file ?? "").localeCompare(right.file ?? "") ||
      (left.path ?? "").localeCompare(right.path ?? "") ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

export function hasAuthoringErrors(diagnostics: readonly IAuthoringDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function sortRelated(related: readonly IAuthoringDiagnosticRelated[]): IAuthoringDiagnosticRelated[] {
  return [...related].sort(
    (left, right) =>
      (left.file ?? "").localeCompare(right.file ?? "") ||
      (left.path ?? "").localeCompare(right.path ?? "") ||
      left.message.localeCompare(right.message),
  );
}

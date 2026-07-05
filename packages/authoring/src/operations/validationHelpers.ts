import { isGeneratedArtifactPath } from "../documents.js";
import { authoringDiagnostic, type IAuthoringDiagnostic } from "../diagnostics.js";
import { readString } from "../schemas.js";

export function typeDiagnostic(file: string, path: string, message: string, value: unknown): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_SHAPE_INVALID",
    file,
    message,
    path,
    value,
  });
}

export function generatedPathDiagnostic(file: string, path: string, value: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
    file,
    message: "Generated bundle artifacts cannot be used as authoring source paths.",
    path,
    value,
    suggestion: "Reference durable source files instead of dist/game.bundle or scripts.bundle.js.",
  });
}

export function validateGeneratedPathString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  const sourcePath = readString(value);
  if (value !== undefined && sourcePath === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  } else if (sourcePath !== undefined && isGeneratedArtifactPath(sourcePath)) {
    diagnostics.push(generatedPathDiagnostic(file, path, sourcePath));
  }
}

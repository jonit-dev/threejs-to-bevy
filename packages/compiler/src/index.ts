export { captureEntry, isSceneRoot, type ICapturedScene } from "./capture.js";
export { loadProjectConfig, type IProjectConfig } from "./config.js";
export { CompilerError } from "./errors.js";
export { emitBundle } from "./emit/bundle.js";
export { validateBundle } from "./validate/index.js";
export type { ICompilerDiagnostic, IValidationReport } from "./diagnostics.js";
export { normalizeAuthoringGraph } from "./authoring/normalize.js";
export type {
  AuthoringDeclarationKind,
  IAuthoringDeclarationNode,
  IAuthoringGraph,
  IAuthoringModuleNode,
  IAuthoringProvenance,
  IAuthoringReference,
  IAuthoringSourcePointer,
} from "./authoring/graph.js";

export async function buildProject(projectPath: string): Promise<{ bundlePath: string }> {
  const { loadProjectConfig } = await import("./config.js");
  const { captureEntry } = await import("./capture.js");
  const { emitBundle } = await import("./emit/bundle.js");
  const config = await loadProjectConfig(projectPath);
  const captured = await captureEntry(config);
  const authoringError = captured.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (authoringError !== undefined) {
    const { CompilerError } = await import("./errors.js");
    throw new CompilerError(authoringError.code, authoringError.message, authoringError);
  }
  const bundlePath = await emitBundle(config, captured.root, { authoringGraph: captured.graph });
  const { validateBundle } = await import("./validate/index.js");
  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    const { CompilerError } = await import("./errors.js");
    throw new CompilerError("TN_COMPILER_EMITTED_INVALID_BUNDLE", report.diagnostics[0]?.message ?? "Emitted bundle is invalid.");
  }
  return { bundlePath };
}

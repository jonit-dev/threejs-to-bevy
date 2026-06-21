export { captureEntry, isSceneRoot, type ICapturedScene } from "./capture.js";
export { loadProjectConfig, type IProjectConfig } from "./config.js";
export { CompilerError } from "./errors.js";
export { emitBundle } from "./emit/bundle.js";
export { validateBundle } from "./validate/index.js";
export { AUTHORING_PROVENANCE_FILE, authoringProvenanceDocument, buildAuthoringProvenanceDocument } from "./authoring/provenance.js";
export type { ICompilerDiagnostic, IValidationReport } from "./diagnostics.js";
export type { IAuthoringEmittedDocument, IAuthoringProvenanceDocument, IBuildAuthoringProvenanceOptions } from "./authoring/provenance.js";
export { normalizeAuthoringGraph } from "./authoring/normalize.js";
export type {
  AuthoringDeclarationKind,
  AuthoringEmittedArtifactKind,
  AuthoringOwnershipClassification,
  IAuthoringDeclarationNode,
  IAuthoringEmittedPointer,
  IAuthoringGraph,
  IAuthoringModuleNode,
  IAuthoringOwnershipEntry,
  IAuthoringProvenance,
  IAuthoringReference,
  IAuthoringStructuredSourcePointer,
  IAuthoringSourcePointer,
} from "./authoring/graph.js";

/**
 * Builds a ThreeNative project from its `threenative.config.json`.
 *
 * The compiler captures the configured TypeScript or structured source entry,
 * emits a portable bundle, writes authoring provenance when source documents
 * are available, and validates the emitted bundle before returning. Invalid
 * authoring input or emitted IR throws `CompilerError` with a stable diagnostic
 * code and source/path metadata where available.
 */
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
  const { loadAuthoringProject } = await import("@threenative/authoring");
  const authoringProject = await loadAuthoringProject({ projectPath });
  const bundlePath = await emitBundle(config, captured.root, {
    authoringDocuments: authoringProject.documents,
    authoringGraph: captured.graph,
  });
  const { validateBundle } = await import("./validate/index.js");
  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    const { CompilerError } = await import("./errors.js");
    throw new CompilerError("TN_COMPILER_EMITTED_INVALID_BUNDLE", report.diagnostics[0]?.message ?? "Emitted bundle is invalid.");
  }
  return { bundlePath };
}

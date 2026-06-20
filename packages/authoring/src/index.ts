export type {
  AuthoringDiagnosticSeverity,
  IAuthoringDiagnostic,
  IAuthoringDiagnosticInput,
  IAuthoringDiagnosticRelated,
} from "./diagnostics.js";
export { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, unsupportedOperationDiagnostic } from "./diagnostics.js";
export type { AuthoringDocumentKind, IAuthoringDocument, IReadAuthoringDocumentResult } from "./documents.js";
export {
  classifyAuthoringDocument,
  isGeneratedArtifactPath,
  normalizeRelativePath,
  readAuthoringJsonDocument,
  writeAuthoringJsonDocument,
} from "./documents.js";
export { formatAuthoringDocument, stableAuthoringJson } from "./format.js";
export type { IAuthoringProject, ILoadAuthoringProjectOptions } from "./project.js";
export { discoverAuthoringFiles, loadAuthoringProject } from "./project.js";
export type { IAuthoringOperationContext, IAuthoringOperationResult } from "./operations.js";
export { authoringOperationResult, loadProjectForOperation, writeChangedProjectDocuments } from "./operations.js";

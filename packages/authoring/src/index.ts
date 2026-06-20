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
export type {
  IScriptReference,
  ISceneDocument,
  ISceneEntity,
  IScenePrefab,
  ISceneResource,
  ISceneSystem,
  ISceneTransform,
  ISceneUi,
  ISceneUiBinding,
  ISceneUiNode,
} from "./schemas.js";
export { logicalIdPattern, sceneDocumentSchema } from "./schemas.js";
export type { IAuthoringProject, ILoadAuthoringProjectOptions } from "./project.js";
export { discoverAuthoringFiles, loadAuthoringProject } from "./project.js";
export type {
  IAuthoringOperationContext,
  IAuthoringOperationResult,
  IAddEntityOptions,
  IAttachScriptOptions,
  IBindUiOptions,
  IInspectSceneResult,
  ISceneInspection,
  ISetCameraOptions,
  ISetTransformOptions,
  IValidateSceneOptions,
} from "./operations.js";
export {
  addEntity,
  attachScript,
  authoringOperationResult,
  bindUi,
  inspectScene,
  loadProjectForOperation,
  setCamera,
  setTransform,
  validateScene,
  writeChangedProjectDocuments,
} from "./operations.js";

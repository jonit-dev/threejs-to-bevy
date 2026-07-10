import { resolveScriptAlias, formatDeprecationDiagnostic } from "./legacyAliases.js";

export { verifyAdvancedUiArtifacts, type IAdvancedUiArtifactReport } from "./advancedUi.js";
export { runAgentIoBudgetGate, type AgentIoBudgetCommand, type AgentIoBudgetMeasurement, type AgentIoBudgetResult } from "./agentIoBudget.js";
export { API_CARD_BUDGET_BYTES, renderScriptApiCard, renderScriptApiCardFromSource, scriptContextMembers, validateApiCard, type ApiCardValidationResult } from "./apiCard.js";
export { checkDocs, formatDocsReport } from "./docs.js";
export { loadRejectedBoundaryCatalog, verifyBoundaryDiagnosticsCatalog, REQUIRED_BOUNDARY_FIXTURES } from "./boundaryDiagnostics.js";
export { editorAiChatArtifactPaths, runEditorAiChatGate, type IEditorAiChatArtifacts, type IEditorAiChatReport } from "./editorAiChat.js";
export { runEditorRequiredOperationsSmoke, type IEditorRequiredOperationsReport } from "./editorRequiredOperations.js";
export { runEfficientScaleGate, type EfficientScaleGateOptions, type EfficientScaleGateResult } from "./efficientScaleGate.js";
export { runVisualPolishGate, validateVisualPolishEvidence, type VisualPolishGateResult } from "./visualPolish.js";
export { runShadowCascadeStabilityGate, validateShadowCascadeEvidence, type ShadowCascadeStabilityGateResult } from "./shadowCascadeStability.js";
export { runUiNativeGate, validateUiNativeReport, type UiNativeGateResult } from "./uiNative.js";
export { runPhysicsNativeGate, validatePhysicsNativeEvidence, type PhysicsNativeGateResult } from "./physicsNative.js";
export { runAudioPlatformGate, validateAudioPlatformEvidence, type AudioPlatformGateResult } from "./audioPlatform.js";
export { resolveArtifactTargets, toRepoRelative, type ArtifactOwner, type ArtifactTargets } from "./artifacts.js";
export { loadFixtureCatalog, resolveFixtureId, listCurrentFixtures } from "./conformance.js";
export { runLegacyScriptAlias, resolveScriptAlias, formatDeprecationDiagnostic, listDeprecatedScriptAliases, isRegisteredGate, SCRIPT_ALIASES } from "./legacyAliases.js";
export { runGameProductionGate, type IGameProductionGateResult } from "./gameProductionGate.js";
export { runGameplayParityGate, type GameplayParityReport } from "./gameplayParity.js";
export { compareAssetProbe, compareMaterialProbe, compareTextureProbe, type GameplayParityProbeObservations } from "./gameplayParityProbes.js";
export { runExampleBuildSweep, type IExampleBuildSweepResult } from "./exampleBuildSweep.js";
export {
  PERFORMANCE_PROOF_SCHEMA,
  PERFORMANCE_PROOF_VERSION,
  isPerformanceProofSidecarPassing,
  validatePerformanceProofSidecar,
  type FrameTimePercentiles,
  type PerformanceMetric,
  type PerformanceMetricMeasured,
  type PerformanceMetricName,
  type PerformanceMetricUnsupported,
  type PerformanceProofBudgets,
  type PerformanceProofMetrics,
  type PerformanceProofSidecar,
  type TextureVariantMeasurement,
} from "./performanceProof.js";
export {
  collectPortableShaderMaterialReport,
  runPortableShaderMaterialGate,
  validatePortableShaderArtifactSet,
  validatePortableShaderSampleRegions,
  type PortableShaderMaterialGateResult,
  type PortableShaderMaterialObservation,
  type PortableShaderMaterialReport,
  type PortableShaderSampleDocument,
  type PortableShaderSampleRegion,
} from "./portableShaderMaterial.js";
export { runReleaseGate } from "./release.js";
export { analyzeRenderLookMetrics, runRenderLookGate, type RenderLookGateResult, type RenderLookMetricInput, type RenderLookMetricSample } from "./renderLook.js";
export { runPhotorealRenderingGate, type PhotorealRenderingGateResult, type PhotorealRenderingMetrics } from "./renderingPhotoreal.js";
export { checkV9QualityGates, V9_FOCUSED_SCRIPT_NAMES, V9_SAMPLE_SCENES } from "./v9QualityGates.js";
export {
  runCommand,
  runStep,
  stepFailureDiagnostic,
  summarize,
  type CommandOptions,
  type CommandResult,
  type StepSummary,
  type VerificationDiagnostic,
  type VerificationReport,
} from "./runner.js";
export { runPackageTests } from "./runTests.js";

export function printScriptAliasWarning(scriptName: string): void {
  const resolution = resolveScriptAlias(scriptName);
  if (resolution.deprecated) {
    process.stderr.write(formatDeprecationDiagnostic(resolution));
  }
}

export { schemaUrls, type SchemaName } from "./schemas.js";
export { listConformanceFixtures, type IConformanceFixture } from "./conformance.js";
export type {
  IConformanceAssetReport,
  IConformanceAudioCommandReport,
  IConformanceAudioReport,
  IConformanceEntityReport,
  IConformanceEnvironmentReport,
  IConformanceEventReport,
  IConformanceMaterialReport,
  IConformanceReport,
  IConformanceResourceReport,
  IConformanceRuntimeConfigReport,
  IConformanceUiNodeReport,
  IConformanceUiReport,
} from "./conformanceReport.js";
export type { IRuntimeDiagnostic } from "./runtimeDiagnostics.js";
export type { IInputActionIr, IInputAxisIr, IInputIr, InputBinding } from "./input.js";
export type { IRuntimeConfigIr } from "./runtimeConfig.js";
export {
  buildComponentReflectionRegistry,
  type IComponentReflectionField,
  type IComponentReflectionRegistry,
  type IComponentReflectionType,
} from "./reflection.js";
export type {
  IIrSystemDeclaration,
  IIrSystemQuery,
  IIrStateSource,
  IIrComponentHookDeclaration,
  IIrObserverDeclaration,
  IrComponentHookKind,
  IrSystemCommand,
  IrObserverPhase,
  IrSystemSchedule,
  IrSystemService,
  ISystemsIr,
} from "./systems.js";
export type {
  IAssetIr,
  IAssetsManifest,
  IAtmosphereProfileIr,
  IAudioIr,
  IAudioMusicIr,
  IAudioOneShotIr,
  IBundleManifest,
  ICameraComponent,
  IColliderComponent,
  IEnvironmentInstanceIr,
  IEnvironmentCameraBookmarkIr,
  IEnvironmentExclusionZoneIr,
  IEnvironmentPathIr,
  IEnvironmentSceneIr,
  IEnvironmentScatterSpecIr,
  IEnvironmentSourceAssetIr,
  IEnvironmentTerrainIr,
  IFirstPersonControllerIr,
  IWalkabilityIr,
  IIrNamedSchema,
  IIrSchemaField,
  IIrSchemaFile,
  IrSchemaFieldKind,
  ILightComponent,
  IMaterialIr,
  IMaterialsIr,
  IMeshRendererComponent,
  IRigidBodyComponent,
  ITargetProfile,
  ITransformComponent,
  IUiBinding,
  IUiIr,
  IUiNodeIr,
  IWorldEntity,
  IWorldIr,
  Quat,
  SchemaVersion,
  Vec3,
} from "./types.js";
export { validateBundle, type IBundleValidationResult, type IIrDiagnostic } from "./validate.js";
export { validateEnvironmentSceneIr } from "./environment.js";
export {
  validateOverlayEntry,
  validateOverlaysIr,
  type IOverlayBridgeMessages,
  type IOverlayIr,
  type IOverlayMessageDeclaration,
  type IOverlayMessageSchema,
  type IOverlaysIr,
  type OverlayInputMode,
  type OverlayMessageSchemaKind,
  type OverlayTargetProfile,
} from "./overlays.js";
export {
  diffEditorProjectSnapshots,
  validateEditorProjectSnapshot,
  type EditorProjectDiffOperation,
  type IEditorProjectSnapshot,
} from "./editorProject.js";
export { validatePerformanceProfile, type PerformanceMetricName } from "./performanceProfile.js";

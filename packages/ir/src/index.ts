export { schemaUrls, type SchemaName } from "./schemas.js";
export { listConformanceFixtures, type IConformanceFixture } from "./conformance.js";
export type { IConformanceEntityReport, IConformanceReport } from "./conformanceReport.js";
export type { IRuntimeDiagnostic } from "./runtimeDiagnostics.js";
export type { IInputActionIr, IInputAxisIr, IInputIr, InputBinding } from "./input.js";
export type { IRuntimeConfigIr } from "./runtimeConfig.js";
export type {
  IIrSystemDeclaration,
  IIrSystemQuery,
  IrSystemCommand,
  IrSystemSchedule,
  ISystemsIr,
} from "./systems.js";
export type {
  IAssetIr,
  IAssetsManifest,
  IAudioIr,
  IAudioMusicIr,
  IAudioOneShotIr,
  IBundleManifest,
  ICameraComponent,
  IColliderComponent,
  IEnvironmentInstanceIr,
  IEnvironmentPathIr,
  IEnvironmentSceneIr,
  IEnvironmentSourceAssetIr,
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

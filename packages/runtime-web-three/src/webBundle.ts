import type {
  IAssetsManifest,
  IAnimationsIr,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IGameFlowIr,
  IFractureManifest,
  IInputIr,
  IInteractionsIr,
  IIrSchemaFile,
  ILocalDataIr,
  IMaterialsIr,
  IOverlaysIr,
  IPrefabsIr,
  IRuntimeConfigIr,
  IScenesIr,
  ISequencesIr,
  ISystemsIr,
  ITargetProfile,
  IUiIr,
  IWorldIr,
  IGltfSceneMetadataIr,
} from "@threenative/ir";

export interface IWebBundle {
  assets: IAssetsManifest;
  animations?: IAnimationsIr;
  audio?: IAudioIr;
  componentSchemas?: IIrSchemaFile;
  environmentScene?: IEnvironmentSceneIr;
  fractureManifests?: Record<string, IFractureManifest>;
  gameFlow?: IGameFlowIr;
  gltfScene?: IGltfSceneMetadataIr;
  input?: IInputIr;
  interactions?: IInteractionsIr;
  localData?: ILocalDataIr;
  manifest: IBundleManifest;
  materials: IMaterialsIr;
  runtimeConfig?: IRuntimeConfigIr;
  scenes?: IScenesIr;
  sequences?: ISequencesIr;
  source?: string;
  systems?: ISystemsIr;
  targetProfile: ITargetProfile;
  ui?: IUiIr;
  overlays?: IOverlaysIr;
  prefabs?: IPrefabsIr;
  world: IWorldIr;
}

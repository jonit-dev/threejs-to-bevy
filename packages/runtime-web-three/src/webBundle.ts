import type {
  IAssetsManifest,
  IAnimationsIr,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IInputIr,
  IIrSchemaFile,
  ILocalDataIr,
  IMaterialsIr,
  IOverlaysIr,
  IPrefabsIr,
  IRuntimeConfigIr,
  IScenesIr,
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
  gltfScene?: IGltfSceneMetadataIr;
  input?: IInputIr;
  localData?: ILocalDataIr;
  manifest: IBundleManifest;
  materials: IMaterialsIr;
  runtimeConfig?: IRuntimeConfigIr;
  scenes?: IScenesIr;
  source?: string;
  systems?: ISystemsIr;
  targetProfile: ITargetProfile;
  ui?: IUiIr;
  overlays?: IOverlaysIr;
  prefabs?: IPrefabsIr;
  world: IWorldIr;
}

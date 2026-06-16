import type { IRuntimeDiagnostic } from "./runtimeDiagnostics.js";
import type { IRuntimeConfigIr } from "./runtimeConfig.js";
import type { IAssetIr, IMaterialIr, Quat, Vec3 } from "./types.js";

export interface IConformanceAssetReport {
  animations?: Extract<IAssetIr, { animations?: unknown }>["animations"];
  bounds?: Extract<IAssetIr, { bounds?: unknown }>["bounds"];
  generation?: Extract<IAssetIr, { generation?: unknown }>["generation"];
  indexCount?: number;
  center?: Extract<IAssetIr, { center?: unknown }>["center"];
  format: IAssetIr["format"];
  id: string;
  kind: IAssetIr["kind"];
  magFilter?: Extract<IAssetIr, { magFilter?: unknown }>["magFilter"];
  minFilter?: Extract<IAssetIr, { minFilter?: unknown }>["minFilter"];
  offset?: Extract<IAssetIr, { offset?: unknown }>["offset"];
  path?: Extract<IAssetIr, { path: string }>["path"];
  primitive?: Extract<IAssetIr, { primitive: string }>["primitive"];
  repeat?: Extract<IAssetIr, { repeat?: unknown }>["repeat"];
  rotation?: Extract<IAssetIr, { rotation?: unknown }>["rotation"];
  size?: Extract<IAssetIr, { size?: readonly number[] }>["size"];
  topology?: Extract<IAssetIr, { topology?: unknown }>["topology"];
  usage?: Extract<IAssetIr, { usage?: unknown }>["usage"];
  vertexCount?: number;
  wrapS?: Extract<IAssetIr, { wrapS?: unknown }>["wrapS"];
  wrapT?: Extract<IAssetIr, { wrapT?: unknown }>["wrapT"];
}

export interface IConformanceMaterialReport {
  alphaCutoff?: number;
  alphaMode?: IMaterialIr["alphaMode"];
  clearcoat?: number;
  clearcoatRoughness?: number;
  color: IMaterialIr["color"];
  emissive?: IMaterialIr["emissive"];
  emissiveIntensity?: number;
  id: string;
  kind: IMaterialIr["kind"];
  metalness?: number;
  opacity?: number;
  roughness?: number;
  specularIntensity?: number;
  transmission?: number;
  textures: {
    baseColor?: string;
    clearcoat?: string;
    clearcoatRoughness?: string;
    emissive?: string;
    metallicRoughness?: string;
    normal?: string;
    occlusion?: string;
    transmission?: string;
  };
}

export interface IConformanceEnvironmentReport {
  atmosphere?: string;
  bookmarks: string[];
  instances: string[];
  path?: string;
  scatter: string[];
  sourceAssets: string[];
  terrain?: string;
}

export interface IConformanceEventReport {
  id: string;
  values: unknown[];
}

export interface IConformanceResourceReport {
  id: string;
  value: unknown;
}

export interface IConformanceUiNodeReport {
  accessibilityLabel?: string;
  action?: string;
  children: IConformanceUiNodeReport[];
  focusable?: boolean;
  id: string;
  kind: string;
  label?: string;
  max?: number;
  role?: string;
  src?: string;
  text?: string;
  value?: number;
}

export interface IConformanceUiReport {
  root: IConformanceUiNodeReport;
}

export interface IConformanceAudioCommandReport {
  asset: string;
  bus?: string;
  emitter?: string;
  event?: string;
  id: string;
  kind: "loop" | "oneShot";
  volume?: number;
}

export interface IConformanceAudioReport {
  commands: IConformanceAudioCommandReport[];
}

export interface IConformanceRuntimeConfigReport {
  renderer?: {
    antialias?: NonNullable<IRuntimeConfigIr["renderer"]>["antialias"];
    bloom?: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["bloom"]>;
  };
}

export interface IConformanceCameraViewReport {
  cameraId: string;
  clearMode?: string;
  exportPath?: string;
  layers: string[];
  order: number;
  projectionKind?: string;
  projectionMatrixHash?: string;
  targetAsset?: string;
  targetKind: string;
  viewport?: readonly [number, number, number, number];
}

export interface IConformanceScreenshotExportReport {
  cameraId: string;
  format: string;
  path: string;
}

export interface IConformanceEntityReport {
  camera?: {
    far: number;
    fovY?: number;
    kind: string;
    near: number;
    runtime?: {
      far?: number;
      fovY?: number;
      kind: string;
      near?: number;
      size?: number;
    };
    size?: number;
  };
  components: string[];
  id: string;
  light?: {
    angle?: number;
    color: string | readonly [number, number, number] | readonly [number, number, number, number];
    intensity: number;
    kind: string;
    range?: number;
    shadowBias?: number;
    shadowNormalBias?: number;
    runtime?: {
      angle?: number;
      color?: string | readonly [number, number, number];
      intensity?: number;
      kind: string;
      range?: number;
      shadowBias?: number;
      shadowNormalBias?: number;
    };
  };
  material?: string;
  meshRenderer?: {
    castShadow?: boolean;
    material: string;
    mesh: string;
    receiveShadow?: boolean;
    visible?: boolean;
  };
  mesh?: string;
  parent?: string;
  transform?: {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
  visibility?: {
    meshRendererVisible?: boolean;
    runtimeVisible?: boolean;
    visible?: boolean;
  };
}

export interface IConformanceReport {
  activeCamera?: string;
  audio?: IConformanceAudioReport;
  assets: IConformanceAssetReport[];
  cameraViews?: IConformanceCameraViewReport[];
  diagnostics: IRuntimeDiagnostic[];
  entities: IConformanceEntityReport[];
  environment?: IConformanceEnvironmentReport;
  events: IConformanceEventReport[];
  fixture: string;
  materials: IConformanceMaterialReport[];
  resources: IConformanceResourceReport[];
  runtime: "bevy" | "web-three";
  runtimeConfig?: IConformanceRuntimeConfigReport;
  screenshotExports?: IConformanceScreenshotExportReport[];
  ui?: IConformanceUiReport;
}

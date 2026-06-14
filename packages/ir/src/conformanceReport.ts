import type { IRuntimeDiagnostic } from "./runtimeDiagnostics.js";
import type { IAssetIr, IMaterialIr, Quat, Vec3 } from "./types.js";

export interface IConformanceAssetReport {
  bounds?: Extract<IAssetIr, { bounds?: unknown }>["bounds"];
  format: IAssetIr["format"];
  id: string;
  kind: IAssetIr["kind"];
  path?: Extract<IAssetIr, { path: string }>["path"];
  primitive?: Extract<IAssetIr, { primitive: string }>["primitive"];
  size?: Extract<IAssetIr, { size?: readonly number[] }>["size"];
}

export interface IConformanceMaterialReport {
  color: IMaterialIr["color"];
  id: string;
  kind: IMaterialIr["kind"];
  metalness?: number;
  roughness?: number;
  textures: {
    baseColor?: string;
    emissive?: string;
    metallicRoughness?: string;
    normal?: string;
    occlusion?: string;
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

export interface IConformanceEntityReport {
  camera?: {
    far: number;
    fovY?: number;
    kind: string;
    near: number;
  };
  components: string[];
  id: string;
  light?: {
    angle?: number;
    color: string | readonly [number, number, number] | readonly [number, number, number, number];
    intensity: number;
    kind: string;
    range?: number;
    runtime?: {
      angle?: number;
      color?: string | readonly [number, number, number];
      intensity?: number;
      kind: string;
      range?: number;
    };
  };
  material?: string;
  meshRenderer?: {
    material: string;
    mesh: string;
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
  assets: IConformanceAssetReport[];
  diagnostics: IRuntimeDiagnostic[];
  entities: IConformanceEntityReport[];
  environment?: IConformanceEnvironmentReport;
  events: IConformanceEventReport[];
  fixture: string;
  materials: IConformanceMaterialReport[];
  resources: IConformanceResourceReport[];
  runtime: "bevy" | "web-three";
}

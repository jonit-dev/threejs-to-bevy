import type { IRuntimeDiagnostic } from "./runtimeDiagnostics.js";
import type { Quat, Vec3 } from "./types.js";

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
    color: string | readonly [number, number, number] | readonly [number, number, number, number];
    intensity: number;
    kind: string;
  };
  material?: string;
  mesh?: string;
  parent?: string;
  transform?: {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
}

export interface IConformanceReport {
  diagnostics: IRuntimeDiagnostic[];
  entities: IConformanceEntityReport[];
  fixture: string;
  runtime: "bevy" | "web-three";
}

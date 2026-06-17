import type { SchemaVersion } from "./types.js";

export type RendererAntialiasMode = "none" | "msaa2" | "msaa4" | "msaa8" | "fxaa" | "taa" | "smaa";

export interface IRuntimeConfigIr {
  schema: "threenative.runtime-config";
  version: SchemaVersion;
  renderer?: {
    antialias: RendererAntialiasMode;
    bloom?: {
      enabled: boolean;
      intensity: number;
      threshold: number;
    };
    colorGrading?: {
      contrast?: number;
      exposure?: number;
      lut?: string;
      saturation?: number;
      temperature?: number;
      tint?: number;
      toneMapping?: "aces" | "linear" | "none" | "reinhard";
    };
    depthOfField?: {
      aperture: number;
      enabled: boolean;
      focusDistance: number;
      maxBlur: number;
    };
    renderPath?: "forward";
  };
  time: {
    fixedDelta: number;
    paused: boolean;
  };
  window: {
    height: number;
    title?: string;
    width: number;
  };
}

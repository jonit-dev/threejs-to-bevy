import type { SchemaVersion } from "./types.js";

export interface IRuntimeConfigIr {
  schema: "threenative.runtime-config";
  version: SchemaVersion;
  renderer?: {
    antialias: "none" | "msaa2" | "msaa4" | "msaa8";
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

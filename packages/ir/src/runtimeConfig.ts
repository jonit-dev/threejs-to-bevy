import type { SchemaVersion } from "./types.js";

export type RendererAntialiasMode = "none" | "msaa2" | "msaa4" | "msaa8" | "fxaa" | "taa" | "smaa";
export type RenderLookProfileName = "parity" | "balanced" | "cinematic" | "stylized";
export type RenderLookShadowQuality = "off" | "low" | "medium" | "high";

export interface IRenderLookProfileIr {
  version: 1;
  profile: RenderLookProfileName;
  overrides?: {
    bloomIntensity?: number;
    contrast?: number;
    environmentIntensity?: number;
    exposure?: number;
    saturation?: number;
    shadowQuality?: RenderLookShadowQuality;
  };
}

export interface IRenderLookProfilePreset {
  antialias: RendererAntialiasMode;
  bloomIntensity: number;
  contrast: number;
  environmentIntensity: number;
  exposure: number;
  saturation: number;
  shadowQuality: RenderLookShadowQuality;
  toneMapping: "aces" | "none";
}

export const RENDER_LOOK_PROFILE_PRESETS = {
  parity: {
    antialias: "none",
    bloomIntensity: 0,
    contrast: 0,
    environmentIntensity: 1,
    exposure: 1,
    saturation: 1,
    shadowQuality: "medium",
    toneMapping: "none",
  },
  balanced: {
    antialias: "msaa4",
    bloomIntensity: 0.25,
    contrast: 0.08,
    environmentIntensity: 1.15,
    exposure: 1.05,
    saturation: 1.08,
    shadowQuality: "high",
    toneMapping: "aces",
  },
} as const satisfies Record<"parity" | "balanced", IRenderLookProfilePreset>;

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
    renderLook?: IRenderLookProfileIr;
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

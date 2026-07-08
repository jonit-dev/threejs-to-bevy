import type { SchemaVersion } from "./types.js";

export type RendererAntialiasMode = "none" | "msaa2" | "msaa4" | "msaa8" | "fxaa" | "taa" | "smaa";
export type RenderLookProfileName = "parity" | "balanced" | "cinematic" | "stylized";
export type RenderLookShadowQuality = "off" | "low" | "medium" | "high";
export type RenderLookTargetProfile = "desktop-web" | "mobile-web" | "native";

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

export interface IResolvedRenderLookProfile extends IRenderLookProfilePreset {
  profile: RenderLookProfileName;
  targetProfile: RenderLookTargetProfile;
}

const renderLookTargetOverride = <T extends Partial<IRenderLookProfilePreset>>(preset: T): T => preset;

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
  cinematic: {
    antialias: "msaa8",
    bloomIntensity: 0.55,
    contrast: 0.18,
    environmentIntensity: 1.35,
    exposure: 1.08,
    saturation: 1.12,
    shadowQuality: "high",
    toneMapping: "aces",
  },
  stylized: {
    antialias: "msaa4",
    bloomIntensity: 0.35,
    contrast: 0.24,
    environmentIntensity: 1.25,
    exposure: 1.02,
    saturation: 1.35,
    shadowQuality: "medium",
    toneMapping: "aces",
  },
} as const satisfies Record<RenderLookProfileName, IRenderLookProfilePreset>;

const RENDER_LOOK_TARGET_PROFILE_OVERRIDES = {
  "desktop-web": {
    balanced: {},
    cinematic: {},
    parity: {},
    stylized: {},
  },
  "mobile-web": {
    balanced: renderLookTargetOverride({ antialias: "msaa2", bloomIntensity: 0.18, shadowQuality: "medium" }),
    cinematic: renderLookTargetOverride({ antialias: "fxaa", bloomIntensity: 0.32, environmentIntensity: 1.2, shadowQuality: "medium" }),
    parity: {},
    stylized: renderLookTargetOverride({ antialias: "fxaa", bloomIntensity: 0.24, shadowQuality: "low" }),
  },
  native: {
    balanced: renderLookTargetOverride({ antialias: "msaa4" }),
    cinematic: renderLookTargetOverride({ antialias: "msaa4", bloomIntensity: 0.45 }),
    parity: {},
    stylized: renderLookTargetOverride({ bloomIntensity: 0.3 }),
  },
} as const satisfies Record<RenderLookTargetProfile, Record<RenderLookProfileName, Partial<IRenderLookProfilePreset>>>;

export function resolveRenderLookProfile(
  renderLook: IRenderLookProfileIr | RenderLookProfileName | undefined,
  targetProfile: RenderLookTargetProfile = "desktop-web",
): IResolvedRenderLookProfile {
  const profile = typeof renderLook === "string" ? renderLook : renderLook?.profile ?? "parity";
  const overrides = typeof renderLook === "string" ? undefined : renderLook?.overrides;
  return {
    ...RENDER_LOOK_PROFILE_PRESETS[profile],
    ...RENDER_LOOK_TARGET_PROFILE_OVERRIDES[targetProfile][profile],
    ...overrides,
    profile,
    targetProfile,
  };
}

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

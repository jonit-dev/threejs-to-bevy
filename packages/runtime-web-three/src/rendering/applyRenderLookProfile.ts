import type { IRuntimeConfigIr, IRenderLookProfileIr } from "@threenative/ir";

type RuntimeRendererConfig = NonNullable<IRuntimeConfigIr["renderer"]>;
type RuntimeBloomConfig = NonNullable<RuntimeRendererConfig["bloom"]>;
type RuntimeColorGradingConfig = NonNullable<RuntimeRendererConfig["colorGrading"]>;
type WebRenderLookPreset = {
  bloomIntensity: number;
  contrast: number;
  exposure: number;
  saturation: number;
  toneMapping: "aces" | "none";
};

const WEB_RENDER_LOOK_PROFILE_PRESETS = {
  parity: {
    bloomIntensity: 0,
    contrast: 0,
    exposure: 1,
    saturation: 1,
    toneMapping: "none",
  },
  balanced: {
    bloomIntensity: 0.25,
    contrast: 0.08,
    exposure: 1.35,
    saturation: 1.08,
    toneMapping: "aces",
  },
} as const satisfies Record<"parity" | "balanced", WebRenderLookPreset>;

export interface IWebRenderLookFallback {
  code: "TN_RENDER_PROFILE_FALLBACK_USED";
  feature: string;
  reason: string;
}

export interface IWebRenderLookApplication {
  appliedProfile: "parity" | "balanced";
  bloom?: RuntimeBloomConfig;
  colorGrading?: RuntimeColorGradingConfig;
  fallbacks: IWebRenderLookFallback[];
  requestedProfile: IRenderLookProfileIr["profile"] | "parity";
}

export function applyWebRenderLookProfile(config?: IRuntimeConfigIr): IWebRenderLookApplication {
  const renderLook = config?.renderer?.renderLook;
  const requestedProfile = renderLook?.profile ?? "parity";
  const appliedProfile = requestedProfile === "balanced" ? "balanced" : "parity";
  const preset = WEB_RENDER_LOOK_PROFILE_PRESETS[appliedProfile];
  const overrides = renderLook?.overrides ?? {};
  const bloomIntensity = overrides.bloomIntensity ?? preset.bloomIntensity;

  return {
    requestedProfile,
    appliedProfile,
    fallbacks: requestedProfile === "cinematic" || requestedProfile === "stylized"
      ? [{
          code: "TN_RENDER_PROFILE_FALLBACK_USED",
          feature: `profile.${requestedProfile}`,
          reason: "Web runtime only promotes parity and balanced render look profiles.",
        }]
      : [],
    bloom: config?.renderer?.bloom ?? (appliedProfile === "balanced"
      ? { enabled: bloomIntensity > 0, intensity: bloomIntensity, threshold: 0.85 }
      : undefined),
    colorGrading: config?.renderer?.colorGrading ?? (appliedProfile === "balanced"
      ? {
          contrast: overrides.contrast ?? preset.contrast,
          exposure: overrides.exposure ?? preset.exposure,
          saturation: overrides.saturation ?? preset.saturation,
          toneMapping: preset.toneMapping,
        }
      : undefined),
  };
}

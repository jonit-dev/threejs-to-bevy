import type { IRuntimeConfigIr, IRenderLookProfileIr, RenderLookProfileName } from "@threenative/ir";
import { resolveRenderLookProfile } from "@threenative/ir/runtimeConfig";

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

export interface IWebRenderLookFallback {
  code: "TN_RENDER_PROFILE_FALLBACK_USED";
  feature: string;
  reason: string;
}

export interface IWebRenderLookApplication {
  appliedProfile: RenderLookProfileName;
  bloom?: RuntimeBloomConfig;
  colorGrading?: RuntimeColorGradingConfig;
  fallbacks: IWebRenderLookFallback[];
  requestedProfile: IRenderLookProfileIr["profile"] | "parity";
}

export function applyWebRenderLookProfile(config?: IRuntimeConfigIr): IWebRenderLookApplication {
  const renderLook = config?.renderer?.renderLook;
  const requestedProfile = renderLook?.profile ?? "parity";
  const resolved = resolveRenderLookProfile(renderLook, "desktop-web");
  const preset: WebRenderLookPreset = resolved;
  const bloomIntensity = resolved.bloomIntensity;
  const artisticProfile = resolved.profile !== "parity";

  return {
    requestedProfile,
    appliedProfile: resolved.profile,
    fallbacks: [],
    bloom: config?.renderer?.bloom ?? (artisticProfile
      ? { enabled: bloomIntensity > 0, intensity: bloomIntensity, threshold: 0.85 }
      : undefined),
    colorGrading: config?.renderer?.colorGrading ?? (artisticProfile
      ? {
          contrast: preset.contrast,
          exposure: preset.exposure,
          saturation: preset.saturation,
          toneMapping: preset.toneMapping,
        }
      : undefined),
  };
}

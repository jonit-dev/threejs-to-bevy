export type RenderLookProfileName = "parity" | "balanced" | "cinematic" | "stylized";
export type RenderLookShadowQuality = "off" | "low" | "medium" | "high";

export interface IRenderLookOverrides {
  bloomIntensity?: number;
  contrast?: number;
  environmentIntensity?: number;
  exposure?: number;
  saturation?: number;
  shadowQuality?: RenderLookShadowQuality;
}

export interface IRenderLookProfileDeclaration {
  version: 1;
  profile: RenderLookProfileName;
  overrides?: IRenderLookOverrides;
}

export function renderLookProfile(profile: RenderLookProfileName, overrides?: IRenderLookOverrides): IRenderLookProfileDeclaration {
  return {
    version: 1,
    profile,
    ...(overrides === undefined ? {} : { overrides }),
  };
}

export const parityRenderLook = (): IRenderLookProfileDeclaration => renderLookProfile("parity");
export const balancedRenderLook = (overrides?: IRenderLookOverrides): IRenderLookProfileDeclaration => renderLookProfile("balanced", overrides);

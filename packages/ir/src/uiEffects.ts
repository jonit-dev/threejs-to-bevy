import type { IUiEffectPresetIr } from "./uiTypes.js";

export type UiEffectRenderStrategy = "none" | "outline" | "shadow" | "tint";

export function resolveUiEffectStrategy(effect: IUiEffectPresetIr): UiEffectRenderStrategy {
  if (effect.fallback !== undefined) {
    return effect.fallback;
  }
  return effect.kind === "tint" ? "tint" : "outline";
}

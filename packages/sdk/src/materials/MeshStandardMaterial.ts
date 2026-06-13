import { SdkError, assertFiniteNumber } from "../errors.js";
import type { IAssetReference } from "../assets.js";

export type ColorValue = string | readonly [number, number, number] | readonly [number, number, number, number];
export type TextureSlotReference = string | IAssetReference;

export interface IMeshStandardMaterialOptions {
  baseColorTexture?: TextureSlotReference;
  color?: ColorValue;
  emissiveTexture?: TextureSlotReference;
  metalness?: number;
  metallicRoughnessTexture?: TextureSlotReference;
  normalTexture?: TextureSlotReference;
  occlusionTexture?: TextureSlotReference;
  roughness?: number;
}

export class MeshStandardMaterial {
  public readonly color: ColorValue;
  public readonly baseColorTexture?: TextureSlotReference;
  public readonly emissiveTexture?: TextureSlotReference;
  public readonly metalness: number;
  public readonly metallicRoughnessTexture?: TextureSlotReference;
  public readonly normalTexture?: TextureSlotReference;
  public readonly occlusionTexture?: TextureSlotReference;
  public readonly roughness: number;

  public constructor(options: IMeshStandardMaterialOptions = {}) {
    this.color = validateColor(options.color ?? "#ffffff");
    this.baseColorTexture = options.baseColorTexture;
    this.emissiveTexture = options.emissiveTexture;
    this.metalness = options.metalness ?? 0;
    this.metallicRoughnessTexture = options.metallicRoughnessTexture;
    this.normalTexture = options.normalTexture;
    this.occlusionTexture = options.occlusionTexture;
    this.roughness = options.roughness ?? 1;
    assertFiniteNumber(this.metalness, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.metalness");
    assertFiniteNumber(this.roughness, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.roughness");
  }
}

export function validateColor(color: ColorValue): ColorValue {
  if (typeof color === "string") {
    if (!/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
      throw new SdkError("TN_SDK_COLOR_INVALID", "Color strings must be #RRGGBB or #RRGGBBAA.");
    }
    return color;
  }

  if (color.length !== 3 && color.length !== 4) {
    throw new SdkError("TN_SDK_COLOR_INVALID", "Color arrays must have three or four channels.");
  }

  color.forEach((channel, index) => {
    assertFiniteNumber(channel, "TN_SDK_COLOR_INVALID", `Color channel ${index}`);
  });

  return [...color] as ColorValue;
}

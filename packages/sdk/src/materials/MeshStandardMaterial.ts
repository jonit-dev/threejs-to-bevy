import { SdkError, assertFiniteNumber } from "../errors.js";
import type { IAssetReference } from "../assets.js";

export type ColorValue = string | readonly [number, number, number] | readonly [number, number, number, number];
export type TextureSlotReference = string | IAssetReference;
export type MaterialAlphaMode = "opaque" | "mask" | "blend";

export interface IMeshStandardMaterialOptions {
  alphaCutoff?: number;
  alphaMode?: MaterialAlphaMode;
  baseColorTexture?: TextureSlotReference;
  color?: ColorValue;
  emissive?: ColorValue;
  emissiveIntensity?: number;
  emissiveTexture?: TextureSlotReference;
  metalness?: number;
  metallicRoughnessTexture?: TextureSlotReference;
  normalTexture?: TextureSlotReference;
  occlusionTexture?: TextureSlotReference;
  opacity?: number;
  roughness?: number;
}

export class MeshStandardMaterial {
  public readonly alphaCutoff?: number;
  public readonly alphaMode: MaterialAlphaMode;
  public readonly color: ColorValue;
  public readonly baseColorTexture?: TextureSlotReference;
  public readonly emissive?: ColorValue;
  public readonly emissiveIntensity: number;
  public readonly emissiveTexture?: TextureSlotReference;
  public readonly metalness: number;
  public readonly metallicRoughnessTexture?: TextureSlotReference;
  public readonly normalTexture?: TextureSlotReference;
  public readonly occlusionTexture?: TextureSlotReference;
  public readonly opacity: number;
  public readonly roughness: number;

  public constructor(options: IMeshStandardMaterialOptions = {}) {
    this.alphaCutoff = options.alphaCutoff;
    this.alphaMode = options.alphaMode ?? "opaque";
    this.color = validateColor(options.color ?? "#ffffff");
    this.baseColorTexture = options.baseColorTexture;
    this.emissive = options.emissive === undefined ? undefined : validateColor(options.emissive);
    this.emissiveIntensity = options.emissiveIntensity ?? 1;
    this.emissiveTexture = options.emissiveTexture;
    this.metalness = options.metalness ?? 0;
    this.metallicRoughnessTexture = options.metallicRoughnessTexture;
    this.normalTexture = options.normalTexture;
    this.occlusionTexture = options.occlusionTexture;
    this.opacity = options.opacity ?? 1;
    this.roughness = options.roughness ?? 1;
    if (!["opaque", "mask", "blend"].includes(this.alphaMode)) {
      throw new SdkError("TN_SDK_MATERIAL_ALPHA_MODE_INVALID", "MeshStandardMaterial.alphaMode must be opaque, mask, or blend.");
    }
    if (this.alphaCutoff !== undefined) {
      assertFiniteNumber(this.alphaCutoff, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.alphaCutoff");
      if (this.alphaCutoff < 0 || this.alphaCutoff > 1) {
        throw new SdkError("TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.alphaCutoff must be between 0 and 1.");
      }
    }
    assertFiniteNumber(this.metalness, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.metalness");
    assertFiniteNumber(this.emissiveIntensity, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.emissiveIntensity");
    assertFiniteNumber(this.opacity, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.opacity");
    assertFiniteNumber(this.roughness, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.roughness");
    if (this.emissiveIntensity < 0) {
      throw new SdkError("TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.emissiveIntensity must be non-negative.");
    }
    if (this.opacity < 0 || this.opacity > 1) {
      throw new SdkError("TN_SDK_MATERIAL_INVALID_VALUE", "MeshStandardMaterial.opacity must be between 0 and 1.");
    }
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

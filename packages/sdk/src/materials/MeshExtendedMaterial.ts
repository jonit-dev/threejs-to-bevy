import { SdkError } from "../errors.js";
import type { IAssetReference } from "../assets.js";
import {
  type ColorValue,
  type MaterialAlphaMode,
  type MaterialBlendMode,
  type TextureSlotReference,
  validateColor,
} from "./MeshStandardMaterial.js";
import { assertFiniteNumber } from "../errors.js";

export type ExtendedMaterialPreset = "foliage" | "unlitMasked";

export interface IMeshExtendedMaterialOptions {
  alphaCutoff?: number;
  alphaMode?: MaterialAlphaMode;
  baseColorTexture?: TextureSlotReference;
  blendMode?: MaterialBlendMode;
  color?: ColorValue;
  depthTest?: boolean;
  depthWrite?: boolean;
  doubleSided?: boolean;
  opacity?: number;
  preset: ExtendedMaterialPreset;
  renderOrder?: number;
}

export class MeshExtendedMaterial {
  public readonly alphaCutoff?: number;
  public readonly alphaMode: MaterialAlphaMode;
  public readonly baseColorTexture?: TextureSlotReference;
  public readonly blendMode?: MaterialBlendMode;
  public readonly color: ColorValue;
  public readonly depthTest?: boolean;
  public readonly depthWrite?: boolean;
  public readonly doubleSided: boolean;
  public readonly kind = "extended" as const;
  public readonly opacity: number;
  public readonly preset: ExtendedMaterialPreset;
  public readonly renderOrder?: number;

  public constructor(options: IMeshExtendedMaterialOptions) {
    if (!["foliage", "unlitMasked"].includes(options.preset)) {
      throw new SdkError("TN_SDK_MATERIAL_EXTENSION_UNSUPPORTED", "MeshExtendedMaterial.preset must be unlitMasked or foliage.");
    }
    this.preset = options.preset;
    this.alphaCutoff = options.alphaCutoff;
    this.alphaMode = options.alphaMode ?? (options.preset === "foliage" ? "mask" : "opaque");
    this.baseColorTexture = options.baseColorTexture;
    this.blendMode = options.blendMode;
    this.color = validateColor(options.color ?? "#ffffff");
    this.depthTest = options.depthTest;
    this.depthWrite = options.depthWrite;
    this.doubleSided = options.doubleSided ?? options.preset === "foliage";
    this.opacity = options.opacity ?? 1;
    this.renderOrder = options.renderOrder;
    if (this.blendMode !== undefined && this.alphaMode !== "blend") {
      throw new SdkError("TN_SDK_MATERIAL_BLEND_MODE_INVALID", "MeshExtendedMaterial.blendMode requires alphaMode 'blend'.");
    }
    if (this.renderOrder !== undefined) {
      assertFiniteNumber(this.renderOrder, "TN_SDK_MATERIAL_INVALID_VALUE", "MeshExtendedMaterial.renderOrder");
      if (!Number.isInteger(this.renderOrder)) {
        throw new SdkError("TN_SDK_MATERIAL_INVALID_VALUE", "MeshExtendedMaterial.renderOrder must be an integer.");
      }
    }
  }
}

export function isMeshExtendedMaterial(value: unknown): value is MeshExtendedMaterial {
  return value instanceof MeshExtendedMaterial;
}

export function resolveTextureSlotReference(reference: TextureSlotReference): string | IAssetReference {
  return reference;
}

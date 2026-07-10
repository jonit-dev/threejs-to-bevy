import { SdkError, assertFiniteNumber, assertNormalizedNumber } from "../errors.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

export interface IContactShadowsOptions extends IObject3DOptions {
  height: number;
  opacity: number;
  resolution: 128 | 256 | 512 | 1024;
  size: readonly [number, number];
  softness: number;
  updateMode: "dynamic" | "static";
}

export class ContactShadows extends Object3D {
  public readonly height: number;
  public readonly opacity: number;
  public readonly resolution: IContactShadowsOptions["resolution"];
  public readonly size: readonly [number, number];
  public readonly softness: number;
  public readonly updateMode: IContactShadowsOptions["updateMode"];

  public constructor(options: IContactShadowsOptions) {
    super(options);
    this.height = options.height;
    this.opacity = options.opacity;
    this.resolution = options.resolution;
    this.size = [...options.size];
    this.softness = options.softness;
    this.updateMode = options.updateMode;

    validateRange(this.height, 0.1, 50, "TN_SDK_CONTACT_SHADOWS_HEIGHT_INVALID", "ContactShadows.height");
    validateRange(this.size[0], 0.1, 500, "TN_SDK_CONTACT_SHADOWS_SIZE_INVALID", "ContactShadows.size[0]");
    validateRange(this.size[1], 0.1, 500, "TN_SDK_CONTACT_SHADOWS_SIZE_INVALID", "ContactShadows.size[1]");
    if (![128, 256, 512, 1024].includes(this.resolution)) {
      throw new SdkError("TN_SDK_CONTACT_SHADOWS_RESOLUTION_INVALID", "ContactShadows.resolution must be 128, 256, 512, or 1024.");
    }
    validateRange(this.softness, 0, 10, "TN_SDK_CONTACT_SHADOWS_SOFTNESS_INVALID", "ContactShadows.softness");
    assertNormalizedNumber(this.opacity, "TN_SDK_CONTACT_SHADOWS_OPACITY_INVALID", "ContactShadows.opacity");
    if (this.updateMode !== "static" && this.updateMode !== "dynamic") {
      throw new SdkError("TN_SDK_CONTACT_SHADOWS_UPDATE_MODE_INVALID", "ContactShadows.updateMode must be 'static' or 'dynamic'.");
    }
  }
}

function validateRange(value: number, minimum: number, maximum: number, code: string, label: string): void {
  assertFiniteNumber(value, code, label);
  if (value < minimum || value > maximum) {
    throw new SdkError(code, `${label} must be between ${minimum} and ${maximum}.`);
  }
}

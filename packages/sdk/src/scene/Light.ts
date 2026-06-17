import { SdkError, assertFiniteNumber } from "../errors.js";
import { validateColor, type ColorValue } from "../materials/MeshStandardMaterial.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

interface ILightOptions extends IObject3DOptions {
  color?: ColorValue;
  debug?: {
    gizmo?: boolean;
  };
  intensity?: number;
}

interface IShadowedLightOptions extends ILightOptions {
  shadowBias?: number;
  shadowFilter?: {
    mode: "pcf";
    quality: "high" | "low" | "medium";
  };
  shadowNormalBias?: number;
}

interface IPointLightOptions extends IShadowedLightOptions {
  range?: number;
}

interface ISpotLightOptions extends IShadowedLightOptions {
  angle?: number;
  range?: number;
}

export class DirectionalLight extends Object3D {
  public readonly color: ColorValue;
  public readonly debug?: { gizmo?: boolean };
  public readonly intensity: number;
  public readonly shadowBias?: number;
  public readonly shadowFilter?: IShadowedLightOptions["shadowFilter"];
  public readonly shadowNormalBias?: number;

  public constructor(options: IShadowedLightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.debug = options.debug;
    this.intensity = options.intensity ?? 1;
    this.shadowBias = options.shadowBias;
    this.shadowFilter = options.shadowFilter;
    this.shadowNormalBias = options.shadowNormalBias;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "DirectionalLight.intensity");
    validateShadowBias(this.shadowBias, "DirectionalLight.shadowBias");
    validateShadowFilter(this.shadowFilter, "DirectionalLight.shadowFilter");
    validateDebug(this.debug, "DirectionalLight.debug");
    validateShadowBias(this.shadowNormalBias, "DirectionalLight.shadowNormalBias");
  }
}

export class AmbientLight extends Object3D {
  public readonly color: ColorValue;
  public readonly debug?: { gizmo?: boolean };
  public readonly intensity: number;

  public constructor(options: ILightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.debug = options.debug;
    this.intensity = options.intensity ?? 1;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "AmbientLight.intensity");
    validateDebug(this.debug, "AmbientLight.debug");
  }
}

export class PointLight extends Object3D {
  public readonly color: ColorValue;
  public readonly debug?: { gizmo?: boolean };
  public readonly intensity: number;
  public readonly range?: number;
  public readonly shadowBias?: number;
  public readonly shadowFilter?: IShadowedLightOptions["shadowFilter"];
  public readonly shadowNormalBias?: number;

  public constructor(options: IPointLightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.debug = options.debug;
    this.intensity = options.intensity ?? 1;
    this.range = options.range;
    this.shadowBias = options.shadowBias;
    this.shadowFilter = options.shadowFilter;
    this.shadowNormalBias = options.shadowNormalBias;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "PointLight.intensity");
    if (this.range !== undefined) {
      assertFiniteNumber(this.range, "TN_SDK_LIGHT_INVALID_RANGE", "PointLight.range");
    }
    validateShadowBias(this.shadowBias, "PointLight.shadowBias");
    validateShadowFilter(this.shadowFilter, "PointLight.shadowFilter");
    validateDebug(this.debug, "PointLight.debug");
    validateShadowBias(this.shadowNormalBias, "PointLight.shadowNormalBias");
  }
}

export class SpotLight extends Object3D {
  public readonly angle?: number;
  public readonly color: ColorValue;
  public readonly debug?: { gizmo?: boolean };
  public readonly intensity: number;
  public readonly range?: number;
  public readonly shadowBias?: number;
  public readonly shadowFilter?: IShadowedLightOptions["shadowFilter"];
  public readonly shadowNormalBias?: number;

  public constructor(options: ISpotLightOptions = {}) {
    super(options);
    this.angle = options.angle;
    this.color = validateColor(options.color ?? "#ffffff");
    this.debug = options.debug;
    this.intensity = options.intensity ?? 1;
    this.range = options.range;
    this.shadowBias = options.shadowBias;
    this.shadowFilter = options.shadowFilter;
    this.shadowNormalBias = options.shadowNormalBias;
    if (this.angle !== undefined) {
      assertFiniteNumber(this.angle, "TN_SDK_LIGHT_INVALID_ANGLE", "SpotLight.angle");
    }
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "SpotLight.intensity");
    if (this.range !== undefined) {
      assertFiniteNumber(this.range, "TN_SDK_LIGHT_INVALID_RANGE", "SpotLight.range");
    }
    validateShadowBias(this.shadowBias, "SpotLight.shadowBias");
    validateShadowFilter(this.shadowFilter, "SpotLight.shadowFilter");
    validateDebug(this.debug, "SpotLight.debug");
    validateShadowBias(this.shadowNormalBias, "SpotLight.shadowNormalBias");
  }
}

function validateShadowBias(value: number | undefined, label: string): void {
  if (value !== undefined) {
    assertFiniteNumber(value, "TN_SDK_LIGHT_INVALID_SHADOW_BIAS", label);
  }
}

function validateShadowFilter(value: IShadowedLightOptions["shadowFilter"] | undefined, label: string): void {
  if (value === undefined) {
    return;
  }
  if (value.mode !== "pcf" || !["low", "medium", "high"].includes(value.quality)) {
    throw new SdkError("TN_SDK_LIGHT_INVALID_SHADOW_FILTER", `${label} must use PCF mode with low, medium, or high quality.`);
  }
}

function validateDebug(value: ILightOptions["debug"] | undefined, label: string): void {
  if (value?.gizmo !== undefined && typeof value.gizmo !== "boolean") {
    throw new SdkError("TN_SDK_LIGHT_INVALID_DEBUG", `${label}.gizmo must be a boolean.`);
  }
}

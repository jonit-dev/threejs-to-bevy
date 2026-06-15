import { assertFiniteNumber } from "../errors.js";
import { validateColor, type ColorValue } from "../materials/MeshStandardMaterial.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

interface ILightOptions extends IObject3DOptions {
  color?: ColorValue;
  intensity?: number;
}

interface IShadowedLightOptions extends ILightOptions {
  shadowBias?: number;
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
  public readonly intensity: number;
  public readonly shadowBias?: number;
  public readonly shadowNormalBias?: number;

  public constructor(options: IShadowedLightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    this.shadowBias = options.shadowBias;
    this.shadowNormalBias = options.shadowNormalBias;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "DirectionalLight.intensity");
    validateShadowBias(this.shadowBias, "DirectionalLight.shadowBias");
    validateShadowBias(this.shadowNormalBias, "DirectionalLight.shadowNormalBias");
  }
}

export class AmbientLight extends Object3D {
  public readonly color: ColorValue;
  public readonly intensity: number;

  public constructor(options: ILightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "AmbientLight.intensity");
  }
}

export class PointLight extends Object3D {
  public readonly color: ColorValue;
  public readonly intensity: number;
  public readonly range?: number;
  public readonly shadowBias?: number;
  public readonly shadowNormalBias?: number;

  public constructor(options: IPointLightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    this.range = options.range;
    this.shadowBias = options.shadowBias;
    this.shadowNormalBias = options.shadowNormalBias;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "PointLight.intensity");
    if (this.range !== undefined) {
      assertFiniteNumber(this.range, "TN_SDK_LIGHT_INVALID_RANGE", "PointLight.range");
    }
    validateShadowBias(this.shadowBias, "PointLight.shadowBias");
    validateShadowBias(this.shadowNormalBias, "PointLight.shadowNormalBias");
  }
}

export class SpotLight extends Object3D {
  public readonly angle?: number;
  public readonly color: ColorValue;
  public readonly intensity: number;
  public readonly range?: number;
  public readonly shadowBias?: number;
  public readonly shadowNormalBias?: number;

  public constructor(options: ISpotLightOptions = {}) {
    super(options);
    this.angle = options.angle;
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    this.range = options.range;
    this.shadowBias = options.shadowBias;
    this.shadowNormalBias = options.shadowNormalBias;
    if (this.angle !== undefined) {
      assertFiniteNumber(this.angle, "TN_SDK_LIGHT_INVALID_ANGLE", "SpotLight.angle");
    }
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "SpotLight.intensity");
    if (this.range !== undefined) {
      assertFiniteNumber(this.range, "TN_SDK_LIGHT_INVALID_RANGE", "SpotLight.range");
    }
    validateShadowBias(this.shadowBias, "SpotLight.shadowBias");
    validateShadowBias(this.shadowNormalBias, "SpotLight.shadowNormalBias");
  }
}

function validateShadowBias(value: number | undefined, label: string): void {
  if (value !== undefined) {
    assertFiniteNumber(value, "TN_SDK_LIGHT_INVALID_SHADOW_BIAS", label);
  }
}

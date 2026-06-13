import { assertFiniteNumber } from "../errors.js";
import { validateColor, type ColorValue } from "../materials/MeshStandardMaterial.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

interface ILightOptions extends IObject3DOptions {
  color?: ColorValue;
  intensity?: number;
}

export class DirectionalLight extends Object3D {
  public readonly color: ColorValue;
  public readonly intensity: number;

  public constructor(options: ILightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "DirectionalLight.intensity");
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

  public constructor(options: ILightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "PointLight.intensity");
  }
}

export class SpotLight extends Object3D {
  public readonly color: ColorValue;
  public readonly intensity: number;

  public constructor(options: ILightOptions = {}) {
    super(options);
    this.color = validateColor(options.color ?? "#ffffff");
    this.intensity = options.intensity ?? 1;
    assertFiniteNumber(this.intensity, "TN_SDK_LIGHT_INVALID_INTENSITY", "SpotLight.intensity");
  }
}

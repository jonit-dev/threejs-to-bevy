import { assertPositiveNumber } from "../errors.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

export interface IPerspectiveCameraOptions extends IObject3DOptions {
  far: number;
  fovY: number;
  near: number;
}

export class PerspectiveCamera extends Object3D {
  public readonly far: number;
  public readonly fovY: number;
  public readonly near: number;

  public constructor(options: IPerspectiveCameraOptions) {
    super(options);
    assertPositiveNumber(options.fovY, "TN_SDK_CAMERA_INVALID_FOV", "PerspectiveCamera.fovY");
    assertPositiveNumber(options.near, "TN_SDK_CAMERA_INVALID_CLIP", "PerspectiveCamera.near");
    assertPositiveNumber(options.far, "TN_SDK_CAMERA_INVALID_CLIP", "PerspectiveCamera.far");
    this.far = options.far;
    this.fovY = options.fovY;
    this.near = options.near;
  }
}

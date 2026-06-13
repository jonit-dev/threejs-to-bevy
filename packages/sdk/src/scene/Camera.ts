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

export interface IOrthographicCameraOptions extends IObject3DOptions {
  far: number;
  near: number;
  size: number;
}

export class OrthographicCamera extends Object3D {
  public readonly far: number;
  public readonly near: number;
  public readonly size: number;

  public constructor(options: IOrthographicCameraOptions) {
    super(options);
    assertPositiveNumber(options.size, "TN_SDK_CAMERA_INVALID_SIZE", "OrthographicCamera.size");
    assertPositiveNumber(options.near, "TN_SDK_CAMERA_INVALID_CLIP", "OrthographicCamera.near");
    assertPositiveNumber(options.far, "TN_SDK_CAMERA_INVALID_CLIP", "OrthographicCamera.far");
    this.far = options.far;
    this.near = options.near;
    this.size = options.size;
  }
}

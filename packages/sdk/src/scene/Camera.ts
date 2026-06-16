import { assertFiniteNumber, assertPositiveNumber, SdkError } from "../errors.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

export type CameraViewport = readonly [number, number, number, number];

export interface ICameraClearOptions {
  color?: string;
  mode: "color" | "default" | "none";
}

export interface ICameraTargetBackbuffer {
  kind: "backbuffer";
}

export interface ICameraTargetTexture {
  asset: string;
  kind: "texture";
}

export interface ICameraTargetDepth {
  asset: string;
  kind: "depth";
}

export type CameraTarget = ICameraTargetBackbuffer | ICameraTargetDepth | ICameraTargetTexture;

export interface ICameraOutputOptions {
  format?: "jpeg" | "png";
  height?: number;
  mode?: "default" | "writeback";
  path?: string;
  width?: number;
}

export interface ICameraPortableProjectionOptions {
  handedness?: "left" | "right";
  kind: "matrix";
  matrix: readonly number[];
}

export interface ICameraFollowOptions {
  offset?: readonly [number, number, number];
  smoothing?: number;
  target: string;
}

export interface ICameraOrbitOptions {
  distance?: { max: number; min: number };
  smoothing?: number;
  target: string;
}

export interface ICameraPanOptions {
  axisX?: string;
  axisY?: string;
  speed?: number;
}

export interface ICameraZoomOptions {
  max: number;
  min: number;
  smoothing?: number;
}

export interface ICameraScreenShakeOptions {
  amplitude: number;
  decay?: number;
  frequency?: number;
}

export interface ICameraViewModelOptions {
  fovScale?: number;
  offset?: readonly [number, number, number];
}

export interface ICameraViewOptions {
  clear?: ICameraClearOptions;
  follow?: ICameraFollowOptions;
  layers?: readonly string[];
  orbit?: ICameraOrbitOptions;
  order?: number;
  output?: ICameraOutputOptions;
  pan?: ICameraPanOptions;
  projection?: ICameraPortableProjectionOptions;
  screenShake?: ICameraScreenShakeOptions;
  target?: CameraTarget;
  viewModel?: ICameraViewModelOptions;
  viewport?: CameraViewport;
  zoom?: ICameraZoomOptions;
}

export interface IPerspectiveCameraOptions extends IObject3DOptions, ICameraViewOptions {
  far: number;
  fovY: number;
  near: number;
}

export interface IOrthographicCameraOptions extends IObject3DOptions, ICameraViewOptions {
  far: number;
  near: number;
  size: number;
}

function validateCameraViewOptions(options: ICameraViewOptions, label: string): void {
  if (options.order !== undefined) {
    assertFiniteNumber(options.order, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.order`);
  }
  if (options.viewport !== undefined) {
    if (options.viewport.length !== 4) {
      throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.viewport must contain four normalized values.`);
    }
    for (const [index, value] of options.viewport.entries()) {
      assertFiniteNumber(value, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.viewport[${index}]`);
      if (value < 0 || value > 1) {
        throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.viewport values must stay within [0, 1].`);
      }
    }
  }
  if (options.layers !== undefined) {
    if (options.layers.length === 0) {
      throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.layers must include at least one layer name.`);
    }
    for (const [index, layer] of options.layers.entries()) {
      if (layer.trim().length === 0) {
        throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.layers[${index}] must be a non-empty string.`);
      }
    }
  }
  if (options.target !== undefined) {
    if (options.target.kind === "texture" || options.target.kind === "depth") {
      if (options.target.asset.trim().length === 0) {
        throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.target.asset must be a non-empty asset id.`);
      }
    }
  }
  if (options.follow !== undefined) {
    validateFollowHelper(options.follow, `${label}.follow`);
  }
  if (options.orbit !== undefined) {
    validateOrbitHelper(options.orbit, `${label}.orbit`);
  }
  if (options.pan !== undefined) {
    if (options.pan.speed !== undefined) {
      assertFiniteNumber(options.pan.speed, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.pan.speed`);
    }
  }
  if (options.zoom !== undefined) {
    validateZoomHelper(options.zoom, `${label}.zoom`);
  }
  if (options.screenShake !== undefined) {
    validateScreenShakeHelper(options.screenShake, `${label}.screenShake`);
  }
  if (options.viewModel !== undefined) {
    if (options.viewModel.fovScale !== undefined) {
      assertPositiveNumber(options.viewModel.fovScale, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.viewModel.fovScale`);
    }
    if (options.viewModel.offset !== undefined && options.viewModel.offset.length !== 3) {
      throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.viewModel.offset must contain three values.`);
    }
  }
}

function validateFollowHelper(helper: ICameraFollowOptions, label: string): void {
  if (helper.target.trim().length === 0) {
    throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.target must be a non-empty entity id.`);
  }
  if (helper.smoothing !== undefined) {
    assertFiniteNumber(helper.smoothing, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.smoothing`);
  }
  if (helper.offset !== undefined && helper.offset.length !== 3) {
    throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.offset must contain three values.`);
  }
}

function validateOrbitHelper(helper: ICameraOrbitOptions, label: string): void {
  if (helper.target.trim().length === 0) {
    throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.target must be a non-empty entity id.`);
  }
  if (helper.smoothing !== undefined) {
    assertFiniteNumber(helper.smoothing, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.smoothing`);
  }
  if (helper.distance !== undefined) {
    assertFiniteNumber(helper.distance.min, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.distance.min`);
    assertFiniteNumber(helper.distance.max, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.distance.max`);
    if (helper.distance.min > helper.distance.max) {
      throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.distance.min must be less than or equal to distance.max.`);
    }
  }
}

function validateZoomHelper(helper: ICameraZoomOptions, label: string): void {
  assertFiniteNumber(helper.min, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.min`);
  assertFiniteNumber(helper.max, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.max`);
  if (helper.min > helper.max) {
    throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.min must be less than or equal to max.`);
  }
  if (helper.smoothing !== undefined) {
    assertFiniteNumber(helper.smoothing, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.smoothing`);
  }
}

function validateScreenShakeHelper(helper: ICameraScreenShakeOptions, label: string): void {
  assertFiniteNumber(helper.amplitude, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.amplitude`);
  if (helper.amplitude < 0) {
    throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.amplitude must be greater than or equal to zero.`);
  }
  if (helper.frequency !== undefined) {
    assertPositiveNumber(helper.frequency, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.frequency`);
  }
  if (helper.decay !== undefined) {
    assertFiniteNumber(helper.decay, "TN_SDK_CAMERA_HELPER_INVALID", `${label}.decay`);
    if (helper.decay < 0) {
      throw new SdkError("TN_SDK_CAMERA_HELPER_INVALID", `${label}.decay must be greater than or equal to zero.`);
    }
  }
}

export class PerspectiveCamera extends Object3D {
  public readonly clear?: ICameraClearOptions;
  public readonly far: number;
  public readonly follow?: ICameraFollowOptions;
  public readonly fovY: number;
  public readonly layers?: readonly string[];
  public readonly near: number;
  public readonly orbit?: ICameraOrbitOptions;
  public readonly order?: number;
  public readonly output?: ICameraOutputOptions;
  public readonly pan?: ICameraPanOptions;
  public readonly projection?: ICameraPortableProjectionOptions;
  public readonly screenShake?: ICameraScreenShakeOptions;
  public readonly target?: CameraTarget;
  public readonly viewModel?: ICameraViewModelOptions;
  public readonly viewport?: CameraViewport;
  public readonly zoom?: ICameraZoomOptions;

  public constructor(options: IPerspectiveCameraOptions) {
    super(options);
    assertPositiveNumber(options.fovY, "TN_SDK_CAMERA_INVALID_FOV", "PerspectiveCamera.fovY");
    assertPositiveNumber(options.near, "TN_SDK_CAMERA_INVALID_CLIP", "PerspectiveCamera.near");
    assertPositiveNumber(options.far, "TN_SDK_CAMERA_INVALID_CLIP", "PerspectiveCamera.far");
    validateCameraViewOptions(options, "PerspectiveCamera");
    this.far = options.far;
    this.fovY = options.fovY;
    this.near = options.near;
    this.order = options.order;
    this.viewport = options.viewport;
    this.clear = options.clear;
    this.layers = options.layers;
    this.target = options.target;
    this.output = options.output;
    this.follow = options.follow;
    this.orbit = options.orbit;
    this.pan = options.pan;
    this.projection = options.projection;
    this.zoom = options.zoom;
    this.screenShake = options.screenShake;
    this.viewModel = options.viewModel;
  }
}

export class OrthographicCamera extends Object3D {
  public readonly clear?: ICameraClearOptions;
  public readonly far: number;
  public readonly follow?: ICameraFollowOptions;
  public readonly layers?: readonly string[];
  public readonly near: number;
  public readonly orbit?: ICameraOrbitOptions;
  public readonly order?: number;
  public readonly output?: ICameraOutputOptions;
  public readonly pan?: ICameraPanOptions;
  public readonly projection?: ICameraPortableProjectionOptions;
  public readonly screenShake?: ICameraScreenShakeOptions;
  public readonly size: number;
  public readonly target?: CameraTarget;
  public readonly viewModel?: ICameraViewModelOptions;
  public readonly viewport?: CameraViewport;
  public readonly zoom?: ICameraZoomOptions;

  public constructor(options: IOrthographicCameraOptions) {
    super(options);
    assertPositiveNumber(options.size, "TN_SDK_CAMERA_INVALID_SIZE", "OrthographicCamera.size");
    assertPositiveNumber(options.near, "TN_SDK_CAMERA_INVALID_CLIP", "OrthographicCamera.near");
    assertPositiveNumber(options.far, "TN_SDK_CAMERA_INVALID_CLIP", "OrthographicCamera.far");
    validateCameraViewOptions(options, "OrthographicCamera");
    this.far = options.far;
    this.near = options.near;
    this.size = options.size;
    this.order = options.order;
    this.viewport = options.viewport;
    this.clear = options.clear;
    this.layers = options.layers;
    this.target = options.target;
    this.output = options.output;
    this.follow = options.follow;
    this.orbit = options.orbit;
    this.pan = options.pan;
    this.projection = options.projection;
    this.zoom = options.zoom;
    this.screenShake = options.screenShake;
    this.viewModel = options.viewModel;
  }
}

import { assertPositiveNumber } from "../errors.js";
import { type Vector3Tuple } from "../math/Vector3.js";

export class BoxGeometry {
  public readonly kind = "box";
  public readonly size: Vector3Tuple;

  public constructor(options: { size?: Vector3Tuple } = {}) {
    const size = options.size ?? [1, 1, 1];
    size.forEach((value, index) => {
      assertPositiveNumber(value, "TN_SDK_GEOMETRY_INVALID_SIZE", `BoxGeometry.size[${index}]`);
    });
    this.size = [...size] as [number, number, number];
  }
}

export class SphereGeometry {
  public readonly kind = "sphere";
  public readonly radius: number;

  public constructor(options: { radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "SphereGeometry.radius");
  }
}

export class PlaneGeometry {
  public readonly kind = "plane";
  public readonly size: readonly [number, number];

  public constructor(options: { size?: readonly [number, number] } = {}) {
    const size = options.size ?? [1, 1];
    size.forEach((value, index) => {
      assertPositiveNumber(value, "TN_SDK_GEOMETRY_INVALID_SIZE", `PlaneGeometry.size[${index}]`);
    });
    this.size = [...size] as [number, number];
  }
}

export class CylinderGeometry {
  public readonly kind = "cylinder";
  public readonly height: number;
  public readonly radius: number;

  public constructor(options: { height?: number; radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    this.height = options.height ?? 1;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "CylinderGeometry.radius");
    assertPositiveNumber(this.height, "TN_SDK_GEOMETRY_INVALID_SIZE", "CylinderGeometry.height");
  }
}

export class CapsuleGeometry {
  public readonly kind = "capsule";
  public readonly height: number;
  public readonly radius: number;

  public constructor(options: { height?: number; radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    this.height = options.height ?? 2;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "CapsuleGeometry.radius");
    assertPositiveNumber(this.height, "TN_SDK_GEOMETRY_INVALID_SIZE", "CapsuleGeometry.height");
  }
}

export type SupportedGeometry = BoxGeometry | CapsuleGeometry | CylinderGeometry | PlaneGeometry | SphereGeometry;

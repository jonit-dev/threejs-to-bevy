import { assertFiniteNumber } from "../errors.js";

export type Vector3Tuple = readonly [number, number, number];

export class Vector3 {
  public constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {
    this.validate();
  }

  public set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.validate();
    return this;
  }

  public toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  public clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  private validate(): void {
    assertFiniteNumber(this.x, "TN_SDK_VECTOR_NON_FINITE", "Vector3.x");
    assertFiniteNumber(this.y, "TN_SDK_VECTOR_NON_FINITE", "Vector3.y");
    assertFiniteNumber(this.z, "TN_SDK_VECTOR_NON_FINITE", "Vector3.z");
  }
}

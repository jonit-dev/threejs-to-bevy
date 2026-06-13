import { Object3D, type IObject3DOptions } from "./Object3D.js";
import { type MeshStandardMaterial } from "../materials/MeshStandardMaterial.js";
import { type SupportedGeometry } from "../geometry/primitives.js";

export interface IMeshOptions extends IObject3DOptions {
  geometry: SupportedGeometry;
  material: MeshStandardMaterial;
}

export class Mesh extends Object3D {
  public readonly geometry: SupportedGeometry;
  public readonly material: MeshStandardMaterial;

  public constructor(options: IMeshOptions) {
    super(options);
    this.geometry = options.geometry;
    this.material = options.material;
  }
}

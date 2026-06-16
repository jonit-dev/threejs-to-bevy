import { Object3D, type IObject3DOptions } from "./Object3D.js";
import { type MeshStandardMaterial } from "../materials/MeshStandardMaterial.js";
import { type SupportedGeometry } from "../geometry/primitives.js";

export interface IMeshOptions extends IObject3DOptions {
  castShadow?: boolean;
  geometry: SupportedGeometry;
  layers?: readonly string[];
  material: MeshStandardMaterial;
  receiveShadow?: boolean;
}

export class Mesh extends Object3D {
  public readonly castShadow?: boolean;
  public readonly geometry: SupportedGeometry;
  public readonly layers?: readonly string[];
  public readonly material: MeshStandardMaterial;
  public readonly receiveShadow?: boolean;

  public constructor(options: IMeshOptions) {
    super(options);
    this.castShadow = options.castShadow;
    this.geometry = options.geometry;
    this.layers = options.layers;
    this.material = options.material;
    this.receiveShadow = options.receiveShadow;
  }
}

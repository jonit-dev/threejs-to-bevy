import { Object3D, type IObject3DOptions } from "./Object3D.js";

export type IGroupOptions = IObject3DOptions;

export class Group extends Object3D {
  public constructor(options: IGroupOptions = {}) {
    super(options);
  }
}

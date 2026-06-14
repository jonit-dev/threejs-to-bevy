import { SdkError } from "../errors.js";
import { Vector3 } from "../math/Vector3.js";
import type { IAssetReference } from "../assets.js";
import type { IPhysicsDeclaration } from "../physics.js";

export interface IObject3DOptions {
  assetRefs?: readonly IAssetReference[];
  id?: string;
  name?: string;
  physics?: IPhysicsDeclaration;
  visible?: boolean;
}

export class Object3D {
  readonly #children: Object3D[] = [];

  public readonly id?: string;
  public readonly assetRefs: readonly IAssetReference[];
  public name: string;
  public parent: Object3D | undefined;
  public readonly physics?: IPhysicsDeclaration;
  public readonly position = new Vector3();
  public readonly rotation = new Vector3();
  public readonly scale = new Vector3(1, 1, 1);
  public visible: boolean;

  public constructor(options: IObject3DOptions = {}) {
    this.assetRefs = [...(options.assetRefs ?? [])].sort((left, right) => left.id.localeCompare(right.id));
    this.id = options.id;
    this.name = options.name ?? options.id ?? "";
    this.physics = options.physics;
    this.visible = options.visible ?? true;
  }

  public get children(): readonly Object3D[] {
    return [...this.#children];
  }

  public add(child: Object3D): this {
    if (child === this) {
      throw new SdkError("TN_SDK_HIERARCHY_CYCLE", "An object cannot be added as a child of itself.");
    }

    if (this.hasAncestor(child)) {
      throw new SdkError("TN_SDK_HIERARCHY_CYCLE", "Adding this child would create a hierarchy cycle.");
    }

    if (child.parent === this) {
      return this;
    }

    child.parent?.remove(child);
    child.parent = this;
    this.#children.push(child);
    return this;
  }

  public remove(child: Object3D): this {
    const index = this.#children.indexOf(child);
    if (index !== -1) {
      this.#children.splice(index, 1);
      child.parent = undefined;
    }
    return this;
  }

  public traverse(visitor: (object: Object3D) => void): void {
    visitor(this);
    for (const child of this.#children) {
      child.traverse(visitor);
    }
  }

  private hasAncestor(candidate: Object3D): boolean {
    let current: Object3D | undefined = this;
    while (current !== undefined) {
      if (current === candidate) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }
}

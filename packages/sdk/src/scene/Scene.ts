import { SdkError } from "../errors.js";
import { OrthographicCamera, PerspectiveCamera } from "./Camera.js";
import { Object3D, type IObject3DOptions } from "./Object3D.js";

type SceneCamera = OrthographicCamera | PerspectiveCamera;

export class Scene extends Object3D {
  public activeCamera: SceneCamera | undefined;

  public constructor(options: IObject3DOptions = {}) {
    super(options);
  }

  public setActiveCamera(camera: SceneCamera): this {
    if (!this.contains(camera)) {
      throw new SdkError("TN_SDK_CAMERA_NOT_IN_SCENE", "Active camera must be part of the scene hierarchy.");
    }
    this.activeCamera = camera;
    return this;
  }

  private contains(target: Object3D): boolean {
    let found = false;
    this.traverse((object) => {
      if (object === target) {
        found = true;
      }
    });
    return found;
  }
}

import type {
  AuthoringClientTransaction,
  IAuthoringClientCommitOptions,
  IAuthoringClientDryRunResult,
  IAuthoringClientTransactionResult,
} from "./index.js";

export type Vec3 = readonly [number, number, number];

export interface ISceneAddPrefabOptions {
  asset?: string;
  color?: string;
  primitive?: string;
}

export interface ISceneAddEntityOptions {
  prefabId?: string;
}

export interface ISceneTransformOptions {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

export interface ISceneCameraOptions {
  far?: number;
  fovY?: number;
  mode?: string;
  near?: number;
  size?: number;
  targetId?: string;
}

export interface ISceneLightOptions {
  angle?: number;
  color?: string;
  intensity?: number;
  kind?: string;
  range?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
}

export interface ISceneMeshRendererOptions {
  castShadow?: boolean;
  material: string;
  mesh: string;
  receiveShadow?: boolean;
  visible?: boolean;
}

export interface ISceneRigidBodyOptions {
  damping?: number;
  gravityScale?: number;
  kind?: string;
  mass?: number;
}

export interface ISceneColliderOptions {
  height?: number;
  kind?: string;
  radius?: number;
  size?: Vec3;
  trigger?: boolean;
}

export interface ISceneCharacterControllerOptions {
  blocking?: boolean;
  grounding?: string;
  moveXAxis?: string;
  moveZAxis?: string;
  slopeLimit?: number;
  speed?: number;
  stepOffset?: number;
}

export interface ISceneScriptOptions {
  exportName: string;
  modulePath: string;
}

export interface ISceneResourceOptions {
  path?: string;
  value?: unknown;
}

export class SceneBuilder {
  readonly sceneId: string;
  readonly transaction: AuthoringClientTransaction;

  constructor(transaction: AuthoringClientTransaction, sceneId: string) {
    this.transaction = transaction;
    this.sceneId = sceneId;
  }

  addPrefab(prefabId: string, options: ISceneAddPrefabOptions = {}): this {
    this.transaction.operation("scene.add_prefab", withScene(this.sceneId, { prefabId, ...defined(options) }));
    return this;
  }

  addEntity(entityId: string, options: ISceneAddEntityOptions = {}): this {
    this.transaction.operation("scene.add_entity", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  transform(entityId: string, options: ISceneTransformOptions): this {
    this.transaction.operation("scene.set_transform", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  camera(entityId: string, options: ISceneCameraOptions = {}): this {
    this.transaction.operation("scene.set_camera_component", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  light(entityId: string, options: ISceneLightOptions = {}): this {
    this.transaction.operation("scene.set_light", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  meshRenderer(entityId: string, options: ISceneMeshRendererOptions): this {
    this.transaction.operation("scene.set_mesh_renderer", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  rigidBody(entityId: string, options: ISceneRigidBodyOptions = {}): this {
    this.transaction.operation("scene.set_rigid_body", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  collider(entityId: string, options: ISceneColliderOptions = {}): this {
    this.transaction.operation("scene.set_collider", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  characterController(entityId: string, options: ISceneCharacterControllerOptions = {}): this {
    this.transaction.operation("scene.set_character_controller", withScene(this.sceneId, { entityId, ...defined(options) }));
    return this;
  }

  script(systemId: string, options: ISceneScriptOptions): this {
    this.transaction.operation("scene.attach_script", withScene(this.sceneId, { systemId, ...defined(options) }));
    return this;
  }

  resource(resourceId: string, options: ISceneResourceOptions = {}): this {
    this.transaction.operation("scene.add_resource", withScene(this.sceneId, { resourceId, ...defined(options) }));
    return this;
  }

  uiBinding(uiNodeId: string, resourcePath: string): this {
    this.transaction.operation("scene.bind_ui", withScene(this.sceneId, { resourcePath, uiNodeId }));
    return this;
  }

  dryRun(): IAuthoringClientDryRunResult {
    return this.transaction.dryRun();
  }

  async commit(options: IAuthoringClientCommitOptions = {}): Promise<IAuthoringClientTransactionResult> {
    return this.transaction.commit(options);
  }
}

function withScene(sceneId: string, args: Record<string, unknown>): Record<string, unknown> {
  return { sceneId, ...args };
}

function defined(input: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

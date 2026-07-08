export interface IGameSpecIds {
  entity: string;
  input: string;
  material: string;
  prefab: string;
  resource: string;
  scene: string;
  ui: string;
}

type IdOf<TIds extends Partial<IGameSpecIds>, TKind extends keyof IGameSpecIds> =
  TIds[TKind] extends string ? TIds[TKind] : string;

export type ITypedComponentWrite =
  | "Animation"
  | "CharacterController"
  | "Collider"
  | "MeshRenderer"
  | "RigidBody"
  | "Transform"
  | "Visibility";

export interface ITypedGameSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  input?: ITypedInputSpec<TIds>;
  materials?: ITypedMaterialSpec<TIds>[];
  scenes: ITypedSceneSpec<TIds>[];
}

export interface ITypedInputSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  actions?: Array<{
    bindings?: string[];
    id: IdOf<TIds, "input">;
  }>;
  axes?: Array<{
    id: IdOf<TIds, "input">;
    negative?: string[];
    positive?: string[];
    value?: string;
  }>;
  id?: string;
}

export interface ITypedMaterialSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  color?: string;
  id: IdOf<TIds, "material">;
  metalness?: number;
  opacity?: number;
  roughness?: number;
}

export interface ITypedSceneSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  entities?: ITypedEntitySpec<TIds>[];
  id: IdOf<TIds, "scene">;
  initial?: boolean;
  kind?: "credits" | "cutscene" | "level" | "loading" | "menu" | "overlay" | "system";
  prefabs?: ITypedPrefabSpec<TIds>[];
  resources?: ITypedResourceSpec<TIds>[];
  systems?: ITypedSystemSpec<TIds>[];
  ui?: ITypedUiSpec<TIds>;
}

export interface ITypedEntitySpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  components?: ITypedEntityComponents<TIds> & Record<string, unknown>;
  id: IdOf<TIds, "entity">;
  prefab?: IdOf<TIds, "prefab">;
  transform?: ITypedTransformSpec;
}

export interface ITypedEntityComponents<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  camera?: {
    far?: number;
    fovY?: number;
    mode: "orthographic" | "perspective" | "third-person-follow";
    near?: number;
    size?: number;
    target?: IdOf<TIds, "entity">;
  };
  CharacterController?: {
    blocking?: boolean;
    grounding?: "none" | "raycast";
    moveXAxis?: IdOf<TIds, "input">;
    moveZAxis?: IdOf<TIds, "input">;
    speed?: number;
  };
  Collider?: {
    center?: readonly [number, number, number];
    height?: number;
    kind: "box" | "capsule" | "mesh" | "sphere";
    radius?: number;
    size?: readonly [number, number, number];
  } & Record<string, unknown>;
  MeshRenderer?: {
    material?: IdOf<TIds, "material">;
    mesh?: string;
    visible?: boolean;
  };
  RigidBody?: {
    kind: "dynamic" | "kinematic" | "static";
  } & Record<string, unknown>;
}

export interface ITypedPrefabSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  asset?: string;
  color?: string;
  id: IdOf<TIds, "prefab">;
  primitive?: "box" | "capsule" | "cone" | "cylinder" | "plane" | "sphere" | "torus";
}

export interface ITypedTransformSpec {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

export interface ITypedResourceSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  id: IdOf<TIds, "resource">;
  path?: string;
  value?: unknown;
}

export interface ITypedSystemSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  id: string;
  queries?: Array<{
    with?: IdOf<TIds, "entity">[];
    without?: IdOf<TIds, "entity">[];
  }>;
  reads?: ITypedComponentWrite[];
  resourceReads?: IdOf<TIds, "resource">[];
  resourceWrites?: IdOf<TIds, "resource">[];
  schedule?: string;
  script?: {
    export: string;
    module: string;
  };
  writes?: ITypedComponentWrite[];
}

export interface ITypedUiSpec<TIds extends Partial<IGameSpecIds> = IGameSpecIds> {
  bindings?: Array<{
    fields?: string[];
    format?: string;
    node: IdOf<TIds, "ui">;
    resource: IdOf<TIds, "resource">;
  }>;
  nodes?: Array<{
    id: IdOf<TIds, "ui">;
    layout?: Record<string, unknown>;
    text?: string;
    type?: "bar" | "button" | "column" | "component" | "image" | "row" | "slider" | "stack" | "text" | "textInput";
  }>;
}

export function defineTypedGameSpec<const TIds extends Partial<IGameSpecIds>>(spec: ITypedGameSpec<TIds>): ITypedGameSpec<TIds> {
  return spec;
}

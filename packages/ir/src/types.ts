export type SchemaVersion = "0.1.0";
export type BundleSchema = "threenative.bundle";
export type WorldSchema = "threenative.world";
export type MaterialsSchema = "threenative.materials";
export type AssetsSchema = "threenative.assets";
export type AudioSchema = "threenative.audio";
export type TargetProfileSchema = "threenative.target-profile";
export type RuntimeConfigSchema = "threenative.runtime-config";
export type UiSchema = "threenative.ui";

export interface IBundleManifest {
  schema: BundleSchema;
  version: SchemaVersion;
  name: string;
  requiredCapabilities: Record<string, string[]>;
  entry: {
    world: "world.ir.json";
    animations?: string;
    audio?: string;
    scripts?: string;
    systems?: string;
    ui?: string;
  };
  files: {
    assets: "assets.manifest.json";
    materials: "materials.ir.json";
    targetProfile: "target.profile.json";
    animations?: string;
    componentSchemas?: "schemas/components.schema.json";
    eventSchemas?: "schemas/events.schema.json";
    input?: string;
    resourceSchemas?: "schemas/resources.schema.json";
    runtimeConfig?: "runtime.config.json";
    scripts?: "scripts.bundle.js";
  };
}

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface ITransformComponent {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

export interface ICameraComponent {
  far: number;
  fovY?: number;
  kind: "perspective" | "orthographic";
  near: number;
  priority?: number;
  size?: number;
}

export interface IMeshRendererComponent {
  material: string;
  mesh: string;
  visible?: boolean;
}

export interface ILightComponent {
  color: string | readonly [number, number, number] | readonly [number, number, number, number];
  intensity: number;
  kind: "ambient" | "directional" | "point" | "spot";
}

export interface IVisibilityComponent {
  visible: boolean;
}

export interface IRigidBodyComponent {
  kind: "dynamic" | "kinematic" | "static";
  mass?: number;
  velocity?: Vec3;
}

export interface IColliderComponent {
  height?: number;
  kind: "box" | "capsule" | "cylinder" | "mesh" | "sphere";
  radius?: number;
  size?: Vec3;
  trigger?: boolean;
}

export interface IWorldEntity {
  components: Record<string, unknown> & {
    Camera?: ICameraComponent;
    Light?: ILightComponent;
    MeshRenderer?: IMeshRendererComponent;
    Collider?: IColliderComponent;
    RigidBody?: IRigidBodyComponent;
    Transform?: ITransformComponent;
    Visibility?: IVisibilityComponent;
  };
  id: string;
  tags?: string[];
}

export interface IWorldIr {
  schema: WorldSchema;
  version: SchemaVersion;
  entities: IWorldEntity[];
  events?: Record<string, unknown>;
  prefabs?: unknown[];
  resources?: Record<string, unknown>;
}

export type IrSchemaFieldKind =
  | "asset"
  | "boolean"
  | "color"
  | "entity"
  | "integer"
  | "number"
  | "quat"
  | "string"
  | "vec2"
  | "vec3"
  | "vec4";

export interface IIrSchemaField {
  default?: unknown;
  kind: IrSchemaFieldKind;
  required?: boolean;
}

export interface IIrNamedSchema {
  fields: Record<string, IIrSchemaField>;
}

export interface IIrSchemaFile {
  schema: "threenative.component-schemas" | "threenative.event-schemas" | "threenative.resource-schemas";
  version: SchemaVersion;
  schemas: Record<string, IIrNamedSchema>;
}

export interface IMaterialIr {
  baseColorTexture?: string;
  color: string | readonly [number, number, number] | readonly [number, number, number, number];
  emissiveTexture?: string;
  id: string;
  kind: "standard";
  metalness?: number;
  metallicRoughnessTexture?: string;
  normalTexture?: string;
  occlusionTexture?: string;
  roughness?: number;
}

export interface IMaterialsIr {
  schema: MaterialsSchema;
  version: SchemaVersion;
  materials: IMaterialIr[];
}

export type IAssetIr =
  | {
      format: "generated";
      id: string;
      kind: "mesh";
      primitive: "box" | "capsule" | "cylinder" | "plane" | "sphere";
      size?: readonly number[];
    }
  | {
      format: "glb" | "gltf";
      id: string;
      kind: "model";
      path: string;
    }
  | {
      format: "jpeg" | "png";
      id: string;
      kind: "texture";
      path: string;
    }
  | {
      format: "mp3" | "ogg" | "wav";
      id: string;
      kind: "audio";
      path: string;
    };

export interface IAssetsManifest {
  schema: AssetsSchema;
  version: SchemaVersion;
  assets: IAssetIr[];
}

export interface IAudioOneShotIr {
  asset: string;
  event: string;
  id: string;
}

export interface IAudioMusicIr {
  asset: string;
  autoplay?: boolean;
  id: string;
  loop: boolean;
}

export interface IAudioIr {
  schema: AudioSchema;
  version: SchemaVersion;
  music: IAudioMusicIr[];
  oneShots: IAudioOneShotIr[];
}

export interface ITargetProfile {
  schema: TargetProfileSchema;
  version: SchemaVersion;
  targets: Array<"web" | "desktop">;
}

export type IUiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };

export interface IUiNodeIr {
  action?: string;
  binding?: IUiBinding;
  children?: IUiNodeIr[];
  focusable?: boolean;
  id: string;
  kind: "bar" | "button" | "column" | "row" | "stack" | "text" | "touchControl";
  label?: string;
  max?: number;
  text?: string;
  value?: number;
}

export interface IUiIr {
  schema: UiSchema;
  version: SchemaVersion;
  root: IUiNodeIr;
}

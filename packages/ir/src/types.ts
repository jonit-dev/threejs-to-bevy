export type SchemaVersion = "0.1.0";
export type BundleSchema = "threenative.bundle";
export type WorldSchema = "threenative.world";
export type MaterialsSchema = "threenative.materials";
export type AssetsSchema = "threenative.assets";
export type TargetProfileSchema = "threenative.target-profile";
export type RuntimeConfigSchema = "threenative.runtime-config";

export interface IBundleManifest {
  schema: BundleSchema;
  version: SchemaVersion;
  name: string;
  requiredCapabilities: Record<string, string[]>;
  entry: {
    world: "world.ir.json";
    animations?: string;
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

export interface IWorldEntity {
  components: Record<string, unknown> & {
    Camera?: ICameraComponent;
    Light?: ILightComponent;
    MeshRenderer?: IMeshRendererComponent;
    Transform?: ITransformComponent;
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
  color: string | readonly [number, number, number] | readonly [number, number, number, number];
  id: string;
  kind: "standard";
  metalness?: number;
  roughness?: number;
}

export interface IMaterialsIr {
  schema: MaterialsSchema;
  version: SchemaVersion;
  materials: IMaterialIr[];
}

export interface IAssetIr {
  format: "generated";
  id: string;
  kind: "mesh";
  primitive: "box" | "sphere" | "plane";
  size?: readonly number[];
}

export interface IAssetsManifest {
  schema: AssetsSchema;
  version: SchemaVersion;
  assets: IAssetIr[];
}

export interface ITargetProfile {
  schema: TargetProfileSchema;
  version: SchemaVersion;
  targets: Array<"web" | "desktop">;
}

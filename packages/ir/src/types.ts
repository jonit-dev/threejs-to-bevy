export type SchemaVersion = "0.1.0";
export type BundleSchema = "threenative.bundle";
export type WorldSchema = "threenative.world";
export type MaterialsSchema = "threenative.materials";
export type AssetsSchema = "threenative.assets";
export type AudioSchema = "threenative.audio";
export type TargetProfileSchema = "threenative.target-profile";
export type RuntimeConfigSchema = "threenative.runtime-config";
export type UiSchema = "threenative.ui";
export type EnvironmentSceneSchema = "threenative.environment-scene";

export interface IBundleManifest {
  schema: BundleSchema;
  version: SchemaVersion;
  name: string;
  requiredCapabilities: Record<string, string[]>;
  entry: {
    world: "world.ir.json";
    animations?: string;
    audio?: string;
    environmentScene?: string;
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
  angle?: number;
  color: string | readonly [number, number, number] | readonly [number, number, number, number];
  intensity: number;
  kind: "ambient" | "directional" | "point" | "spot";
  range?: number;
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
      format: "bin";
      id: string;
      kind: "buffer";
      path: string;
    }
  | {
      bounds?: {
        max: Vec3;
        min: Vec3;
      };
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
  budgets?: {
    maxAssetBytes?: number;
    maxBundleBytes?: number;
    supportedModelFormats?: Array<"glb" | "gltf">;
    supportedTextureFormats?: Array<"jpeg" | "png">;
  };
  performance?: IPerformanceProfile;
}

export interface IPerformanceThreshold {
  max: number;
  warn?: number;
}

export interface IPerformanceProfile {
  averageFrameMs: IPerformanceThreshold;
  drawCalls: IPerformanceThreshold;
  instancedGroups: IPerformanceThreshold;
  instances: IPerformanceThreshold;
  loadMs: IPerformanceThreshold;
  p95FrameMs: IPerformanceThreshold;
  requiredTarget: "web";
  textureBytes: IPerformanceThreshold;
  triangles: IPerformanceThreshold;
  uninstancedRepeatedProps: IPerformanceThreshold;
  worstFrameMs: IPerformanceThreshold;
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

export interface IEnvironmentSourceAssetIr {
  asset: string;
  category: "flower" | "grass" | "mushroom" | "pebble" | "rock" | "terrain" | "tree" | "vegetation";
  id: string;
}

export interface IEnvironmentInstanceIr {
  collisionMode?: "blocking" | "none" | "walkable";
  id: string;
  kind?: "hero" | "manual" | "scatter";
  renderGroup?: string;
  sourceAsset: string;
  position: Vec3;
  rotation?: Quat;
  scale?: Vec3;
  scatterExclusionRadius?: number;
  scatterSource?: string;
  tags?: string[];
}

export interface IEnvironmentTerrainIr {
  bounds: {
    max: Vec3;
    min: Vec3;
  };
  controlPoints?: Vec3[];
  heightMode: "controlPoints" | "flat";
  id: string;
  material?: string;
}

export interface IEnvironmentPathIr {
  clearingRadius?: number;
  edgeFalloff?: number;
  id: string;
  material?: string;
  points: Vec3[];
  width: number;
}

export interface IEnvironmentExclusionZoneIr {
  bounds?: {
    max: Vec3;
    min: Vec3;
  };
  id: string;
  radius?: number;
  tags?: string[];
}

export interface IEnvironmentScatterSpecIr {
  assetIds: string[];
  bounds: {
    max: Vec3;
    min: Vec3;
  };
  collisionMode?: "blocking" | "none" | "walkable";
  count?: number;
  density?: number;
  exclusionZoneIds?: string[];
  id: string;
  maxScale: number;
  minScale: number;
  rotation?: {
    maxYaw: number;
    minYaw: number;
  };
  seed: number;
  slopeLimit?: number;
  tags?: string[];
}

export interface IEnvironmentCameraBookmarkIr {
  expectedTags?: string[];
  id: string;
  notes?: string;
  pitch: number;
  position: Vec3;
  yaw: number;
}

export interface IFirstPersonControllerIr {
  acceleration: number;
  camera: string;
  collisionProfile?: string;
  height: number;
  input: {
    backward: string;
    forward: string;
    lookX: string;
    lookY: string;
    left: string;
    right: string;
    sprint?: string;
  };
  maxSpeed: number;
  pitch: {
    max: number;
    min: number;
  };
  pointerLock: "required" | "optional";
  sensitivity: number;
}

export interface IWalkabilityIr {
  blockers: Array<{
    collider: {
      radius?: number;
      size?: Vec3;
      type: "box" | "cylinder";
    };
    id: string;
    instance: string;
  }>;
  movementProfile: {
    boundary: "block";
    eyeHeight: number;
    height: number;
    maxSlope?: number;
    maxStep: number;
    radius: number;
  };
  regions: Array<{
    id: string;
    points: Array<readonly [number, number]>;
  }>;
  terrain: {
    height: number;
    surface: string;
  };
}

export interface IAtmosphereProfileIr {
  active: boolean;
  ambient: {
    color: string | readonly [number, number, number];
    intensity: number;
    mode: "constant" | "hemisphere";
  };
  colorManagement: {
    exposure: number;
    outputColorSpace: "srgb";
    textureColorSpace: "srgb";
    toneMapping: "aces" | "linear" | "none";
  };
  fog?: {
    color: string | readonly [number, number, number];
    density?: number;
    enabled: boolean;
    far?: number;
    mode: "exponential" | "linear";
    near?: number;
  };
  id: string;
  shadows: {
    bias: number;
    cascadeCount: 1 | 2 | 4;
    enabled: boolean;
    mapSize: 512 | 1024 | 2048;
    maxDistance: number;
    normalBias: number;
    receiverPolicy: "terrain-and-path";
  };
  sky: {
    color: string | readonly [number, number, number];
    horizonColor?: string | readonly [number, number, number];
  };
  sun: {
    castsShadow: boolean;
    color: string | readonly [number, number, number];
    direction: Vec3;
    id: string;
    intensity: number;
  };
}

export interface IEnvironmentSceneIr {
  schema: EnvironmentSceneSchema;
  version: SchemaVersion;
  atmosphere?: IAtmosphereProfileIr;
  bookmarks?: IEnvironmentCameraBookmarkIr[];
  controller?: IFirstPersonControllerIr;
  exclusionZones?: IEnvironmentExclusionZoneIr[];
  referenceImage?: string;
  scatter?: IEnvironmentScatterSpecIr[];
  sourceAssets: IEnvironmentSourceAssetIr[];
  instances: IEnvironmentInstanceIr[];
  path: IEnvironmentPathIr;
  terrain?: IEnvironmentTerrainIr;
  walkability?: IWalkabilityIr;
}

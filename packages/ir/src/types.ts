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
export type OverlaysSchema = "threenative.overlays";

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
    overlays?: string;
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
export type Vec2 = readonly [number, number];
export type TextureWrapMode = "clampToEdge" | "mirroredRepeat" | "repeat";
export type TextureMinFilter =
  | "linear"
  | "linearMipmapLinear"
  | "linearMipmapNearest"
  | "nearest"
  | "nearestMipmapLinear"
  | "nearestMipmapNearest";
export type TextureMagFilter = "linear" | "nearest";

export interface ITransformComponent {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

export type ICameraViewport = readonly [number, number, number, number];

export interface ICameraClear {
  color?: string | readonly [number, number, number] | readonly [number, number, number, number];
  mode: "color" | "default" | "none";
}

export interface ICameraTargetBackbuffer {
  kind: "backbuffer";
}

export interface ICameraTargetTexture {
  asset: string;
  kind: "texture";
}

export interface ICameraTargetDepth {
  asset: string;
  kind: "depth";
  sample?: boolean;
}

export type ICameraTarget = ICameraTargetBackbuffer | ICameraTargetDepth | ICameraTargetTexture;

export interface ICameraOutputConfig {
  format?: "jpeg" | "png";
  height?: number;
  mode?: "default" | "writeback";
  path?: string;
  width?: number;
}

export interface ICameraFollowHelper {
  offset?: Vec3;
  smoothing?: number;
  target: string;
}

export interface ICameraOrbitHelper {
  distance?: number;
  maxDistance?: number;
  minDistance?: number;
  smoothing?: number;
  target: string;
}

export interface ICameraPanHelper {
  axisX?: string;
  axisY?: string;
  smoothing?: number;
}

export interface ICameraZoomHelper {
  axis?: string;
  max?: number;
  min?: number;
  smoothing?: number;
}

export interface ICameraScreenShakeHelper {
  amplitude: number;
  decay?: number;
  frequency?: number;
}

export interface ICameraViewModelHelper {
  fovScale?: number;
  offset?: Vec3;
}

export interface ICameraPortableProjection {
  handedness?: "left" | "right";
  kind: "matrix";
  matrix: readonly number[];
}

export interface ICameraBackendProjection {
  backend: string;
  kind: "backend";
  payload?: unknown;
}

export type ICameraProjection = ICameraBackendProjection | ICameraPortableProjection;

export interface ICameraComponent {
  clear?: ICameraClear;
  far: number;
  follow?: ICameraFollowHelper;
  fovY?: number;
  kind: "perspective" | "orthographic";
  layers?: readonly string[];
  near: number;
  orbit?: ICameraOrbitHelper;
  order?: number;
  output?: ICameraOutputConfig;
  pan?: ICameraPanHelper;
  priority?: number;
  projection?: ICameraProjection;
  screenShake?: ICameraScreenShakeHelper;
  size?: number;
  target?: ICameraTarget;
  viewModel?: ICameraViewModelHelper;
  viewport?: ICameraViewport;
  zoom?: ICameraZoomHelper;
}

export interface IRenderLayersComponent {
  layers: readonly string[];
}

export interface IActiveCamerasResource {
  cameras: readonly { entity: string; order?: number }[];
}

export interface IActiveCameraResource {
  entity: string;
}

export interface IMeshRendererComponent {
  castShadow?: boolean;
  material: string;
  mesh: string;
  receiveShadow?: boolean;
  visible?: boolean;
}

export interface ILightComponent {
  angle?: number;
  color: string | readonly [number, number, number] | readonly [number, number, number, number];
  intensity: number;
  kind: "ambient" | "directional" | "point" | "spot";
  range?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
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
  layer?: string;
  mask?: readonly string[];
  radius?: number;
  size?: Vec3;
  slope?: {
    axis: "x" | "z";
    direction: -1 | 1;
    rise: number;
    run: number;
  };
  trigger?: boolean;
}

export interface ICharacterControllerComponent {
  blocking: boolean;
  grounding: "none" | "raycast";
  interactAction?: string;
  moveXAxis: string;
  moveZAxis: string;
  slopeLimit?: number;
  speed: number;
  stepOffset?: number;
}

export interface IWorldEntity {
  components: Record<string, unknown> & {
    Camera?: ICameraComponent;
    CharacterController?: ICharacterControllerComponent;
    Light?: ILightComponent;
    MeshRenderer?: IMeshRendererComponent;
    Collider?: IColliderComponent;
    RenderLayers?: IRenderLayersComponent;
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

export type MaterialBlendMode = "additive" | "multiply" | "normal" | "premultipliedAlpha";
export type MaterialKind = "extended" | "standard";
export type ExtendedMaterialPreset = "foliage" | "unlitMasked";

export interface IMaterialExtensionIr {
  doubleSided?: boolean;
  preset: ExtendedMaterialPreset;
}

export interface IMaterialIr {
  alphaCutoff?: number;
  alphaMode?: "blend" | "mask" | "opaque";
  baseColorTexture?: string;
  blendMode?: MaterialBlendMode;
  clearcoat?: number;
  clearcoatRoughness?: number;
  clearcoatRoughnessTexture?: string;
  clearcoatTexture?: string;
  color: string | readonly [number, number, number] | readonly [number, number, number, number];
  depthTest?: boolean;
  depthWrite?: boolean;
  emissive?: string | readonly [number, number, number] | readonly [number, number, number, number];
  emissiveIntensity?: number;
  emissiveTexture?: string;
  extension?: IMaterialExtensionIr;
  id: string;
  kind: MaterialKind;
  metalness?: number;
  metallicRoughnessTexture?: string;
  normalTexture?: string;
  occlusionTexture?: string;
  opacity?: number;
  renderOrder?: number;
  roughness?: number;
  specularIntensity?: number;
  specularTexture?: string;
  transmission?: number;
  transmissionTexture?: string;
}

export interface IMaterialsIr {
  schema: MaterialsSchema;
  version: SchemaVersion;
  materials: IMaterialIr[];
}

export interface IMeshAttributeIr {
  itemSize: 1 | 2 | 3 | 4;
  name: "color" | "normal" | "position" | "uv" | "uv1" | `custom:${string}`;
  values: readonly number[];
}

export interface IMeshBinaryAttributeIr {
  count: number;
  format: "float32x1" | "float32x2" | "float32x3" | "float32x4";
  itemSize: 1 | 2 | 3 | 4;
  name: "color" | "normal" | "position" | "uv" | "uv1" | `custom:${string}`;
  path: string;
}

export interface IMeshBinaryIndicesIr {
  count: number;
  format: "uint16" | "uint32";
  path: string;
}

export interface IGeneratedMeshMetadataIr {
  helper?: string;
  id: string;
  seed?: number;
  source: "BufferGeometrySnapshot" | "MeshBuilder";
}

export interface IGeneratedMeshBudgetIr {
  classification: "doodad" | "hero-prop" | "standard-prop";
  limit: number;
  vertexCount: number;
}

export type IAssetIr =
  | {
      attributes?: readonly IMeshAttributeIr[];
      binaryAttributes?: readonly IMeshBinaryAttributeIr[];
      binaryIndices?: IMeshBinaryIndicesIr;
      bounds?: {
        max: Vec3;
        min: Vec3;
      };
      budget?: IGeneratedMeshBudgetIr;
      format: "generated";
      generation?: IGeneratedMeshMetadataIr;
      id: string;
      indices?: readonly number[];
      kind: "mesh";
      primitive:
        | "annulus"
        | "box"
        | "capsule"
        | "circle"
        | "cone"
        | "conicalFrustum"
        | "custom"
        | "cylinder"
        | "extrudedRectangle"
        | "plane"
        | "regularPolygon"
        | "sphere"
        | "torus";
      size?: readonly number[];
      topology?: "triangle-list";
      usage?: "static";
    }
  | {
      format: "bin";
      id: string;
      kind: "buffer";
      path: string;
    }
  | {
      animations?: Array<{
        id: string;
        loop?: boolean;
        sourceClip?: string;
        speed?: number;
      }>;
      animationGraph?: {
        initialState: string;
        parameters?: Array<{
          default?: boolean | number;
          id: string;
          kind: "boolean" | "number" | "trigger";
        }>;
        states: Array<{
          clip: string;
          events?: Array<{
            atSeconds: number;
            event: string;
          }>;
          id: string;
        }>;
        transitions?: Array<{
          blendSeconds?: number;
          from: string;
          to: string;
          when: {
            equals?: boolean | number;
            greaterThan?: number;
            lessThan?: number;
            parameter: string;
          };
        }>;
      };
      bounds?: {
        max: Vec3;
        min: Vec3;
      };
      format: "glb" | "gltf";
      id: string;
      kind: "model";
      particleEmitters?: Array<{
        id: string;
        lifetimeSeconds: number;
        maxParticles: number;
        radius?: number;
        ratePerSecond: number;
        shape: "point" | "sphere";
      }>;
      path: string;
    }
  | {
      center?: Vec2;
      format: "jpeg" | "png";
      id: string;
      kind: "texture";
      magFilter?: TextureMagFilter;
      minFilter?: TextureMinFilter;
      offset?: Vec2;
      path: string;
      repeat?: Vec2;
      rotation?: number;
      wrapS?: TextureWrapMode;
      wrapT?: TextureWrapMode;
    }
  | {
      format: "mp3" | "ogg" | "wav";
      id: string;
      kind: "audio";
      path: string;
    }
  | {
      format: "depth24plus" | "rgba16f" | "rgba8";
      height: number;
      id: string;
      kind: "render-target";
      sampleCount?: number;
      usage: "color" | "depth";
      width: number;
    };

export interface IAssetsManifest {
  schema: AssetsSchema;
  version: SchemaVersion;
  assets: IAssetIr[];
}

export interface IAudioOneShotIr {
  asset: string;
  bus?: string;
  emitter?: string;
  event: string;
  id: string;
  volume?: number;
}

export interface IAudioMusicIr {
  asset: string;
  autoplay?: boolean;
  bus?: string;
  id: string;
  loop: boolean;
  volume?: number;
}

export interface IAudioBusIr {
  id: string;
  volume?: number;
}

export interface IAudioListenerIr {
  id: string;
  position: Vec3;
}

export interface IAudioEmitterIr {
  id: string;
  position: Vec3;
  radius?: number;
}

export type AudioControlKind = "pause" | "query" | "resume" | "seek" | "stop";

export interface IAudioControlIr {
  at?: number;
  id: string;
  kind: AudioControlKind;
  target: string;
}

export interface IAudioIr {
  buses?: IAudioBusIr[];
  controls?: IAudioControlIr[];
  emitters?: IAudioEmitterIr[];
  listeners?: IAudioListenerIr[];
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
export type IUiAccessibilityRole = "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";

export interface IUiNodeIr {
  action?: string;
  accessibilityLabel?: string;
  binding?: IUiBinding;
  children?: IUiNodeIr[];
  focusable?: boolean;
  id: string;
  kind: "bar" | "button" | "column" | "image" | "row" | "stack" | "text" | "touchControl";
  label?: string;
  layout?: IUiLayoutIr;
  max?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  role?: IUiAccessibilityRole;
  style?: IUiStyleIr;
  src?: string;
  text?: string;
  value?: number;
}

export interface IUiLayoutIr {
  align?: "center" | "end" | "start" | "stretch";
  columnGap?: number;
  direction?: "column" | "row";
  grid?: {
    autoFlow?: "column" | "row";
    columns?: number;
    rows?: number;
  };
  grow?: number;
  height?: number;
  inset?: {
    bottom?: number;
    left?: number;
    right?: number;
    top?: number;
  };
  justify?: "center" | "end" | "spaceBetween" | "start";
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  overflow?: "hidden" | "scroll" | "visible";
  padding?: number;
  position?: "absolute" | "relative";
  rowGap?: number;
  width?: number;
  zIndex?: number;
}

export interface IUiStyleIr {
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: "bold" | "normal";
  gradient?: {
    angle?: number;
    from: string;
    kind: "linear";
    to: string;
  };
  opacity?: number;
  shadow?: {
    blur?: number;
    color: string;
    offsetX?: number;
    offsetY?: number;
    spread?: number;
  };
  textDecoration?: "lineThrough" | "none" | "underline";
  textAlign?: "center" | "left" | "right";
  wrap?: "character" | "none" | "word";
}

export interface IUiIr {
  focusOrder?: string[];
  inputActions?: {
    activate?: string;
    cancel?: string;
    next?: string;
    previous?: string;
  };
  safeArea?: {
    edges?: Array<"bottom" | "left" | "right" | "top">;
    mode: "avoid" | "none";
  };
  schema: UiSchema;
  version: SchemaVersion;
  root: IUiNodeIr;
}

export interface IEnvironmentSourceAssetIr {
  asset: string;
  category: "flower" | "grass" | "mushroom" | "pebble" | "rock" | "terrain" | "tree" | "vegetation";
  id: string;
  lod?: IEnvironmentLodLevelIr[];
}

export interface IEnvironmentLodLevelIr {
  asset: string;
  maxDistance: number;
  minDistance: number;
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

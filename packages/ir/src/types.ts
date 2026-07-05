export type SchemaVersion = "0.1.0";
export type BundleSchema = "threenative.bundle";
export type WorldSchema = "threenative.world";
export type MaterialsSchema = "threenative.materials";
export type AssetsSchema = "threenative.assets";
export type GltfSceneSchema = "threenative.gltf-scene";
export type AudioSchema = "threenative.audio";
export type LocalDataSchema = "threenative.local-data";
export type TargetProfileSchema = "threenative.target-profile";
export type RuntimeConfigSchema = "threenative.runtime-config";
export type UiSchema = "threenative.ui";
export type EnvironmentSceneSchema = "threenative.environment-scene";
export type OverlaysSchema = "threenative.overlays";
export type AnimationsSchema = "threenative.animations";
export type ScenesSchema = "threenative.scenes";
export type PrefabsSchema = "threenative.prefabs";

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
    localData?: string;
    scripts?: string;
    scenes?: string;
    systems?: string;
    overlays?: string;
    prefabs?: string;
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
    prefabs?: string;
    gltfScene?: string;
    localData?: string;
    resourceSchemas?: "schemas/resources.schema.json";
    runtimeConfig?: "runtime.config.json";
    scripts?: "scripts.bundle.js";
  };
}

export interface IPrefabEntityTemplateIr {
  id: string;
  components: IWorldEntity["components"];
}

export interface IPrefabDeclarationIr {
  id: string;
  root: string;
  entities: readonly IPrefabEntityTemplateIr[];
}

export interface IPrefabsIr {
  prefabs: readonly IPrefabDeclarationIr[];
  schema: PrefabsSchema;
  version: SchemaVersion;
}

export type SceneLifecycleKind = "credits" | "cutscene" | "level" | "loading" | "menu" | "overlay" | "system";
export type SceneActivationPolicy = "additive" | "exclusive" | "loading" | "overlay" | "persistent";
export type SceneTransitionKind = "crossfade" | "fade" | "instant" | "loadingScreen";

export interface ISceneTransitionIr {
  color?: string;
  durationMs: number;
  kind: SceneTransitionKind;
  loadingScene?: string;
}

export interface ISceneLifecycleIr {
  activation: SceneActivationPolicy;
  assetGroups?: readonly string[];
  audio?: {
    music?: string;
    transition?: ISceneTransitionIr;
  };
  entities?: readonly string[];
  id: string;
  input?: string;
  kind: SceneLifecycleKind;
  persistence?: {
    keepEntities?: readonly string[];
    keepResources?: readonly string[];
  };
  systems?: readonly string[];
  transitions?: {
    enter?: ISceneTransitionIr;
    exit?: ISceneTransitionIr;
  };
  ui?: readonly string[];
}

export interface IScenesIr {
  initialScene: string;
  scenes: readonly ISceneLifecycleIr[];
  schema: ScenesSchema;
  version: SchemaVersion;
}

export type LocalDataSettingGroup = "accessibility" | "audio" | "controls" | "video";
export type LocalDataSettingKind = "boolean" | "number" | "string";

export interface ILocalDataSchemaEntryIr {
  id: string;
  schema: Record<string, unknown>;
}

export interface ILocalDataSettingIr {
  defaultValue: boolean | number | string;
  enumValues?: readonly string[];
  group: LocalDataSettingGroup;
  key: string;
  kind: LocalDataSettingKind;
  max?: number;
  min?: number;
}

export interface ILocalDataSaveSlotIr {
  appVersion: string;
  id: string;
  schemaVersion: number;
}

export interface ILocalDataMigrationIr {
  currentVersion: number;
  migrators: readonly number[];
}

export interface ILocalDataAutosaveIr {
  checkpointEvents?: readonly string[];
  debounceMs: number;
  intervalSeconds?: number;
}

export interface ILocalDataIr {
  autosave?: ILocalDataAutosaveIr;
  components: readonly ILocalDataSchemaEntryIr[];
  migration?: ILocalDataMigrationIr;
  resources: readonly ILocalDataSchemaEntryIr[];
  saveSlots: readonly ILocalDataSaveSlotIr[];
  schema: LocalDataSchema;
  settings: readonly ILocalDataSettingIr[];
  version: SchemaVersion;
}

export interface ITransformAnimationKeyframeIr {
  timeSeconds: number;
  value: readonly number[];
}

export interface ITransformAnimationTrackIr {
  channel: "position" | "rotation" | "scale";
  easing?: "linear" | "step";
  keyframes: readonly ITransformAnimationKeyframeIr[];
  target: string;
}

export interface ITransformAnimationClipIr {
  id: string;
  loop?: "none" | "repeat";
  tracks: readonly ITransformAnimationTrackIr[];
}

export interface IAnimationsIr {
  schema: AnimationsSchema;
  version: SchemaVersion;
  transformClips: readonly ITransformAnimationClipIr[];
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
export type TextureDeliveryFormat = "basis" | "bc" | "dds" | "etc2" | "astc" | "jpeg" | "ktx2" | "png" | "webp";

export interface ITextureVariantIr {
  fallback?: boolean;
  format: TextureDeliveryFormat;
  path: string;
  targets?: Array<"desktop" | "web">;
}

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
  debug?: {
    gizmo?: boolean;
  };
  intensity: number;
  kind: "ambient" | "directional" | "point" | "spot";
  range?: number;
  shadowBias?: number;
  shadowFilter?: {
    mode: "pcf";
    quality: "high" | "low" | "medium";
  };
  shadowNormalBias?: number;
}

export interface IVisibilityComponent {
  visible: boolean;
}

export interface IRigidBodyComponent {
  angularVelocity?: Vec3;
  ccd?: {
    enabled: boolean;
    maxSubsteps?: number;
    mode: "linear" | "swept-aabb";
  };
  damping?: number;
  enabledRotations?: readonly [boolean, boolean, boolean];
  enabledTranslations?: readonly [boolean, boolean, boolean];
  gravityScale?: number;
  inverseMass?: number;
  kind: "dynamic" | "kinematic" | "static";
  mass?: number;
  sleepThreshold?: number;
  solverIterations?: number;
  velocity?: Vec3;
}

export interface IColliderComponent {
  center?: Vec3;
  friction?: number;
  height?: number;
  kind: "box" | "capsule" | "cylinder" | "mesh" | "sphere";
  layer?: string;
  mask?: readonly string[];
  mesh?: {
    bounds: {
      center?: Vec3;
      size: Vec3;
    };
    source?: string;
    triangleCount: number;
  };
  radius?: number;
  restitution?: number;
  size?: Vec3;
  slope?: {
    axis: "x" | "z";
    direction: -1 | 1;
    rise: number;
    run: number;
  };
  sensor?: {
    interactionKind?: "checkpoint" | "hazard" | "pickup" | "prompt" | "zone";
    occupantLimit?: number;
    phases?: readonly ("enter" | "exit" | "stay")[];
    trackOccupants?: boolean;
  };
  trigger?: boolean;
}

export interface IPhysicsJointComponent {
  anchor?: Vec3;
  axis?: Vec3;
  connectedEntity: string;
  damping?: number;
  kind: "hinge" | "slider" | "suspension";
  limits?: {
    max: number;
    min: number;
  };
  stiffness?: number;
  travel?: number;
}

export interface ICharacterPushPolicyComponent {
  allowedLayers?: readonly string[];
  blockedWhenTooHeavy?: boolean;
  enabled: boolean;
  impulseScale?: number;
  maxPushMass?: number;
  minMoveSpeed?: number;
}

export interface ICharacterControllerComponent {
  blocking: boolean;
  grounding: "none" | "raycast";
  interactAction?: string;
  moveXAxis: string;
  moveZAxis: string;
  pushPolicy?: ICharacterPushPolicyComponent;
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
    PhysicsJoint?: IPhysicsJointComponent;
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

export interface IMaterialEmissiveBloomIr {
  enabled: boolean;
  intensity: number;
  threshold: number;
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
  emissiveBloom?: IMaterialEmissiveBloomIr;
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

export type AssetSourceMode = "bundle" | "embedded" | "network";
export type AssetCachePolicy = "immutable" | "no-store" | "revalidate";

export interface IEmbeddedAssetSourceIr {
  byteLength: number;
  data: string;
  encoding: "base64";
  hash?: string;
  mediaType: string;
}

export interface INetworkAssetSourceIr {
  cachePolicy?: AssetCachePolicy;
  integrity?: string;
  url: string;
}

export interface IAssetSourceIr {
  embedded?: IEmbeddedAssetSourceIr;
  network?: INetworkAssetSourceIr;
  sourceMode?: AssetSourceMode;
}

export type AssetGroupFailurePolicy = "fail" | "warn";

export interface IAssetGroupIr {
  failurePolicy?: AssetGroupFailurePolicy;
  id: string;
  optional?: string[];
  required: string[];
  timeoutMs?: number;
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
      path?: string;
    } & IAssetSourceIr
  | {
      animations?: Array<{
        id: string;
        loop?: boolean;
        mask?: string;
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
      masks?: Array<{
        id: string;
        joints: string[];
      }>;
      morphClips?: Array<{
        id: string;
        keyframes: Array<{
          timeSeconds: number;
          weight: number;
        }>;
        target: string;
      }>;
      morphTargets?: Array<{
        defaultWeight?: number;
        id: string;
      }>;
      particleEmitters?: Array<{
        id: string;
        lifetimeSeconds: number;
        maxParticles: number;
        radius?: number;
        ratePerSecond: number;
        shape: "point" | "sphere";
      }>;
      path?: string;
      skeleton?: {
        joints: string[];
      };
    } & IAssetSourceIr
  | {
      center?: Vec2;
      format: TextureDeliveryFormat;
      fallback?: string;
      id: string;
      kind: "texture";
      magFilter?: TextureMagFilter;
      minFilter?: TextureMinFilter;
      offset?: Vec2;
      path?: string;
      repeat?: Vec2;
      rotation?: number;
      variants?: ITextureVariantIr[];
      wrapS?: TextureWrapMode;
      wrapT?: TextureWrapMode;
    } & IAssetSourceIr
  | {
      format: "mp3" | "ogg" | "wav";
      id: string;
      kind: "audio";
      path?: string;
    } & IAssetSourceIr
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
  groups?: IAssetGroupIr[];
}

export interface IAudioOneShotIr {
  asset: string;
  bus?: string;
  emitter?: string;
  event: string;
  id: string;
  pitch?: number;
  volume?: number;
}

export interface IAudioMusicIr {
  asset: string;
  autoplay?: boolean;
  bus?: string;
  id: string;
  loop: boolean;
  pitch?: number;
  volume?: number;
}

export interface IAudioBusIr {
  gain?: number;
  id: string;
  mute?: boolean;
  parent?: string;
  solo?: boolean;
  volume?: number;
}

export interface IAudioListenerIr {
  binding?: { entity?: string; kind: "activeCamera" | "entity" };
  id: string;
  position: Vec3;
}

export interface IAudioEmitterIr {
  attenuation?: {
    curve: "exponential" | "inverse" | "linear";
    maxDistance: number;
    minDistance: number;
    rolloffFactor: number;
  };
  id: string;
  position: Vec3;
  radius?: number;
}

export interface IAudioDuckingRuleIr {
  attack: number;
  gain: number;
  id: string;
  release: number;
  sourceBus: string;
  targetBus: string;
}

export interface IAudioToneIr {
  bus?: string;
  duration: number;
  frequency?: number;
  id: string;
  pitch?: number;
  volume?: number;
  waveform: "noise" | "sine" | "square";
}

export interface IAudioMusicTransitionIr {
  duration?: number;
  from?: string;
  id: string;
  kind: "crossfade" | "intro" | "loop" | "stinger";
  playbackId: string;
  state: string;
  to: string;
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
  duckingRules?: IAudioDuckingRuleIr[];
  emitters?: IAudioEmitterIr[];
  listeners?: IAudioListenerIr[];
  musicTransitions?: IAudioMusicTransitionIr[];
  schema: AudioSchema;
  tones?: IAudioToneIr[];
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
    supportedTextureFormats?: TextureDeliveryFormat[];
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
  profiler?: ISupportProfilerMetadata;
  instancedGroups: IPerformanceThreshold;
  instances: IPerformanceThreshold;
  loadMs: IPerformanceThreshold;
  p95FrameMs: IPerformanceThreshold;
  requiredTarget: "web";
  textureBytes: IPerformanceThreshold;
  triangles: IPerformanceThreshold;
  support?: ISupportTargetProfile;
  uninstancedRepeatedProps: IPerformanceThreshold;
  worstFrameMs: IPerformanceThreshold;
}

export type SupportTargetCategory = "audio" | "desktopNative" | "desktopWeb" | "diagnosticsOverlay" | "localData" | "localEditor";

export interface ISupportRepairHint {
  code: string;
  missingCapability: string;
  suggestion: string;
  target: SupportTargetCategory;
}

export interface ISupportCapabilityRequirement {
  availableCapabilities?: readonly string[];
  category: SupportTargetCategory;
  repairHints: readonly ISupportRepairHint[];
  requiredCapabilities: readonly string[];
}

export interface ISupportTargetProfile {
  requirements: readonly ISupportCapabilityRequirement[];
}

export interface ISupportProfilerMetadata {
  audioVoiceCount?: number;
  drawCount?: number;
  entityCount?: number;
  frameTimeMs?: number;
  gpuTimingUnavailable?: boolean;
  memoryEstimateBytes?: number;
  renderPassMs?: number;
  renderTimeMs?: number;
  saveLatencyMs?: number;
  uiNodeCount?: number;
  updateTimeMs?: number;
}

export type IUiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };
export type IUiAccessibilityRole = "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";

export interface IUiNodeIr {
  action?: string;
  accessibilityLabel?: string;
  anchorId?: string;
  binding?: IUiBinding;
  children?: IUiNodeIr[];
  disabled?: boolean;
  focusable?: boolean;
  id: string;
  image?: IUiImageMetadataIr;
  kind: "bar" | "button" | "column" | "contextMenu" | "image" | "minimap" | "row" | "scrollbar" | "slider" | "stack" | "text" | "textInput" | "touchControl";
  minimap?: IUiMinimapMetadataIr;
  label?: string;
  layout?: IUiLayoutIr;
  max?: number;
  min?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  orientation?: "horizontal" | "vertical";
  role?: IUiAccessibilityRole;
  spans?: IUiRichTextSpanIr[];
  step?: number;
  style?: IUiStyleIr;
  src?: string;
  text?: string;
  value?: number;
  valueText?: string;
}

export interface IUiImageMetadataIr {
  atlas?: { x: number; y: number; width: number; height: number };
  flipX?: boolean;
  flipY?: boolean;
  nineSlice?: { left: number; right: number; top: number; bottom: number };
  scaleMode?: "contain" | "cover" | "stretch";
  sourceSize?: { width: number; height: number };
  tileSize?: { width: number; height: number };
  tint?: string;
}

export interface IUiMinimapMetadataIr {
  backgroundColor?: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  markers?: Array<{ color?: string; label?: string; radius?: number; x: number; z: number }>;
  paths: Array<{ color?: string; points: Array<[number, number]>; width?: number }>;
}

export interface IUiFontAssetIr {
  asset: string;
  fallbackFamily?: string;
  family: string;
  glyphRanges?: Array<{ from: number; to: number }>;
  style?: "italic" | "normal";
  weight?: "bold" | "normal" | number;
}

export interface IUiRichTextSpanIr {
  accessibilityText?: string;
  color?: string;
  decoration?: "lineThrough" | "none" | "underline";
  fontFamily?: string;
  fontSize?: number;
  italic?: boolean;
  text: string;
  weight?: "bold" | "normal" | number;
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
  fontFamily?: string;
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
  fonts?: IUiFontAssetIr[];
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
  debug?: {
    gizmo?: boolean;
  };
  id: string;
  lod?: IEnvironmentLodLevelIr[];
  visibility?: IVisibilityRangeIr;
}

export interface IEnvironmentLodLevelIr {
  asset: string;
  fade?: {
    endDistance: number;
    startDistance: number;
  };
  impostor?: {
    material: string;
    mode: "cameraFacingQuad";
  };
  maxDistance: number;
  minDistance: number;
}

export interface IVisibilityRangeIr {
  fade?: {
    endDistance: number;
    startDistance: number;
  };
  maxDistance: number;
  minDistance: number;
}

export interface IEnvironmentInstanceIr {
  collisionMode?: "blocking" | "none" | "walkable";
  debug?: {
    gizmo?: boolean;
  };
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
  visibility?: IVisibilityRangeIr;
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

export interface IEnvironmentCubemapFacesIr {
  negativeX: string;
  negativeY: string;
  negativeZ: string;
  positiveX: string;
  positiveY: string;
  positiveZ: string;
}

export type EnvironmentTextureIntent = "irradiance" | "reflection" | "reflection-and-irradiance";

export type IEnvironmentTextureSourceIr =
  | {
      asset: string;
      mode: "equirect";
    }
  | {
      faces: IEnvironmentCubemapFacesIr;
      mode: "cubemap";
    };

export type ISkyboxIr = IEnvironmentTextureSourceIr & {
  intensity?: number;
  rotationY?: number;
};

export type IEnvironmentMapIr = IEnvironmentTextureSourceIr & {
  intensity?: number;
  intent: EnvironmentTextureIntent;
};

export interface ILightProbeIr {
  bounds: {
    max: Vec3;
    min: Vec3;
  };
  id: string;
  influenceRadius: number;
  intent: EnvironmentTextureIntent;
  source: IEnvironmentTextureSourceIr;
}

export interface IEnvironmentSceneIr {
  schema: EnvironmentSceneSchema;
  version: SchemaVersion;
  atmosphere?: IAtmosphereProfileIr;
  bookmarks?: IEnvironmentCameraBookmarkIr[];
  controller?: IFirstPersonControllerIr;
  environmentMap?: IEnvironmentMapIr;
  exclusionZones?: IEnvironmentExclusionZoneIr[];
  referenceImage?: string;
  lightProbes?: ILightProbeIr[];
  scatter?: IEnvironmentScatterSpecIr[];
  sourceAssets: IEnvironmentSourceAssetIr[];
  skybox?: ISkyboxIr;
  instances: IEnvironmentInstanceIr[];
  path: IEnvironmentPathIr;
  terrain?: IEnvironmentTerrainIr;
  walkability?: IWalkabilityIr;
}

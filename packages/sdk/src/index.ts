export { SdkError } from "./errors.js";
export {
  defineAnimations,
  transformAnimationClip,
  type IAnimationsDeclaration,
  type ITransformAnimationClipDeclaration,
  type ITransformAnimationKeyframe,
  type ITransformAnimationTrack,
  type TransformAnimationChannel,
  type TransformAnimationEasing,
  type TransformAnimationLoop,
} from "./animation.js";
export {
  audioPlaybackControl,
  audioBus,
  audioListener,
  defineAudio,
  loopingMusic,
  oneShotSound,
  spatialAudioEmitter,
  type AudioPlaybackControlKind,
  type IAudioBusDeclaration,
  type IAudioDeclaration,
  type IAudioEmitterDeclaration,
  type IAudioListenerDeclaration,
  type IAudioMusicDeclaration,
  type IAudioOneShotDeclaration,
  type IAudioPlaybackControlDeclaration,
} from "./audio.js";
export {
  animationClip,
  animationEvent,
  animationGraph,
  assetGroup,
  audioAsset,
  boundedParticleEmitter,
  embeddedAsset,
  modelAsset,
  networkAsset,
  renderTargetAsset,
  textureAsset,
  type AssetCachePolicy,
  type AssetFormat,
  type AssetGroupFailurePolicy,
  type AssetKind,
  type AssetSourceMode,
  type IAnimationEventMarker,
  type IAnimationGraphDeclaration,
  type IAnimationGraphParameter,
  type IAnimationGraphState,
  type IAnimationGraphTransition,
  type IAnimationClipReference,
  type IAssetGroupDeclaration,
  type IAssetGroupOptions,
  type IAssetReference,
  type IBoundedParticleEmitter,
  type IEmbeddedAssetSource,
  type INetworkAssetSource,
  type ITextureAssetOptions,
  type IUnsupportedAnimationAssetOptions,
  type TextureMagFilter,
  type TextureMinFilter,
  type TextureWrapMode,
} from "./assets.js";
export {
  CharacterController,
  characterController,
  type CharacterGroundingMode,
  type ICharacterControllerDeclaration,
  type ICharacterControllerOptions,
  type ICharacterPushPolicy,
  type IUnsupportedCharacterControllerOptions,
} from "./character.js";
export { defineControls, type IControlActionRecipe, type IControlsOptions, type IWasdMovementOptions } from "./controls.js";
export {
  World,
  type IWorldCommandDeclaration,
  type IWorldEntityDeclaration,
  type IWorldQueryDeclaration,
  type IWorldSnapshot,
  type IWorldSystemDeclaration,
} from "./ecs/World.js";
export { defineQuery, type IQueryDeclaration, type IQueryOptions } from "./ecs/query.js";
export * as commands from "./ecs/commands.js";
export type { CommandDeclaration, EntityRef } from "./ecs/commands.js";
export {
  defineSystem,
  fixedUpdate,
  postUpdate,
  startup,
  update,
  type ISystemContext,
  type ISystemDeclaration,
  type ISystemEntity,
  type ISystemOptions,
  type IV4SystemConfig,
  type PortableSystem,
  type SystemSchedule,
  type SystemService,
} from "./ecs/system.js";
export {
  defineComponent,
  defineEvent,
  defineResource,
  type EcsFactory,
  type IEcsDeclaration,
  type IEcsSchema,
  type ISchemaField,
  type SchemaFieldDefinition,
  type SchemaFieldKind,
  type SchemaFields,
  type SchemaKind,
} from "./ecs/schema.js";
export {
  AnnulusGeometry,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  ConicalFrustumGeometry,
  CustomMeshGeometry,
  CylinderGeometry,
  ExtrudedRectangleGeometry,
  type ICustomMeshAttribute,
  type MeshAttributeItemSize,
  type MeshAttributeName,
  PlaneGeometry,
  RegularPolygonGeometry,
  SphereGeometry,
  TorusGeometry,
  type SupportedGeometry,
} from "./geometry/primitives.js";
export { MeshBuilder, type IMeshBuilderBuildOptions } from "./geometry/meshBuilder.js";
export { mushroom, pineTree, rock, stylizedTree, type IOrganicMeshOptions } from "./geometry/meshBuilderOrganic.js";
export { defineGame, type IGameRoot, type IGameRootOptions } from "./game.js";
export {
  gltfNodeHandle,
  gltfSceneHandles,
  lookupGltfNodeExtras,
  setGltfNodeMaterial,
  setGltfNodeTransform,
  setGltfNodeVisibility,
  type GltfNodeHandleOperation,
  type IGltfNodeHandleDeclaration,
  type IGltfNodeTransformOverride,
  type IGltfSceneHandlesDeclaration,
} from "./gltfScene.js";
export {
  environmentMap,
  lightProbe,
  skybox,
  EnvironmentMapDeclaration,
  LightProbeDeclaration,
  SkyboxDeclaration,
  type EnvironmentTextureIntent,
  type EnvironmentTextureMode,
  type EnvironmentTextureSourceDeclaration,
  type IEnvironmentCubemapFacesDeclaration,
  type IEnvironmentMapDeclarationJson,
  type IEnvironmentTextureSourceJson,
  type ILightProbeDeclarationJson,
  type ISkyboxDeclarationJson,
} from "./environment.js";
export {
  action,
  axis,
  defineInputMap,
  gamepad,
  keyboard,
  pointerAxis,
  pointerButton,
  touchControl,
  type IInputActionDeclaration,
  type IInputAxisDeclaration,
  type IInputMapDeclaration,
  type InputBinding,
} from "./input.js";
export { MeshExtendedMaterial, type ExtendedMaterialPreset, type IMeshExtendedMaterialOptions } from "./materials/MeshExtendedMaterial.js";
export { MeshStandardMaterial, type ColorValue, type MaterialAlphaMode, type MaterialBlendMode, type TextureSlotReference } from "./materials/MeshStandardMaterial.js";
export { Vector3, type Vector3Tuple } from "./math/Vector3.js";
export {
  staticNavigation,
  type INavigationPathQueryDeclaration,
  type INavigationRegionDeclaration,
  type IStaticNavigationDeclaration,
  type NavigationPoint2,
  type NavigationPoint3,
} from "./navigation.js";
export {
  overlay,
  type IOverlayDeclaration,
  type IOverlayMessageDeclaration,
  type IOverlayMessageSchema,
  type IOverlayMountOptions,
  type OverlayInputMode,
  type OverlayMessageSchemaKind,
  type OverlayTargetProfile,
} from "./overlay.js";
export {
  boxCollider,
  capsuleCollider,
  cylinderCollider,
  meshCollider,
  physics,
  rigidBody,
  sphereCollider,
  type IColliderSlopeDeclaration,
  type IColliderDeclaration,
  type IPhysicsDeclaration,
  type IPhysicsMaterialOptions,
  type IRigidBodyDeclaration,
  type ISensorDeclaration,
  type PhysicsBodyKind,
  type PhysicsColliderKind,
  type SensorPhase,
} from "./physics.js";
export {
  PrefabModelAsset,
  PrefabTransform,
  definePrefab,
  modelActorPrefab,
  primitiveActorPrefab,
  type IModelActorPrefabOptions,
  type IPrefabDeclaration,
  type IPrimitiveActorPrefabDeclaration,
  type IPrimitiveActorPrefabOptions,
} from "./prefab.js";
export { OrthographicCamera, PerspectiveCamera } from "./scene/Camera.js";
export { AmbientLight, DirectionalLight, PointLight, SpotLight } from "./scene/Light.js";
export { Mesh } from "./scene/Mesh.js";
export { Object3D } from "./scene/Object3D.js";
export { Scene } from "./scene/Scene.js";
export { defineRuntimeConfig, type IRuntimeConfigDeclaration } from "./time.js";

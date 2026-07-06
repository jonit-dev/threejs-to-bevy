import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { IAssetIr, IMaterialIr, IRuntimeDiagnostic, IWorldEntity, IWorldIr } from "@threenative/ir";
import { advanceAnimationPlaybackState, animationPlaybackState, type IAnimationPlaybackState } from "./animation.js";
import {
  applyCameraRenderLayers,
  applyRenderLayersToObject,
  collectLayerNames,
  allocateRenderLayers,
  planCameraViews,
  resolvePrimaryCameraId,
  type ICameraViewPlan,
} from "./cameras.js";
import type { IWebBundle } from "./loadBundle.js";
import { atmosphereColorManagementExposure } from "./rendering.js";
import type { IRenderTargetRegistry } from "./renderTargets.js";
import type { ISystemEffectLogEntry } from "./systems/log.js";
import { bundleUrl, isLoadableModelFormat } from "./worldMapping/assets.js";
import { colorToThree } from "./worldMapping/colors.js";
import { attachWorldHierarchy } from "./worldMapping/hierarchy.js";
import {
  advanceStylizedNatureRuntime,
  attachStylizedSourceAssets,
  createRippleWaterObject,
  createStylizedNatureObject,
  createStylizedSparklesObject,
  hasStylizedNatureContent,
  readRippleWater,
  readStylizedNature,
  readStylizedSparkles,
} from "./worldMapping/stylizedNature.js";
import {
  applyTextureControls,
  canLoadImageInRuntime,
  enqueuePendingTextureLoad,
  loadPendingTextureLoads,
  resetPendingTextureLoads,
} from "./worldMapping/textureLoading.js";

export type { IRuntimeDiagnostic } from "@threenative/ir";
export type { ICameraViewPlan } from "./cameras.js";

export interface IThreeWorld {
  camera: THREE.Camera;
  cameraViews: ICameraViewPlan[];
  cameras: Map<string, THREE.Camera>;
  diagnostics: IRuntimeDiagnostic[];
  layerAllocation: Map<string, number>;
  objectsById: Map<string, THREE.Object3D>;
  renderTargets?: IRenderTargetRegistry;
  scene: THREE.Scene;
}

export interface IWebEmissiveBloomObservation {
  contribution: number;
  emissiveIntensity: number;
  enabled: boolean;
  entityId: string;
  exceedsThreshold: boolean;
  materialId: string;
  materialIntensity: number;
  threshold: number;
}

interface IGltfModel {
  animations?: THREE.AnimationClip[];
  scene: THREE.Object3D;
}

interface IShadowSettings {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface IWorldModelLoader {
  loadAsync(url: string): Promise<IGltfModel>;
}

export interface ILoadWorldModelAssetsOptions {
  loader?: IWorldModelLoader;
}

export function mapWorld(bundle: IWebBundle): IThreeWorld {
  resetPendingTextureLoads();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111318");
  const objectsById = new Map<string, THREE.Object3D>();
  const diagnostics: IRuntimeDiagnostic[] = [];
  const assetsById = new Map(bundle.assets.assets.map((asset) => [asset.id, asset]));
  const materialsById = new Map(bundle.materials.materials.map((material) => [material.id, material]));

  const layerAllocation = allocateRenderLayers(collectLayerNames(bundle.world), diagnostics);
  const atmosphereProvidesWorldLighting = bundle.environmentScene?.atmosphere?.active === true;
  const atmosphereExposure = atmosphereProvidesWorldLighting
    ? atmosphereColorManagementExposure(bundle.environmentScene?.atmosphere?.colorManagement)
    : undefined;
  const entities = [...bundle.world.entities].sort((left, right) => left.id.localeCompare(right.id));
  for (const entity of entities) {
    const object = mapEntity(
      entity,
      assetsById,
      materialsById,
      diagnostics,
      bundle.source,
      atmosphereProvidesWorldLighting,
      atmosphereExposure,
    );
    applyTransform(object, entity);
    applyVisibility(object, entity);
    applyEntityRenderLayers(object, entity, layerAllocation);
    objectsById.set(entity.id, object);
  }

  attachWorldHierarchy(scene, entities, objectsById);

  const cameras = new Map<string, THREE.Camera>();
  for (const entity of entities) {
    const object = objectsById.get(entity.id);
    if (object instanceof THREE.Camera) {
      cameras.set(entity.id, object);
      object.userData.threeNativeCamera = entity.components.Camera;
      applyCameraRenderLayers(object, entity.components.Camera?.layers ?? ["default"], layerAllocation);
    }
  }

  const cameraViews = planCameraViews(bundle.world, objectsById);
  const primaryCameraId = resolvePrimaryCameraId(cameraViews);
  let selectedCamera: THREE.Camera | undefined = primaryCameraId === undefined ? undefined : cameras.get(primaryCameraId);
  const requestedActiveCamera = readActiveCamera(bundle);

  if (selectedCamera === undefined) {
    const activeCamera = requestedActiveCamera === undefined ? undefined : objectsById.get(requestedActiveCamera);
    if (activeCamera instanceof THREE.Camera) {
      selectedCamera = activeCamera;
    } else if (requestedActiveCamera !== undefined) {
      diagnostics.push({
        code: "TN-WEB-ACTIVE-CAMERA-INVALID",
        message: `ActiveCamera references '${requestedActiveCamera}', but that entity is missing or does not have a Camera component.`,
        path: "world.ir.json/resources/ActiveCamera/entity",
        severity: "error",
        suggestion: "Point world.resources.ActiveCamera.entity at an entity with a Camera component.",
      });
    }
  }

  if (selectedCamera === undefined) {
    for (const object of cameras.values()) {
      selectedCamera = object;
      break;
    }
    if (selectedCamera !== undefined && requestedActiveCamera === undefined && cameraViews.length === 0) {
      diagnostics.push({
        code: "TN-WEB-ACTIVE-CAMERA-MISSING",
        message: "No ActiveCamera or ActiveCameras resource selects a camera; using the first camera entity.",
        path: "world.ir.json/resources/ActiveCamera",
        severity: "warning",
        suggestion: "Set world.resources.ActiveCamera.entity to a Camera entity id.",
      });
    }
  }

  if (selectedCamera === undefined) {
    selectedCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    selectedCamera.position.set(0, 1.5, 4);
    diagnostics.push({
      code: "TN-WEB-CAMERA-MISSING",
      message: "No camera entity was found; web preview cannot render this scene.",
      path: "world.ir.json/entities",
      severity: "error",
      suggestion: "Add a Camera component and set world.resources.ActiveCamera.entity.",
    });
  }

  diagnostics.push(...sceneStartupDiagnostics(bundle));

  return {
    camera: selectedCamera,
    cameras,
    cameraViews,
    diagnostics,
    layerAllocation,
    objectsById,
    scene,
  };
}

export function sceneStartupDiagnostics(bundle: IWebBundle): IRuntimeDiagnostic[] {
  const diagnostics: IRuntimeDiagnostic[] = [];
  const visibleRenderers = bundle.world.entities
    .map((entity) => entity.components.MeshRenderer)
    .filter((renderer): renderer is NonNullable<IWorldEntity["components"]["MeshRenderer"]> => renderer !== undefined && renderer.visible !== false);
  const hasLight = bundle.world.entities.some((entity) => entity.components.Light !== undefined);
  const environmentHasRenderableContent = environmentSceneHasRenderableContent(bundle);

  if (visibleRenderers.length === 0 && !environmentHasRenderableContent && !hasStylizedNatureContent(bundle.world)) {
    diagnostics.push({
      code: "TN-WEB-SCENE-RENDERERS-MISSING",
      message: "No visible MeshRenderer components were found; the scene has nothing renderable.",
      path: "world.ir.json/entities",
      severity: "error",
      suggestion: "Add at least one visible MeshRenderer with a valid mesh and material.",
    });
  }

  if (!hasLight && visibleRenderers.some((renderer) => isLitMaterial(bundle, renderer.material))) {
    diagnostics.push({
      code: "TN-WEB-LIGHT-MISSING",
      message: "Visible lit materials are present but no Light component was found; the scene may render very dark.",
      path: "world.ir.json/entities",
      severity: "warning",
      suggestion: "Add an ambient, directional, point, or spot Light entity, or use an unlit/basic material.",
    });
  }

  return diagnostics;
}

function environmentSceneHasRenderableContent(bundle: IWebBundle): boolean {
  const scene = bundle.environmentScene;
  if (scene === undefined) {
    return false;
  }
  if (scene.terrain !== undefined) {
    return true;
  }
  if ((scene.instances?.length ?? 0) > 0) {
    return true;
  }
  return (scene.scatter ?? []).some(
    (spec) => (spec.count ?? 0) > 0 || (spec.density !== undefined && spec.density > 0),
  );
}

function isLitMaterial(bundle: IWebBundle, materialId: string): boolean {
  const material = bundle.materials.materials.find((entry) => entry.id === materialId);
  return material?.extension?.preset !== "unlitMasked";
}

export function advanceAnimationPlayback(mapped: IThreeWorld, fixedDelta: number): void {
  for (const object of mapped.objectsById.values()) {
    const playback = object.userData.threeNativeAnimation as IAnimationPlaybackState | undefined;
    if (playback !== undefined) {
      object.userData.threeNativeAnimation = advanceAnimationPlaybackState(playback, fixedDelta);
    }
    const mixer = object.userData.threeNativeAnimationMixer as THREE.AnimationMixer | undefined;
    if (mixer !== undefined) {
      mixer.update(fixedDelta);
    }
    advanceStylizedNatureRuntime(object, fixedDelta);
  }
}

export function hasAnimationPlayback(mapped: IThreeWorld): boolean {
  return [...mapped.objectsById.values()].some((object) => {
    if (object.userData.threeNativeAnimation !== undefined) {
      return true;
    }
    let animated = false;
    object.traverse((child) => {
      if (child.userData.threeNativeGrassWind !== undefined || child.userData.threeNativeRippleMaterial !== undefined) {
        animated = true;
      }
    });
    return animated;
  });
}

export async function loadPendingMaterialTextures(): Promise<void> {
  await loadPendingTextureLoads();
}

export async function loadWorldModelAssets(
  mapped: IThreeWorld,
  bundle: IWebBundle,
  source: string,
  options: ILoadWorldModelAssetsOptions = {},
): Promise<void> {
  const loader = options.loader ?? createGltfLoader();
  const assetsById = new Map(bundle.assets.assets.map((asset) => [asset.id, asset]));
  const entities = [...bundle.world.entities].sort((left, right) => left.id.localeCompare(right.id));
  for (const entity of entities) {
    const stylizedNature = readStylizedNature(entity);
    if (stylizedNature === undefined) {
      continue;
    }
    const object = mapped.objectsById.get(entity.id);
    if (object instanceof THREE.Group) {
      await attachStylizedSourceAssets(object, stylizedNature, assetsById, source, loader, mapped.diagnostics);
    }
  }
  for (const entity of entities) {
    const renderer = entity.components.MeshRenderer;
    if (renderer === undefined) {
      continue;
    }
    const asset = assetsById.get(renderer.mesh);
    if (asset?.kind !== "model" || asset.path === undefined || !isLoadableModelFormat(asset)) {
      continue;
    }
    const object = mapped.objectsById.get(entity.id);
    if (object === undefined) {
      continue;
    }
    try {
      const gltf = await loader.loadAsync(bundleUrl(source, asset.path));
      attachLoadedModel(object, asset, gltf, renderer);
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : "";
      mapped.diagnostics.push({
        code: "TN-WEB-MODEL-LOAD-FAILED",
        message: `Failed to load model asset '${asset.id}'.${reason}`,
        path: `assets.manifest.json/assets/${asset.id}/path`,
        severity: "warning",
      });
    }
  }
}

function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

export function traceEmissiveBloomContributions(bundle: IWebBundle): IWebEmissiveBloomObservation[] {
  const materialsById = new Map(bundle.materials.materials.map((material) => [material.id, material]));
  return bundle.world.entities
    .flatMap((entity) => {
      const renderer = entity.components.MeshRenderer;
      if (renderer === undefined) {
        return [];
      }
      const material = materialsById.get(renderer.material);
      if (material?.emissiveBloom === undefined) {
        return [];
      }
      return [emissiveBloomObservation(entity.id, material)];
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function mapEntity(
  entity: IWorldEntity,
  assetsById: Map<string, IAssetIr>,
  materialsById: Map<string, IMaterialIr>,
  diagnostics: IRuntimeDiagnostic[],
  source?: string,
  atmosphereProvidesWorldLighting = false,
  atmosphereExposure?: number,
): THREE.Object3D {
  const stylizedNature = readStylizedNature(entity);
  if (stylizedNature !== undefined) {
    return createStylizedNatureObject(stylizedNature, assetsById, diagnostics, source);
  }
  const stylizedSparkles = readStylizedSparkles(entity);
  if (stylizedSparkles !== undefined) {
    return createStylizedSparklesObject(stylizedSparkles);
  }
  const rippleWater = readRippleWater(entity);
  if (rippleWater !== undefined) {
    return createRippleWaterObject(rippleWater);
  }

  const renderer = entity.components.MeshRenderer;
  if (renderer !== undefined) {
    const asset = assetsById.get(renderer.mesh);
    const material = materialsById.get(renderer.material);
    if (asset !== undefined && material !== undefined) {
      const geometry = mapGeometry(asset);
      const mappedMaterial = mapMaterial(material, assetsById, diagnostics, source);
      if (geometry.getAttribute("color") !== undefined && "vertexColors" in mappedMaterial) {
        mappedMaterial.vertexColors = true;
        mappedMaterial.needsUpdate = true;
      }
      const object = new THREE.Mesh(geometry, mappedMaterial);
      object.userData.threeNativeMaterialId = material.id;
      applyShadowSettings(object, renderer);
      if (material.renderOrder !== undefined) {
        object.renderOrder = material.renderOrder;
      }
      if (asset.kind === "model") {
        const playback = animationPlaybackState(asset);
        if (playback !== undefined) {
          object.userData.threeNativeAnimation = playback;
        }
      }
      return object;
    }
    diagnostics.push({
      code: "TN-WEB-MESH-REFERENCE-MISSING",
      message: `Entity '${entity.id}' has unresolved mesh or material reference.`,
      path: `world.ir.json/entities/${entity.id}/components/MeshRenderer`,
      severity: "error",
    });
  }

  const camera = entity.components.Camera;
  if (camera?.kind === "perspective") {
    const mapped = new THREE.PerspectiveCamera(camera.fovY ?? 60, 1, camera.near, camera.far);
    mapped.userData.threeNativeCamera = camera;
    return mapped;
  }
  if (camera?.kind === "orthographic") {
    const halfSize = (camera.size ?? 1) / 2;
    const mapped = new THREE.OrthographicCamera(-halfSize, halfSize, halfSize, -halfSize, camera.near, camera.far);
    mapped.userData.threeNativeCamera = camera;
    return mapped;
  }

  const light = entity.components.Light;
  if (light?.kind === "directional") {
    if (atmosphereProvidesWorldLighting) {
      return new THREE.Object3D();
    }
    const mapped = new THREE.DirectionalLight(colorToThree(light.color), light.intensity);
    applyLightShadowBias(mapped, light);
    return mapped;
  }
  if (light?.kind === "ambient") {
    if (atmosphereProvidesWorldLighting) {
      return new THREE.Object3D();
    }
    return new THREE.AmbientLight(colorToThree(light.color), light.intensity);
  }
  if (light?.kind === "point") {
    const intensity = scaleWorldLightIntensity(light.intensity, atmosphereProvidesWorldLighting, atmosphereExposure);
    const mapped = new THREE.PointLight(colorToThree(light.color), intensity, light.range ?? 0);
    applyLightShadowBias(mapped, light);
    return mapped;
  }
  if (light?.kind === "spot") {
    const intensity = scaleWorldLightIntensity(light.intensity, atmosphereProvidesWorldLighting, atmosphereExposure);
    const spot = new THREE.SpotLight(colorToThree(light.color), intensity, light.range ?? 0);
    if (light.angle !== undefined) {
      spot.angle = light.angle;
    }
    applyLightShadowBias(spot, light);
    return spot;
  }

  return new THREE.Object3D();
}

function applyLightShadowBias(light: THREE.Light & { shadow: THREE.LightShadow }, source: NonNullable<IWorldEntity["components"]["Light"]>): void {
  if (source.shadowBias !== undefined) {
    light.shadow.bias = source.shadowBias;
  }
  if (source.shadowNormalBias !== undefined) {
    light.shadow.normalBias = source.shadowNormalBias;
  }
}

function scaleWorldLightIntensity(
  intensity: number,
  atmosphereProvidesWorldLighting: boolean,
  atmosphereExposure: number | undefined,
): number {
  if (!atmosphereProvidesWorldLighting || atmosphereExposure === undefined) {
    return intensity;
  }
  return intensity / atmosphereExposure;
}

function attachLoadedModel(object: THREE.Object3D, asset: Extract<IAssetIr, { kind: "model" }>, gltf: IGltfModel, shadowSettings: IShadowSettings): void {
  const model = gltf.scene;
  model.name = model.name === "" ? `model:${asset.id}` : model.name;
  const overrideMaterial = object instanceof THREE.Mesh ? object.material : undefined;
  const overrideMaterialId = object.userData.threeNativeMaterialId as string | undefined;
  prepareLoadedModel(model, shadowSettings, overrideMaterial, overrideMaterialId);
  clearPlaceholderGeometry(object);
  object.add(model);

  const playback = object.userData.threeNativeAnimation as IAnimationPlaybackState | undefined;
  if (playback === undefined) {
    return;
  }
  const clip = selectAnimationClip(gltf.animations ?? [], playback);
  if (clip === undefined) {
    return;
  }
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(playback.loop ? THREE.LoopRepeat : THREE.LoopOnce, playback.loop ? Infinity : 1);
  action.clampWhenFinished = !playback.loop;
  action.timeScale = playback.speed;
  action.play();
  object.userData.threeNativeAnimationMixer = mixer;
  object.userData.threeNativeAnimationAction = action;
  object.userData.threeNativeAnimationAsset = asset.id;
  object.userData.threeNativeAnimationClip = clip.name;
  object.userData.threeNativeAnimationClips = gltf.animations ?? [];
}

export function applyAnimationServiceEffects(mapped: IThreeWorld, entries: readonly ISystemEffectLogEntry[]): void {
  for (const entry of entries) {
    if (entry.kind === "service" && entry.service === "animation.play") {
      applyAnimationPlayService(mapped, entry.payload);
    }
  }
}

function applyAnimationPlayService(mapped: IThreeWorld, payload: unknown): void {
  if (!isRecord(payload) || !isRecord(payload.request) || !isRecord(payload.result)) {
    return;
  }
  const entityId = typeof payload.request.entity === "string" ? payload.request.entity : undefined;
  const object = entityId === undefined ? undefined : mapped.objectsById.get(entityId);
  const mixer = object?.userData.threeNativeAnimationMixer as THREE.AnimationMixer | undefined;
  const clips = object?.userData.threeNativeAnimationClips as THREE.AnimationClip[] | undefined;
  if (object === undefined || mixer === undefined || clips === undefined) {
    return;
  }
  const sourceClip = typeof payload.result.sourceClip === "string"
    ? payload.result.sourceClip
    : typeof payload.request.clip === "string"
      ? payload.request.clip
      : undefined;
  if (sourceClip === undefined) {
    return;
  }
  const speed = numberOr(payload.result.speed, 1);
  const loop = payload.result.loop !== false;
  const asset = typeof object.userData.threeNativeAnimationAsset === "string" ? object.userData.threeNativeAnimationAsset : "";
  const clip = selectAnimationClip(clips, {
    activeState: sourceClip,
    asset,
    clip: sourceClip,
    loop,
    sourceClip,
    speed,
    timeSeconds: 0,
  });
  if (clip === undefined) {
    return;
  }
  if (object.userData.threeNativeAnimationClip === clip.name) {
    const currentAction = object.userData.threeNativeAnimationAction as THREE.AnimationAction | undefined;
    if (currentAction !== undefined) {
      currentAction.timeScale = speed;
      currentAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    }
    return;
  }
  const previousAction = object.userData.threeNativeAnimationAction as THREE.AnimationAction | undefined;
  previousAction?.fadeOut(0.12);
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
  action.timeScale = speed;
  action.fadeIn(0.12).play();
  object.userData.threeNativeAnimationAction = action;
  object.userData.threeNativeAnimationClip = clip.name;
  object.userData.threeNativeAnimation = {
    activeState: typeof payload.result.activeState === "string" ? payload.result.activeState : clip.name,
    asset,
    clip: typeof payload.result.clip === "string" ? payload.result.clip : clip.name,
    loop,
    sourceClip: clip.name,
    speed,
    timeSeconds: 0,
  } satisfies IAnimationPlaybackState;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prepareLoadedModel(
  model: THREE.Object3D,
  shadowSettings: IShadowSettings,
  overrideMaterial: THREE.Material | THREE.Material[] | undefined,
  overrideMaterialId: string | undefined,
): void {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = shadowSettings.castShadow ?? true;
      child.receiveShadow = shadowSettings.receiveShadow ?? true;
      if (overrideMaterial !== undefined) {
        child.material = applyLoadedModelMaterialOverride(child.material, overrideMaterial);
        if (overrideMaterialId !== undefined) {
          child.userData.threeNativeMaterialId = overrideMaterialId;
        }
      }
    }
  });
}

function applyLoadedModelMaterialOverride(
  loadedMaterial: THREE.Material | THREE.Material[],
  overrideMaterial: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  if (Array.isArray(loadedMaterial)) {
    return loadedMaterial.map((material, index) => mergeLoadedModelMaterial(material, Array.isArray(overrideMaterial) ? overrideMaterial[index] ?? overrideMaterial[0] : overrideMaterial));
  }
  return mergeLoadedModelMaterial(loadedMaterial, Array.isArray(overrideMaterial) ? overrideMaterial[0] : overrideMaterial);
}

function mergeLoadedModelMaterial(loadedMaterial: THREE.Material, overrideMaterial: THREE.Material | undefined): THREE.Material {
  const merged = loadedMaterial.clone();
  if (overrideMaterial === undefined) {
    return merged;
  }
  if ("color" in merged && "color" in overrideMaterial && merged.color instanceof THREE.Color && overrideMaterial.color instanceof THREE.Color) {
    merged.color.copy(overrideMaterial.color);
  }
  if ("roughness" in merged && "roughness" in overrideMaterial && typeof overrideMaterial.roughness === "number") {
    merged.roughness = overrideMaterial.roughness;
  }
  if ("metalness" in merged && "metalness" in overrideMaterial && typeof overrideMaterial.metalness === "number") {
    merged.metalness = overrideMaterial.metalness;
  }
  if ("emissive" in merged && "emissive" in overrideMaterial && merged.emissive instanceof THREE.Color && overrideMaterial.emissive instanceof THREE.Color) {
    merged.emissive.copy(overrideMaterial.emissive);
  }
  if ("emissiveIntensity" in merged && "emissiveIntensity" in overrideMaterial && typeof overrideMaterial.emissiveIntensity === "number") {
    merged.emissiveIntensity = overrideMaterial.emissiveIntensity;
  }
  merged.needsUpdate = true;
  return merged;
}

function applyShadowSettings(object: THREE.Object3D, shadowSettings: IShadowSettings): void {
  if (!(object instanceof THREE.Mesh)) {
    return;
  }
  if (shadowSettings.castShadow !== undefined) {
    object.castShadow = shadowSettings.castShadow;
  }
  if (shadowSettings.receiveShadow !== undefined) {
    object.receiveShadow = shadowSettings.receiveShadow;
  }
}

function clearPlaceholderGeometry(object: THREE.Object3D): void {
  if (!(object instanceof THREE.Mesh)) {
    return;
  }
  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry();
}

function selectAnimationClip(clips: readonly THREE.AnimationClip[], playback: IAnimationPlaybackState): THREE.AnimationClip | undefined {
  return clips.find((clip) => clip.name === playback.sourceClip)
    ?? clips.find((clip) => clip.name === playback.clip)
    ?? clips[0];
}

function mapGeometry(asset: IAssetIr): THREE.BufferGeometry {
  if (asset.kind !== "mesh") {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  if (asset.primitive === "custom") {
    return mapCustomGeometry(asset);
  }
  if (asset.primitive === "box") {
    const [x = 1, y = 1, z = 1] = asset.size ?? [];
    return new THREE.BoxGeometry(x, y, z);
  }
  if (asset.primitive === "sphere") {
    return new THREE.SphereGeometry(asset.size?.[0] ?? 0.5, 32, 16);
  }
  if (asset.primitive === "cylinder") {
    return new THREE.CylinderGeometry(asset.size?.[0] ?? 0.5, asset.size?.[0] ?? 0.5, asset.size?.[1] ?? 1, 32);
  }
  if (asset.primitive === "capsule") {
    return new THREE.CapsuleGeometry(asset.size?.[0] ?? 0.5, asset.size?.[1] ?? 1, 16, 32);
  }
  if (asset.primitive === "cone") {
    return new THREE.ConeGeometry(asset.size?.[0] ?? 0.5, asset.size?.[1] ?? 1, 32);
  }
  if (asset.primitive === "conicalFrustum") {
    return new THREE.CylinderGeometry(asset.size?.[0] ?? 0.25, asset.size?.[1] ?? 0.5, asset.size?.[2] ?? 1, 32);
  }
  if (asset.primitive === "torus") {
    const innerRadius = asset.size?.[0] ?? 0.5;
    const outerRadius = asset.size?.[1] ?? 1;
    const tubeRadius = (outerRadius - innerRadius) / 2;
    const majorRadius = outerRadius - tubeRadius;
    return new THREE.TorusGeometry(majorRadius, tubeRadius, 32, 64);
  }
  if (asset.primitive === "circle") {
    return new THREE.CircleGeometry(asset.size?.[0] ?? 0.5, 64);
  }
  if (asset.primitive === "annulus") {
    return new THREE.RingGeometry(asset.size?.[0] ?? 0.5, asset.size?.[1] ?? 1, 64);
  }
  if (asset.primitive === "regularPolygon") {
    return new THREE.CircleGeometry(asset.size?.[0] ?? 0.5, asset.size?.[1] ?? 6);
  }
  if (asset.primitive === "extrudedRectangle") {
    const [width = 1, height = 1, depth = 1] = asset.size ?? [];
    const shape = new THREE.Shape()
      .moveTo(-width / 2, -height / 2)
      .lineTo(width / 2, -height / 2)
      .lineTo(width / 2, height / 2)
      .lineTo(-width / 2, height / 2)
      .lineTo(-width / 2, -height / 2);
    const geometry = new THREE.ExtrudeGeometry(shape, { bevelEnabled: false, depth });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }
  const [x = 1, y = 1] = asset.size ?? [];
  return new THREE.PlaneGeometry(x, y);
}

function mapCustomGeometry(asset: Extract<IAssetIr, { kind: "mesh" }>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const attribute of asset.attributes ?? []) {
    geometry.setAttribute(webAttributeName(attribute.name), new THREE.Float32BufferAttribute([...attribute.values], attribute.itemSize));
  }
  if (asset.indices !== undefined) {
    geometry.setIndex([...asset.indices]);
  }
  return geometry;
}

function webAttributeName(name: string): string {
  if (name === "position" || name === "normal" || name === "color") {
    return name;
  }
  if (name === "uv" || name === "uv1") {
    return name;
  }
  return name.replace(/^custom:/, "");
}

function mapMaterial(
  material: IMaterialIr,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source?: string,
): THREE.Material {
  if (material.kind === "extended") {
    return mapExtendedMaterial(material, assetsById, diagnostics, source);
  }
  const aoMap = mapTextureSlot(material, "occlusionTexture", assetsById, diagnostics, source);
  const clearcoatMap = mapTextureSlot(material, "clearcoatTexture", assetsById, diagnostics, source);
  const clearcoatRoughnessMap = mapTextureSlot(material, "clearcoatRoughnessTexture", assetsById, diagnostics, source);
  const emissiveMap = mapTextureSlot(material, "emissiveTexture", assetsById, diagnostics, source);
  const map = mapTextureSlot(material, "baseColorTexture", assetsById, diagnostics, source);
  const metallicRoughnessTexture = mapTextureSlot(
    material,
    "metallicRoughnessTexture",
    assetsById,
    diagnostics,
    source,
  );
  const normalMap = mapTextureSlot(material, "normalTexture", assetsById, diagnostics, source);
  const specularMap = mapTextureSlot(material, "specularTexture", assetsById, diagnostics, source);
  const transmissionMap = mapTextureSlot(material, "transmissionTexture", assetsById, diagnostics, source);
  const physical = hasPhysicalMaterialFields(material);
  const parameters: THREE.MeshStandardMaterialParameters & THREE.MeshPhysicalMaterialParameters = {
    alphaTest: material.alphaMode === "mask" ? material.alphaCutoff ?? 0.5 : 0,
    color: colorToThree(material.color),
    emissive: material.emissive === undefined ? new THREE.Color("#000000") : colorToThree(material.emissive),
    emissiveIntensity: material.emissiveIntensity ?? 1,
    metalness: material.metalness ?? 0,
    roughness: material.roughness ?? 1,
  };
  if (physical) {
    parameters.clearcoat = material.clearcoat ?? 0;
    parameters.clearcoatRoughness = material.clearcoatRoughness ?? 0;
    parameters.specularColor = new THREE.Color("#ffffff");
    parameters.specularIntensity = material.specularIntensity ?? 0.5;
    parameters.transmission = material.transmission ?? 0;
    if (specularMap !== undefined) {
      parameters.specularIntensityMap = specularMap;
    }
    if ((material.transmission ?? 0) > 0) {
      parameters.ior = 1.5;
      parameters.thickness = 0.2;
      parameters.side = THREE.DoubleSide;
    }
  }
  if (material.alphaMode === "blend" || (material.opacity !== undefined && material.opacity < 1)) {
    parameters.opacity = material.opacity ?? 1;
    parameters.transparent = true;
  } else if (material.opacity !== undefined) {
    parameters.opacity = material.opacity;
  }
  if (aoMap !== undefined) {
    parameters.aoMap = aoMap;
  }
  if (emissiveMap !== undefined) {
    parameters.emissiveMap = emissiveMap;
  }
  if (clearcoatMap !== undefined) {
    parameters.clearcoatMap = clearcoatMap;
  }
  if (clearcoatRoughnessMap !== undefined) {
    parameters.clearcoatRoughnessMap = clearcoatRoughnessMap;
  }
  if (map !== undefined) {
    parameters.map = map;
  }
  if (metallicRoughnessTexture !== undefined) {
    parameters.metalnessMap = metallicRoughnessTexture;
    parameters.roughnessMap = metallicRoughnessTexture;
  }
  if (normalMap !== undefined) {
    parameters.normalMap = normalMap;
  }
  if (transmissionMap !== undefined) {
    parameters.transmissionMap = transmissionMap;
  }
  const mapped = physical ? new THREE.MeshPhysicalMaterial(parameters) : new THREE.MeshStandardMaterial(parameters);
  applyMaterialPolicy(mapped, material);
  if (material.emissiveBloom !== undefined) {
    mapped.userData.threeNativeEmissiveBloom = emissiveBloomObservation("", material);
  }
  mapped.userData.threeNativeAlphaMode = material.alphaMode ?? "opaque";
  mapped.needsUpdate = true;
  return mapped;
}

function mapExtendedMaterial(
  material: IMaterialIr,
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source?: string,
): THREE.Material {
  const preset = material.extension?.preset;
  const map = mapTextureSlot(material, "baseColorTexture", assetsById, diagnostics, source);
  const parameters: THREE.MeshBasicMaterialParameters = {
    alphaTest: material.alphaMode === "mask" ? material.alphaCutoff ?? 0.5 : 0,
    color: colorToThree(material.color),
    side: material.extension?.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
  };
  if (material.alphaMode === "blend" || (material.opacity !== undefined && material.opacity < 1)) {
    parameters.opacity = material.opacity ?? 1;
    parameters.transparent = true;
  } else if (material.opacity !== undefined) {
    parameters.opacity = material.opacity;
  }
  if (map !== undefined) {
    parameters.map = map;
  }
  const mapped = new THREE.MeshBasicMaterial(parameters);
  applyMaterialPolicy(mapped, material);
  mapped.userData.threeNativeMaterialKind = "extended";
  mapped.userData.threeNativeExtendedPreset = preset;
  mapped.needsUpdate = true;
  return mapped;
}

function applyMaterialPolicy(material: THREE.Material, source: IMaterialIr): void {
  if (source.depthWrite !== undefined) {
    material.depthWrite = source.depthWrite;
  }
  if (source.depthTest !== undefined) {
    material.depthTest = source.depthTest;
  }
  if (source.alphaMode === "blend" && source.blendMode !== undefined) {
    switch (source.blendMode) {
      case "additive":
        material.blending = THREE.AdditiveBlending;
        break;
      case "multiply":
        material.blending = THREE.MultiplyBlending;
        break;
      case "premultipliedAlpha":
        material.premultipliedAlpha = true;
        material.blending = THREE.NormalBlending;
        break;
      default:
        material.blending = THREE.NormalBlending;
        break;
    }
  }
  material.userData.threeNativeBlendMode = source.blendMode ?? "normal";
  material.userData.threeNativeDepthWrite = source.depthWrite;
  material.userData.threeNativeDepthTest = source.depthTest;
  material.userData.threeNativeRenderOrder = source.renderOrder;
}

function hasPhysicalMaterialFields(material: IMaterialIr): boolean {
  return material.clearcoat !== undefined
    || material.clearcoatRoughness !== undefined
    || material.clearcoatRoughnessTexture !== undefined
    || material.clearcoatTexture !== undefined
    || material.specularIntensity !== undefined
    || material.specularTexture !== undefined
    || material.transmission !== undefined
    || material.transmissionTexture !== undefined;
}

function mapTextureSlot(
  material: IMaterialIr,
  slot:
    | "baseColorTexture"
    | "clearcoatRoughnessTexture"
    | "clearcoatTexture"
    | "emissiveTexture"
    | "metallicRoughnessTexture"
    | "normalTexture"
    | "occlusionTexture"
    | "specularTexture"
    | "transmissionTexture",
  assetsById: Map<string, IAssetIr>,
  diagnostics: IRuntimeDiagnostic[],
  source?: string,
): THREE.Texture | undefined {
  const assetId = material[slot];
  if (assetId === undefined) {
    return undefined;
  }

  const asset = assetsById.get(assetId);
  if (asset?.kind !== "texture" || asset.path === undefined) {
    diagnostics.push({
      code: "TN-WEB-MATERIAL-TEXTURE-REFERENCE-INVALID",
      message: `Material '${material.id}' ${slot} references missing or non-texture asset '${assetId}'.`,
      path: `materials.ir.json/materials/${material.id}/${slot}`,
      severity: "error",
    });
    return undefined;
  }

  const url = source === undefined ? asset.path : `${source.replace(/\/$/, "")}/${asset.path}`;
  const texture = new THREE.Texture();
  texture.name = asset.id;
  texture.userData = {
    ...texture.userData,
    threenativeAssetId: asset.id,
    threenativeSlot: slot,
    threenativeUrl: url,
  };
  texture.colorSpace = textureColorSpaceForSlot(slot);
  applyTextureControls(texture, asset);
  if (canLoadImageInRuntime()) {
    enqueuePendingTextureLoad(
      new THREE.TextureLoader()
        .loadAsync(url)
        .then((loaded) => {
          texture.image = loaded.image;
          texture.colorSpace = textureColorSpaceForSlot(slot);
          texture.needsUpdate = true;
        })
        .catch(() => undefined),
    );
  }
  return texture;
}

function textureColorSpaceForSlot(slot: Parameters<typeof mapTextureSlot>[1]): THREE.ColorSpace {
  return slot === "baseColorTexture" || slot === "emissiveTexture"
    ? THREE.SRGBColorSpace
    : THREE.NoColorSpace;
}

function applyTransform(object: THREE.Object3D, entity: IWorldEntity): void {
  const transform = entity.components.Transform;
  if (transform?.position !== undefined) {
    object.position.fromArray([...transform.position]);
  }
  if (transform?.rotation !== undefined) {
    object.quaternion.fromArray([...transform.rotation]);
  }
  if (transform?.scale !== undefined) {
    object.scale.fromArray([...transform.scale]);
  }
}

function applyEntityRenderLayers(
  object: THREE.Object3D,
  entity: IWorldEntity,
  allocation: Map<string, number>,
): void {
  const layers = entity.components.RenderLayers?.layers;
  if (layers === undefined) {
    return;
  }
  applyRenderLayersToObject(object, layers, allocation);
}

function applyVisibility(object: THREE.Object3D, entity: IWorldEntity): void {
  const visibility = entity.components.Visibility;
  const renderer = entity.components.MeshRenderer;
  if (visibility?.visible === false || renderer?.visible === false) {
    object.visible = false;
  }
}

export function syncTransforms(world: IWorldIr, objectsById: Map<string, THREE.Object3D>): void {
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  for (const id of objectsById.keys()) {
    if (!entityIds.has(id)) {
      objectsById.get(id)?.removeFromParent();
      objectsById.delete(id);
    }
  }
  for (const entity of world.entities) {
    const object = objectsById.get(entity.id);
    if (object !== undefined) {
      applyTransform(object, entity);
      applyVisibility(object, entity);
    }
  }
}

export function syncMeshRendererMaterials(world: IWorldIr, objectsById: Map<string, THREE.Object3D>): void {
  const materialsById = new Map<string, THREE.Material | THREE.Material[]>();
  for (const object of objectsById.values()) {
    if (object instanceof THREE.Mesh) {
      const materialId = object.userData.threeNativeMaterialId as string | undefined;
      if (materialId !== undefined) {
        materialsById.set(materialId, object.material);
      }
    }
  }

  for (const entity of world.entities) {
    const materialId = entity.components.MeshRenderer?.material;
    if (materialId === undefined) {
      continue;
    }
    const object = objectsById.get(entity.id);
    const material = materialsById.get(materialId);
    if (object instanceof THREE.Mesh && material !== undefined) {
      object.material = material;
      object.userData.threeNativeMaterialId = materialId;
    }
  }
}

function emissiveBloomObservation(entityId: string, material: IMaterialIr): IWebEmissiveBloomObservation {
  const bloom = material.emissiveBloom ?? { enabled: false, intensity: 0, threshold: Number.POSITIVE_INFINITY };
  const emissiveIntensity = material.emissiveIntensity ?? 1;
  const luminance = material.emissive === undefined ? (material.emissiveTexture === undefined ? 0 : 1) : colorLuminance(material.emissive);
  const contribution = bloom.enabled ? luminance * emissiveIntensity * bloom.intensity : 0;
  return {
    contribution: Number(contribution.toFixed(6)),
    emissiveIntensity,
    enabled: bloom.enabled,
    entityId,
    exceedsThreshold: contribution >= bloom.threshold,
    materialId: material.id,
    materialIntensity: bloom.intensity,
    threshold: bloom.threshold,
  };
}

function colorLuminance(color: IMaterialIr["color"]): number {
  const three = colorToThree(color);
  return three.r * 0.2126 + three.g * 0.7152 + three.b * 0.0722;
}

function readActiveCamera(bundle: IWebBundle): string | undefined {
  const activeCamera = bundle.world.resources?.ActiveCamera as { entity?: string } | undefined;
  return activeCamera?.entity;
}

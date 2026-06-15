import * as THREE from "three";
import type {
  IAssetIr,
  IAudioIr,
  IConformanceAssetReport,
  IConformanceAudioReport,
  IConformanceEntityReport,
  IConformanceEnvironmentReport,
  IConformanceEventReport,
  IConformanceMaterialReport,
  IConformanceReport,
  IConformanceResourceReport,
  IConformanceUiNodeReport,
  IConformanceUiReport,
  IEnvironmentSceneIr,
  IMaterialIr,
  IUiIr,
  IWorldEntity,
  Quat,
  Vec3,
} from "@threenative/ir";
import { createWebAudioRuntime } from "./audio.js";
import type { IWebBundle } from "./loadBundle.js";
import type { IThreeWorld } from "./mapWorld.js";
import { detectPhysicsEvents } from "./physics.js";

type IRuntimeLightReport = NonNullable<IConformanceEntityReport["light"]>["runtime"];

export function reportWebConformance(
  bundle: IWebBundle,
  mapped: IThreeWorld,
  fixture = bundle.manifest.name,
): IConformanceReport {
  const idsByObject = new Map<THREE.Object3D, string>();
  for (const [id, object] of mapped.objectsById.entries()) {
    idsByObject.set(object, id);
  }

  return {
    audio: bundle.audio === undefined ? undefined : reportAudio(bundle.audio, bundle.world.events ?? {}),
    assets: bundle.assets.assets.map(reportAsset).sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics: mapped.diagnostics,
    entities: bundle.world.entities
      .map((entity) => reportEntity(entity, mapped, idsByObject))
      .sort((left, right) => left.id.localeCompare(right.id)),
    environment: bundle.environmentScene === undefined ? undefined : reportEnvironment(bundle.environmentScene),
    events: reportEvents(observedEvents(bundle.world)),
    fixture,
    materials: bundle.materials.materials.map(reportMaterial).sort((left, right) => left.id.localeCompare(right.id)),
    resources: reportResources(bundle.world.resources ?? {}),
    runtime: "web-three",
    ui: bundle.ui === undefined ? undefined : reportUi(bundle.ui),
  };
}

function reportAudio(audio: IAudioIr, events: Record<string, unknown>): IConformanceAudioReport {
  const runtime = createWebAudioRuntime(audio);
  runtime.start();
  runtime.handleEvents(audioEvents(events));
  return {
    commands: runtime.commands.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function audioEvents(events: Record<string, unknown>): Array<{ event: string; payload: unknown }> {
  return Object.entries(events).flatMap(([event, payloads]) =>
    Array.isArray(payloads)
      ? payloads.map((payload) => ({ event, payload }))
      : [{ event, payload: payloads }],
  );
}

function reportEntity(
  entity: IWorldEntity,
  mapped: IThreeWorld,
  idsByObject: Map<THREE.Object3D, string>,
): IConformanceEntityReport {
  const object = mapped.objectsById.get(entity.id);
  const report: IConformanceEntityReport = {
    components: componentNames(entity),
    id: entity.id,
  };

  if (object !== undefined) {
    report.transform = {
      position: object.position.toArray() as Vec3,
      rotation: object.quaternion.toArray() as Quat,
      scale: object.scale.toArray() as Vec3,
    };
    const parentId = object.parent === null || object.parent instanceof THREE.Scene ? undefined : idsByObject.get(object.parent);
    if (parentId !== undefined) {
      report.parent = parentId;
    }
  }

  if (entity.components.MeshRenderer !== undefined) {
    const renderer = entity.components.MeshRenderer;
    report.mesh = renderer.mesh;
    report.material = renderer.material;
    report.meshRenderer = {
      castShadow: renderer.castShadow,
      material: renderer.material,
      mesh: renderer.mesh,
      receiveShadow: renderer.receiveShadow,
      visible: renderer.visible,
    };
  }
  if (entity.components.Camera !== undefined) {
    report.camera = {
      far: entity.components.Camera.far,
      fovY: entity.components.Camera.fovY,
      kind: entity.components.Camera.kind,
      near: entity.components.Camera.near,
      runtime: object === undefined ? undefined : reportRuntimeCamera(object),
      size: entity.components.Camera.size,
    };
  }
  if (entity.components.Light !== undefined) {
    report.light = {
      angle: entity.components.Light.angle,
      color: entity.components.Light.color,
      intensity: entity.components.Light.intensity,
      kind: entity.components.Light.kind,
      range: entity.components.Light.range,
      shadowBias: entity.components.Light.shadowBias,
      shadowNormalBias: entity.components.Light.shadowNormalBias,
      runtime: object === undefined ? undefined : reportRuntimeLight(object),
    };
  }
  if (entity.components.Visibility !== undefined || entity.components.MeshRenderer?.visible !== undefined || object !== undefined) {
    report.visibility = {
      meshRendererVisible: entity.components.MeshRenderer?.visible,
      runtimeVisible: object?.visible,
      visible: entity.components.Visibility?.visible,
    };
  }

  return report;
}

function reportRuntimeCamera(object: THREE.Object3D): NonNullable<NonNullable<IConformanceEntityReport["camera"]>["runtime"]> | undefined {
  if (object instanceof THREE.PerspectiveCamera) {
    return {
      far: object.far,
      fovY: object.fov,
      kind: "perspective",
      near: object.near,
    };
  }
  if (object instanceof THREE.OrthographicCamera) {
    return {
      far: object.far,
      kind: "orthographic",
      near: object.near,
      size: object.top - object.bottom,
    };
  }
  return undefined;
}

function reportRuntimeLight(object: THREE.Object3D): IRuntimeLightReport | undefined {
  if (object instanceof THREE.DirectionalLight) {
    return { color: `#${object.color.getHexString()}`, intensity: object.intensity, kind: "directional", shadowBias: object.shadow.bias, shadowNormalBias: object.shadow.normalBias };
  }
  if (object instanceof THREE.AmbientLight) {
    return undefined;
  }
  if (object instanceof THREE.PointLight) {
    return {
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      kind: "point",
      range: object.distance,
      shadowBias: object.shadow.bias,
      shadowNormalBias: object.shadow.normalBias,
    };
  }
  if (object instanceof THREE.SpotLight) {
    return {
      angle: object.angle,
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      kind: "spot",
      range: object.distance,
      shadowBias: object.shadow.bias,
      shadowNormalBias: object.shadow.normalBias,
    };
  }
  return undefined;
}

function reportAsset(asset: IAssetIr): IConformanceAssetReport {
  return {
    animations: "animations" in asset ? asset.animations : undefined,
    bounds: "bounds" in asset ? asset.bounds : undefined,
    center: "center" in asset ? asset.center : undefined,
    format: asset.format,
    id: asset.id,
    kind: asset.kind,
    magFilter: "magFilter" in asset ? asset.magFilter : undefined,
    minFilter: "minFilter" in asset ? asset.minFilter : undefined,
    offset: "offset" in asset ? asset.offset : undefined,
    path: "path" in asset ? asset.path : undefined,
    primitive: "primitive" in asset ? asset.primitive : undefined,
    repeat: "repeat" in asset ? asset.repeat : undefined,
    rotation: "rotation" in asset ? asset.rotation : undefined,
    size: "size" in asset ? asset.size : undefined,
    wrapS: "wrapS" in asset ? asset.wrapS : undefined,
    wrapT: "wrapT" in asset ? asset.wrapT : undefined,
  };
}

function reportMaterial(material: IMaterialIr): IConformanceMaterialReport {
  return {
    alphaCutoff: material.alphaCutoff,
    alphaMode: material.alphaMode,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
    color: material.color,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    id: material.id,
    kind: material.kind,
    metalness: material.metalness,
    opacity: material.opacity,
    roughness: material.roughness,
    specularIntensity: material.specularIntensity,
    transmission: material.transmission,
    textures: {
      baseColor: material.baseColorTexture,
      clearcoat: material.clearcoatTexture,
      clearcoatRoughness: material.clearcoatRoughnessTexture,
      emissive: material.emissiveTexture,
      metallicRoughness: material.metallicRoughnessTexture,
      normal: material.normalTexture,
      occlusion: material.occlusionTexture,
      transmission: material.transmissionTexture,
    },
  };
}

function reportEnvironment(environment: IEnvironmentSceneIr): IConformanceEnvironmentReport {
  return {
    atmosphere: environment.atmosphere?.id,
    bookmarks: (environment.bookmarks ?? []).map((bookmark) => bookmark.id).sort(),
    instances: environment.instances.map((instance) => instance.id).sort(),
    path: environment.path.id,
    scatter: (environment.scatter ?? []).map((scatter) => scatter.id).sort(),
    sourceAssets: environment.sourceAssets.map((asset) => asset.id).sort(),
    terrain: environment.terrain?.id,
  };
}

function reportEvents(events: Record<string, unknown>): IConformanceEventReport[] {
  return Object.entries(events)
    .map(([id, value]) => ({
      id,
      values: Array.isArray(value) ? value : [],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function observedEvents(world: IWebBundle["world"]): Record<string, unknown> {
  const events: Record<string, unknown[]> = Object.fromEntries(
    Object.entries(world.events ?? {}).map(([id, value]) => [id, Array.isArray(value) ? [...value] : []]),
  );
  for (const observation of detectPhysicsEvents(world)) {
    const { event, ...payload } = observation;
    if (!hasEventPayload(events[event] ?? [], payload)) {
      events[event] = [...(events[event] ?? []), payload];
    }
  }
  return events;
}

function hasEventPayload(values: unknown[], payload: unknown): boolean {
  return values.some((value) => jsonEquals(value, payload));
}

function jsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    );
  }
  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) {
      return false;
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key]))
    );
  }
  return false;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportResources(resources: Record<string, unknown>): IConformanceResourceReport[] {
  return Object.entries(resources)
    .map(([id, value]) => ({ id, value }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reportUi(ui: IUiIr): IConformanceUiReport {
  return { root: reportUiNode(ui.root) };
}

function reportUiNode(node: IUiIr["root"]): IConformanceUiNodeReport {
  return {
    ...(node.accessibilityLabel === undefined ? {} : { accessibilityLabel: node.accessibilityLabel }),
    ...(node.action === undefined ? {} : { action: node.action }),
    children: (node.children ?? []).map(reportUiNode),
    ...(node.focusable === undefined ? {} : { focusable: node.focusable }),
    id: node.id,
    kind: node.kind,
    ...(node.label === undefined ? {} : { label: node.label }),
    ...(node.max === undefined ? {} : { max: node.max }),
    ...(node.role === undefined ? {} : { role: node.role }),
    ...(node.src === undefined ? {} : { src: node.src }),
    ...(node.text === undefined ? {} : { text: node.text }),
    ...(node.value === undefined ? {} : { value: node.value }),
  };
}

function componentNames(entity: IWorldEntity): string[] {
  return Object.keys(entity.components)
    .filter((componentName) => entity.components[componentName] !== undefined)
    .sort();
}

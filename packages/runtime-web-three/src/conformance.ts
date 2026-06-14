import * as THREE from "three";
import type {
  IAssetIr,
  IConformanceAssetReport,
  IConformanceEntityReport,
  IConformanceEnvironmentReport,
  IConformanceEventReport,
  IConformanceMaterialReport,
  IConformanceReport,
  IConformanceResourceReport,
  IEnvironmentSceneIr,
  IMaterialIr,
  IWorldEntity,
  Quat,
  Vec3,
} from "@threenative/ir";
import type { IWebBundle } from "./loadBundle.js";
import type { IThreeWorld } from "./mapWorld.js";

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
    assets: bundle.assets.assets.map(reportAsset).sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics: mapped.diagnostics,
    entities: bundle.world.entities
      .map((entity) => reportEntity(entity, mapped, idsByObject))
      .sort((left, right) => left.id.localeCompare(right.id)),
    environment: bundle.environmentScene === undefined ? undefined : reportEnvironment(bundle.environmentScene),
    events: reportEvents(bundle.world.events ?? {}),
    fixture,
    materials: bundle.materials.materials.map(reportMaterial).sort((left, right) => left.id.localeCompare(right.id)),
    resources: reportResources(bundle.world.resources ?? {}),
    runtime: "web-three",
  };
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
      material: renderer.material,
      mesh: renderer.mesh,
      visible: renderer.visible,
    };
  }
  if (entity.components.Camera !== undefined) {
    report.camera = {
      far: entity.components.Camera.far,
      fovY: entity.components.Camera.fovY,
      kind: entity.components.Camera.kind,
      near: entity.components.Camera.near,
    };
  }
  if (entity.components.Light !== undefined) {
    report.light = {
      angle: entity.components.Light.angle,
      color: entity.components.Light.color,
      intensity: entity.components.Light.intensity,
      kind: entity.components.Light.kind,
      range: entity.components.Light.range,
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

function reportRuntimeLight(object: THREE.Object3D): IRuntimeLightReport | undefined {
  if (object instanceof THREE.DirectionalLight) {
    return { color: `#${object.color.getHexString()}`, intensity: object.intensity, kind: "directional" };
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
    };
  }
  if (object instanceof THREE.SpotLight) {
    return {
      angle: object.angle,
      color: `#${object.color.getHexString()}`,
      intensity: object.intensity,
      kind: "spot",
      range: object.distance,
    };
  }
  return undefined;
}

function reportAsset(asset: IAssetIr): IConformanceAssetReport {
  return {
    bounds: "bounds" in asset ? asset.bounds : undefined,
    format: asset.format,
    id: asset.id,
    kind: asset.kind,
    path: "path" in asset ? asset.path : undefined,
    primitive: "primitive" in asset ? asset.primitive : undefined,
    size: "size" in asset ? asset.size : undefined,
  };
}

function reportMaterial(material: IMaterialIr): IConformanceMaterialReport {
  return {
    color: material.color,
    id: material.id,
    kind: material.kind,
    metalness: material.metalness,
    roughness: material.roughness,
    textures: {
      baseColor: material.baseColorTexture,
      emissive: material.emissiveTexture,
      metallicRoughness: material.metallicRoughnessTexture,
      normal: material.normalTexture,
      occlusion: material.occlusionTexture,
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

function reportResources(resources: Record<string, unknown>): IConformanceResourceReport[] {
  return Object.entries(resources)
    .map(([id, value]) => ({ id, value }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function componentNames(entity: IWorldEntity): string[] {
  return Object.keys(entity.components)
    .filter((componentName) => entity.components[componentName] !== undefined)
    .sort();
}

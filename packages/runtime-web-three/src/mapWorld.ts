import * as THREE from "three";
import type { IAssetIr, IMaterialIr, IRuntimeDiagnostic, IWorldEntity, IWorldIr } from "@threenative/ir";
import { advanceAnimationPlaybackState, animationPlaybackState, type IAnimationPlaybackState } from "./animation.js";
import type { IWebBundle } from "./loadBundle.js";

export type { IRuntimeDiagnostic } from "@threenative/ir";

export interface IThreeWorld {
  camera: THREE.Camera;
  diagnostics: IRuntimeDiagnostic[];
  objectsById: Map<string, THREE.Object3D>;
  scene: THREE.Scene;
}

export function mapWorld(bundle: IWebBundle): IThreeWorld {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111318");
  const objectsById = new Map<string, THREE.Object3D>();
  const diagnostics: IRuntimeDiagnostic[] = [];
  const assetsById = new Map(bundle.assets.assets.map((asset) => [asset.id, asset]));
  const materialsById = new Map(bundle.materials.materials.map((material) => [material.id, material]));
  let selectedCamera: THREE.Camera | undefined;

  const entities = [...bundle.world.entities].sort((left, right) => left.id.localeCompare(right.id));
  for (const entity of entities) {
    const object = mapEntity(entity, assetsById, materialsById, diagnostics, bundle.source);
    applyTransform(object, entity);
    applyVisibility(object, entity);
    objectsById.set(entity.id, object);
  }

  for (const entity of entities) {
    const object = objectsById.get(entity.id);
    if (object === undefined) {
      continue;
    }

    const parentId = readParentId(entity);
    const parent = parentId === undefined ? undefined : objectsById.get(parentId);
    if (parent !== undefined) {
      parent.add(object);
    } else {
      scene.add(object);
    }

    if (object instanceof THREE.Camera && selectedCamera === undefined) {
      selectedCamera = object;
    }
  }

  const activeCameraEntity = readActiveCamera(bundle);
  const activeCamera = activeCameraEntity === undefined ? undefined : objectsById.get(activeCameraEntity);
  if (activeCamera instanceof THREE.Camera) {
    selectedCamera = activeCamera;
  }

  if (selectedCamera === undefined) {
    selectedCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    selectedCamera.position.set(0, 1.5, 4);
    diagnostics.push({
      code: "TN-WEB-CAMERA-MISSING",
      message: "No camera entity was found; using fallback camera.",
      path: "world.ir.json/resources/ActiveCamera",
      severity: "warning",
    });
  }

  return { camera: selectedCamera, diagnostics, objectsById, scene };
}

export function advanceAnimationPlayback(mapped: IThreeWorld, fixedDelta: number): void {
  for (const object of mapped.objectsById.values()) {
    const playback = object.userData.threeNativeAnimation as IAnimationPlaybackState | undefined;
    if (playback !== undefined) {
      object.userData.threeNativeAnimation = advanceAnimationPlaybackState(playback, fixedDelta);
    }
  }
}

function mapEntity(
  entity: IWorldEntity,
  assetsById: Map<string, IAssetIr>,
  materialsById: Map<string, IMaterialIr>,
  diagnostics: IRuntimeDiagnostic[],
  source?: string,
): THREE.Object3D {
  const renderer = entity.components.MeshRenderer;
  if (renderer !== undefined) {
    const asset = assetsById.get(renderer.mesh);
    const material = materialsById.get(renderer.material);
    if (asset !== undefined && material !== undefined) {
      const object = new THREE.Mesh(mapGeometry(asset), mapMaterial(material, assetsById, diagnostics, source));
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
    return new THREE.PerspectiveCamera(camera.fovY ?? 60, 1, camera.near, camera.far);
  }
  if (camera?.kind === "orthographic") {
    const halfSize = (camera.size ?? 1) / 2;
    return new THREE.OrthographicCamera(-halfSize, halfSize, halfSize, -halfSize, camera.near, camera.far);
  }

  const light = entity.components.Light;
  if (light?.kind === "directional") {
    return new THREE.DirectionalLight(colorToThree(light.color), light.intensity);
  }
  if (light?.kind === "ambient") {
    return new THREE.AmbientLight(colorToThree(light.color), light.intensity);
  }
  if (light?.kind === "point") {
    return new THREE.PointLight(colorToThree(light.color), light.intensity, light.range ?? 0);
  }
  if (light?.kind === "spot") {
    const spot = new THREE.SpotLight(colorToThree(light.color), light.intensity, light.range ?? 0);
    if (light.angle !== undefined) {
      spot.angle = light.angle;
    }
    return spot;
  }

  return new THREE.Object3D();
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
  const aoMap = mapTextureSlot(material, "occlusionTexture", assetsById, diagnostics, source);
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
  const parameters: THREE.MeshStandardMaterialParameters = {
    color: colorToThree(material.color),
    metalness: material.metalness ?? 0,
    roughness: material.roughness ?? 1,
  };
  if (aoMap !== undefined) {
    parameters.aoMap = aoMap;
  }
  if (emissiveMap !== undefined) {
    parameters.emissiveMap = emissiveMap;
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
  const mapped = new THREE.MeshStandardMaterial(parameters);
  mapped.needsUpdate = true;
  return mapped;
}

function mapTextureSlot(
  material: IMaterialIr,
  slot: "baseColorTexture" | "emissiveTexture" | "metallicRoughnessTexture" | "normalTexture" | "occlusionTexture",
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
  const texture = canLoadImageInRuntime() ? new THREE.TextureLoader().load(url) : new THREE.Texture();
  texture.name = asset.id;
  texture.userData = {
    ...texture.userData,
    threenativeAssetId: asset.id,
    threenativeSlot: slot,
    threenativeUrl: url,
  };
  return texture;
}

function canLoadImageInRuntime(): boolean {
  return (globalThis as { document?: unknown }).document !== undefined;
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

function colorToThree(color: IMaterialIr["color"]): THREE.Color {
  if (typeof color === "string") {
    return new THREE.Color(color);
  }
  return new THREE.Color(color[0], color[1], color[2]);
}

function readParentId(entity: IWorldEntity): string | undefined {
  const hierarchy = entity.components.Hierarchy as { parent?: string } | undefined;
  return hierarchy?.parent;
}

function readActiveCamera(bundle: IWebBundle): string | undefined {
  const activeCamera = bundle.world.resources?.ActiveCamera as { entity?: string } | undefined;
  return activeCamera?.entity;
}

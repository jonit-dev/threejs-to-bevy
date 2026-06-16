import * as THREE from "three";
import type { IAssetIr, IAssetsManifest, IMaterialIr, IRuntimeDiagnostic, IWorldIr } from "@threenative/ir";

import { updateCameraHelpers, updateCameraProjection } from "./cameras.js";
import type { IThreeWorld } from "./mapWorld.js";

export interface IRenderTargetEntry {
  assetId: string;
  height: number;
  target: THREE.WebGLRenderTarget;
  texture: THREE.Texture;
  width: number;
}

export interface IRenderTargetRegistry {
  diagnostics: IRuntimeDiagnostic[];
  entries: Map<string, IRenderTargetEntry>;
}

const TEXTURE_SLOTS = [
  "baseColorTexture",
  "normalTexture",
  "metallicRoughnessTexture",
  "emissiveTexture",
  "occlusionTexture",
  "clearcoatTexture",
  "clearcoatRoughnessTexture",
  "transmissionTexture",
] as const;

export function createRenderTargetRegistry(
  assets: IAssetsManifest,
  _renderer: THREE.WebGLRenderer,
): IRenderTargetRegistry {
  const entries = new Map<string, IRenderTargetEntry>();
  const diagnostics: IRuntimeDiagnostic[] = [];
  for (const asset of assets.assets) {
    if (asset.kind !== "render-target" || asset.usage !== "color") {
      continue;
    }
    const target = new THREE.WebGLRenderTarget(asset.width, asset.height, {
      format: THREE.RGBAFormat,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
    });
    target.texture.name = asset.id;
    target.texture.userData = {
      ...target.texture.userData,
      threenativeAssetId: asset.id,
      threenativeRenderTarget: true,
    };
    entries.set(asset.id, {
      assetId: asset.id,
      height: asset.height,
      target,
      texture: target.texture,
      width: asset.width,
    });
  }
  return { diagnostics, entries };
}

export function bindRenderTargetTextures(
  mapped: IThreeWorld,
  registry: IRenderTargetRegistry,
  materials: readonly IMaterialIr[],
): void {
  const materialTextureIds = new Map<string, Map<string, string>>();
  for (const material of materials) {
    const slots = new Map<string, string>();
    for (const slot of TEXTURE_SLOTS) {
      const assetId = material[slot];
      if (assetId !== undefined) {
        slots.set(slot, assetId);
      }
    }
    materialTextureIds.set(material.id, slots);
  }

  mapped.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const materialRef = object.userData.threeNativeMaterialId as string | undefined;
    if (materialRef === undefined) {
      return;
    }
    const slots = materialTextureIds.get(materialRef);
    if (slots === undefined) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const mappedMaterial of materials) {
      if (!(mappedMaterial instanceof THREE.MeshStandardMaterial)) {
        continue;
      }
      for (const [slot, assetId] of slots.entries()) {
        const entry = registry.entries.get(assetId);
        if (entry === undefined) {
          continue;
        }
        if (slot === "baseColorTexture") {
          mappedMaterial.map = entry.texture;
        } else if (slot === "emissiveTexture") {
          mappedMaterial.emissiveMap = entry.texture;
        } else if (slot === "normalTexture") {
          mappedMaterial.normalMap = entry.texture;
        } else if (slot === "metallicRoughnessTexture") {
          mappedMaterial.metalnessMap = entry.texture;
          mappedMaterial.roughnessMap = entry.texture;
        } else if (slot === "occlusionTexture") {
          mappedMaterial.aoMap = entry.texture;
        }
        mappedMaterial.needsUpdate = true;
      }
    }
  });
}

export function renderTargetCameraPasses(
  renderer: THREE.WebGLRenderer,
  mapped: IThreeWorld,
  world: IWorldIr,
  registry: IRenderTargetRegistry,
  delta = 0,
): string[] {
  updateCameraHelpers(world, mapped.objectsById, delta);
  const rendered: string[] = [];
  const textureViews = mapped.cameraViews
    .filter((view) => view.targetKind === "texture")
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.entityId.localeCompare(right.entityId);
    });

  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  const sceneBackground = mapped.scene.background instanceof THREE.Color ? mapped.scene.background : new THREE.Color("#111318");

  for (const view of textureViews) {
    const assetId = view.targetAsset;
    if (assetId === undefined) {
      continue;
    }
    const entry = registry.entries.get(assetId);
    const camera = mapped.cameras.get(view.entityId);
    if (entry === undefined || camera === undefined) {
      continue;
    }
    updateCameraProjection(camera, entry.width, entry.height);
    renderer.setRenderTarget(entry.target);
    renderer.autoClear = true;
    renderer.setClearColor(sceneBackground);
    renderer.clear();
    renderer.render(mapped.scene, camera);
    rendered.push(view.entityId);
  }

  renderer.setRenderTarget(previousTarget);
  renderer.autoClear = previousAutoClear;
  return rendered;
}

export function listScreenshotExportDeclarations(world: IWorldIr): Array<{
  cameraId: string;
  format: "jpeg" | "png";
  height?: number;
  path: string;
  width?: number;
}> {
  const exports: Array<{
    cameraId: string;
    format: "jpeg" | "png";
    height?: number;
    path: string;
    width?: number;
  }> = [];
  for (const entity of world.entities) {
    const output = entity.components.Camera?.output;
    if (output?.path === undefined) {
      continue;
    }
    exports.push({
      cameraId: entity.id,
      format: output.format ?? "png",
      ...(output.height === undefined ? {} : { height: output.height }),
      path: output.path,
      ...(output.width === undefined ? {} : { width: output.width }),
    });
  }
  return exports.sort((left, right) => left.cameraId.localeCompare(right.cameraId));
}

export function isRenderTargetAsset(asset: IAssetIr): asset is Extract<IAssetIr, { kind: "render-target" }> {
  return asset.kind === "render-target";
}

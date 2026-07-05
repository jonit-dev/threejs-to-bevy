import * as THREE from "three";
import type { IAssetIr } from "@threenative/ir";

let pendingTextureLoads: Promise<void>[] = [];

export function resetPendingTextureLoads(): void {
  pendingTextureLoads = [];
}

export function enqueuePendingTextureLoad(load: Promise<void>): void {
  pendingTextureLoads.push(load);
}

export async function loadPendingTextureLoads(): Promise<void> {
  await Promise.all(pendingTextureLoads);
  pendingTextureLoads = [];
}

export function canLoadImageInRuntime(): boolean {
  return (globalThis as { document?: unknown }).document !== undefined;
}

export function applyTextureControls(texture: THREE.Texture, asset: Extract<IAssetIr, { kind: "texture" }>): void {
  if (asset.wrapS !== undefined) {
    texture.wrapS = textureWrapMode(asset.wrapS);
  }
  if (asset.wrapT !== undefined) {
    texture.wrapT = textureWrapMode(asset.wrapT);
  }
  if (asset.minFilter !== undefined) {
    texture.minFilter = textureMinFilter(asset.minFilter);
  }
  if (asset.magFilter !== undefined) {
    texture.magFilter = textureMagFilter(asset.magFilter);
  }
  if (asset.repeat !== undefined) {
    texture.repeat.fromArray([...asset.repeat]);
  }
  if (asset.offset !== undefined) {
    texture.offset.fromArray([...asset.offset]);
  }
  if (asset.center !== undefined) {
    texture.center.fromArray([...asset.center]);
  }
  if (asset.rotation !== undefined) {
    texture.rotation = asset.rotation;
  }
  texture.needsUpdate = true;
}

function textureWrapMode(value: NonNullable<Extract<IAssetIr, { kind: "texture" }>["wrapS"]>): THREE.Wrapping {
  switch (value) {
    case "mirroredRepeat":
      return THREE.MirroredRepeatWrapping;
    case "repeat":
      return THREE.RepeatWrapping;
    case "clampToEdge":
      return THREE.ClampToEdgeWrapping;
  }
}

function textureMinFilter(value: NonNullable<Extract<IAssetIr, { kind: "texture" }>["minFilter"]>): THREE.MinificationTextureFilter {
  switch (value) {
    case "nearest":
      return THREE.NearestFilter;
    case "nearestMipmapNearest":
      return THREE.NearestMipmapNearestFilter;
    case "nearestMipmapLinear":
      return THREE.NearestMipmapLinearFilter;
    case "linearMipmapNearest":
      return THREE.LinearMipmapNearestFilter;
    case "linearMipmapLinear":
      return THREE.LinearMipmapLinearFilter;
    case "linear":
      return THREE.LinearFilter;
  }
}

function textureMagFilter(value: NonNullable<Extract<IAssetIr, { kind: "texture" }>["magFilter"]>): THREE.MagnificationTextureFilter {
  return value === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
}

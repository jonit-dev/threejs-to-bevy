import * as THREE from "three";
import type { IWorldEntity, IWorldIr } from "@threenative/ir";
import type { IThreeWorld } from "./mapWorld.js";

const MAX_LIVE_WORLD_TEXT = 64;

export function mapWorldTextObject(component: NonNullable<IWorldEntity["components"]["WorldText"]>): THREE.Object3D {
  const material = new THREE.SpriteMaterial({
    color: textColor(component.color),
    depthTest: true,
    depthWrite: false,
    opacity: 1,
    transparent: true,
  });
  const canvas = createTextCanvas(component.text, component.size ?? 24, component.color);
  if (canvas !== undefined) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
  }
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(Math.max(0.01, (component.size ?? 24) / 48));
  sprite.userData.threeNativeWorldText = true;
  sprite.userData.threeNativeWorldTextText = component.text;
  return sprite;
}

export function syncWorldText(world: IWorldIr, mapped: IThreeWorld, delta: number): void {
  const live = world.entities.filter((entity) => entity.components.WorldText !== undefined);
  const expired = new Set<string>();
  for (const entity of live) {
    const component = entity.components.WorldText;
    if (component === undefined) {
      continue;
    }
    const object = mapped.objectsById.get(entity.id);
    if (object === undefined) {
      continue;
    }
    const lifetime = component.lifetime;
    const elapsed = Math.max(0, (component.elapsed ?? 0) + Math.max(0, delta));
    component.elapsed = elapsed;
    if (lifetime !== undefined && elapsed >= lifetime) {
      expired.add(entity.id);
      continue;
    }
    const target = component.target === undefined ? undefined : mapped.objectsById.get(component.target);
    const base = target === undefined ? readEntityPosition(entity) : target.getWorldPosition(new THREE.Vector3()).toArray();
    const offset = component.offset ?? [0, 0, 0];
    const floatProgress = lifetime === undefined || lifetime <= 0 ? Math.min(1, elapsed) : Math.min(1, elapsed / lifetime);
    object.position.set(base[0] + offset[0], base[1] + offset[1] + (component.floatDistance ?? 0) * floatProgress, base[2] + offset[2]);
    if (component.billboard !== false && mapped.camera !== undefined) {
      object.quaternion.copy(mapped.camera.quaternion);
    }
    const material = object instanceof THREE.Sprite ? object.material : undefined;
    if (material !== undefined) {
      const opacity = component.fade === false || lifetime === undefined || lifetime <= 0 ? 1 : Math.max(0, 1 - elapsed / lifetime);
      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.needsUpdate = true;
    }
  }
  if (expired.size > 0) {
    world.entities = world.entities.filter((entity) => !expired.has(entity.id));
  }
  if (live.length > MAX_LIVE_WORLD_TEXT) {
    const overflow = live.slice(MAX_LIVE_WORLD_TEXT).map((entity) => entity.id);
    world.entities = world.entities.filter((entity) => !overflow.includes(entity.id));
  }
}

function readEntityPosition(entity: IWorldEntity): [number, number, number] {
  const position = entity.components.Transform?.position;
  return position === undefined ? [0, 0, 0] : [position[0], position[1], position[2]];
}

function textColor(value: unknown): THREE.ColorRepresentation {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return new THREE.Color(value[0] ?? 1, value[1] ?? 1, value[2] ?? 1);
  }
  return "#ffffff";
}

function createTextCanvas(text: string, size: number, color: unknown): HTMLCanvasElement | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) {
    return undefined;
  }
  const fontSize = Math.max(8, Math.min(128, size));
  context.font = `600 ${fontSize}px sans-serif`;
  const width = Math.ceil(context.measureText(text).width + fontSize);
  canvas.width = Math.max(1, width);
  canvas.height = Math.ceil(fontSize * 1.6);
  context.font = `600 ${fontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = typeof color === "string" ? color : "#ffffff";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas;
}

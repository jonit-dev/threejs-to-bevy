import * as THREE from "three";
import type { IWorldIr, IrTweenEasing, IrTweenProperty } from "@threenative/ir";
import type { IThreeWorld } from "./mapWorld.js";
import type { IQueuedCommand, IQueuedServiceCall } from "./systems/contextTypes.js";

const MAX_TWEENS = 128;
const MAX_SHAKES = 32;

export interface IPresentationLog {
  at: number;
  entity?: string;
  id: string;
  kind: "cancel" | "complete" | "start";
  property?: IrTweenProperty;
}

export interface IPresentationRuntimeState {
  elapsed: number;
  logs: IPresentationLog[];
  shakes: Map<string, IShakeEntry>;
  tweens: Map<string, ITweenEntry>;
  worldTextSequence: number;
}

interface ITweenEntry {
  direction: 1 | -1;
  duration: number;
  elapsed: number;
  easing: IrTweenEasing;
  entity: string;
  from: number[];
  id: string;
  loops: number;
  property: IrTweenProperty;
  to: number[];
  yoyo: boolean;
}

interface IShakeEntry {
  amplitude: number;
  camera?: string;
  duration: number;
  elapsed: number;
  frequency: number;
  id: string;
  seed: number;
}

export function createPresentationRuntimeState(): IPresentationRuntimeState {
  return { elapsed: 0, logs: [], shakes: new Map(), tweens: new Map(), worldTextSequence: 0 };
}

export function enqueuePresentationEffects(
  world: IWorldIr,
  mapped: IThreeWorld,
  state: IPresentationRuntimeState,
  commands: readonly IQueuedCommand[],
  services: readonly IQueuedServiceCall[],
): void {
  for (const command of commands) {
    if (command.kind === "despawn") {
      cancelPresentationEntity(state, command.entity);
    }
    if (command.kind === "tween") {
      enqueueTween(world, mapped, state, command);
    }
  }
  for (const service of services) {
    if (service.service === "camera.shake") {
      enqueueShake(state, service.payload);
    }
    if (service.service === "effects.play") {
      enqueuePresetCameraShake(state, service.payload);
    }
  }
}

export function stepPresentation(
  world: IWorldIr,
  mapped: IThreeWorld,
  state: IPresentationRuntimeState,
  delta: number,
): void {
  const frameDelta = Math.max(Number.isFinite(delta) ? delta : 0, 0);
  state.elapsed += frameDelta;
  stepTweens(world, mapped, state, frameDelta);
  advanceShakes(state, frameDelta);
}

export function applyPresentationCameraShake(mapped: IThreeWorld, state: IPresentationRuntimeState): void {
  for (const [id, shake] of [...state.shakes.entries()]) {
    const camera = shake.camera === undefined ? mapped.camera : mapped.cameras.get(shake.camera);
    if (camera === undefined) {
      state.shakes.delete(id);
      continue;
    }
    const previous = camera.userData.threeNativePortableShakeOffset as [number, number, number] | undefined;
    if (previous !== undefined) {
      camera.position.sub(new THREE.Vector3(...previous));
    }
    const envelope = shakeEnvelope(shake.elapsed, shake.duration);
    if (envelope <= 0) {
      delete camera.userData.threeNativePortableShakeOffset;
      state.shakes.delete(id);
      continue;
    }
    const phase = shake.seed + shake.elapsed * shake.frequency * Math.PI * 2;
    const offset: [number, number, number] = [
      Math.sin(phase) * shake.amplitude * envelope,
      Math.cos(phase * 1.17) * shake.amplitude * envelope * 0.7,
      Math.sin(phase * 0.71) * shake.amplitude * envelope * 0.35,
    ];
    camera.position.add(new THREE.Vector3(...offset));
    camera.userData.threeNativePortableShakeOffset = offset;
  }
}

export function cancelPresentationEntity(state: IPresentationRuntimeState, entity: string): void {
  for (const [key, tween] of state.tweens) {
    if (tween.entity !== entity) {
      continue;
    }
    state.tweens.delete(key);
    log(state, { at: state.elapsed, entity, id: tween.id, kind: "cancel", property: tween.property });
  }
}

export function shakeEnvelope(elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) {
    return 0;
  }
  return Math.max(0, 1 - Math.max(0, elapsed) / duration);
}

function enqueueTween(world: IWorldIr, mapped: IThreeWorld, state: IPresentationRuntimeState, command: IQueuedCommand): void {
  const raw = isRecord(command.value) ? command.value : {};
  const duration = boundedNumber(raw.duration, 0, 10, 0);
  const loops = Math.floor(boundedNumber(raw.loops, 0, 8, 0));
  const easing = readEasing(raw.easing);
  const property = command.property;
  if (property === undefined || !isTweenProperty(property) || state.tweens.size >= MAX_TWEENS) {
    return;
  }
  const from = readTweenValue(world, mapped, command.entity, property);
  const to = normalizeTweenValue(property, raw.to);
  if (from === undefined || to === undefined) {
    return;
  }
  const id = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : `tween:${command.entity}:${property}:${state.elapsed.toFixed(6)}`;
  const key = `${command.entity}\0${property}`;
  const previous = state.tweens.get(key);
  if (previous !== undefined) {
    state.tweens.delete(key);
    log(state, { at: state.elapsed, entity: command.entity, id: previous.id, kind: "cancel", property });
  }
  const entry: ITweenEntry = {
    direction: 1,
    duration,
    elapsed: 0,
    easing,
    entity: command.entity,
    from,
    id,
    loops,
    property,
    to,
    yoyo: raw.yoyo === true,
  };
  state.tweens.set(key, entry);
  log(state, { at: state.elapsed, entity: command.entity, id, kind: "start", property });
  if (duration === 0) {
    applyTweenValue(world, mapped, entry, 1);
    state.tweens.delete(key);
    log(state, { at: state.elapsed, entity: command.entity, id, kind: "complete", property });
  }
}

function stepTweens(world: IWorldIr, mapped: IThreeWorld, state: IPresentationRuntimeState, delta: number): void {
  for (const [key, tween] of [...state.tweens.entries()]) {
    if (world.entities.every((entity) => entity.id !== tween.entity)) {
      state.tweens.delete(key);
      log(state, { at: state.elapsed, entity: tween.entity, id: tween.id, kind: "cancel", property: tween.property });
      continue;
    }
    tween.elapsed += delta;
    const progress = tween.duration <= 0 ? 1 : Math.min(1, tween.elapsed / tween.duration);
    const eased = ease(progress, tween.easing);
    applyTweenValue(world, mapped, tween, tween.direction === 1 ? eased : 1 - eased);
    if (progress < 1) {
      continue;
    }
    if (tween.loops > 0) {
      tween.loops -= 1;
      tween.elapsed = 0;
      if (tween.yoyo) {
        tween.direction = tween.direction === 1 ? -1 : 1;
      }
      continue;
    }
    state.tweens.delete(key);
    log(state, { at: state.elapsed, entity: tween.entity, id: tween.id, kind: "complete", property: tween.property });
  }
}

function applyTweenValue(world: IWorldIr, mapped: IThreeWorld, tween: ITweenEntry, progress: number): void {
  const value = tween.from.map((from, index) => from + (tween.to[index] ?? from) * progress - from * progress);
  const entity = world.entities.find((candidate) => candidate.id === tween.entity);
  const object = mapped.objectsById.get(tween.entity);
  if (tween.property === "position" || tween.property === "scale") {
    if (entity !== undefined) {
      const current = isRecord(entity.components.Transform) ? entity.components.Transform : {};
      entity.components.Transform = { ...current, [tween.property]: value };
    }
    if (object !== undefined) {
      if (tween.property === "position") {
        object.position.fromArray(value);
      } else {
        object.scale.fromArray(value);
      }
    }
    return;
  }
  if (tween.property === "rotation") {
    const from = new THREE.Quaternion().fromArray(tween.from);
    const to = new THREE.Quaternion().fromArray(tween.to);
    if (from.dot(to) < 0) {
      to.set(-to.x, -to.y, -to.z, -to.w);
    }
    const rotation = from.slerp(to, progress).toArray();
    if (entity !== undefined) {
      const current = isRecord(entity.components.Transform) ? entity.components.Transform : {};
      entity.components.Transform = { ...current, rotation };
    }
    if (object !== undefined) {
      object.quaternion.fromArray(rotation);
    }
    return;
  }
  if (object === undefined) {
    return;
  }
  const setMaterial = (material: THREE.Material): void => {
    const candidate = material as THREE.Material & { emissiveIntensity?: number; opacity?: number };
    const next = value[0] ?? 0;
    if (tween.property === "opacity" && candidate.opacity !== undefined) {
      candidate.opacity = next;
      candidate.transparent = next < 1;
      candidate.needsUpdate = true;
    }
    if (tween.property === "emissiveIntensity" && candidate.emissiveIntensity !== undefined) {
      candidate.emissiveIntensity = next;
      candidate.needsUpdate = true;
    }
  };
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        setMaterial(material);
      }
    }
  });
}

function readTweenValue(world: IWorldIr, mapped: IThreeWorld, entityId: string, property: IrTweenProperty): number[] | undefined {
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  const object = mapped.objectsById.get(entityId);
  if (property === "position" || property === "scale") {
    const transform = entity?.components.Transform;
    const value = property === "position" ? transform?.position : transform?.scale;
    return value === undefined ? [...(property === "scale" ? [1, 1, 1] : [0, 0, 0])] : [...value];
  }
  if (property === "rotation") {
    const value = entity?.components.Transform?.rotation;
    return value === undefined ? [0, 0, 0, 1] : [...value];
  }
  let result: number | undefined;
  object?.traverse((child) => {
    if (result !== undefined || !(child instanceof THREE.Mesh)) {
      return;
    }
    const material = (Array.isArray(child.material) ? child.material[0] : child.material) as THREE.Material & { emissiveIntensity?: number; opacity?: number };
    result = property === "opacity" ? material.opacity : material.emissiveIntensity;
  });
  return result === undefined ? undefined : [result];
}

function normalizeTweenValue(property: IrTweenProperty, value: unknown): number[] | undefined {
  const expected = property === "rotation" ? 4 : property === "position" || property === "scale" ? 3 : 1;
  if (typeof value === "number" && expected === 1 && Number.isFinite(value)) {
    return [value];
  }
  if (!Array.isArray(value) || value.length !== expected || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  return value as number[];
}

function enqueueShake(state: IPresentationRuntimeState, payload: unknown): void {
  const raw = isRecord(payload) && isRecord(payload.request) ? payload.request : isRecord(payload) ? payload : {};
  const result = isRecord(payload) && isRecord(payload.result) ? payload.result : {};
  if (result.accepted === false || state.shakes.size >= MAX_SHAKES) {
    return;
  }
  const id = typeof result.id === "string" ? result.id : `shake:${state.elapsed.toFixed(6)}:${state.shakes.size}`;
  state.shakes.set(id, {
    amplitude: boundedNumber(raw.amplitude, 0, 2, 0.08),
    camera: typeof raw.camera === "string" ? raw.camera : undefined,
    duration: boundedNumber(raw.duration, 0, 5, 0.15),
    elapsed: 0,
    frequency: boundedNumber(raw.frequency, 0, 120, 24),
    id,
    seed: seedNumber(raw.seed, id),
  });
}

function enqueuePresetCameraShake(state: IPresentationRuntimeState, payload: unknown): void {
  if (!isRecord(payload) || !isRecord(payload.camera)) {
    return;
  }
  enqueueShake(state, { request: payload.camera, result: { accepted: true, id: `feedback-shake:${state.elapsed.toFixed(6)}` } });
}

function advanceShakes(state: IPresentationRuntimeState, delta: number): void {
  for (const shake of state.shakes.values()) {
    shake.elapsed += delta;
  }
}

function log(state: IPresentationRuntimeState, entry: IPresentationLog): void {
  state.logs.push(entry);
  if (state.logs.length > 512) {
    state.logs.splice(0, state.logs.length - 512);
  }
}

function isTweenProperty(value: unknown): value is IrTweenProperty {
  return ["emissiveIntensity", "opacity", "position", "rotation", "scale"].includes(String(value));
}

function readEasing(value: unknown): IrTweenEasing {
  return value === "ease-in" || value === "ease-out" || value === "ease-in-out" || value === "linear" ? value : "linear";
}

function ease(value: number, easing: IrTweenEasing): number {
  if (easing === "ease-in") {
    return value * value;
  }
  if (easing === "ease-out") {
    return 1 - (1 - value) * (1 - value);
  }
  if (easing === "ease-in-out") {
    return value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
  }
  return value;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function seedNumber(value: unknown, fallback: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const source = typeof value === "string" ? value : fallback;
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

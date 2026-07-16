import { buildComponentReflectionRegistry, type IComponentReflectionRegistry, type IComponentReflectionType } from "@threenative/ir/reflection";
import { feedbackPresetById } from "@threenative/ir/feedback";
import type { IAssetsManifest, IIrDelayedCommandDeclaration, IIrSchemaFile, IIrStateSource, IIrSystemDeclaration, ILocalDataIr, IPrefabsIr, IRuntimeDiagnostic, IScriptSystemQuery, ISystemsIr, IUiIr, IUiNodeIr, IWorldEntity, IWorldIr } from "@threenative/ir";
import { AnimationRuntimeController, ParticleRuntimeController } from "../animation.js";
import { ScriptAudioRuntimeController, type IScriptAudioPlayOptions } from "../audio.js";
import { traceCharacterControllers, type ICharacterTraceObservation } from "../character.js";
import type { IWebInputState } from "../input.js";
import { queryNavigationPath, type INavigationPathRequest, type INavigationPathResult } from "../navigation.js";
import { createPhysicsSensorRuntimeState, type IPhysicsSensorEvent } from "../sensors.js";
import type { IRenderedUi } from "../ui/renderUi.js";
import { animationPlayPayload, animationQueryPayload, animationStopPayload } from "./services/animation.js";
import { audioPlayPayload, audioQueryPayload, audioStopPayload } from "./services/audio.js";
import { createWebPersistenceService, type IWebPersistenceService } from "./services/persistence.js";
import { pickMesh, pointerRay, type IPickMeshRequest, type IPickMeshResult, type IPointerRayRequest, type IPointerRayResult } from "./services/picking.js";
import {
  overlapPrimitive,
  raycastPrimitive,
  shapeCastPrimitive,
  type IOverlapRequest,
  type IOverlapResult,
  type IRaycastRequest,
  type IRaycastResult,
  type IShapeCastRequest,
  type IShapeCastResult,
} from "./services/physics.js";
import type { IComponentDiffCache } from "./componentDiff.js";
import { createScriptUiState } from "./contextUi.js";
import { createRuntimeWriteLedger } from "./writeAudit.js";
import { createCountdownRuntimeState } from "../countdowns.js";
import { createPresentationRuntimeState } from "../presentation.js";
import type {
  IAssetLoadResult,
  ICharacterMoveRequest,
  ICameraShakeOptions,
  ICameraShakeResult,
  IComponentHookObservation,
  IEntityLifecycleQueryOptions,
  IInstantiateResult,
  IFeedbackPlayOptions,
  IFeedbackPlayResult,
  IObserverPropagationStep,
  IPhysicsBodyCommandResult,
  IPhysicsSensorRequest,
  IPhysicsSensorResult,
  IPluginDeclarationView,
  IPluginGroupView,
  IQueuedCommand,
  IQueuedEvent,
  IQueuedResourceWrite,
  IQueuedServiceCall,
  ISceneServiceResult,
  ISystemContext,
  ISystemEntityView,
  ISystemTransformFacade,
  ITaskDeclarationView,
  ITweenCommandOptions,
  ITweenCommandResult,
  IUiActivateResult,
  IUiDisabledResult,
  IUiFocusResult,
  IUiReadResult,
  IUiValueResult,
  IWorldTextCommandOptions,
  IWorldTextCommandResult,
} from "./contextTypes.js";
export type {
  IAssetLoadResult,
  ICharacterMoveRequest,
  ICameraShakeOptions,
  ICameraShakeResult,
  IComponentHookObservation,
  IEntityLifecycleQueryOptions,
  IInstantiateResult,
  IFeedbackPlayOptions,
  IFeedbackPlayResult,
  IObserverPropagationStep,
  IParticleCommandOptions,
  IParticleCommandResult,
  IPhysicsSensorRequest,
  IPhysicsSensorResult,
  IPluginDeclarationView,
  IPluginGroupView,
  IQueuedCommand,
  IQueuedEvent,
  IQueuedResourceWrite,
  IQueuedServiceCall,
  ISceneServiceResult,
  ISystemCommandBuffer,
  ISystemContext,
  ISystemEntityView,
  ISystemTransformFacade,
  ITaskDeclarationView,
  ITweenCommandOptions,
  ITweenCommandResult,
  IUiActivateResult,
  IUiDisabledResult,
  IUiFocusResult,
  IUiReadResult,
  IUiValueResult,
  IWorldTextCommandOptions,
  IWorldTextCommandResult,
} from "./contextTypes.js";

export function createWebSystemRuntimeState(
  world: IWorldIr,
  options: { assets?: IAssetsManifest; audio?: import("@threenative/ir").IAudioIr },
) {
  const seed = randomSeed(world);
  const runtimeState = {
    animations: new AnimationRuntimeController(),
    assets: options.assets,
    audio: options.audio,
    countdowns: createCountdownRuntimeState(),
    delayedCommands: [] as IWebDelayedCommand[],
    inputEdges: createInputEdgeRuntimeState(),
    particles: new ParticleRuntimeController(options.assets),
    random: createDeterministicRandom(seed),
    randomSeedKey: runtimeSeedKey(seed),
    scriptAudio: new ScriptAudioRuntimeController(options.audio),
    sensors: createPhysicsSensorRuntimeState(),
    lifecycle: createEntityLifecycleRuntimeState(world),
    presentation: createPresentationRuntimeState(),
    knownComponents: new Set(world.entities.flatMap((entity) => Object.keys(entity.components))),
    queryDiagnostics: new Set<string>(),
    writeLedger: createRuntimeWriteLedger(),
  };
  recordInitialRuntimeWrites(world, runtimeState.writeLedger);
  return runtimeState;
}

function createInputEdgeRuntimeState() {
  const observations = new Map<string, { frame: number; tick: number }>();
  return {
    read(kind: "pressed" | "released", name: string, frame: number, tick: number, active: boolean): boolean {
      if (!active) return false;
      const key = `${kind}:${name}`;
      const observed = observations.get(key);
      if (observed?.frame === frame) return observed.tick === tick;
      observations.set(key, { frame, tick });
      return true;
    },
  };
}

export interface IWebEntityLifecycleRuntimeState {
  beginTick(world: IWorldIr, tick: number): void;
  despawned(options?: IEntityLifecycleQueryOptions): string[];
  observe(before: ReadonlyMap<string, readonly string[]>, world: IWorldIr): void;
  spawned(options?: IEntityLifecycleQueryOptions): string[];
}

export function createEntityLifecycleRuntimeState(world: IWorldIr): IWebEntityLifecycleRuntimeState {
  let activeTick: number | undefined;
  let known = entityTagSnapshot(world);
  let spawned = new Map<string, string[]>();
  let despawned = new Map<string, string[]>();
  const matches = (tags: readonly string[], options: IEntityLifecycleQueryOptions | undefined): boolean => {
    if (options?.tag === undefined) {
      return true;
    }
    return validEntityTag(options.tag) && tags.includes(options.tag);
  };
  return {
    beginTick(nextWorld, tick) {
      if (activeTick === tick) {
        return;
      }
      activeTick = tick;
      spawned = new Map();
      despawned = new Map();
      known = entityTagSnapshot(nextWorld);
    },
    despawned(options) {
      return [...despawned.entries()]
        .filter(([, tags]) => matches(tags, options))
        .map(([id]) => id)
        .sort((left, right) => left.localeCompare(right));
    },
    observe(before, nextWorld) {
      const after = entityTagSnapshot(nextWorld);
      for (const [id, tags] of before) {
        if (!after.has(id)) {
          despawned.set(id, [...tags]);
        }
      }
      for (const [id, tags] of after) {
        if (!before.has(id)) {
          spawned.set(id, [...tags]);
        }
      }
      known = after;
    },
    spawned(options) {
      return [...spawned.entries()]
        .filter(([, tags]) => matches(tags, options))
        .map(([id]) => id)
        .sort((left, right) => left.localeCompare(right));
    },
  };
}

function entityTagSnapshot(world: IWorldIr): Map<string, string[]> {
  return new Map(world.entities.map((entity) => [entity.id, normalizeEntityTags(entity.tags)] as const));
}

function normalizeEntityTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).filter((tag): tag is string => typeof tag === "string" && validEntityTag(tag)))].sort((left, right) => left.localeCompare(right));
}

function validEntityTag(tag: unknown): tag is string {
  return typeof tag === "string" && tag.trim() !== "" && tag.length <= 64 && !/[\u0000-\u001f\u007f]/u.test(tag);
}

function recordInitialRuntimeWrites(world: IWorldIr, ledger: ReturnType<typeof createRuntimeWriteLedger>): void {
  for (const entity of world.entities) {
    for (const [component, value] of Object.entries(entity.components)) {
      for (const field of writeFields(value)) {
        ledger.record({
          newValue: isRecord(value) ? value[field] : value,
          path: `${component}/${field}`,
          schedule: "startup",
          system: "initial-ir",
          targetId: entity.id,
          targetKind: "component",
          tick: 0,
          writer: "initial-ir",
        });
      }
    }
  }
  for (const [resource, value] of Object.entries(world.resources ?? {})) {
    for (const field of writeFields(value)) {
      ledger.record({
        newValue: isRecord(value) ? value[field] : value,
        path: field,
        schedule: "startup",
        system: "initial-ir",
        targetId: resource,
        targetKind: "resource",
        tick: 0,
        writer: "initial-ir",
      });
    }
  }
}

export interface IResourceObservation {
  frame?: number;
  kind: "load" | "read" | "write";
  resource: string;
  schedule?: string;
  system?: string;
  tick?: number;
}

export interface IWebDelayedCommand {
  cancelPolicy: "drop" | "flush";
  command: IQueuedCommand;
  delayTicks: number;
  enqueuedTick: number;
  id: string;
  ownership: {
    id: string;
    kind: "entity" | "scene";
  };
  remainingTicks: number;
  schedule: IIrSystemDeclaration["schedule"];
  systemName: string;
}

const webSystemRuntimeStates = new WeakMap<IWorldIr, ReturnType<typeof createWebSystemRuntimeState>>();

export function webSystemRuntimeStateFor(
  world: IWorldIr,
  options: { assets?: IAssetsManifest; audio?: import("@threenative/ir").IAudioIr },
): ReturnType<typeof createWebSystemRuntimeState> {
  const seedKey = runtimeSeedKey(randomSeed(world));
  const existing = webSystemRuntimeStates.get(world);
  if (existing !== undefined && existing.assets === options.assets && existing.audio === options.audio && existing.randomSeedKey === seedKey) {
    return existing;
  }
  const next = createWebSystemRuntimeState(world, options);
  webSystemRuntimeStates.set(world, next);
  return next;
}

export function createSystemContext(
  world: IWorldIr,
  options: { assets?: IAssetsManifest; audio?: import("@threenative/ir").IAudioIr; componentDiff?: IComponentDiffCache; componentSchemas?: IIrSchemaFile; currentScene?: string | null; defaultQuery?: IScriptSystemQuery; delayedCommands?: IIrSystemDeclaration["delayedCommands"]; delta: number; elapsed?: number; fixedDelta: number; frame?: number; input?: IWebInputState; localData?: ILocalDataIr; mappedObjects?: ReadonlyMap<string, import("three").Object3D>; paused?: boolean; persistence?: IWebPersistenceService; prefabs?: IPrefabsIr; resourceObserver?: (observation: Omit<IResourceObservation, "frame" | "schedule" | "system" | "tick">) => void; runtimeState?: ReturnType<typeof createWebSystemRuntimeState>; schedule?: IIrSystemDeclaration["schedule"]; systemName?: string; systems?: ISystemsIr; tick?: number; ui?: IUiIr; uiState?: IRenderedUi },
): {
  commands: IQueuedCommand[];
  context: ISystemContext;
  diagnostics: IRuntimeDiagnostic[];
  events: IQueuedEvent[];
  resources: IQueuedResourceWrite[];
  services: IQueuedServiceCall[];
} {
  const commands: IQueuedCommand[] = [];
  const diagnostics: IRuntimeDiagnostic[] = [];
  const events: IQueuedEvent[] = [];
  const resources: IQueuedResourceWrite[] = [];
  const services: IQueuedServiceCall[] = [];
  const states = evaluateStates(world, options.systems);
  const componentTypes = buildComponentReflectionRegistry(options.componentSchemas);
  const knownComponents = options.runtimeState?.knownComponents
    ?? new Set(world.entities.flatMap((entity) => Object.keys(entity.components)));
  for (const component of componentTypes.components) knownComponents.add(component.id);
  const emittedQueryDiagnostics = options.runtimeState?.queryDiagnostics ?? new Set<string>();
  const random = options.runtimeState?.random ?? createDeterministicRandom(randomSeed(world));
  const animations = options.runtimeState?.animations ?? new AnimationRuntimeController();
  const scriptAudio = options.runtimeState?.scriptAudio ?? new ScriptAudioRuntimeController(options.audio);
  const particles = options.runtimeState?.particles ?? new ParticleRuntimeController(options.assets);
  const sensors = options.runtimeState?.sensors ?? createPhysicsSensorRuntimeState();
  const persistence = options.persistence ?? createWebPersistenceService(options.localData ?? emptyLocalData());
  const ui = options.uiState ?? createScriptUiState(options.ui);
  const delayedScheduler = createDelayedScheduler(options.delayedCommands ?? [], {
    runtimeState: options.runtimeState,
    schedule: options.schedule ?? "update",
    systemName: options.systemName ?? "",
    tick: options.tick ?? 0,
  });
  const inputEdge = (kind: "pressed" | "released", name: string): boolean => {
    const active = kind === "pressed" ? options.input?.pressed(name) ?? false : options.input?.released(name) ?? false;
    return options.runtimeState?.inputEdges.read(kind, name, options.frame ?? 0, options.tick ?? 0, active) ?? active;
  };
  const entityViews = new Map<string, ISystemEntityView>();
  const currentResourceValue = (resource: string): unknown => {
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      const pending = resources[index];
      if (pending?.resource === resource) {
        return pending.value;
      }
    }
    return world.resources?.[resource];
  };
  const findEntity = (id: string): ISystemEntityView | undefined => {
    const entity = world.entities.find((candidate) => candidate.id === id);
    if (entity === undefined) return undefined;
    const existing = entityViews.get(entity.id);
    if (existing !== undefined) return existing;
    const view = createEntityView(entity, commands);
    entityViews.set(entity.id, view);
    return view;
  };
  const queuePhysicsBodyCommand = (
    service: "physics.addForce" | "physics.addTorque" | "physics.applyAngularImpulse" | "physics.applyImpulse" | "physics.setAngularVelocity" | "physics.setLinearVelocity",
    entity: string,
    value: readonly [number, number, number],
  ): IPhysicsBodyCommandResult => {
    const target = world.entities.find((candidate) => candidate.id === entity);
    const validVector = value.length === 3 && value.every(Number.isFinite);
    const result: IPhysicsBodyCommandResult = target === undefined
      ? { accepted: false, entity, status: "missing" }
      : !validVector
        ? { accepted: false, entity, status: "invalid-vector" }
        : target.components.RigidBody?.kind !== "dynamic"
          ? { accepted: false, entity, status: "invalid-body" }
          : { accepted: true, entity, status: "applied" };
    services.push({
      payload: {
        request: { entity, fixedDelta: options.fixedDelta, value: cloneValue(value) },
        result,
      },
      service,
    });
    return cloneValue(result) as IPhysicsBodyCommandResult;
  };
  return {
    commands,
    diagnostics,
    context: {
      animation: {
        play(entity, clip, playOptions = {}) {
          const entityId = normalizeEntityRef(entity);
          const options = cloneValue(playOptions) as Record<string, unknown>;
          const result = animations.play(entityId, clip, options);
          const payload = animationPlayPayload({ clip, entity: entityId, options }, result);
          services.push({ payload, service: "animation.play" });
          return cloneValue(payload.result) as ReturnType<typeof animationPlayPayload>["result"];
        },
        query(entity, clip) {
          const entityId = normalizeEntityRef(entity);
          const payload = animationQueryPayload({ ...(clip === undefined ? {} : { clip }), entity: entityId }, animations.query(entityId, clip));
          services.push({ payload, service: "animation.query" });
          return cloneValue(payload.result) as ReturnType<typeof animationQueryPayload>["result"];
        },
        stop(entity, clip) {
          const entityId = normalizeEntityRef(entity);
          const payload = animationStopPayload({ ...(clip === undefined ? {} : { clip }), entity: entityId }, animations.stop(entityId, clip));
          services.push({ payload, service: "animation.stop" });
          return cloneValue(payload.result) as ReturnType<typeof animationStopPayload>["result"];
        },
      },
      audio: {
        play(soundId, playOptions = {}) {
          const options = cloneValue(playOptions) as IScriptAudioPlayOptions;
          const result = scriptAudio.play(soundId, options);
          const payload = audioPlayPayload({ options: options as Record<string, unknown>, soundId }, result);
          services.push({ payload, service: "audio.play" });
          return cloneValue(payload.result) as ReturnType<typeof audioPlayPayload>["result"];
        },
        query(playbackId) {
          const payload = audioQueryPayload({ playbackId }, scriptAudio.query(playbackId));
          services.push({ payload, service: "audio.query" });
          return cloneValue(payload.result) as ReturnType<typeof audioQueryPayload>["result"];
        },
        stop(playbackId) {
          const payload = audioStopPayload({ playbackId }, scriptAudio.stop(playbackId));
          services.push({ payload, service: "audio.stop" });
          return cloneValue(payload.result) as ReturnType<typeof audioStopPayload>["result"];
        },
      },
      cameras: {
        shake(shakeOptions = {}) {
          const request = normalizeCameraShakeRequest(shakeOptions);
          const accepted = request.amplitude > 0 && request.duration > 0 && request.frequency > 0;
          const result = {
            accepted,
            id: `shake:${options.tick ?? 0}:${services.length}`,
            status: accepted ? "enqueued" as const : "rejected" as const,
          };
          services.push({ payload: { request, result }, service: "camera.shake" });
          return result;
        },
      },
      particles: {
        burst(asset, emitter, particleOptions = {}) {
          const request = { asset, emitter, options: cloneValue(particleOptions) };
          const result = particles.execute("burst", asset, emitter, particleOptions);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.burst" });
          return cloneValue(result);
        },
        clear(asset, emitter, particleOptions = {}) {
          const request = { asset, emitter, options: cloneValue(particleOptions) };
          const result = particles.execute("clear", asset, emitter, particleOptions);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.clear" });
          return cloneValue(result);
        },
        emit(asset, emitter, particleOptions = {}) {
          const request = { asset, emitter, options: cloneValue(particleOptions) };
          const result = particles.execute("emit", asset, emitter, particleOptions);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.emit" });
          return cloneValue(result);
        },
        play(asset, emitter, particleOptions = {}) {
          const request = { asset, emitter, options: cloneValue(particleOptions) };
          const result = particles.execute("play", asset, emitter, particleOptions);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.play" });
          return cloneValue(result);
        },
        reset(asset, emitter, particleOptions = {}) {
          const request = { asset, emitter, options: cloneValue(particleOptions) };
          const result = particles.execute("reset", asset, emitter, particleOptions);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.reset" });
          return cloneValue(result);
        },
        start(asset, emitter, particleOptions = {}) {
          const request = { asset, emitter, options: cloneValue(particleOptions) };
          const result = particles.execute("start", asset, emitter, particleOptions);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.start" });
          return cloneValue(result);
        },
        stop(asset, emitter) {
          const request = { asset, emitter };
          const result = particles.execute("stop", asset, emitter);
          services.push({ payload: { request, result: cloneValue(result) }, service: "particles.stop" });
          return cloneValue(result);
        },
      },
      assets: {
        get(id) {
          return cloneValue(assetById(options.assets, normalizeHandleName(id)) ?? null) as IAssetsManifest["assets"][number] | null;
        },
        list() {
          return cloneValue(options.assets?.assets ?? []) as IAssetsManifest["assets"];
        },
        load(id) {
          const request = { id: normalizeHandleName(id) };
          const asset = assetById(options.assets, request.id);
          const result: IAssetLoadResult = asset === undefined
            ? { accepted: false, asset: null, id: request.id, status: "missing" }
            : { accepted: true, asset: cloneValue(asset) as IAssetsManifest["assets"][number], id: request.id, status: "ready" };
          services.push({ payload: { request, result }, service: "assets.load" });
          return cloneValue(result) as IAssetLoadResult;
        },
      },
      character: {
        move(entity, moveOptions = {}) {
          const entityId = typeof entity === "string" ? entity : entity.id;
          const request = {
            entity: entityId,
            options: cloneValue(moveOptions) as ICharacterMoveRequest,
          };
          const result = traceCharacterControllers(world, {
            axes: moveOptions.axes ?? characterAxes(world, options.input),
            direction: moveOptions.direction,
            fixedDelta: moveOptions.fixedDelta ?? options.fixedDelta,
            speed: moveOptions.speed,
          }).find((observation) => observation.entity === entityId) ?? null;
          services.push({ payload: { request, result }, service: "character.move" });
          return cloneValue(result) as ICharacterTraceObservation | null;
        },
      },
      commands: {
        addComponent(entity, component, value = {}) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "addComponent", source: "command", value: cloneValue(value) });
        },
        clearParent(child) {
          commands.push({ child, entity: child, kind: "clearParent", source: "command" });
        },
        despawn(entity) {
          commands.push({ entity, kind: "despawn", source: "command" });
        },
        emitEvent(event, payload) {
          commands.push({ entity: "", event: normalizeHandleName(event), kind: "emitEvent", payload: cloneValue(payload), source: "command" });
        },
        instantiate(prefab, prefix) {
          const template = options.prefabs?.prefabs.find((candidate) => candidate.id === prefab);
          const result: IInstantiateResult = template === undefined
            ? { accepted: false, entities: [], prefab, root: null, status: "missing" }
            : {
                accepted: true,
                entities: template.entities.map((entity) => `${prefix}.${entity.id}`),
                prefab,
                root: `${prefix}.${template.root}`,
                status: "enqueued",
              };
          commands.push({ entity: result.root ?? "", kind: "instantiate", prefab, prefix, source: "command", value: cloneValue(result) });
          return cloneValue(result) as IInstantiateResult;
        },
        materialPatch(entity, value) {
          commands.push({ entity, kind: "material.patch", source: "command", value: cloneValue(value) });
        },
        removeComponent(entity, component) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "removeComponent", source: "command" });
        },
        setComponent(entity, component, value) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "setComponent", source: "command", value: cloneValue(value) });
        },
        setParent(child, parent) {
          commands.push({ child, entity: child, kind: "setParent", parent, source: "command" });
        },
        spawn(entity, components = {}, tags = []) {
          const normalizedTags = normalizeEntityTags(tags);
          for (const component of Object.keys(components)) knownComponents.add(component);
          commands.push({ components: cloneValue(components) as Record<string, unknown>, entity, kind: "spawn", source: "command", ...(normalizedTags.length === 0 ? {} : { tags: normalizedTags }), });
        },
        tween(entity, tweenOptions) {
          const normalized = normalizeTweenRequest(tweenOptions);
          const accepted = normalized !== undefined;
          const id = `tween:${entity}:${tweenOptions.property}:${options.tick ?? 0}:${commands.length}`;
          const result = { accepted, id, status: accepted ? "enqueued" as const : "rejected" as const };
          if (normalized !== undefined) {
            commands.push({ entity, kind: "tween", property: normalized.property, source: "command", value: { ...normalized, id } });
          }
          return result;
        },
        worldText(entity, textOptions) {
          const normalized = normalizeWorldTextRequest(textOptions);
          const result = { accepted: normalized !== undefined, entity, status: normalized === undefined ? "rejected" as const : "enqueued" as const };
          if (normalized !== undefined) {
            commands.push({ entity, kind: "worldText", source: "command", value: normalized });
          }
          return result;
        },
      },
      channels: {
        read(channel) {
          const event = channelEvent(options.systems, normalizeHandleName(channel));
          if (event === undefined) {
            return [];
          }
          const queue = world.events?.[event];
          return Array.isArray(queue) ? cloneValue(queue) as unknown[] : [];
        },
        send(channel, payload) {
          const event = channelEvent(options.systems, normalizeHandleName(channel));
          if (event !== undefined) {
            events.push({ event, payload: cloneValue(payload) });
          }
        },
      },
      components: {
        hooks(component) {
          return componentHookObservations(world, options.systems, normalizeHandleName(component));
        },
        type(component) {
          return cloneValue(componentTypes.components.find((type) => type.id === normalizeHandleName(component)) ?? null) as IComponentReflectionType | null;
        },
        types() {
          return cloneValue(componentTypes) as IComponentReflectionRegistry;
        },
      },
      events: {
        emit(event, payload) {
          events.push({ event: normalizeHandleName(event), payload: cloneValue(payload) });
        },
        read(event) {
          const queue = world.events?.[normalizeHandleName(event)];
          return Array.isArray(queue) ? cloneValue(queue) as unknown[] : [];
        },
      },
      input: {
        action(name) {
          return options.input?.action(name) ?? false;
        },
        axis1(name, buttons = {}) {
          const axis = options.input?.axis(name) ?? 0;
          const negative = buttons.negative === undefined ? 0 : (options.input?.action(buttons.negative) ? -1 : 0);
          const positive = buttons.positive === undefined ? 0 : (options.input?.action(buttons.positive) ? 1 : 0);
          return clamp(axis + negative + positive, -1, 1);
        },
        axis(name) {
          return options.input?.axis(name) ?? 0;
        },
        getAxis(name) {
          return options.input?.axis(name) ?? 0;
        },
        getAxis2(xAxis, yAxis, axisOptions = {}) {
          const value: [number, number] = [options.input?.axis(xAxis) ?? 0, options.input?.axis(yAxis) ?? 0];
          const deadzone = Math.max(0, Number(axisOptions.deadzone ?? 0));
          const length = Math.hypot(value[0], value[1]);
          if (length <= deadzone) {
            return [0, 0];
          }
          if (axisOptions.normalize === true && length > 1) {
            return [value[0] / length, value[1] / length];
          }
          return value;
        },
        getButton(name) {
          return options.input?.action(name) ?? false;
        },
        getButtonDown(name) {
          return inputEdge("pressed", name);
        },
        getButtonUp(name) {
          return inputEdge("released", name);
        },
        pressed(name) {
          return inputEdge("pressed", name);
        },
        released(name) {
          return inputEdge("released", name);
        },
      },
      entities: {
        byId(ids) {
          return Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, findEntity(id)])) as { [K in keyof typeof ids]: ISystemEntityView | undefined };
        },
        countTag(tag) {
          return validEntityTag(tag) ? world.entities.filter((entity) => normalizeEntityTags(entity.tags).includes(tag)).length : 0;
        },
        despawned(queryOptions) {
          return options.runtimeState?.lifecycle.despawned(queryOptions) ?? [];
        },
        spawned(queryOptions) {
          return options.runtimeState?.lifecycle.spawned(queryOptions) ?? [];
        },
        withTag(tag) {
          if (!validEntityTag(tag)) {
            return [];
          }
          return world.entities
            .filter((entity) => normalizeEntityTags(entity.tags).includes(tag))
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((entity) => findEntity(entity.id))
            .filter((entity): entity is ISystemEntityView => entity !== undefined);
        },
      },
      entity(id) {
        return findEntity(id);
      },
      effects: {
        play(presetId, playOptions = {}) {
          const preset = feedbackPresetById(options.systems?.feedbackPresets, normalizeHandleName(presetId));
          if (preset === undefined) {
            return { accepted: false, preset: normalizeHandleName(presetId), status: "missing" as const };
          }
          const seed = playOptions.seed ?? options.runtimeState?.random.float() ?? 0;
          const resolvedPitch = preset.audio === undefined
            ? undefined
            : Math.min(4, Math.max(0.25, (preset.audio.pitch ?? 1) + deterministicVariance(seed, preset.audio.pitchVariance ?? 0)));
          const audio = preset.audio === undefined
            ? undefined
            : scriptAudio.play(preset.audio.soundId, { ...(playOptions.entity === undefined ? {} : { entity: playOptions.entity }), ...(preset.audio.volume === undefined ? {} : { volume: preset.audio.volume }), ...(resolvedPitch === undefined ? {} : { pitch: resolvedPitch }) });
          const particleResults = (preset.particles ?? []).map((particle) => ({
            command: particle.command,
            emitter: particle.emitter,
            result: particles.execute(particle.command, particle.asset, particle.emitter, { count: particle.count, seed }),
          }));
          const camera = preset.camera === undefined ? undefined : { ...preset.camera, ...(playOptions.camera === undefined ? {} : { camera: playOptions.camera }), seed };
          const result = { accepted: true as const, preset: normalizeHandleName(presetId), status: "enqueued" as const };
          services.push({ payload: { audio, camera, particles: particleResults, request: { ...playOptions, preset: normalizeHandleName(presetId), seed }, resolvedPitch, result }, service: "effects.play" });
          return result;
        },
      },
      ui: {
        activate(nodeId) {
          const request = { node: nodeId };
          const result = ui.activate(nodeId);
          services.push({ payload: { request, result }, service: "ui.activate" });
          return cloneValue(result) as IUiActivateResult;
        },
        actions() {
          const request = {};
          const result = ui.recentActions();
          services.push({ payload: { request, result }, service: "ui.actions" });
          return cloneValue(result);
        },
        focus(nodeId) {
          const request = { node: nodeId };
          const result = ui.focus(nodeId);
          services.push({ payload: { request, result }, service: "ui.focus" });
          return cloneValue(result) as IUiFocusResult;
        },
        read(nodeId) {
          const request = { node: nodeId };
          const result = ui.read(nodeId);
          services.push({ payload: { request, result }, service: "ui.read" });
          return cloneValue(result) as IUiReadResult;
        },
        setDisabled(nodeId, disabled) {
          const request = { disabled, node: nodeId };
          const result = ui.setDisabled(nodeId, disabled);
          services.push({ payload: { request, result }, service: "ui.setDisabled" });
          return cloneValue(result) as IUiDisabledResult;
        },
        setValue(nodeId, value) {
          const request = { node: nodeId, value };
          const result = ui.setValue(nodeId, value);
          services.push({ payload: { request, result }, service: "ui.setValue" });
          return cloneValue(result) as IUiValueResult;
        },
      },
      observers: {
        propagate(event, target) {
          return propagateObserverEvent(world, options.systems, normalizeHandleName(event), target);
        },
      },
      plugins: {
        group(id) {
          return cloneValue(pluginGroup(options.systems, normalizeHandleName(id))) as IPluginGroupView | null;
        },
        has(id) {
          return plugin(options.systems, normalizeHandleName(id)) !== null;
        },
        list() {
          return cloneValue(options.systems?.plugins ?? []) as IPluginDeclarationView[];
        },
      },
      persistence: {
        delete(slot) {
          const request = { slot };
          const deleted = persistence.delete(slot);
          const result = { accepted: deleted, slot, status: deleted ? "deleted" as const : "missing-save" as const };
          services.push({ payload: { request, result }, service: "persistence.delete" });
          return result;
        },
        listSlots() {
          const result = persistence.listSlots();
          services.push({ payload: { request: {}, result }, service: "persistence.listSlots" });
          return cloneValue(result) as string[];
        },
        load(slot) {
          const request = { slot };
          const result = persistence.load(slot, world);
          if (result.accepted) Object.assign(world, cloneValue(result.world));
          services.push({ payload: { request, result }, service: "persistence.load" });
          return cloneValue(result) as ReturnType<IWebPersistenceService["load"]>;
        },
        save(slot) {
          const request = { slot };
          const result = persistence.save(slot, world);
          services.push({ payload: { request, result }, service: "persistence.save" });
          return cloneValue(result) as ReturnType<IWebPersistenceService["save"]>;
        },
      },
      query(query = options.defaultQuery ?? { with: [], without: [] }) {
        diagnoseUnknownQueryComponents(query, knownComponents, emittedQueryDiagnostics, options.systemName ?? "", diagnostics);
        return applyQueryWindow(world.entities.filter((entity) => matchesQuery(world, entity, query, options.componentDiff)), query)
          .map((entity) => findEntity(entity.id))
          .filter((entity): entity is ISystemEntityView => entity !== undefined);
      },
      random,
      scenes: {
        change(scene, sceneOptions = {}) {
          return queueSceneService(services, "change", scene, sceneOptions);
        },
        current() {
          const result = options.currentScene ?? null;
          services.push({ payload: { request: {}, result }, service: "scene.current" });
          return result;
        },
        loadAdditive(scene, sceneOptions = {}) {
          return queueSceneService(services, "loadAdditive", scene, sceneOptions);
        },
        pop(sceneOptions = {}) {
          const request = { options: cloneValue(sceneOptions) as Record<string, unknown> };
          const result = { accepted: true as const, operation: "pop" as const };
          services.push({ payload: { request, result }, service: "scene.pop" });
          return result;
        },
        push(scene, sceneOptions = {}) {
          return queueSceneService(services, "push", scene, sceneOptions);
        },
        unload(scene, sceneOptions = {}) {
          return queueSceneService(services, "unload", scene, sceneOptions);
        },
      },
      schedule: {
        afterTicks(scheduleOptions) {
          return delayedScheduler.afterTicks(scheduleOptions);
        },
      },
      sequences: {
        play(sequence, sequenceOptions = {}) {
          const request = { options: cloneValue(sequenceOptions) as Record<string, unknown>, sequence: normalizeHandleName(sequence) };
          const result = { accepted: true, operation: "play" as const, sequence: request.sequence };
          services.push({ payload: { request, result }, service: "sequences.play" });
          return result;
        },
        query(sequence) {
          const request = { sequence: sequence === undefined ? null : normalizeHandleName(sequence) };
          const result = { active: false, sequence: request.sequence };
          services.push({ payload: { request, result }, service: "sequences.query" });
          return result;
        },
        stop(sequence) {
          const request = { sequence: normalizeHandleName(sequence) };
          const result = { accepted: true, operation: "stop" as const, sequence: request.sequence };
          services.push({ payload: { request, result }, service: "sequences.stop" });
          return result;
        },
      },
      timers: createTimerHelpers(options.elapsed ?? 0),
      resources: {
        get<T = unknown>(name: string, defaults?: Record<string, unknown>): T {
          const key = normalizeHandleName(name);
          options.resourceObserver?.({ kind: "read", resource: key });
          const value = currentResourceValue(key);
          if (defaults !== undefined && isRecord(defaults)) {
            return {
              ...cloneValue(defaults) as Record<string, unknown>,
              ...(isRecord(value) ? cloneValue(value) as Record<string, unknown> : {}),
            } as T;
          }
          return cloneValue(value) as T;
        },
        patch(name, value) {
          const key = normalizeHandleName(name);
          options.resourceObserver?.({ kind: "write", resource: key });
          const existing = currentResourceValue(key);
          resources.push({
            resource: key,
            value: {
              ...(isRecord(existing) ? existing : {}),
              ...cloneValue(value),
            },
          });
        },
        set(name, value) {
          const key = normalizeHandleName(name);
          options.resourceObserver?.({ kind: "write", resource: key });
          resources.push({ resource: key, value: cloneValue(value) });
        },
      },
      state(key, defaults) {
        const resource = normalizeHandleName(key);
        options.resourceObserver?.({ kind: "read", resource });
        const initial = {
          ...cloneValue(defaults) as Record<string, unknown>,
          ...(isRecord(currentResourceValue(resource)) ? cloneValue(currentResourceValue(resource)) as Record<string, unknown> : {}),
        };
        return new Proxy(initial, {
          set(target, property, value) {
            if (typeof property === "string") {
              target[property] = cloneValue(value);
              options.resourceObserver?.({ kind: "write", resource });
              resources.push({ resource, value: cloneValue(target) });
              return true;
            }
            return false;
          },
        }) as typeof defaults;
      },
      settings: {
        export() {
          const result = persistence.exportSettings();
          services.push({ payload: { request: {}, result }, service: "settings.export" });
          return cloneValue(result) as Record<string, boolean | number | string>;
        },
        get(key) {
          const request = { key };
          const result = persistence.getSetting(key);
          services.push({ payload: { request, result: result ?? null }, service: "settings.get" });
          return result;
        },
        import(values) {
          const request = { values: cloneValue(values) as Record<string, unknown> };
          const result = persistence.importSettings(values);
          services.push({ payload: { request, result }, service: "settings.import" });
          return cloneValue(result) as Record<string, boolean | number | string>;
        },
        set(key, value) {
          const request = { key, value };
          const result = persistence.setSetting(key, value);
          services.push({ payload: { request, result }, service: "settings.set" });
          return result;
        },
      },
      states: {
        get(id) {
          return states[id] ?? null;
        },
      },
      tasks: {
        channel(id) {
          return taskChannel(options.systems, normalizeHandleName(id));
        },
        has(id) {
          return options.systems?.tasks?.some((task) => task.id === normalizeHandleName(id)) ?? false;
        },
        list() {
          return cloneValue(options.systems?.tasks ?? []) as ITaskDeclarationView[];
        },
      },
      physics: {
        addForce(entity, force) {
          return queuePhysicsBodyCommand("physics.addForce", entity, force);
        },
        addTorque(entity, torque) {
          return queuePhysicsBodyCommand("physics.addTorque", entity, torque);
        },
        applyAngularImpulse(entity, impulse) {
          return queuePhysicsBodyCommand("physics.applyAngularImpulse", entity, impulse);
        },
        applyImpulse(entity, impulse) {
          return queuePhysicsBodyCommand("physics.applyImpulse", entity, impulse);
        },
        overlap(serviceOptions) {
          const request = cloneValue(serviceOptions);
          const result = overlapPrimitive(world, request);
          services.push({ payload: { request, result }, service: "physics.overlap" });
          return result;
        },
        raycast(serviceOptions) {
          const request = cloneValue(serviceOptions);
          const result = raycastPrimitive(world, request);
          services.push({ payload: { request, result }, service: "physics.raycast" });
          return result;
        },
        sensor(serviceOptions = {}) {
          const request = cloneValue(serviceOptions) as IPhysicsSensorRequest;
          const result: IPhysicsSensorResult = {
            events: sensors.events()
              .filter((event) => request.sensor === undefined || event.sensor === request.sensor)
              .filter((event) => request.phases === undefined || request.phases.includes(event.phase)),
          };
          services.push({ payload: { request, result }, service: "physics.sensor" });
          return cloneValue(result) as IPhysicsSensorResult;
        },
        shapeCast(serviceOptions) {
          const request = cloneValue(serviceOptions);
          const result = shapeCastPrimitive(world, request);
          services.push({ payload: { request, result }, service: "physics.shapeCast" });
          return result;
        },
        setAngularVelocity(entity, velocity) {
          return queuePhysicsBodyCommand("physics.setAngularVelocity", entity, velocity);
        },
        setLinearVelocity(entity, velocity) {
          return queuePhysicsBodyCommand("physics.setLinearVelocity", entity, velocity);
        },
      },
      navigation: {
        path(serviceOptions) {
          const request = cloneValue(serviceOptions) as INavigationPathRequest;
          const result = queryNavigationPath(world, request);
          services.push({ payload: { request, result }, service: "navigation.path" });
          return cloneValue(result) as INavigationPathResult;
        },
      },
      picking: {
        mesh(serviceOptions) {
          const request = cloneValue(serviceOptions);
          const result = pickMesh(world, options.assets, request, options.mappedObjects);
          services.push({ payload: { request, result }, service: "picking.mesh" });
          return result;
        },
        pointerRay(serviceOptions) {
          const request = cloneValue(serviceOptions);
          const result = pointerRay(world, request);
          services.push({ payload: { request, result }, service: "picking.pointerRay" });
          return result;
        },
      },
      time: {
        delta: options.delta,
        deltaTime: options.delta,
        dt: options.delta,
        elapsed: options.elapsed ?? 0,
        fixedDelta: finiteNumber(options.fixedDelta, finiteNumber(options.delta, 0.016)),
        fixedDeltaTime: finiteNumber(options.fixedDelta, finiteNumber(options.delta, 0.016)),
        fixedDt: options.fixedDelta,
        paused: options.paused ?? false,
        time: options.elapsed ?? 0,
      },
    },
    events,
    resources,
    services,
  };
}

function queueSceneService<TOperation extends "change" | "loadAdditive" | "push" | "unload">(
  services: IQueuedServiceCall[],
  operation: TOperation,
  scene: string,
  options: Record<string, unknown>,
): ISceneServiceResult<TOperation> {
  const request = { options: cloneValue(options) as Record<string, unknown>, scene };
  const result = { accepted: true as const, operation, scene };
  services.push({ payload: { request, result }, service: `scene.${operation}` as IQueuedServiceCall["service"] });
  return result;
}

export function channelEvent(systems: ISystemsIr | undefined, channel: string): string | undefined {
  return systems?.channels?.find((candidate) => candidate.id === channel && candidate.delivery === "fixed-trace")?.event;
}

export function taskChannel(systems: ISystemsIr | undefined, task: string): string | null {
  return systems?.tasks?.find((candidate) => candidate.id === task)?.channel ?? null;
}

export function plugin(systems: ISystemsIr | undefined, id: string): IPluginDeclarationView | null {
  return systems?.plugins?.find((candidate) => candidate.id === id) ?? null;
}

export function pluginGroup(systems: ISystemsIr | undefined, id: string): IPluginGroupView | null {
  return systems?.pluginGroups?.find((candidate) => candidate.id === id) ?? null;
}

export function componentHookObservations(world: IWorldIr, systems: ISystemsIr | undefined, component: string): IComponentHookObservation[] {
  const declaration = systems?.componentHooks?.find((candidate) => candidate.component === component);
  if (declaration === undefined) {
    return [];
  }
  const observations: IComponentHookObservation[] = [];
  for (const entity of world.entities) {
    if (entity.components[component] === undefined) {
      continue;
    }
    for (const hook of declaration.hooks) {
      observations.push({ component, entity: entity.id, hook });
    }
  }
  return observations;
}

function characterAxes(world: IWorldIr, input: IWebInputState | undefined): Record<string, number> {
  if (input === undefined) {
    return {};
  }
  const axes = new Set<string>();
  for (const entity of world.entities) {
    const controller = entity.components.CharacterController;
    if (!isRecord(controller)) {
      continue;
    }
    if (typeof controller.moveXAxis === "string") {
      axes.add(controller.moveXAxis);
    }
    if (typeof controller.moveZAxis === "string") {
      axes.add(controller.moveZAxis);
    }
  }
  return Object.fromEntries([...axes].sort().map((axis) => [axis, input.axis(axis)]));
}

export function propagateObserverEvent(world: IWorldIr, systems: ISystemsIr | undefined, event: string, target: string): IObserverPropagationStep[] {
  const observer = systems?.observers?.find((candidate) => candidate.event === event && candidate.propagation === "target-ancestors");
  if (observer === undefined || world.entities.every((entity) => entity.id !== target)) {
    return [];
  }
  const ancestors = ancestorIds(world, target);
  const route: IObserverPropagationStep[] = [];
  if (observer.phases.includes("target")) {
    route.push({ entity: target, phase: "target" });
  }
  if (observer.phases.includes("bubble")) {
    route.push(...ancestors.map((entity) => ({ entity, phase: "bubble" as const })));
  }
  return route;
}

function ancestorIds(world: IWorldIr, target: string): string[] {
  const byId = new Map(world.entities.map((entity) => [entity.id, entity]));
  const ancestors: string[] = [];
  const seen = new Set<string>([target]);
  let current = byId.get(target);
  while (current !== undefined) {
    const parent = parentId(current);
    if (parent === undefined || seen.has(parent)) {
      break;
    }
    ancestors.push(parent);
    seen.add(parent);
    current = byId.get(parent);
  }
  return ancestors;
}

function parentId(entity: IWorldEntity): string | undefined {
  const hierarchy = entity.components.Hierarchy;
  if (isRecord(hierarchy) && typeof hierarchy.parent === "string" && hierarchy.parent.trim() !== "") {
    return hierarchy.parent;
  }
  return undefined;
}

export function evaluateStates(world: IWorldIr, systems: ISystemsIr | undefined): Record<string, string | null> {
  const lifecycle = systems?.lifecycle;
  const values: Record<string, string | null> = {};
  for (const state of lifecycle?.appStates ?? []) {
    values[state.id] = readDeclaredStateValue(world, state.source, state.values, state.initial);
  }
  for (const state of lifecycle?.computedStates ?? []) {
    values[state.id] = readDeclaredStateValue(world, state.source, state.values, state.fallback);
  }
  for (const state of lifecycle?.substates ?? []) {
    values[state.id] = values[state.parent] === state.parentValue
      ? readDeclaredStateValue(world, state.source, state.values, state.fallback)
      : null;
  }
  return values;
}

function readDeclaredStateValue(world: IWorldIr, source: IIrStateSource, values: ReadonlyArray<string>, fallback: string): string {
  const resource = world.resources?.[source.resource];
  const raw = isRecord(resource) ? resource[source.field] : undefined;
  return typeof raw === "string" && values.includes(raw) ? raw : fallback;
}

function randomSeed(world: IWorldIr): unknown {
  const randomResource = world.resources?.Random;
  if (isRecord(randomResource) && randomResource.seed !== undefined) {
    return randomResource.seed;
  }
  return world.resources?.__randomSeed ?? 0;
}

function runtimeSeedKey(seed: unknown): string {
  if (seed === null || typeof seed === "string" || typeof seed === "number" || typeof seed === "boolean") {
    return `${typeof seed}:${String(seed)}`;
  }
  return `json:${JSON.stringify(seed) ?? "undefined"}`;
}

function createDeterministicRandom(seed: unknown): ISystemContext["random"] {
  let state = hashSeed(seed);
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    bool(probability = 0.5) {
      return next() < clamp01(probability);
    },
    float() {
      return next();
    },
    int(min, max) {
      const lower = Math.ceil(Math.min(min, max));
      const upper = Math.floor(Math.max(min, max));
      if (upper < lower) {
        return lower;
      }
      return Math.floor(next() * (upper - lower + 1)) + lower;
    },
    pick(values) {
      return values.length === 0 ? undefined : values[Math.floor(next() * values.length)];
    },
    range(min, max) {
      return next() * (max - min) + min;
    },
  };
}

function hashSeed(seed: unknown): number {
  const source = typeof seed === "string" || typeof seed === "number" || typeof seed === "boolean"
    ? String(seed)
    : JSON.stringify(seed);
  let hash = 2166136261;
  for (const char of source ?? "0") {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function createTimerHelpers(now: number): ISystemContext["timers"] {
  const normalizedNow = finiteNumber(now, 0);
  const elapsed = (start: number) => Math.max(0, normalizedNow - finiteNumber(start, normalizedNow));
  return {
    done(start, duration) {
      return elapsed(start) >= Math.max(0, finiteNumber(duration, 0));
    },
    elapsed,
    progress(start, duration) {
      const total = Math.max(0, finiteNumber(duration, 0));
      return total === 0 ? 1 : clamp01(elapsed(start) / total);
    },
    ready(lastRun, cooldown) {
      return elapsed(lastRun) >= Math.max(0, finiteNumber(cooldown, 0));
    },
    remaining(start, duration) {
      return Math.max(0, Math.max(0, finiteNumber(duration, 0)) - elapsed(start));
    },
  };
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assetById(assets: IAssetsManifest | undefined, id: string): IAssetsManifest["assets"][number] | undefined {
  return assets?.assets.find((asset) => asset.id === id);
}

function createEntityView(entity: IWorldEntity, commands: IQueuedCommand[]): ISystemEntityView {
  const pendingComponents = cloneValue(entity.components) as IWorldEntity["components"];
  const components = new Proxy({} as IWorldEntity["components"], {
    defineProperty: () => false,
    deleteProperty: () => false,
    get: (_target, property) => typeof property === "string" ? deepFreeze(cloneValue(pendingComponents[property])) : undefined,
    getOwnPropertyDescriptor: (_target, property) => typeof property === "string" && property in pendingComponents
      ? { configurable: true, enumerable: true, value: deepFreeze(cloneValue(pendingComponents[property])), writable: false }
      : undefined,
    has: (_target, property) => typeof property === "string" && property in pendingComponents,
    ownKeys: () => Reflect.ownKeys(pendingComponents),
    set: () => false,
  });
  const tags = normalizeEntityTags(entity.tags);
  const queueTransformPatch = (value: Record<string, unknown>) => {
    const transform = fullTransform({
      ...(isRecord(pendingComponents.Transform) ? pendingComponents.Transform : {}),
      ...cloneValue(value),
    });
    pendingComponents.Transform = transform;
    commands.push({
      component: "Transform",
      entity: entity.id,
      kind: "setComponent",
      source: "entity",
      value: transform,
    });
  };
  return {
    components,
    get<T = unknown>(component: unknown, defaults?: Record<string, unknown>): T {
      const value = pendingComponents[normalizeHandleName(component)];
      if (defaults !== undefined && isRecord(defaults)) {
        return {
          ...cloneValue(defaults) as Record<string, unknown>,
          ...(isRecord(value) ? cloneValue(value) as Record<string, unknown> : {}),
        } as T;
      }
      return cloneValue(value) as T;
    },
    has(component: unknown): boolean {
      return pendingComponents[normalizeHandleName(component)] !== undefined;
    },
    id: entity.id,
    patch(component: unknown, value: Record<string, unknown>): void {
      const componentName = normalizeHandleName(component);
      const existing = pendingComponents[componentName];
      const next = {
        ...(isRecord(existing) ? existing : {}),
        ...cloneValue(value),
      };
      pendingComponents[componentName] = next;
      commands.push({
        component: componentName,
        entity: entity.id,
        kind: "setComponent",
        source: "entity",
        value: cloneValue(next),
      });
    },
    set(component: unknown, value: unknown): void {
      const componentName = normalizeHandleName(component);
      pendingComponents[componentName] = cloneValue(value);
      commands.push({ component: componentName, entity: entity.id, kind: "setComponent", source: "entity", value: cloneValue(value) });
    },
    tags,
    transform(): ISystemTransformFacade {
      return {
        get position() {
          return vec3((isRecord(pendingComponents.Transform) ? pendingComponents.Transform.position : undefined), [0, 0, 0]);
        },
        set position(position) {
          queueTransformPatch({ position: vec3(position, [0, 0, 0]) });
        },
        positionOr(fallback) {
          return vec3((isRecord(pendingComponents.Transform) ? pendingComponents.Transform.position : undefined), fallback);
        },
        setPose(position, rotation) {
          queueTransformPatch({ position: vec3(position, [0, 0, 0]), rotation: quat(rotation, [0, 0, 0, 1]) });
        },
        setPosition(position) {
          queueTransformPatch({ position: vec3(position, [0, 0, 0]) });
        },
        setRotation(rotation) {
          queueTransformPatch({ rotation: quat(rotation, [0, 0, 0, 1]) });
        },
        yawOr(fallback) {
          return yawFromQuat((isRecord(pendingComponents.Transform) ? pendingComponents.Transform.rotation : undefined), fallback);
        },
      };
    },
  };
}

function vec3(value: unknown, fallback: readonly [number, number, number]): [number, number, number] {
  const source = Array.isArray(value) ? value : [];
  return [
    finiteNumber(Number(source[0]), fallback[0]),
    finiteNumber(Number(source[1]), fallback[1]),
    finiteNumber(Number(source[2]), fallback[2]),
  ];
}

function quat(value: unknown, fallback: readonly [number, number, number, number]): [number, number, number, number] {
  const source = Array.isArray(value) ? value : [];
  return [
    finiteNumber(Number(source[0]), fallback[0]),
    finiteNumber(Number(source[1]), fallback[1]),
    finiteNumber(Number(source[2]), fallback[2]),
    finiteNumber(Number(source[3]), fallback[3]),
  ];
}

function fullTransform(value: Record<string, unknown>): { position: [number, number, number]; rotation: [number, number, number, number]; scale: [number, number, number] } {
  return {
    position: vec3(value.position, [0, 0, 0]),
    rotation: quat(value.rotation, [0, 0, 0, 1]),
    scale: vec3(value.scale, [1, 1, 1]),
  };
}

function yawFromQuat(value: unknown, fallback: number): number {
  const [x, y, z, w] = quat(value, [0, 0, 0, 1]);
  return finiteNumber(Math.atan2(2 * (w * y + z * x), 1 - 2 * (y * y + z * z)), fallback);
}

function normalizeHandleName(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "function" && typeof value.name === "string" && value.name !== "") {
    return value.name;
  }
  if (typeof value === "object" && value !== null && "name" in value && typeof value.name === "string") {
    return value.name;
  }
  return String(value);
}

function normalizeEntityRef(entity: string | ISystemEntityView): string {
  return typeof entity === "string" ? entity : entity.id;
}

function normalizeTweenRequest(value: ITweenCommandOptions): ITweenCommandOptions | undefined {
  if (!isRecord(value) || !["emissiveIntensity", "opacity", "position", "rotation", "scale"].includes(String(value.property))) {
    return undefined;
  }
  const expected = value.property === "rotation" ? 4 : value.property === "position" || value.property === "scale" ? 3 : 1;
  const to = typeof value.to === "number" ? [value.to] : Array.isArray(value.to) ? [...value.to] : [];
  if (to.length !== expected || !to.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  if (typeof value.duration !== "number" || !Number.isFinite(value.duration) || value.duration < 0 || value.duration > 10) {
    return undefined;
  }
  if (value.loops !== undefined && (!Number.isInteger(value.loops) || value.loops < 0 || value.loops > 8)) {
    return undefined;
  }
  return {
    duration: value.duration,
    easing: value.easing ?? "linear",
    loops: value.loops ?? 0,
    property: value.property,
    to,
    yoyo: value.yoyo === true,
  };
}

function normalizeWorldTextRequest(value: IWorldTextCommandOptions): IWorldTextCommandOptions | undefined {
  if (!isRecord(value) || typeof value.text !== "string" || value.text.length === 0 || value.text.length > 128) {
    return undefined;
  }
  if (value.lifetime !== undefined && (typeof value.lifetime !== "number" || !Number.isFinite(value.lifetime) || value.lifetime < 0 || value.lifetime > 30)) {
    return undefined;
  }
  if (value.size !== undefined && (typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 1 || value.size > 256)) {
    return undefined;
  }
  return cloneValue(value);
}

function normalizeCameraShakeRequest(value: { amplitude?: number; camera?: string; duration?: number; frequency?: number; seed?: number | string }): Record<string, unknown> & { amplitude: number; duration: number; frequency: number } {
  return {
    amplitude: clamp(finiteNumber(value.amplitude, 0.08), 0, 2),
    ...(value.camera === undefined ? {} : { camera: value.camera }),
    duration: clamp(finiteNumber(value.duration, 0.15), 0, 5),
    frequency: clamp(finiteNumber(value.frequency, 24), 0, 120),
    ...(value.seed === undefined ? {} : { seed: value.seed }),
  };
}

function deterministicVariance(seed: unknown, variance: number): number {
  if (variance <= 0) {
    return 0;
  }
  const normalized = (hashSeed(seed) % 100000) / 100000;
  return (normalized * 2 - 1) * variance;
}

function createDelayedScheduler(
  declarations: readonly IIrDelayedCommandDeclaration[],
  options: {
    runtimeState?: ReturnType<typeof createWebSystemRuntimeState>;
    schedule: IIrSystemDeclaration["schedule"];
    systemName: string;
    tick: number;
  },
): ISystemContext["schedule"] {
  const byId = new Map(declarations.map((declaration) => [declaration.id, declaration] as const));
  return {
    afterTicks(scheduleOptions) {
      const declaration = byId.get(scheduleOptions.id);
      if (
        declaration === undefined ||
        options.runtimeState === undefined ||
        !Number.isInteger(scheduleOptions.delayTicks) ||
        scheduleOptions.delayTicks < 1 ||
        scheduleOptions.delayTicks > declaration.maxDelayTicks
      ) {
        return {
          accepted: false,
          delayTicks: scheduleOptions.delayTicks,
          id: scheduleOptions.id,
          status: "rejected",
        };
      }
      options.runtimeState.delayedCommands.push({
        cancelPolicy: declaration.cancelPolicy,
        command: queuedCommandFromDelayedDeclaration(declaration),
        delayTicks: scheduleOptions.delayTicks,
        enqueuedTick: options.tick,
        id: declaration.id,
        ownership: { ...declaration.ownership },
        remainingTicks: scheduleOptions.delayTicks,
        schedule: options.schedule,
        systemName: options.systemName,
      });
      return {
        accepted: true,
        delayTicks: scheduleOptions.delayTicks,
        id: scheduleOptions.id,
        status: "enqueued",
      };
    },
  };
}

function queuedCommandFromDelayedDeclaration(declaration: IIrDelayedCommandDeclaration): IQueuedCommand {
  const command = declaration.command;
  if (command.kind === "spawn") {
    return {
      components: Object.fromEntries(command.components.map((component) => [component, {}])),
      entity: command.entity,
      kind: "spawn",
      source: "command",
    };
  }
  if (command.kind === "emitEvent") {
    return { entity: "", event: command.event, kind: "emitEvent", payload: {}, source: "command" };
  }
  if (command.kind === "despawn") {
    return { entity: command.entity, kind: "despawn", source: "command" };
  }
  if (command.kind === "instantiate") {
    return { entity: "", kind: "instantiate", prefab: command.prefab, prefix: command.prefix, source: "command" };
  }
  if (command.kind === "setParent") {
    return { child: command.child, entity: command.child, kind: "setParent", parent: command.parent, source: "command" };
  }
  if (command.kind === "clearParent") {
    return { child: command.child, entity: command.child, kind: "clearParent", source: "command" };
  }
  if (command.kind === "tween") {
    return { entity: command.entity, kind: "tween", property: command.property, source: "command" };
  }
  if (command.kind === "worldText") {
    return { entity: command.entity, kind: "worldText", source: "command" };
  }
  if (command.kind === "material.patch") {
    return { entity: command.entity, kind: "material.patch", source: "command", value: {} };
  }
  return {
    component: command.component,
    entity: command.entity,
    kind: command.kind,
    source: "command",
    value: {},
  };
}

export function advanceWebDelayedCommands(
  world: IWorldIr,
  runtimeState: ReturnType<typeof createWebSystemRuntimeState>,
  options: { currentScene?: string | null; schedule: IIrSystemDeclaration["schedule"]; tick: number },
): IWebDelayedCommand[] {
  if (options.schedule !== "fixedUpdate") {
    return [];
  }
  const ready: IWebDelayedCommand[] = [];
  const pending: IWebDelayedCommand[] = [];
  for (const command of runtimeState.delayedCommands) {
    if (command.enqueuedTick >= options.tick) {
      pending.push(command);
      continue;
    }
    const next = { ...command, remainingTicks: command.remainingTicks - 1 };
    if (next.remainingTicks > 0) {
      pending.push(next);
      continue;
    }
    if (next.cancelPolicy === "drop" && !delayedCommandOwnerActive(world, next, options.currentScene)) {
      continue;
    }
    ready.push(next);
  }
  runtimeState.delayedCommands = pending;
  return ready;
}

function delayedCommandOwnerActive(world: IWorldIr, command: IWebDelayedCommand, currentScene: string | null | undefined): boolean {
  if (command.ownership.kind === "entity") {
    return world.entities.some((entity) => entity.id === command.ownership.id);
  }
  return currentScene === undefined || currentScene === null || currentScene === command.ownership.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeFields(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).sort() : ["$"];
}

export function applyCommands(world: IWorldIr, commands: ReadonlyArray<IQueuedCommand>, prefabs?: IPrefabsIr): void {
  for (const command of commands) {
    if (command.kind === "instantiate") {
      const prefab = prefabs?.prefabs.find((candidate) => candidate.id === command.prefab);
      if (prefab === undefined || command.prefix === undefined) {
        continue;
      }
      for (const template of prefab.entities) {
        const id = `${command.prefix}.${template.id}`;
        if (world.entities.some((entity) => entity.id === id)) {
          continue;
        }
        const components = cloneValue(template.components) as IWorldEntity["components"];
        const hierarchy = components.Hierarchy;
        if (isRecord(hierarchy) && typeof hierarchy.parent === "string" && hierarchy.parent.trim() !== "") {
          components.Hierarchy = { ...hierarchy, parent: `${command.prefix}.${hierarchy.parent}` };
        }
        const tags = normalizeEntityTags(template.tags);
        world.entities.push({ components, id, ...(tags.length === 0 ? {} : { tags }) });
      }
      continue;
    }
    if (command.kind === "tween") {
      continue;
    }
    if (command.kind === "worldText") {
      if (world.entities.some((entity) => entity.id === command.entity) || !isRecord(command.value)) {
        continue;
      }
      const liveWorldText = world.entities.filter((entity) => entity.components.WorldText !== undefined).length;
      if (liveWorldText >= 64) {
        continue;
      }
      world.entities.push({ components: { WorldText: cloneValue(command.value) as unknown as NonNullable<IWorldEntity["components"]["WorldText"]> }, id: command.entity });
      continue;
    }
    if (command.kind === "spawn") {
      if (world.entities.every((entity) => entity.id !== command.entity)) {
        const tags = normalizeEntityTags(command.tags);
        world.entities.push({ components: cloneValue(command.components ?? {}) as IWorldEntity["components"], id: command.entity, ...(tags.length === 0 ? {} : { tags }) });
      }
      continue;
    }
    if (command.kind === "despawn") {
      world.entities = world.entities.filter((entity) => entity.id !== command.entity);
      continue;
    }
    if (command.kind === "setParent") {
      if (command.child !== undefined && command.parent !== undefined) {
        setEntityParent(world, command.child, command.parent);
      }
      continue;
    }
    if (command.kind === "clearParent") {
      if (command.child !== undefined) {
        clearEntityParent(world, command.child);
      }
      continue;
    }
    if (command.kind === "emitEvent") {
      if (command.event !== undefined) {
        applyEvents(world, [{ event: command.event, payload: command.payload }]);
      }
      continue;
    }
    const entity = world.entities.find((item) => item.id === command.entity);
    if (entity === undefined || command.component === undefined) {
      continue;
    }
    if (command.kind === "removeComponent") {
      delete entity.components[command.component];
      continue;
    }
    if (command.kind === "addComponent" || command.kind === "setComponent") {
      if (command.source === "entity" && command.component === "Transform" && isRecord(command.value) && isRecord(entity.components.Transform)) {
        entity.components.Transform = { ...entity.components.Transform, ...cloneValue(command.value) };
        continue;
      }
      entity.components[command.component] = cloneValue(command.value);
    }
  }
}

function setEntityParent(world: IWorldIr, childId: string, parentId: string): void {
  if (childId === parentId || wouldCreateHierarchyCycle(world, childId, parentId)) {
    return;
  }
  const child = world.entities.find((entity) => entity.id === childId);
  const parent = world.entities.find((entity) => entity.id === parentId);
  if (child === undefined || parent === undefined) {
    return;
  }
  const current = isRecord(child.components.Hierarchy) ? child.components.Hierarchy : {};
  child.components.Hierarchy = { ...current, parent: parentId };
}

function clearEntityParent(world: IWorldIr, childId: string): void {
  const child = world.entities.find((entity) => entity.id === childId);
  if (child === undefined) {
    return;
  }
  const current = isRecord(child.components.Hierarchy) ? child.components.Hierarchy : {};
  child.components.Hierarchy = { ...current };
  delete (child.components.Hierarchy as Record<string, unknown>).parent;
}

function wouldCreateHierarchyCycle(world: IWorldIr, childId: string, parentId: string): boolean {
  let current: string | undefined = parentId;
  const visited = new Set<string>();
  while (current !== undefined) {
    if (current === childId) {
      return true;
    }
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    const entity = world.entities.find((candidate) => candidate.id === current);
    const hierarchy = entity?.components.Hierarchy;
    current = isRecord(hierarchy) && typeof hierarchy.parent === "string" ? hierarchy.parent : undefined;
  }
  return false;
}

export function applyEvents(world: IWorldIr, events: ReadonlyArray<IQueuedEvent>): void {
  if (events.length === 0) {
    return;
  }
  const queues = { ...(world.events ?? {}) };
  for (const event of events) {
    const queue = queues[event.event];
    queues[event.event] = Array.isArray(queue) ? [...queue, event.payload] : [event.payload];
  }
  world.events = queues;
}

export function applyResourceWrites(world: IWorldIr, resources: ReadonlyArray<IQueuedResourceWrite>): void {
  if (resources.length === 0) {
    return;
  }
  world.resources = {
    ...(world.resources ?? {}),
    ...Object.fromEntries(resources.map((resource) => [resource.resource, cloneValue(resource.value)])),
  };
}

function applyQueryWindow(entities: IWorldEntity[], query: IScriptSystemQuery): IWorldEntity[] {
  const ordered = query.orderBy === "id" ? [...entities].sort((left, right) => left.id.localeCompare(right.id)) : entities;
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = query.limit === undefined ? undefined : Math.max(0, Math.floor(query.limit));
  return ordered.slice(offset, limit === undefined ? undefined : offset + limit);
}

function diagnoseUnknownQueryComponents(
  query: IScriptSystemQuery,
  knownComponents: ReadonlySet<string>,
  emitted: Set<string>,
  systemName: string,
  diagnostics: IRuntimeDiagnostic[],
): void {
  for (const component of [...(query.with ?? []), ...(query.without ?? []), ...(query.changed ?? [])]) {
    if (knownComponents.has(component)) continue;
    const key = `${systemName}\0${component}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const nearest = [...knownComponents]
      .map((candidate) => ({ candidate, distance: editDistance(component, candidate) }))
      .filter(({ distance }) => distance <= 2)
      .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))[0]?.candidate;
    diagnostics.push({
      code: "TN_RUNTIME_QUERY_UNKNOWN_COMPONENT",
      message: `System '${systemName || "<anonymous>"}' queried unknown component '${component}'.`,
      path: `systems/${systemName || "<anonymous>"}/queries/${component}`,
      severity: "error",
      suggestion: nearest === undefined
        ? "Declare the component on an entity or in a component schema before querying it."
        : `Use '${nearest}' or declare '${component}' before querying it.`,
    });
  }
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0]!;
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = row[rightIndex]!;
      row[rightIndex] = Math.min(
        row[rightIndex]! + 1,
        row[rightIndex - 1]! + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length]!;
}

function matchesQuery(world: IWorldIr, entity: IWorldEntity, query: IScriptSystemQuery, componentDiff?: IComponentDiffCache): boolean {
  return (query.with ?? []).every((component) => entity.components[component] !== undefined)
    && (query.without ?? []).every((component) => entity.components[component] === undefined)
    && (query.changed ?? []).every((component) => changedComponents(world, entity, componentDiff).has(component));
}

function changedComponents(world: IWorldIr, entity: IWorldEntity, componentDiff?: IComponentDiffCache): Set<string> {
  const explicit = [
    readChangedValue(entity.components.__changed, entity.id),
    readChangedValue(world.resources?.__changed, entity.id),
    readChangedValue(world.resources?.Changed, entity.id),
  ].flat();
  if (explicit.length > 0) {
    return new Set(explicit);
  }
  return new Set(componentDiff?.runtimeChangedComponents(entity) ?? []);
}

function readChangedValue(value: unknown, entityId: string): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (!isRecord(value)) {
    return [];
  }
  if (Array.isArray(value[entityId])) {
    return (value[entityId] as unknown[]).filter((item): item is string => typeof item === "string");
  }
  const entities = value.entities;
  if (isRecord(entities) && Array.isArray(entities[entityId])) {
    return (entities[entityId] as unknown[]).filter((item): item is string => typeof item === "string");
  }
  return [];
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return globalThis.structuredClone !== undefined ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function emptyLocalData(): ILocalDataIr {
  return {
    components: [],
    resources: [],
    saveSlots: [],
    schema: "threenative.local-data",
    settings: [],
    version: "0.1.0",
  };
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  return value;
}

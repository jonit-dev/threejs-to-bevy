import { buildComponentReflectionRegistry, type IComponentReflectionRegistry, type IComponentReflectionType } from "@threenative/ir/reflection";
import type { IAssetsManifest, IIrSchemaFile, IIrStateSource, IIrSystemQuery, ILocalDataIr, IPrefabsIr, ISystemsIr, IUiIr, IUiNodeIr, IWorldEntity, IWorldIr } from "@threenative/ir";
import { AnimationRuntimeController } from "../animation.js";
import { ScriptAudioRuntimeController, type IScriptAudioPlayOptions } from "../audio.js";
import { traceCharacterControllers, type ICharacterTraceObservation } from "../character.js";
import type { IWebInputState } from "../input.js";
import { queryNavigationPath, type INavigationPathRequest, type INavigationPathResult } from "../navigation.js";
import { tracePhysicsSensors, type IPhysicsSensorEvent } from "../sensors.js";
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

export interface ISystemEntityView {
  components: IWorldEntity["components"];
  get<T = unknown>(component: unknown): T;
  has(component: unknown): boolean;
  id: string;
  patch(component: unknown, value: Record<string, unknown>): void;
  set(component: unknown, value: unknown): void;
}

export interface ISystemCommandBuffer {
  addComponent(entity: string, component: unknown, value?: unknown): void;
  clearParent(child: string): void;
  despawn(entity: string): void;
  emitEvent(event: unknown, payload: unknown): void;
  instantiate(prefab: string, prefix: string): IInstantiateResult;
  removeComponent(entity: string, component: unknown): void;
  setComponent(entity: string, component: unknown, value: unknown): void;
  setParent(child: string, parent: string): void;
  spawn(entity: string, components?: Record<string, unknown>): void;
}

export interface ISystemContext {
  animation: {
    play(entity: string | ISystemEntityView, clip: string, options?: Record<string, unknown>): ReturnType<typeof animationPlayPayload>["result"];
    query(entity: string | ISystemEntityView, clip?: string): ReturnType<typeof animationQueryPayload>["result"];
    stop(entity: string | ISystemEntityView, clip?: string): ReturnType<typeof animationStopPayload>["result"];
  };
  audio: {
    play(soundId: string, options?: IScriptAudioPlayOptions): ReturnType<typeof audioPlayPayload>["result"];
    query(playbackId: string): ReturnType<typeof audioQueryPayload>["result"];
    stop(playbackId: string): ReturnType<typeof audioStopPayload>["result"];
  };
  assets: {
    get(id: unknown): IAssetsManifest["assets"][number] | null;
    list(): IAssetsManifest["assets"];
    load(id: unknown): IAssetLoadResult;
  };
  character: {
    move(entity: string | ISystemEntityView, options?: ICharacterMoveRequest): ICharacterTraceObservation | null;
  };
  commands: ISystemCommandBuffer;
  components: {
    hooks(component: unknown): IComponentHookObservation[];
    type(component: unknown): IComponentReflectionType | null;
    types(): IComponentReflectionRegistry;
  };
  channels: {
    read(channel: unknown): unknown[];
    send(channel: unknown, payload: unknown): void;
  };
  events: {
    emit(event: unknown, payload: unknown): void;
    read(event: unknown): unknown[];
  };
  input: {
    action(name: string): boolean;
    axis(name: string): number;
    pressed(name: string): boolean;
    released(name: string): boolean;
  };
  ui: {
    activate(nodeId: string): IUiActivateResult;
    focus(nodeId: string): IUiFocusResult;
    read(nodeId: string): IUiReadResult;
    setDisabled(nodeId: string, disabled: boolean): IUiDisabledResult;
    setValue(nodeId: string, value: boolean | number | string): IUiValueResult;
  };
  persistence: {
    delete(slot: string): { accepted: boolean; slot: string; status: "deleted" | "missing-save" };
    listSlots(): string[];
    load(slot: string): ReturnType<IWebPersistenceService["load"]>;
    save(slot: string): ReturnType<IWebPersistenceService["save"]>;
  };
  observers: {
    propagate(event: unknown, target: string): IObserverPropagationStep[];
  };
  plugins: {
    group(id: unknown): IPluginGroupView | null;
    has(id: unknown): boolean;
    list(): IPluginDeclarationView[];
  };
  query(query?: IIrSystemQuery): ISystemEntityView[];
  random: {
    bool(probability?: number): boolean;
    float(): number;
    int(min: number, max: number): number;
    pick<T>(values: readonly T[]): T | undefined;
    range(min: number, max: number): number;
  };
  scenes: {
    change(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"change">;
    current(): string | null;
    loadAdditive(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"loadAdditive">;
    pop(options?: Record<string, unknown>): { accepted: true; operation: "pop" };
    push(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"push">;
    unload(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"unload">;
  };
  timers: {
    done(start: number, duration: number): boolean;
    elapsed(start: number): number;
    progress(start: number, duration: number): number;
    ready(lastRun: number, cooldown: number): boolean;
    remaining(start: number, duration: number): number;
  };
  resources: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
  settings: {
    export(): Record<string, boolean | number | string>;
    get(key: string): boolean | number | string | undefined;
    import(values: Record<string, unknown>): Record<string, boolean | number | string>;
    set(key: string, value: boolean | number | string): boolean;
  };
  states: {
    get(id: string): string | null;
  };
  tasks: {
    channel(id: unknown): string | null;
    has(id: unknown): boolean;
    list(): ITaskDeclarationView[];
  };
  physics: {
    overlap(options: IOverlapRequest): IOverlapResult;
    raycast(options: IRaycastRequest): IRaycastResult;
    sensor(options?: IPhysicsSensorRequest): IPhysicsSensorResult;
    shapeCast(options: IShapeCastRequest): IShapeCastResult;
  };
  navigation: {
    path(options: INavigationPathRequest): INavigationPathResult;
  };
  picking: {
    mesh(options: IPickMeshRequest): IPickMeshResult;
    pointerRay(options: IPointerRayRequest): IPointerRayResult;
  };
  time: {
    delta: number;
    dt: number;
    elapsed: number;
    fixedDelta: number;
    fixedDt: number;
    paused: boolean;
  };
}

export interface IObserverPropagationStep {
  entity: string;
  phase: "bubble" | "target";
}

export interface IComponentHookObservation {
  component: string;
  entity: string;
  hook: "onAdd" | "onInsert";
}

export interface ITaskDeclarationView {
  channel?: string;
  id: string;
  mode: "fixed-trace";
  schedule: "fixedUpdate" | "postUpdate" | "startup" | "update";
}

export interface IPluginDeclarationView {
  id: string;
  systems: string[];
}

export interface IPluginGroupView {
  id: string;
  plugins: string[];
}

export interface IQueuedCommand {
  child?: string;
  components?: Record<string, unknown>;
  component?: string;
  entity: string;
  event?: string;
  kind: "addComponent" | "clearParent" | "despawn" | "emitEvent" | "instantiate" | "removeComponent" | "setComponent" | "setParent" | "spawn";
  parent?: string;
  payload?: unknown;
  prefab?: string;
  prefix?: string;
  source: "command" | "entity";
  value?: unknown;
}

export interface IInstantiateResult {
  accepted: boolean;
  entities: string[];
  prefab: string;
  root: string | null;
  status: "enqueued" | "missing";
}

export interface IQueuedEvent {
  event: string;
  payload: unknown;
}

export interface IQueuedResourceWrite {
  resource: string;
  value: unknown;
}

export interface IQueuedServiceCall {
  payload: unknown;
  service: "animation.play" | "animation.query" | "animation.stop" | "audio.play" | "audio.query" | "audio.stop" | "assets.load" | "character.move" | "navigation.path" | "physics.overlap" | "physics.raycast" | "physics.sensor" | "physics.shapeCast" | "picking.mesh" | "picking.pointerRay" | "persistence.delete" | "persistence.listSlots" | "persistence.load" | "persistence.save" | "scene.change" | "scene.current" | "scene.loadAdditive" | "scene.pop" | "scene.push" | "scene.unload" | "settings.export" | "settings.get" | "settings.import" | "settings.set" | "ui.activate" | "ui.focus" | "ui.read" | "ui.setDisabled" | "ui.setValue";
}

export interface IUiFocusResult {
  accepted: boolean;
  current: string | null;
  previous: string | null;
  status: "focused" | "missing" | "not-focusable";
}

export interface IUiActivateResult {
  accepted: boolean;
  action?: string;
  node: string;
  status: "activated" | "disabled" | "missing" | "no-action";
}

export interface IUiDisabledResult {
  accepted: boolean;
  disabled: boolean;
  node: string;
  status: "missing" | "updated";
}

export interface IUiValueResult {
  accepted: boolean;
  node: string;
  status: "missing" | "updated";
  value: boolean | number | string;
}

export interface IUiReadResult {
  action?: string;
  disabled: boolean;
  focusable: boolean;
  focused: boolean;
  kind?: string;
  node: string;
  status: "found" | "missing";
  value?: boolean | number | string;
}

export interface ISceneServiceResult<TOperation extends "change" | "loadAdditive" | "push" | "unload"> {
  accepted: true;
  operation: TOperation;
  scene: string;
}

export interface IAssetLoadResult {
  accepted: boolean;
  asset: IAssetsManifest["assets"][number] | null;
  id: string;
  status: "missing" | "ready";
}

export interface ICharacterMoveRequest {
  axes?: Record<string, number>;
  fixedDelta?: number;
}

export interface IPhysicsSensorRequest {
  phases?: Array<"enter" | "exit" | "stay">;
  sensor?: string;
}

export interface IPhysicsSensorResult {
  events: IPhysicsSensorEvent[];
}

export function createSystemContext(
  world: IWorldIr,
  options: { assets?: IAssetsManifest; audio?: import("@threenative/ir").IAudioIr; componentDiff?: IComponentDiffCache; componentSchemas?: IIrSchemaFile; currentScene?: string | null; defaultQuery?: IIrSystemQuery; delta: number; elapsed?: number; fixedDelta: number; input?: IWebInputState; localData?: ILocalDataIr; paused?: boolean; persistence?: IWebPersistenceService; prefabs?: IPrefabsIr; systems?: ISystemsIr; ui?: IUiIr },
): {
  commands: IQueuedCommand[];
  context: ISystemContext;
  events: IQueuedEvent[];
  resources: IQueuedResourceWrite[];
  services: IQueuedServiceCall[];
} {
  const commands: IQueuedCommand[] = [];
  const events: IQueuedEvent[] = [];
  const resources: IQueuedResourceWrite[] = [];
  const services: IQueuedServiceCall[] = [];
  const states = evaluateStates(world, options.systems);
  const componentTypes = buildComponentReflectionRegistry(options.componentSchemas);
  const random = createDeterministicRandom(randomSeed(world));
  const animations = new AnimationRuntimeController();
  const scriptAudio = new ScriptAudioRuntimeController(options.audio);
  const persistence = options.persistence ?? createWebPersistenceService(options.localData ?? emptyLocalData());
  const ui = createScriptUiState(options.ui);
  return {
    commands,
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
            fixedDelta: moveOptions.fixedDelta ?? options.fixedDelta,
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
        removeComponent(entity, component) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "removeComponent", source: "command" });
        },
        setComponent(entity, component, value) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "setComponent", source: "command", value: cloneValue(value) });
        },
        setParent(child, parent) {
          commands.push({ child, entity: child, kind: "setParent", parent, source: "command" });
        },
        spawn(entity, components = {}) {
          commands.push({ components: cloneValue(components) as Record<string, unknown>, entity, kind: "spawn", source: "command" });
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
        axis(name) {
          return options.input?.axis(name) ?? 0;
        },
        pressed(name) {
          return options.input?.pressed(name) ?? false;
        },
        released(name) {
          return options.input?.released(name) ?? false;
        },
      },
      ui: {
        activate(nodeId) {
          const request = { node: nodeId };
          const result = ui.activate(nodeId);
          services.push({ payload: { request, result }, service: "ui.activate" });
          return cloneValue(result) as IUiActivateResult;
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
        return applyQueryWindow(world.entities.filter((entity) => matchesQuery(world, entity, query, options.componentDiff)), query)
          .map((entity) => createEntityView(entity, commands));
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
      timers: createTimerHelpers(options.elapsed ?? 0),
      resources: {
        get(name) {
          return cloneValue(world.resources?.[name]);
        },
        set(name, value) {
          resources.push({ resource: normalizeHandleName(name), value: cloneValue(value) });
        },
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
            events: tracePhysicsSensors(world, { phases: request.phases, steps: 1 }).filter((event) => request.sensor === undefined || event.sensor === request.sensor),
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
          const result = pickMesh(world, options.assets, request);
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
        dt: options.delta,
        elapsed: options.elapsed ?? 0,
        fixedDelta: options.fixedDelta,
        fixedDt: options.fixedDelta,
        paused: options.paused ?? false,
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

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function assetById(assets: IAssetsManifest | undefined, id: string): IAssetsManifest["assets"][number] | undefined {
  return assets?.assets.find((asset) => asset.id === id);
}

function createEntityView(entity: IWorldEntity, commands: IQueuedCommand[]): ISystemEntityView {
  const components = deepFreeze(cloneValue(entity.components)) as IWorldEntity["components"];
  return {
    components,
    get<T = unknown>(component: unknown): T {
      return cloneValue(components[normalizeHandleName(component)]) as T;
    },
    has(component: unknown): boolean {
      return components[normalizeHandleName(component)] !== undefined;
    },
    id: entity.id,
    patch(component: unknown, value: Record<string, unknown>): void {
      const componentName = normalizeHandleName(component);
      const existing = components[componentName];
      commands.push({
        component: componentName,
        entity: entity.id,
        kind: "setComponent",
        source: "entity",
        value: {
          ...(isRecord(existing) ? existing : {}),
          ...cloneValue(value),
        },
      });
    },
    set(component: unknown, value: unknown): void {
      commands.push({ component: normalizeHandleName(component), entity: entity.id, kind: "setComponent", source: "entity", value: cloneValue(value) });
    },
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        world.entities.push({ components, id });
      }
      continue;
    }
    if (command.kind === "spawn") {
      if (world.entities.every((entity) => entity.id !== command.entity)) {
        world.entities.push({ components: cloneValue(command.components ?? {}) as IWorldEntity["components"], id: command.entity });
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

function applyQueryWindow(entities: IWorldEntity[], query: IIrSystemQuery): IWorldEntity[] {
  const ordered = query.orderBy === "id" ? [...entities].sort((left, right) => left.id.localeCompare(right.id)) : entities;
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = query.limit === undefined ? undefined : Math.max(0, Math.floor(query.limit));
  return ordered.slice(offset, limit === undefined ? undefined : offset + limit);
}

function matchesQuery(world: IWorldIr, entity: IWorldEntity, query: IIrSystemQuery, componentDiff?: IComponentDiffCache): boolean {
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

function createScriptUiState(ui: IUiIr | undefined): {
  activate(nodeId: string): IUiActivateResult;
  focus(nodeId: string): IUiFocusResult;
  read(nodeId: string): IUiReadResult;
  setDisabled(nodeId: string, disabled: boolean): IUiDisabledResult;
  setValue(nodeId: string, value: boolean | number | string): IUiValueResult;
} {
  const nodes = new Map<string, IUiNodeIr>();
  if (ui !== undefined) {
    collectUiNodes(ui.root, nodes);
  }
  const focusable = new Set((ui?.focusOrder ?? [...nodes.values()].filter(isUiFocusable).map((node) => node.id)).filter((id) => nodes.has(id) && isUiFocusable(nodes.get(id)!)));
  const disabled = new Map<string, boolean>();
  const values = new Map<string, boolean | number | string>();
  let currentFocus = [...focusable].sort()[0] ?? null;

  return {
    activate(nodeId) {
      const node = nodes.get(nodeId);
      if (node === undefined) {
        return { accepted: false, node: nodeId, status: "missing" };
      }
      if (disabled.get(nodeId) ?? node.disabled === true) {
        return { accepted: false, node: nodeId, status: "disabled" };
      }
      if (typeof node.action !== "string" || node.action.trim() === "") {
        return { accepted: false, node: nodeId, status: "no-action" };
      }
      return { accepted: true, action: node.action, node: nodeId, status: "activated" };
    },
    focus(nodeId) {
      const previous = currentFocus;
      if (!nodes.has(nodeId)) {
        return { accepted: false, current: currentFocus, previous, status: "missing" };
      }
      if (!focusable.has(nodeId) || (disabled.get(nodeId) ?? nodes.get(nodeId)?.disabled) === true) {
        return { accepted: false, current: currentFocus, previous, status: "not-focusable" };
      }
      currentFocus = nodeId;
      return { accepted: true, current: currentFocus, previous, status: "focused" };
    },
    read(nodeId) {
      const node = nodes.get(nodeId);
      if (node === undefined) {
        return { disabled: false, focusable: false, focused: false, node: nodeId, status: "missing" };
      }
      const value = values.get(nodeId) ?? node.value ?? node.text ?? node.label;
      return {
        ...(node.action === undefined ? {} : { action: node.action }),
        disabled: disabled.get(nodeId) ?? node.disabled === true,
        focusable: focusable.has(nodeId),
        focused: currentFocus === nodeId,
        kind: node.kind,
        node: nodeId,
        status: "found",
        ...(value === undefined ? {} : { value }),
      };
    },
    setDisabled(nodeId, nextDisabled) {
      if (!nodes.has(nodeId)) {
        return { accepted: false, disabled: nextDisabled, node: nodeId, status: "missing" };
      }
      disabled.set(nodeId, nextDisabled);
      if (nextDisabled && currentFocus === nodeId) {
        currentFocus = null;
      }
      return { accepted: true, disabled: nextDisabled, node: nodeId, status: "updated" };
    },
    setValue(nodeId, value) {
      if (!nodes.has(nodeId)) {
        return { accepted: false, node: nodeId, status: "missing", value };
      }
      values.set(nodeId, value);
      return { accepted: true, node: nodeId, status: "updated", value };
    },
  };
}

function collectUiNodes(node: IUiNodeIr, nodes: Map<string, IUiNodeIr>): void {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) {
    collectUiNodes(child, nodes);
  }
}

function isUiFocusable(node: IUiNodeIr): boolean {
  return node.focusable === true || node.kind === "button" || node.kind === "touchControl";
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

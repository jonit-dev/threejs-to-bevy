import { SdkError } from "../errors.js";
import type { CommandDeclaration } from "./commands.js";
import type { IQueryDeclaration, IQueryOptions } from "./query.js";
import type { EcsFactory, IEcsSchema } from "./schema.js";

export type SystemSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";
export type SystemService =
  | "animation.play"
  | "animation.query"
  | "animation.stop"
  | "audio.play"
  | "audio.query"
  | "audio.stop"
  | "assets.load"
  | "character.move"
  | "navigation.path"
  | "particles.burst"
  | "particles.reset"
  | "particles.start"
  | "particles.stop"
  | "physics.overlap"
  | "physics.raycast"
  | "physics.sensor"
  | "physics.shapeCast"
  | "picking.mesh"
  | "picking.pointerRay"
  | "persistence.delete"
  | "persistence.listSlots"
  | "persistence.load"
  | "persistence.save"
  | "scene.change"
  | "scene.current"
  | "scene.loadAdditive"
  | "scene.pop"
  | "scene.push"
  | "scene.unload"
  | "settings.export"
  | "settings.get"
  | "settings.import"
  | "settings.set"
  | "ui.activate"
  | "ui.focus"
  | "ui.read"
  | "ui.setDisabled"
  | "ui.setValue";
export type PortableSystem<TContext = ISystemContext> = (context: TContext) => unknown;

export interface ISystemScriptSourceReference {
  export: string;
  hash?: string;
  module: string;
}

export interface ISystemOptions {
  after?: ReadonlyArray<string>;
  before?: ReadonlyArray<string>;
  commands?: ReadonlyArray<CommandDeclaration>;
  eventReads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  eventWrites?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  queries?: ReadonlyArray<IQueryDeclaration>;
  reads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  resourceReads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  resourceWrites?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  run?: PortableSystem;
  script?: ISystemScriptSourceReference;
  services?: ReadonlyArray<SystemService>;
  writes?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
}

export interface IV4SystemConfig extends ISystemOptions {
  id: string;
  stage: SystemSchedule;
}

export interface ISystemDeclaration {
  after: string[];
  before: string[];
  commands: CommandDeclaration[];
  eventReads: string[];
  eventSchemas: IEcsSchema[];
  eventWrites: string[];
  name: string;
  queries: IQueryDeclaration[];
  reads: string[];
  resourceReads: string[];
  resourceSchemas: IEcsSchema[];
  resourceWrites: string[];
  run?: PortableSystem;
  schedule: SystemSchedule;
  script?: ISystemScriptSourceReference;
  services: SystemService[];
  schemas: IEcsSchema[];
  writes: string[];
}

export interface ISystemEntity {
  readonly id: string;
  get<T = unknown>(component: EcsFactory | IEcsSchema | string): T;
  get<T extends Record<string, unknown>>(component: EcsFactory | IEcsSchema | string, defaults: T): T;
  has(component: EcsFactory | IEcsSchema | string): boolean;
  patch(component: EcsFactory | IEcsSchema | string, value: Record<string, unknown>): void;
  set(component: EcsFactory | IEcsSchema | string, value: unknown): void;
  transform(): ISystemTransformFacade;
}

export interface ISystemTransformFacade {
  position: [number, number, number];
  positionOr(fallback: readonly [number, number, number]): [number, number, number];
  setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
  setPosition(position: readonly [number, number, number]): void;
  setRotation(rotation: readonly [number, number, number, number]): void;
  yawOr(fallback: number): number;
}

export interface ISystemContext {
  animation: {
    play(entity: ISystemEntity | string, clip: string, options?: Record<string, unknown>): void;
    query(entity: ISystemEntity | string, clip?: string): { active: boolean; clip?: string; entity: string; paused: boolean; stopped: boolean; timeSeconds: number };
    stop(entity: ISystemEntity | string, clip?: string): { accepted: true; stopped: true };
  };
  particles: {
    burst(asset: string, emitter: string, options?: { count?: number; seed?: number | string }): IParticleCommandResult;
    reset(asset: string, emitter: string, options?: { seed?: number | string }): IParticleCommandResult;
    start(asset: string, emitter: string, options?: { count?: number; seed?: number | string }): IParticleCommandResult;
    stop(asset: string, emitter: string): IParticleCommandResult;
  };
  audio: {
    play(soundId: string, options?: import("../audio.js").IScriptAudioPlayOptions): import("../audio.js").IScriptAudioPlayResult;
    query(playbackId: string): import("../audio.js").IScriptAudioQueryResult;
    stop(playbackId: string): import("../audio.js").IScriptAudioStopResult;
  };
  assets: {
    get(id: unknown): Record<string, unknown> | null;
    list(): Record<string, unknown>[];
    load(id: unknown): { accepted: boolean; asset: Record<string, unknown> | null; id: string; status: "missing" | "ready" };
  };
  character: {
    move(
      entity: ISystemEntity | string,
      options?: {
        axes?: Record<string, number>;
        fixedDelta?: number;
      },
    ): {
      blockedBy?: string;
      desired: [number, number, number];
      entity: string;
      groundEntity?: string;
      grounded: boolean;
      platformDelta?: [number, number, number];
      resolved: [number, number, number];
      start: [number, number, number];
    } | null;
  };
  commands: {
    addComponent(entity: string, component: EcsFactory | IEcsSchema | string, value?: unknown): void;
    clearParent(child: string): void;
    despawn(entity: string, policy?: { recursive?: boolean }): void;
    instantiate(prefab: string, prefix: string): { accepted: boolean; entities: string[]; prefab: string; root: string | null; status: "enqueued" | "missing" };
    removeComponent(entity: string, component: EcsFactory | IEcsSchema | string): void;
    setComponent(entity: string, component: EcsFactory | IEcsSchema | string, value: unknown): void;
    setParent(child: string, parent: string): void;
    spawn(entity: string, components: Record<string, unknown>): void;
  };
  events: {
    emit(event: EcsFactory | IEcsSchema | string, payload: unknown): void;
    read<T = unknown>(event: EcsFactory | IEcsSchema | string): T[];
  };
  input: {
    action(name: string): boolean;
    axis1(axis: string, buttons?: { negative?: string; positive?: string }): number;
    axis(name: string): number;
    getAxis(axis: string): number;
    getAxis2(xAxis: string, yAxis: string, options?: { deadzone?: number; normalize?: boolean }): [number, number];
    getButton(name: string): boolean;
    getButtonDown(name: string): boolean;
    getButtonUp(name: string): boolean;
    pressed(name: string): boolean;
    released(name: string): boolean;
  };
  entities: {
    byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ISystemEntity | undefined };
  };
  entity(id: string): ISystemEntity | undefined;
  ui: {
    activate(nodeId: string): { accepted: boolean; action?: string; node: string; status: "activated" | "disabled" | "missing" | "no-action" };
    focus(nodeId: string): { accepted: boolean; current: string | null; previous: string | null; status: "focused" | "missing" | "not-focusable" };
    read(nodeId: string): {
      action?: string;
      disabled: boolean;
      focusable: boolean;
      focused: boolean;
      kind?: string;
      node: string;
      status: "found" | "missing";
      value?: boolean | number | string;
    };
    setDisabled(nodeId: string, disabled: boolean): { accepted: boolean; disabled: boolean; node: string; status: "missing" | "updated" };
    setValue(nodeId: string, value: boolean | number | string): { accepted: boolean; node: string; status: "missing" | "updated"; value: boolean | number | string };
  };
  physics: {
    overlap(options: {
      layer?: string;
      mask?: string[];
      position: [number, number, number];
      shape: { halfExtents: [number, number, number]; kind: "box" } | { kind: "sphere"; radius: number };
    }): { entities: string[] };
    raycast(options: {
      direction: [number, number, number];
      ignore?: string[];
      layer?: string;
      layers?: string[];
      mask?: string[];
      maxDistance: number;
      origin: [number, number, number];
    }):
      | { hit: false }
      | {
          distance: number;
          entity: string;
          hit: true;
          material?: string;
          normal: [number, number, number];
          point: [number, number, number];
        };
    shapeCast(options: {
      direction: [number, number, number];
      ignore?: string[];
      layer?: string;
      mask?: string[];
      maxDistance: number;
      origin: [number, number, number];
      shape: { halfExtents: [number, number, number]; kind: "box" } | { kind: "sphere"; radius: number };
    }):
      | { hit: false }
      | {
          distance: number;
          entity: string;
          hit: true;
          normal: [number, number, number];
          point: [number, number, number];
        };
    sensor(options?: {
      phases?: Array<"enter" | "exit" | "stay">;
      sensor?: string;
    }): {
      events: Array<{
        occupants: string[];
        phase: "enter" | "exit" | "stay";
        sensor: string;
      }>;
    };
  };
  navigation: {
    path(options: {
      goal: [number, number, number];
      id?: string;
      start: [number, number, number];
    }): {
      failureReason?: "goal-outside" | "no-route" | "start-outside";
      path: Array<[number, number, number]>;
      query: string;
      status: "failed" | "success";
      totalCost: number;
      visitedRegions: string[];
    };
  };
  picking: {
    mesh(options: {
      direction: [number, number, number];
      ignore?: string[];
      maxDistance: number;
      origin: [number, number, number];
    }):
      | { hit: false }
      | {
          distance: number;
          entity: string;
          hit: true;
          normal: [number, number, number];
          point: [number, number, number];
        };
    pointerRay(options: {
      aspect?: number;
      camera?: string;
      maxDistance?: number;
      pointer: [number, number];
    }):
      | { hit: false }
      | {
          direction: [number, number, number];
          hit: true;
          maxDistance: number;
          origin: [number, number, number];
        };
  };
  persistence: {
    delete(slot: string): { accepted: boolean; slot: string; status: "deleted" | "missing-save" };
    listSlots(): string[];
    load(slot: string): {
      accepted: boolean;
      record?: {
        appVersion: string;
        components: Record<string, Record<string, unknown>>;
        resources: Record<string, unknown>;
        schemaVersion: number;
        settings: Record<string, boolean | number | string>;
        slot: string;
      };
      slot: string;
      status: "loaded" | "missing-save" | "missing-slot";
      world: unknown;
    };
    save(slot: string): {
      accepted: boolean;
      record?: {
        appVersion: string;
        components: Record<string, Record<string, unknown>>;
        resources: Record<string, unknown>;
        schemaVersion: number;
        settings: Record<string, boolean | number | string>;
        slot: string;
      };
      slot: string;
      status: "missing-slot" | "saved";
    };
  };
  query(query?: IQueryDeclaration | IQueryOptions): ISystemEntity[];
  random: {
    bool(probability?: number): boolean;
    float(): number;
    int(min: number, max: number): number;
    pick<T>(values: readonly T[]): T | undefined;
    range(min: number, max: number): number;
  };
  scenes: {
    change(scene: string, options?: Record<string, unknown>): { accepted: true; operation: "change"; scene: string };
    current(): string | null;
    loadAdditive(scene: string, options?: Record<string, unknown>): { accepted: true; operation: "loadAdditive"; scene: string };
    pop(options?: Record<string, unknown>): { accepted: true; operation: "pop" };
    push(scene: string, options?: Record<string, unknown>): { accepted: true; operation: "push"; scene: string };
    unload(scene: string, options?: Record<string, unknown>): { accepted: true; operation: "unload"; scene: string };
  };
  settings: {
    export(): Record<string, boolean | number | string>;
    get(key: string): boolean | number | string | undefined;
    import(values: Record<string, unknown>): Record<string, boolean | number | string>;
    set(key: string, value: boolean | number | string): boolean;
  };
  timers: {
    done(start: number, duration: number): boolean;
    elapsed(start: number): number;
    progress(start: number, duration: number): number;
    ready(lastRun: number, cooldown: number): boolean;
    remaining(start: number, duration: number): number;
  };
  time: {
    delta: number;
    deltaTime: number;
    dt: number;
    elapsed: number;
    fixedDelta: number;
    fixedDeltaTime: number;
    fixedDt: number;
    paused: boolean;
    time: number;
  };
  resources: {
    get<T = unknown>(name: string): T;
    get<T extends Record<string, unknown>>(name: string, defaults: T): T;
    patch(name: string, value: Record<string, unknown>): void;
    set(name: string, value: unknown): void;
  };
  state<T extends Record<string, unknown>>(key: string, defaults: T): T;
}

export interface IParticleCommandResult {
  accepted: boolean;
  active: boolean;
  asset: string;
  command: "burst" | "reset" | "start" | "stop";
  count: number;
  emitter: string;
  maxParticles: number;
  seed: number;
  status: "burst" | "missing-emitter" | "reset" | "started" | "stopped";
}

export function defineSystem(config: IV4SystemConfig, run?: PortableSystem): ISystemDeclaration {
  return createSystem(config.stage, config.id, {
    ...config,
    ...(run === undefined ? (config.run === undefined && config.script !== undefined ? {} : { run: config.run ?? (() => undefined) }) : { run }),
  });
}

export function fixedUpdate(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return createSystem("fixedUpdate", name, options);
}

export function startup(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return createSystem("startup", name, options);
}

export function update(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return createSystem("update", name, options);
}

export function postUpdate(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return createSystem("postUpdate", name, options);
}

function createSystem(schedule: SystemSchedule, name: string, options: ISystemOptions): ISystemDeclaration {
  if (name.trim() === "") {
    throw new SdkError("TN_SDK_ECS_SYSTEM_NAME_EMPTY", "System name must not be empty.");
  }
  if (options.run !== undefined && options.script !== undefined) {
    throw new SdkError("TN_SDK_ECS_SYSTEM_SCRIPT_AMBIGUOUS", "System cannot declare both run and script source metadata.");
  }

  const commands = [...(options.commands ?? [])];
  const componentSchemaSources = [
    ...(options.reads ?? []),
    ...(options.writes ?? []),
    ...(options.queries ?? []).flatMap((query) => query.schemas),
    ...commands.flatMap((command) => {
      if (command.kind === "spawn") {
        return command.schemas;
      }
      if ("schema" in command && command.schema !== undefined && command.schema.kind === "component") {
        return [command.schema];
      }
      return [];
    }),
  ];
  const eventSchemaSources = [
    ...(options.eventReads ?? []),
    ...(options.eventWrites ?? []),
    ...commands.flatMap((command) => ("schema" in command && command.schema !== undefined && command.schema.kind === "event" ? [command.schema] : [])),
  ];
  const resourceSchemaSources = [...(options.resourceReads ?? []), ...(options.resourceWrites ?? [])];

  return {
    after: normalizeSystemRefs(options.after ?? []),
    before: normalizeSystemRefs(options.before ?? []),
    commands,
    eventReads: normalizeNames(options.eventReads ?? []),
    eventSchemas: normalizeSchemas(eventSchemaSources, "event"),
    eventWrites: normalizeNames(options.eventWrites ?? []),
    name,
    queries: [...(options.queries ?? [])],
    reads: normalizeNames(options.reads ?? []),
    resourceReads: normalizeNames(options.resourceReads ?? []),
    resourceSchemas: normalizeSchemas(resourceSchemaSources, "resource"),
    resourceWrites: normalizeNames(options.resourceWrites ?? []),
    run: options.run,
    schedule,
    script: normalizeSystemScript(options.script),
    services: [...(options.services ?? [])].sort(),
    schemas: normalizeSchemas(componentSchemaSources, "component"),
    writes: normalizeNames(options.writes ?? []),
  };
}

function normalizeSystemScript(script: ISystemScriptSourceReference | undefined): ISystemScriptSourceReference | undefined {
  if (script === undefined) {
    return undefined;
  }
  const module = script.module.trim();
  const exportName = script.export.trim();
  const hash = script.hash?.trim();
  if (module.length === 0) {
    throw new SdkError("TN_SDK_ECS_SYSTEM_SCRIPT_MODULE_EMPTY", "System script module must not be empty.");
  }
  if (module.startsWith("/") || module.includes("\\") || module.split("/").includes("..")) {
    throw new SdkError("TN_SDK_ECS_SYSTEM_SCRIPT_MODULE_INVALID", "System script module must be a project-relative path.");
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(exportName)) {
    throw new SdkError("TN_SDK_ECS_SYSTEM_SCRIPT_EXPORT_INVALID", "System script export must be a named JavaScript export identifier.");
  }
  if (hash !== undefined && hash.length === 0) {
    throw new SdkError("TN_SDK_ECS_SYSTEM_SCRIPT_HASH_INVALID", "System script hash must not be empty when provided.");
  }
  return {
    export: exportName,
    ...(hash === undefined ? {} : { hash }),
    module,
  };
}

function normalizeSystemRefs(values: ReadonlyArray<string>): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort();
}

function normalizeNames(values: ReadonlyArray<EcsFactory | IEcsSchema | string>): string[] {
  return [...new Set(values.map((value) => (typeof value === "string" ? value : value.name)))].sort();
}

function normalizeSchemas(values: ReadonlyArray<EcsFactory | IEcsSchema | string>, kind: IEcsSchema["kind"]): IEcsSchema[] {
  const schemas = new Map<string, IEcsSchema>();
  for (const value of values) {
    if (typeof value === "string") {
      continue;
    }
    if (value.kind === kind) {
      schemas.set(value.name, value);
    }
  }
  return [...schemas.values()].sort((left, right) => left.name.localeCompare(right.name));
}

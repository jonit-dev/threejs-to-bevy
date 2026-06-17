import { SdkError } from "../errors.js";
import type { CommandDeclaration } from "./commands.js";
import type { IQueryDeclaration, IQueryOptions } from "./query.js";
import type { EcsFactory, IEcsSchema } from "./schema.js";

export type SystemSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";
export type SystemService =
  | "animation.play"
  | "animation.query"
  | "animation.stop"
  | "assets.load"
  | "character.move"
  | "navigation.path"
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
  | "settings.export"
  | "settings.get"
  | "settings.import"
  | "settings.set";
export type PortableSystem<TContext = ISystemContext> = (context: TContext) => unknown;

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
  services: SystemService[];
  schemas: IEcsSchema[];
  writes: string[];
}

export interface ISystemEntity {
  readonly id: string;
  get<T = unknown>(component: EcsFactory | IEcsSchema | string): T;
  has(component: EcsFactory | IEcsSchema | string): boolean;
  patch(component: EcsFactory | IEcsSchema | string, value: Record<string, unknown>): void;
  set(component: EcsFactory | IEcsSchema | string, value: unknown): void;
}

export interface ISystemContext {
  animation: {
    play(entity: ISystemEntity | string, clip: string, options?: Record<string, unknown>): void;
    query(entity: ISystemEntity | string, clip?: string): { active: boolean; clip?: string; entity: string; paused: boolean; stopped: boolean; timeSeconds: number };
    stop(entity: ISystemEntity | string, clip?: string): { accepted: true; stopped: true };
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
    despawn(entity: string, policy?: { recursive?: boolean }): void;
    removeComponent(entity: string, component: EcsFactory | IEcsSchema | string): void;
    setComponent(entity: string, component: EcsFactory | IEcsSchema | string, value: unknown): void;
    spawn(entity: string, components: Record<string, unknown>): void;
  };
  events: {
    emit(event: EcsFactory | IEcsSchema | string, payload: unknown): void;
    read<T = unknown>(event: EcsFactory | IEcsSchema | string): T[];
  };
  input: {
    action(name: string): boolean;
    axis(name: string): number;
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
  query(query?: IQueryDeclaration | IQueryOptions): ISystemEntity[];
  random: {
    bool(probability?: number): boolean;
    float(): number;
    int(min: number, max: number): number;
    pick<T>(values: readonly T[]): T | undefined;
    range(min: number, max: number): number;
  };
  timers: {
    done(start: number, duration: number): boolean;
    elapsed(start: number): number;
    progress(start: number, duration: number): number;
    ready(lastRun: number, cooldown: number): boolean;
    remaining(start: number, duration: number): number;
  };
  time: {
    dt: number;
    elapsed: number;
    fixedDt: number;
  };
}

export function defineSystem(config: IV4SystemConfig, run: PortableSystem = config.run ?? (() => undefined)): ISystemDeclaration {
  return createSystem(config.stage, config.id, { ...config, run });
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
    services: [...(options.services ?? [])].sort(),
    schemas: normalizeSchemas(componentSchemaSources, "component"),
    writes: normalizeNames(options.writes ?? []),
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

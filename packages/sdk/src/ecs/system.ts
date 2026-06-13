import { SdkError } from "../errors.js";
import type { CommandDeclaration } from "./commands.js";
import type { IQueryDeclaration } from "./query.js";
import type { EcsFactory, IEcsSchema } from "./schema.js";

export type SystemSchedule = "fixedUpdate" | "postUpdate" | "update";
export type SystemService = "animation.play" | "physics.raycast";
export type PortableSystem<TContext = ISystemContext> = (context: TContext) => unknown;

export interface ISystemOptions {
  commands?: ReadonlyArray<CommandDeclaration>;
  eventReads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  eventWrites?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  queries?: ReadonlyArray<IQueryDeclaration>;
  reads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  run?: PortableSystem;
  services?: ReadonlyArray<SystemService>;
  writes?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
}

export interface IV4SystemConfig extends ISystemOptions {
  id: string;
  stage: SystemSchedule;
}

export interface ISystemDeclaration {
  commands: CommandDeclaration[];
  eventReads: string[];
  eventSchemas: IEcsSchema[];
  eventWrites: string[];
  name: string;
  queries: IQueryDeclaration[];
  reads: string[];
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
    raycast(options: {
      direction: [number, number, number];
      ignore?: string[];
      layers?: string[];
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
  };
  query(): ISystemEntity[];
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

  return {
    commands,
    eventReads: normalizeNames(options.eventReads ?? []),
    eventSchemas: normalizeSchemas(eventSchemaSources, "event"),
    eventWrites: normalizeNames(options.eventWrites ?? []),
    name,
    queries: [...(options.queries ?? [])],
    reads: normalizeNames(options.reads ?? []),
    run: options.run,
    schedule,
    services: [...(options.services ?? [])].sort(),
    schemas: normalizeSchemas(componentSchemaSources, "component"),
    writes: normalizeNames(options.writes ?? []),
  };
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

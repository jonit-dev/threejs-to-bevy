import { SdkError } from "../errors.js";
import type { ScriptContext, ScriptEntity, ScriptTransformFacade } from "@threenative/script-stdlib";
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
  | "audio.update"
  | "camera.shake"
  | "effects.play"
  | "assets.load"
  | "character.move"
  | "navigation.path"
  | "particles.burst"
  | "particles.clear"
  | "particles.emit"
  | "particles.play"
  | "particles.reset"
  | "particles.start"
  | "particles.stop"
  | "physics.addForce"
  | "physics.addForceAtPoint"
  | "physics.addTorque"
  | "physics.aerodynamics.setInputs"
  | "physics.applyAngularImpulse"
  | "physics.applyImpulse"
  | "physics.applyImpulseAtPoint"
  | "physics.overlap"
  | "physics.raycast"
  | "physics.sensor"
  | "physics.setAngularVelocity"
  | "physics.setLinearVelocity"
  | "physics.shapeCast"
  | "physics.vehicle.setInputs"
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
  | "sequences.play"
  | "sequences.query"
  | "sequences.stop"
  | "settings.export"
  | "settings.get"
  | "settings.import"
  | "settings.set"
  | "ui.actions"
  | "ui.activate"
  | "ui.focus"
  | "ui.read"
  | "ui.setDisabled"
  | "ui.setValue";
export type PortableSystem<TContext = ISystemContext> = (context: TContext) => unknown;

export type SystemDelayedCommandCancelPolicy = "drop" | "flush";

export interface ISystemDelayedCommandOwnership {
  id: string;
  kind: "entity" | "scene";
}

export interface ISystemDelayedCommandDeclaration {
  cancelPolicy: SystemDelayedCommandCancelPolicy;
  command: CommandDeclaration;
  id: string;
  maxDelayTicks: number;
  ownership: ISystemDelayedCommandOwnership;
}

export interface IScheduleAfterTicksOptions {
  command: CommandDeclaration | string;
  delayTicks: number;
  id: string;
  owner?: ISystemDelayedCommandOwnership;
}

export interface IScheduleAfterTicksResult {
  accepted: boolean;
  delayTicks: number;
  id: string;
  status: "enqueued" | "rejected";
}

export interface ISystemScriptSourceReference {
  export: string;
  hash?: string;
  module: string;
}

export interface ISystemOptions {
  after?: ReadonlyArray<string>;
  before?: ReadonlyArray<string>;
  commands?: ReadonlyArray<CommandDeclaration>;
  delayedCommands?: ReadonlyArray<ISystemDelayedCommandDeclaration>;
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
  delayedCommands: ISystemDelayedCommandDeclaration[];
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

export interface ISystemEntity extends ScriptEntity {
  readonly id: string;
  get<T = unknown>(component: EcsFactory | IEcsSchema | string): T;
  get<T extends Record<string, unknown>>(component: EcsFactory | IEcsSchema | string, defaults: T): T;
  has(component: EcsFactory | IEcsSchema | string): boolean;
  patch(component: EcsFactory | IEcsSchema | string, value: Record<string, unknown>): void;
  set(component: EcsFactory | IEcsSchema | string, value: unknown): void;
  transform(): ISystemTransformFacade;
}

export interface ISystemTransformFacade extends ScriptTransformFacade {}

export interface ISystemContext
  extends Omit<ScriptContext, "commands" | "entities" | "entity" | "events" | "query" | "schedule"> {
  commands: Omit<
    ScriptContext["commands"],
    "addComponent" | "despawn" | "removeComponent" | "setComponent" | "spawn"
  > & {
    addComponent(entity: string, component: EcsFactory | IEcsSchema | string, value?: unknown): void;
    despawn(entity: string, policy?: { recursive?: boolean }): void;
    removeComponent(entity: string, component: EcsFactory | IEcsSchema | string): void;
    setComponent(entity: string, component: EcsFactory | IEcsSchema | string, value: unknown): void;
    spawn(entity: string, components?: Record<string, unknown>, tags?: readonly string[]): void;
  };
  entities: Omit<ScriptContext["entities"], "byId" | "withTag"> & {
    byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ISystemEntity | undefined };
    withTag(tag: string): ISystemEntity[];
  };
  entity(id: string): ISystemEntity | undefined;
  events: Omit<ScriptContext["events"], "emit" | "read"> & {
    emit(event: EcsFactory | IEcsSchema | string, payload?: unknown): void;
    read<T = unknown>(event: EcsFactory | IEcsSchema | string): T[];
  };
  query(query?: IQueryDeclaration | IQueryOptions): ISystemEntity[];
  schedule: {
    afterTicks(options: IScheduleAfterTicksOptions): IScheduleAfterTicksResult;
  };
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
  const delayedCommands = [...(options.delayedCommands ?? [])];
  const componentSchemaSources = [
    ...(options.reads ?? []),
    ...(options.writes ?? []),
    ...(options.queries ?? []).flatMap((query) => query.schemas),
    ...[...commands, ...delayedCommands.map((declaration) => declaration.command)].flatMap((command) => {
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
    ...[...commands, ...delayedCommands.map((declaration) => declaration.command)].flatMap((command) =>
      "schema" in command && command.schema !== undefined && command.schema.kind === "event" ? [command.schema] : [],
    ),
  ];
  const resourceSchemaSources = [...(options.resourceReads ?? []), ...(options.resourceWrites ?? [])];

  return {
    after: normalizeSystemRefs(options.after ?? []),
    before: normalizeSystemRefs(options.before ?? []),
    commands,
    delayedCommands,
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

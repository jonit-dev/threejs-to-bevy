import { SdkError } from "../errors.js";
import type { CommandDeclaration } from "./commands.js";
import type { IQueryDeclaration } from "./query.js";
import type { EcsFactory, IEcsSchema } from "./schema.js";

export type SystemSchedule = "fixedUpdate" | "postUpdate" | "update";

export interface ISystemOptions {
  commands?: ReadonlyArray<CommandDeclaration>;
  eventReads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  eventWrites?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  queries?: ReadonlyArray<IQueryDeclaration>;
  reads?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  writes?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
}

export interface ISystemDeclaration {
  commands: CommandDeclaration[];
  eventReads: string[];
  eventSchemas: IEcsSchema[];
  eventWrites: string[];
  name: string;
  queries: IQueryDeclaration[];
  reads: string[];
  schedule: SystemSchedule;
  schemas: IEcsSchema[];
  writes: string[];
}

export function fixedUpdate(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return defineSystem("fixedUpdate", name, options);
}

export function update(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return defineSystem("update", name, options);
}

export function postUpdate(name: string, options: ISystemOptions = {}): ISystemDeclaration {
  return defineSystem("postUpdate", name, options);
}

function defineSystem(schedule: SystemSchedule, name: string, options: ISystemOptions): ISystemDeclaration {
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
    schedule,
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

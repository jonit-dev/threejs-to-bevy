import { SdkError } from "../errors.js";
import type { IInputMapDeclaration } from "../input.js";
import type { IRuntimeConfigDeclaration } from "../time.js";
import type { CommandDeclaration } from "./commands.js";
import type { IQueryDeclaration } from "./query.js";
import type { EcsFactory, IEcsDeclaration, IEcsSchema } from "./schema.js";
import type { ISystemDeclaration, ISystemDelayedCommandDeclaration, ISystemScriptSourceReference, SystemSchedule, SystemService } from "./system.js";

export interface IWorldEntityDeclaration {
  components: Record<string, Record<string, unknown>>;
  id: string;
}

export type IWorldCommandDeclaration =
  | {
      kind: "addComponent" | "removeComponent" | "setComponent";
      component: string;
      entity: string;
    }
  | {
      components: string[];
      entity: string;
      kind: "spawn";
    }
  | {
      entity: string;
      kind: "despawn";
    }
  | {
      kind: "instantiate";
      prefab: string;
      prefix: string;
    }
  | {
      child: string;
      kind: "setParent";
      parent: string;
    }
  | {
      child: string;
      kind: "clearParent";
    }
  | {
      event: string;
      kind: "emitEvent";
    };

export interface IWorldSystemDeclaration {
  after?: string[];
  before?: string[];
  commands: IWorldCommandDeclaration[];
  delayedCommands?: IWorldDelayedCommandDeclaration[];
  eventReads: string[];
  eventWrites: string[];
  name: string;
  queries: IWorldQueryDeclaration[];
  reads: string[];
  resourceReads: string[];
  resourceWrites: string[];
  services: SystemService[];
  script?: IWorldSystemScriptDeclaration;
  schedule: SystemSchedule;
  writes: string[];
}

export interface IWorldDelayedCommandDeclaration {
  cancelPolicy: "drop" | "flush";
  command: IWorldCommandDeclaration;
  id: string;
  maxDelayTicks: number;
  ownership: {
    id: string;
    kind: "entity" | "scene";
  };
}

export interface IWorldSystemScriptDeclaration {
  exportName: string;
  source?: string;
  sourceRef?: ISystemScriptSourceReference & { systemId: string };
}

export interface IWorldQueryDeclaration {
  changed?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "id";
  with: string[];
  without: string[];
}

export interface IWorldSnapshot {
  componentSchemas: Record<string, IEcsSchema>;
  entities: IWorldEntityDeclaration[];
  eventSchemas: Record<string, IEcsSchema>;
  resources: Record<string, Record<string, unknown>>;
  resourceSchemas: Record<string, IEcsSchema>;
  input?: IInputMapDeclaration;
  runtimeConfig?: IRuntimeConfigDeclaration;
  systems: IWorldSystemDeclaration[];
}

export class World {
  readonly #componentSchemas = new Map<string, IEcsSchema>();
  readonly #entities = new Map<string, IWorldEntityDeclaration>();
  readonly #eventSchemas = new Map<string, IEcsSchema>();
  readonly #resources = new Map<string, Record<string, unknown>>();
  readonly #resourceSchemas = new Map<string, IEcsSchema>();
  #input?: IInputMapDeclaration;
  #runtimeConfig?: IRuntimeConfigDeclaration;
  readonly #systems = new Map<string, ISystemDeclaration>();

  public spawn(id: string, ...components: IEcsDeclaration[]): this {
    assertId(id, "TN_SDK_ECS_ENTITY_ID_EMPTY", "Entity ID");
    if (this.#entities.has(id)) {
      throw new SdkError("TN_SDK_ECS_ENTITY_DUPLICATE", `Entity '${id}' is already declared.`);
    }

    const componentMap = new Map<string, Record<string, unknown>>();
    for (const component of components) {
      assertSchemaKind(component.schema, "component");
      this.registerSchema(this.#componentSchemas, component.schema, "TN_SDK_ECS_COMPONENT_SCHEMA_DUPLICATE");
      if (componentMap.has(component.schema.name)) {
        throw new SdkError(
          "TN_SDK_ECS_ENTITY_COMPONENT_DUPLICATE",
          `Entity '${id}' already has component '${component.schema.name}'.`,
        );
      }
      componentMap.set(component.schema.name, { ...component.data });
    }

    this.#entities.set(id, {
      components: Object.fromEntries([...componentMap.entries()].sort(([left], [right]) => left.localeCompare(right))),
      id,
    });
    return this;
  }

  public addResource(resource: IEcsDeclaration): this {
    assertSchemaKind(resource.schema, "resource");
    this.registerSchema(this.#resourceSchemas, resource.schema, "TN_SDK_ECS_RESOURCE_SCHEMA_DUPLICATE");
    if (this.#resources.has(resource.schema.name)) {
      throw new SdkError("TN_SDK_ECS_RESOURCE_DUPLICATE", `Resource '${resource.schema.name}' is already declared.`);
    }
    this.#resources.set(resource.schema.name, { ...resource.data });
    return this;
  }

  public addEvent(event: IEcsSchema | EcsFactory): this {
    assertSchemaKind(event, "event");
    this.registerSchema(this.#eventSchemas, event, "TN_SDK_ECS_EVENT_SCHEMA_DUPLICATE");
    return this;
  }

  public addSystem(system: ISystemDeclaration): this {
    if (this.#systems.has(system.name)) {
      throw new SdkError("TN_SDK_ECS_SYSTEM_DUPLICATE", `System '${system.name}' is already declared.`);
    }
    for (const schema of system.schemas) {
      assertSchemaKind(schema, "component");
      this.registerSchema(this.#componentSchemas, schema, "TN_SDK_ECS_COMPONENT_SCHEMA_DUPLICATE");
    }
    for (const schema of system.eventSchemas) {
      assertSchemaKind(schema, "event");
      this.registerSchema(this.#eventSchemas, schema, "TN_SDK_ECS_EVENT_SCHEMA_DUPLICATE");
    }
    for (const schema of system.resourceSchemas) {
      assertSchemaKind(schema, "resource");
      this.registerSchema(this.#resourceSchemas, schema, "TN_SDK_ECS_RESOURCE_SCHEMA_DUPLICATE");
    }
    this.#systems.set(system.name, system);
    return this;
  }

  public setInputMap(input: IInputMapDeclaration): this {
    this.#input = input;
    return this;
  }

  public setRuntimeConfig(config: IRuntimeConfigDeclaration): this {
    this.#runtimeConfig = config;
    return this;
  }

  public toJSON(): IWorldSnapshot {
    const snapshot: IWorldSnapshot = {
      componentSchemas: sortedRecord(this.#componentSchemas),
      entities: [...this.#entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
      eventSchemas: sortedRecord(this.#eventSchemas),
      resources: Object.fromEntries([...this.#resources.entries()].sort(([left], [right]) => left.localeCompare(right))),
      resourceSchemas: sortedRecord(this.#resourceSchemas),
      systems: [...this.#systems.values()].sort((left, right) => left.name.localeCompare(right.name)).map(serializeSystem),
    };
    if (this.#input !== undefined) {
      snapshot.input = this.#input;
    }
    if (this.#runtimeConfig !== undefined) {
      snapshot.runtimeConfig = this.#runtimeConfig;
    }
    return snapshot;
  }

  private registerSchema(schemas: Map<string, IEcsSchema>, schema: IEcsSchema, duplicateCode: string): void {
    const existing = schemas.get(schema.name);
    if (existing !== undefined && !sameSchema(existing, schema)) {
      throw new SdkError(duplicateCode, `${schema.kind} schema '${schema.name}' is already declared.`);
    }
    schemas.set(schema.name, existing ?? schema);
  }
}

function assertId(value: string, code: string, label: string): void {
  if (value.trim() === "") {
    throw new SdkError(code, `${label} must not be empty.`);
  }
}

function assertSchemaKind(schema: IEcsSchema, expected: IEcsSchema["kind"]): void {
  if (schema.kind !== expected) {
    throw new SdkError(
      "TN_SDK_ECS_SCHEMA_KIND_INVALID",
      `Expected ${expected} schema '${schema.name}', received ${schema.kind}.`,
    );
  }
}

function sortedRecord<T>(values: Map<string, T>): Record<string, T> {
  return Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sameSchema(left: IEcsSchema, right: IEcsSchema): boolean {
  return left.kind === right.kind && JSON.stringify(left.fields) === JSON.stringify(right.fields);
}

function serializeSystem(system: ISystemDeclaration): IWorldSystemDeclaration {
  return {
    ...(system.after.length === 0 ? {} : { after: [...system.after] }),
    ...(system.before.length === 0 ? {} : { before: [...system.before] }),
    commands: system.commands.map(serializeCommand),
    ...(system.delayedCommands.length === 0 ? {} : { delayedCommands: system.delayedCommands.map(serializeDelayedCommand) }),
    eventReads: [...system.eventReads],
    eventWrites: [...system.eventWrites],
    name: system.name,
    queries: system.queries.map(serializeQuery),
    reads: [...system.reads],
    resourceReads: [...system.resourceReads],
    resourceWrites: [...system.resourceWrites],
    services: [...system.services],
    script: serializeSystemScript(system),
    schedule: system.schedule,
    writes: [...system.writes],
  };
}

function serializeDelayedCommand(declaration: ISystemDelayedCommandDeclaration): IWorldDelayedCommandDeclaration {
  return {
    cancelPolicy: declaration.cancelPolicy,
    command: serializeCommand(declaration.command),
    id: declaration.id,
    maxDelayTicks: declaration.maxDelayTicks,
    ownership: { ...declaration.ownership },
  };
}

function serializeSystemScript(system: ISystemDeclaration): IWorldSystemScriptDeclaration | undefined {
  if (system.run === undefined && system.script === undefined) {
    return undefined;
  }
  return {
    exportName: systemExportName(system.name),
    ...(system.run === undefined ? {} : { source: system.run.toString() }),
    ...(system.script === undefined ? {} : { sourceRef: { ...system.script, systemId: system.name } }),
  };
}

function systemExportName(name: string): string {
  const safeName = name.replace(/[^A-Za-z0-9_$]/g, "_");
  return `system_${safeName}`;
}

function serializeQuery(query: IQueryDeclaration): IWorldQueryDeclaration {
  return {
    ...(query.changed === undefined ? {} : { changed: [...query.changed] }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.offset === undefined ? {} : { offset: query.offset }),
    ...(query.orderBy === undefined ? {} : { orderBy: query.orderBy }),
    with: [...query.with],
    without: [...query.without],
  };
}

function serializeCommand(command: CommandDeclaration): IWorldCommandDeclaration {
  if (command.kind === "spawn") {
    return { components: [...command.components], entity: command.entity, kind: command.kind };
  }
  if (command.kind === "emitEvent") {
    return { event: command.event, kind: command.kind };
  }
  if (command.kind === "despawn") {
    return { entity: command.entity, kind: command.kind };
  }
  if (command.kind === "instantiate") {
    return { kind: command.kind, prefab: command.prefab, prefix: command.prefix };
  }
  if (command.kind === "setParent") {
    return { child: command.child, kind: command.kind, parent: command.parent };
  }
  if (command.kind === "clearParent") {
    return { child: command.child, kind: command.kind };
  }
  return { component: command.component, entity: command.entity, kind: command.kind };
}

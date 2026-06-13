import type { IIrSchemaFile, IWorldIr } from "@threenative/ir";
import type { ISystemsIr } from "@threenative/ir";

import { systemsToIr } from "./systems.js";

interface IEcsWorldLike {
  toJSON(): {
    componentSchemas: Record<string, { fields: Record<string, unknown> }>;
    entities: Array<{ components: Record<string, Record<string, unknown>>; id: string }>;
    eventSchemas: Record<string, { fields: Record<string, unknown> }>;
    resources: Record<string, Record<string, unknown>>;
    resourceSchemas: Record<string, { fields: Record<string, unknown> }>;
    systems: ISystemsIr["systems"];
  };
}

export interface IEcsEmitResult {
  componentSchemas: IIrSchemaFile;
  eventSchemas: IIrSchemaFile;
  resourceSchemas: IIrSchemaFile;
  systems: ISystemsIr;
  world: IWorldIr;
}

export function ecsToIr(world: IEcsWorldLike): IEcsEmitResult {
  const snapshot = world.toJSON();
  return {
    componentSchemas: schemaFile("threenative.component-schemas", snapshot.componentSchemas),
    eventSchemas: schemaFile("threenative.event-schemas", snapshot.eventSchemas),
    resourceSchemas: schemaFile("threenative.resource-schemas", snapshot.resourceSchemas),
    systems: systemsToIr(snapshot.systems),
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: snapshot.entities.map((entity) => ({
        id: entity.id,
        components: entity.components,
      })),
      resources: snapshot.resources,
      events: Object.fromEntries(Object.keys(snapshot.eventSchemas).sort().map((name) => [name, {}])),
      prefabs: [],
    },
  };
}

function schemaFile(schema: IIrSchemaFile["schema"], schemas: Record<string, { fields: Record<string, unknown> }>): IIrSchemaFile {
  return {
    schema,
    version: "0.1.0",
    schemas: Object.fromEntries(
      Object.entries(schemas)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => [name, { fields: value.fields }]),
    ) as IIrSchemaFile["schemas"],
  };
}

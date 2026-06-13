import type { IIrSchemaFile, IWorldIr } from "@threenative/ir";
import type { IrSystemCommand, IrSystemSchedule, ISystemsIr } from "@threenative/ir";

import { CompilerError } from "../errors.js";
import { bundleSystemScripts } from "../scripts/bundle.js";
import { systemsToIr } from "./systems.js";

interface IEcsWorldLike {
  toJSON(): {
    componentSchemas: Record<string, { fields: Record<string, unknown> }>;
    entities: Array<{ components: Record<string, Record<string, unknown>>; id: string }>;
    eventSchemas: Record<string, { fields: Record<string, unknown> }>;
    resources: Record<string, Record<string, unknown>>;
    resourceSchemas: Record<string, { fields: Record<string, unknown> }>;
    systems: IEcsSystemSnapshot[];
  };
}

interface IEcsSystemSnapshot {
  commands: IrSystemCommand[];
  eventReads: string[];
  eventWrites: string[];
  name: string;
  queries: Array<{ with: string[]; without: string[] }>;
  reads: string[];
  script?: { exportName: string; source: string };
  schedule: IrSystemSchedule;
  writes: string[];
}

export interface IEcsEmitResult {
  componentSchemas: IIrSchemaFile;
  eventSchemas: IIrSchemaFile;
  resourceSchemas: IIrSchemaFile;
  scriptBundle?: string;
  systems: ISystemsIr;
  world: IWorldIr;
}

export function ecsToIr(world: IEcsWorldLike): IEcsEmitResult {
  const snapshot = world.toJSON();
  const scriptBundle = bundleSystemScripts(snapshot.systems);
  if (scriptBundle.diagnostics.length > 0) {
    const diagnostic = scriptBundle.diagnostics[0];
    throw new CompilerError(
      diagnostic?.code ?? "TN_SCRIPT_INVALID",
      diagnostic?.message ?? "Portable system script is invalid.",
      diagnostic,
    );
  }
  return {
    componentSchemas: schemaFile("threenative.component-schemas", snapshot.componentSchemas),
    eventSchemas: schemaFile("threenative.event-schemas", snapshot.eventSchemas),
    resourceSchemas: schemaFile("threenative.resource-schemas", snapshot.resourceSchemas),
    scriptBundle: scriptBundle.code,
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

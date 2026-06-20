import type { IIrSchemaFile, IInputIr, IRuntimeConfigIr, IWorldIr } from "@threenative/ir";
import type { IrSystemCommand, IrSystemSchedule, IrSystemService, ISystemsIr } from "@threenative/ir";

import { CompilerError } from "../errors.js";
import { bundleSystemScripts, type IScriptsManifest } from "../scripts/bundle.js";
import { systemsToIr } from "./systems.js";

interface IEcsWorldLike {
  toJSON(): {
    componentSchemas: Record<string, { fields: Record<string, unknown> }>;
    entities: Array<{ components: Record<string, Record<string, unknown>>; id: string }>;
    eventSchemas: Record<string, { fields: Record<string, unknown> }>;
    resources: Record<string, Record<string, unknown>>;
    resourceSchemas: Record<string, { fields: Record<string, unknown> }>;
    input?: Omit<IInputIr, "schema" | "version">;
    runtimeConfig?: Omit<IRuntimeConfigIr, "schema" | "version">;
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
  resourceReads: string[];
  resourceWrites: string[];
  services: IrSystemService[];
  script?: {
    exportName: string;
    source?: string;
    sourceRef?: { export: string; hash?: string; module: string; systemId: string };
  };
  schedule: IrSystemSchedule;
  writes: string[];
}

export interface IEcsEmitResult {
  componentSchemas: IIrSchemaFile;
  eventSchemas: IIrSchemaFile;
  input?: IInputIr;
  resourceSchemas: IIrSchemaFile;
  runtimeConfig?: IRuntimeConfigIr;
  scriptBundle?: string;
  scriptManifest?: IScriptsManifest;
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
    input:
      snapshot.input === undefined
        ? undefined
        : {
            schema: "threenative.input",
            version: "0.1.0",
            actions: snapshot.input.actions,
            axes: snapshot.input.axes,
          },
    resourceSchemas: schemaFile("threenative.resource-schemas", snapshot.resourceSchemas),
    runtimeConfig:
      snapshot.runtimeConfig === undefined
        ? undefined
        : {
            schema: "threenative.runtime-config",
            version: "0.1.0",
            renderer: snapshot.runtimeConfig.renderer,
            time: snapshot.runtimeConfig.time,
            window: snapshot.runtimeConfig.window,
          },
    scriptBundle: scriptBundle.code,
    scriptManifest: scriptBundle.manifest,
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

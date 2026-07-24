import type { IIrSchemaFile, IInputIr, IRuntimeConfigIr, IWorldIr } from "@threenative/ir";
import type { IrSystemCommand, IrSystemSchedule, IrSystemService, ISystemsIr } from "@threenative/ir";

import { CompilerError } from "../errors.js";
import { bundleSystemScripts, type IScriptsManifest } from "../scripts/bundle.js";
import { resolveSystemScriptSources } from "../scripts/sourceRefs.js";
import { systemsToIr } from "./systems.js";

interface IEcsWorldLike {
  toJSON(): {
    componentSchemas: Record<string, { fields: Record<string, unknown> }>;
    entities: Array<{ components: Record<string, Record<string, unknown>>; id: string; tags?: string[] }>;
    eventSchemas: Record<string, { fields: Record<string, unknown> }>;
    resources: Record<string, Record<string, unknown>>;
    resourceSchemas: Record<string, { fields: Record<string, unknown> }>;
    countdowns?: Array<{ autostart?: boolean; direction: "down" | "up"; event: string; field: string; id: string; limit: number; resource: string }>;
    feedbackPresets?: ISystemsIr["feedbackPresets"];
    input?: Omit<IInputIr, "schema" | "version">;
    runtimeConfig?: Omit<IRuntimeConfigIr, "schema" | "version">;
    systems: IEcsSystemSnapshot[];
  };
}

type EcsCommand = IrSystemCommand | { kind: "despawn"; tag: string };
type ExpandedEcsSystemSnapshot = Omit<IEcsSystemSnapshot, "commands" | "delayedCommands"> & {
  commands: IrSystemCommand[];
  delayedCommands?: ISystemsIr["systems"][number]["delayedCommands"];
};

interface IEcsSystemSnapshot {
  commands: EcsCommand[];
  delayedCommands?: Array<Omit<NonNullable<ISystemsIr["systems"][number]["delayedCommands"]>[number], "command"> & { command: EcsCommand }>;
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

export interface IEcsEmitOptions {
  projectPath?: string;
}

export function ecsToIr(world: IEcsWorldLike, options: IEcsEmitOptions = {}): IEcsEmitResult {
  const snapshot = world.toJSON();
  const resolvedScripts = resolveSystemScriptSources(snapshot.systems, options.projectPath);
  const expandedSystems = expandSystemSelectors(resolvedScripts.systems, snapshot.entities);
  const scriptBundle = bundleSystemScripts(expandedSystems);
  const scriptDiagnostics = [...resolvedScripts.diagnostics, ...scriptBundle.diagnostics];
  const scriptError = scriptDiagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (scriptError !== undefined) {
    throw new CompilerError(
      scriptError.code,
      scriptError.message,
      scriptError,
    );
  }
  const eventSchemas = mergeSchemaRecords(snapshot.eventSchemas, resolvedScripts.eventSchemas);
  return {
    componentSchemas: schemaFile("threenative.component-schemas", snapshot.componentSchemas),
    eventSchemas: schemaFile("threenative.event-schemas", eventSchemas),
    input:
      snapshot.input === undefined
        ? undefined
        : {
            schema: "threenative.input",
            version: "0.1.0",
            actions: snapshot.input.actions,
            axes: snapshot.input.axes,
          },
    resourceSchemas: schemaFile("threenative.resource-schemas", mergeSchemaRecords(snapshot.resourceSchemas, resolvedScripts.resourceSchemas)),
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
    systems: systemsToIr(expandedSystems, snapshot.countdowns, snapshot.feedbackPresets),
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: snapshot.entities.map((entity) => ({
        id: entity.id,
        components: entity.components,
        ...(entity.tags === undefined ? {} : { tags: [...entity.tags] }),
      })),
      resources: snapshot.resources,
      events: Object.fromEntries(Object.keys(eventSchemas).sort().map((name) => [name, {}])),
      prefabs: [],
    },
  };
}

function expandSystemSelectors(
  systems: ReadonlyArray<IEcsSystemSnapshot>,
  entities: ReadonlyArray<{ components: Record<string, Record<string, unknown>>; id: string; tags?: string[] }>,
): ExpandedEcsSystemSnapshot[] {
  return systems.map((system) => {
    const { commands: authoredCommands, delayedCommands: authoredDelayedCommands, ...systemWithoutCommands } = system;
    const instantiatePrefixes = [...authoredCommands, ...(authoredDelayedCommands ?? []).map((declaration) => declaration.command)]
      .filter((command): command is Extract<IrSystemCommand, { kind: "instantiate" }> => command.kind === "instantiate")
      .map((command) => command.prefix);
    return {
      ...systemWithoutCommands,
      commands: authoredCommands.flatMap((command, commandIndex) => expandCommandSelector(command, system.name, `commands/${commandIndex}`, entities, instantiatePrefixes)),
      ...(authoredDelayedCommands === undefined ? {} : {
        delayedCommands: authoredDelayedCommands.flatMap((declaration, declarationIndex): NonNullable<ISystemsIr["systems"][number]["delayedCommands"]>[number][] => {
        const expanded = expandCommandSelector(declaration.command, system.name, `delayedCommands/${declarationIndex}/command`, entities, instantiatePrefixes);
        return expanded.map((command, commandIndex) => ({
          cancelPolicy: declaration.cancelPolicy,
          command,
          id: expanded.length <= 1 ? declaration.id : `${declaration.id}.${commandIndex + 1}`,
          maxDelayTicks: declaration.maxDelayTicks,
          ownership: declaration.ownership,
        }));
      }),
      }),
    };
  });
}

function expandCommandSelector(
  command: EcsCommand,
  systemName: string,
  path: string,
  entities: ReadonlyArray<{ components: Record<string, Record<string, unknown>>; id: string; tags?: string[] }>,
  instantiatePrefixes: readonly string[],
): IrSystemCommand[] {
  if (command.kind !== "despawn") {
    return [command as IrSystemCommand];
  }
  const selector = command as { entity?: string; tag?: string };
  if (selector.entity === undefined && selector.tag === undefined) {
    throw selectorError(systemName, path, "A despawn selector must provide an entity pattern or tag.");
  }
  const matches = entities
    .filter((entity) => {
      const entityMatches = selector.entity === undefined || wildcardMatch(entity.id, selector.entity);
      const tagMatches = selector.tag === undefined || (entity.tags ?? []).includes(selector.tag) || Object.prototype.hasOwnProperty.call(entity.components, selector.tag);
      return entityMatches && tagMatches;
    })
    .map((entity) => entity.id)
    .sort();
  if (matches.length === 0) {
    if (
      selector.tag === undefined
      && selector.entity !== undefined
      && !selector.entity.includes("*")
      && instantiatePrefixes.some((prefix) => selector.entity!.startsWith(`${prefix}.`))
    ) {
      return [{ entity: selector.entity, kind: "despawn" }];
    }
    throw selectorError(systemName, path, `Despawn selector '${selector.tag === undefined ? selector.entity : `tag:${selector.tag}`}' did not match an authored entity.`);
  }
  return matches.map((entity) => ({ entity, kind: "despawn" }));
}

function wildcardMatch(value: string, pattern: string): boolean {
  const expression = pattern.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${expression}$`, "u").test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\[\]\\]/gu, "\\$&");
}

function selectorError(systemName: string, path: string, message: string): CompilerError {
  const diagnostic = {
    code: "TN_IR_SYSTEM_COMMAND_SELECTOR_INVALID",
    message: `System '${systemName}' command selector is invalid. ${message}`,
    path: `systems/${systemName}/${path}`,
    severity: "error" as const,
    suggestion: "Use an authored entity id or wildcard pattern, or a tag declared with tn scene add-tag.",
  };
  return new CompilerError(diagnostic.code, diagnostic.message, diagnostic);
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

function mergeSchemaRecords(
  left: Record<string, { fields: Record<string, unknown> }>,
  right: Record<string, { fields: Record<string, unknown> }>,
): Record<string, { fields: Record<string, unknown> }> {
  const merged: Record<string, { fields: Record<string, unknown> }> = Object.fromEntries(
    Object.entries(left).map(([name, value]) => [name, { fields: { ...value.fields } }]),
  );
  for (const [name, value] of Object.entries(right)) {
    merged[name] = {
      fields: {
        ...value.fields,
        ...(merged[name]?.fields ?? {}),
      },
    };
  }
  return merged;
}

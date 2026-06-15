import type { IAssetsManifest, IBundleManifest, IIrSchemaFile, IIrSystemDeclaration, IRuntimeDiagnostic, IrSystemSchedule, ISystemsIr, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "../input.js";

import { createSystemContext } from "./context.js";
import { applySystemEffects } from "./effects.js";
import { appendSystemEffectLog, type ISystemEffectLog } from "./log.js";

export type SystemFunction = (context: unknown) => unknown | Promise<unknown>;

export interface ISystemModule {
  systems?: Record<string, SystemFunction>;
  [name: string]: unknown;
}

export interface ISystemRunResult {
  diagnostics: IRuntimeDiagnostic[];
}

export async function loadSystemModule(source: string, manifest: IBundleManifest): Promise<ISystemModule> {
  const scriptFile = manifest.entry.scripts ?? manifest.files.scripts;
  if (scriptFile === undefined) {
    return { systems: {} };
  }
  if (isFetchable(source)) {
    return (await import(/* @vite-ignore */ `${source.replace(/\/$/, "")}/${scriptFile}`)) as ISystemModule;
  }

  const pathModule = nodeModuleName("path");
  const urlModule = nodeModuleName("url");
  const dynamicImport = new Function("moduleName", "return import(moduleName)") as <T>(
    moduleName: string,
  ) => Promise<T>;
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  const { pathToFileURL } = await dynamicImport<{ pathToFileURL(path: string): URL }>(urlModule);
  return (await import(/* @vite-ignore */ pathToFileURL(resolve(source, scriptFile)).href)) as ISystemModule;
}

export async function runSchedule(options: {
  assets?: IAssetsManifest;
  delta?: number;
  effectLog?: ISystemEffectLog;
  frame?: number;
  fixedDelta?: number;
  input?: IWebInputState;
  elapsed?: number;
  componentSchemas?: IIrSchemaFile;
  module: ISystemModule;
  paused?: boolean;
  schedule: IrSystemSchedule;
  systems: ISystemsIr;
  tick?: number;
  world: IWorldIr;
}): Promise<ISystemRunResult> {
  const diagnostics: IRuntimeDiagnostic[] = [];
  const scheduledSystems = options.systems.systems
    .filter((system) => system.schedule === options.schedule)
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const system of scheduledSystems) {
    const result = await runSystem(system, options);
    diagnostics.push(...result.diagnostics);
  }
  return { diagnostics };
}

async function runSystem(
  system: IIrSystemDeclaration,
  options: {
    assets?: IAssetsManifest;
    delta?: number;
    elapsed?: number;
    componentSchemas?: IIrSchemaFile;
    effectLog?: ISystemEffectLog;
    frame?: number;
    fixedDelta?: number;
    input?: IWebInputState;
    module: ISystemModule;
    paused?: boolean;
    systems: ISystemsIr;
    tick?: number;
    world: IWorldIr;
  },
): Promise<ISystemRunResult> {
  if (system.script === undefined) {
    return { diagnostics: [] };
  }
  const fn = readSystemFunction(options.module, system.script.exportName);
  const { commands, context, events, resources, services } = createSystemContext(options.world, {
    assets: options.assets,
    defaultQuery: system.queries[0],
    componentSchemas: options.componentSchemas,
    delta: options.delta ?? 0,
    elapsed: options.elapsed ?? 0,
    fixedDelta: options.fixedDelta ?? 1 / 60,
    input: options.input,
    paused: options.paused ?? false,
    systems: options.systems,
  });
  await fn(context);
  const result = applySystemEffects(options.world, system, { commands, events, resources, services }, { frame: options.frame ?? 0, tick: options.tick ?? 0 });
  if (options.effectLog !== undefined) {
    appendSystemEffectLog(options.effectLog, result.entries);
  }
  return { diagnostics: result.diagnostics };
}

function readSystemFunction(module: ISystemModule, exportName: string): SystemFunction {
  const value = module.systems?.[exportName] ?? module[exportName];
  if (typeof value !== "function") {
    throw new Error(`System export '${exportName}' was not found in scripts bundle.`);
  }
  return value as SystemFunction;
}

function nodeModuleName(name: string): string {
  return `node:${name}`;
}

function isFetchable(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    (typeof window !== "undefined" && source.startsWith("/"))
  );
}

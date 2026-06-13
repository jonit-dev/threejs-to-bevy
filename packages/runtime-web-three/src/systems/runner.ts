import type { IBundleManifest, IIrSystemDeclaration, IRuntimeDiagnostic, IrSystemSchedule, ISystemsIr, IWorldIr } from "@threenative/ir";
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

  const nodePrefix = "node";
  const pathModule = `${nodePrefix}:path`;
  const urlModule = `${nodePrefix}:url`;
  const dynamicImport = new Function("moduleName", "return import(moduleName)") as <T>(
    moduleName: string,
  ) => Promise<T>;
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  const { pathToFileURL } = await dynamicImport<{ pathToFileURL(path: string): URL }>(urlModule);
  return (await import(/* @vite-ignore */ pathToFileURL(resolve(source, scriptFile)).href)) as ISystemModule;
}

export async function runSchedule(options: {
  delta?: number;
  effectLog?: ISystemEffectLog;
  frame?: number;
  fixedDelta?: number;
  input?: IWebInputState;
  elapsed?: number;
  module: ISystemModule;
  paused?: boolean;
  schedule: IrSystemSchedule;
  systems: ISystemsIr;
  tick?: number;
  world: IWorldIr;
}): Promise<ISystemRunResult> {
  const diagnostics: IRuntimeDiagnostic[] = [];
  const scheduledSystems = options.systems.systems.filter((system) => system.schedule === options.schedule);
  for (const system of scheduledSystems) {
    const result = await runSystem(system, options);
    diagnostics.push(...result.diagnostics);
  }
  return { diagnostics };
}

async function runSystem(
  system: IIrSystemDeclaration,
  options: {
    delta?: number;
    elapsed?: number;
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
  const { commands, context, events, services } = createSystemContext(options.world, {
    defaultQuery: system.queries[0],
    delta: options.delta ?? 0,
    elapsed: options.elapsed ?? 0,
    fixedDelta: options.fixedDelta ?? 1 / 60,
    input: options.input,
    paused: options.paused ?? false,
  });
  await fn(context);
  const result = applySystemEffects(options.world, system, { commands, events, services }, { frame: options.frame ?? 0, tick: options.tick ?? 0 });
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

function isFetchable(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    (typeof window !== "undefined" && source.startsWith("/"))
  );
}

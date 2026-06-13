import type { IBundleManifest, IIrSystemDeclaration, IrSystemSchedule, ISystemsIr, IWorldIr } from "@threenative/ir";

import { applyCommands, applyEvents, createSystemContext } from "./context.js";

export type SystemFunction = (context: unknown) => unknown | Promise<unknown>;

export interface ISystemModule {
  systems?: Record<string, SystemFunction>;
  [name: string]: unknown;
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
  fixedDelta?: number;
  module: ISystemModule;
  schedule: IrSystemSchedule;
  systems: ISystemsIr;
  world: IWorldIr;
}): Promise<void> {
  const scheduledSystems = options.systems.systems.filter((system) => system.schedule === options.schedule);
  for (const system of scheduledSystems) {
    await runSystem(system, options);
  }
}

async function runSystem(
  system: IIrSystemDeclaration,
  options: {
    delta?: number;
    fixedDelta?: number;
    module: ISystemModule;
    systems: ISystemsIr;
    world: IWorldIr;
  },
): Promise<void> {
  if (system.script === undefined) {
    return;
  }
  const fn = readSystemFunction(options.module, system.script.exportName);
  const { commands, context, events } = createSystemContext(options.world, {
    delta: options.delta ?? 0,
    fixedDelta: options.fixedDelta ?? 1 / 60,
  });
  await fn(context);
  applyEvents(options.world, events);
  applyCommands(options.world, commands);
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

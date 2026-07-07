import type { IAssetsManifest, IAudioIr, IIrSchemaFile, IIrSystemDeclaration, ILocalDataIr, IPrefabsIr, IRuntimeDiagnostic, IUiIr, IrSystemSchedule, ISystemsIr, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "../input.js";

import { createComponentDiffCache } from "./componentDiff.js";
import { createSystemContext } from "./context.js";
import { applySystemEffects } from "./effects.js";
import { appendSystemEffectLog, type ISystemEffectLog, type ISystemEffectLogEntry } from "./log.js";
import { createWebPersistenceService, type IWebPersistenceService } from "./services/persistence.js";

export type SystemFunction = (context: unknown) => unknown | Promise<unknown>;

export interface ISystemModule {
  systems?: Record<string, SystemFunction>;
  [name: string]: unknown;
}

export interface ISystemRunResult {
  diagnostics: IRuntimeDiagnostic[];
  entries: ISystemEffectLogEntry[];
}

export async function runSchedule(options: {
  assets?: IAssetsManifest;
  audio?: IAudioIr;
  delta?: number;
  effectLog?: ISystemEffectLog;
  frame?: number;
  fixedDelta?: number;
  input?: IWebInputState;
  elapsed?: number;
  localData?: ILocalDataIr;
  componentSchemas?: IIrSchemaFile;
  module: ISystemModule;
  paused?: boolean;
  prefabs?: IPrefabsIr;
  schedule: IrSystemSchedule;
  systems: ISystemsIr;
  tick?: number;
  ui?: IUiIr;
  world: IWorldIr;
}): Promise<ISystemRunResult> {
  const diagnostics: IRuntimeDiagnostic[] = [];
  const entries: ISystemEffectLogEntry[] = [];
  const scheduledSystems = orderedSystemsForSchedule(options.systems.systems, options.schedule);
  const componentDiff = createComponentDiffCache();
  const persistence = options.localData === undefined ? undefined : createWebPersistenceService(options.localData);
  const tracked = [...new Set(scheduledSystems.flatMap((system) => system.queries.flatMap((query) => query.changed ?? [])))].sort();
  componentDiff.beginScheduleStage(options.world, tracked);
  for (const system of scheduledSystems) {
    const result = await runSystem(system, { ...options, componentDiff, persistence });
    diagnostics.push(...result.diagnostics);
    entries.push(...result.entries);
  }
  return { diagnostics, entries };
}

async function runSystem(
  system: IIrSystemDeclaration,
  options: {
    assets?: IAssetsManifest;
    audio?: import("@threenative/ir").IAudioIr;
    componentDiff?: ReturnType<typeof createComponentDiffCache>;
    delta?: number;
    elapsed?: number;
    componentSchemas?: IIrSchemaFile;
    effectLog?: ISystemEffectLog;
    frame?: number;
    fixedDelta?: number;
    input?: IWebInputState;
    localData?: ILocalDataIr;
    module: ISystemModule;
    paused?: boolean;
    persistence?: IWebPersistenceService;
    prefabs?: IPrefabsIr;
    systems: ISystemsIr;
    tick?: number;
    ui?: IUiIr;
    world: IWorldIr;
  },
): Promise<ISystemRunResult> {
  if (system.script === undefined) {
    return { diagnostics: [], entries: [] };
  }
  const fn = readSystemFunction(options.module, system.script.exportName);
  const { commands, context, events, resources, services } = createSystemContext(options.world, {
    assets: options.assets,
    audio: options.audio,
    componentDiff: options.componentDiff,
    defaultQuery: system.queries[0],
    componentSchemas: options.componentSchemas,
    delta: options.delta ?? 0,
    elapsed: options.elapsed ?? 0,
    fixedDelta: options.fixedDelta ?? 1 / 60,
    input: options.input,
    localData: options.localData,
    paused: options.paused ?? false,
    persistence: options.persistence,
    prefabs: options.prefabs,
    systems: options.systems,
    ui: options.ui,
  });
  await fn(context);
  const result = applySystemEffects(options.world, system, { commands, events, resources, services }, { frame: options.frame ?? 0, prefabs: options.prefabs, tick: options.tick ?? 0 });
  if (options.effectLog !== undefined) {
    appendSystemEffectLog(options.effectLog, result.entries);
  }
  return { diagnostics: result.diagnostics, entries: result.entries };
}

function orderedSystemsForSchedule(systems: readonly IIrSystemDeclaration[], schedule: IrSystemSchedule): IIrSystemDeclaration[] {
  const scheduled = systems.filter((system) => system.schedule === schedule).sort((left, right) => left.name.localeCompare(right.name));
  const byName = new Map(scheduled.map((system) => [system.name, system] as const));
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const system of scheduled) {
    outgoing.set(system.name, new Set());
    indegree.set(system.name, 0);
  }
  for (const system of scheduled) {
    for (const target of system.before ?? []) {
      if (byName.has(target)) {
        addOrderEdge(system.name, target, outgoing, indegree);
      }
    }
    for (const source of system.after ?? []) {
      if (byName.has(source)) {
        addOrderEdge(source, system.name, outgoing, indegree);
      }
    }
  }

  const ready = scheduled.map((system) => system.name).filter((name) => indegree.get(name) === 0).sort();
  const ordered: IIrSystemDeclaration[] = [];
  while (ready.length > 0) {
    const name = ready.shift()!;
    const system = byName.get(name);
    if (system !== undefined) {
      ordered.push(system);
    }
    for (const next of [...(outgoing.get(name) ?? [])].sort()) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  return ordered.length === scheduled.length ? ordered : scheduled;
}

function addOrderEdge(source: string, target: string, outgoing: Map<string, Set<string>>, indegree: Map<string, number>): void {
  const edges = outgoing.get(source);
  if (edges === undefined || edges.has(target)) {
    return;
  }
  edges.add(target);
  indegree.set(target, (indegree.get(target) ?? 0) + 1);
}

function readSystemFunction(module: ISystemModule, exportName: string): SystemFunction {
  const value = module.systems?.[exportName] ?? module[exportName];
  if (typeof value !== "function") {
    throw new Error(`System export '${exportName}' was not found in scripts bundle.`);
  }
  return value as SystemFunction;
}

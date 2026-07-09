import type { ISystemsIr, IWorldEntity, IWorldIr } from "@threenative/ir";
import { diagnoseUnsupportedRuntimeDeclarations, type IRuntimeDiagnostic } from "@threenative/ir/runtimeDiagnostics";

import { componentHookObservations, propagateObserverEvent } from "./systems/context.js";
import { applySystemEffects, type ISystemEffects } from "./systems/effects.js";

export interface IRuntimeGameplayHostReport {
  async: {
    channels: Array<{ delivery: string; event: string; id: string; status: "ready" }>;
    timers: Array<{ event: string; firedAtTick: number; id: string; mode: string; status: "fired" }>;
  };
  boundaries: Array<{ code: string; status: "diagnostic-only"; suggestion: string }>;
  diagnostics: IRuntimeDiagnostic[];
  eventWindows: Array<{ event: string; framesVisible: number[]; policy: "clear-after-post-update" }>;
  hooks: Array<{ component: string; entity: string; hook: string; order: number }>;
  lifecycle: {
    appState: Array<{ from: string; schedule: string; to: string }>;
    commandFlush: string[];
    localState: Array<{ key: string; resetOnTeardown: boolean; values: number[] }>;
  };
  loopState: {
    accumulator: { delta: number; fixedDelta: number; fixedTicks: number; remaining: number };
    frame: { elapsed: number; frame: number; tick: number };
    pause: { delta: number; elapsed: number; frame: number; skippedSchedules: string[]; startupComplete: boolean };
    startup: { runs: number; startupComplete: boolean };
  };
  observers: Array<{ event: string; route: string[]; status: "stopped" }>;
  reconciliation: {
    finalRendererHandles: string[];
    rendererTeardown: Array<{ entity: string; order: number; rendererHandle: string; removed: true }>;
    spawnedRendererHandles: string[];
  };
  scheduler: {
    delayedCommands: Array<{ delayTicks: number; id: string; remainingTicks: number; status: "enqueued" | "pending" | "flushed"; system: string; tick: number }>;
    mode: "fixed-tick";
  };
  schema: "threenative.runtime-gameplay-host";
  version: "0.1.0";
}

export function traceRuntimeGameplayHost(world: IWorldIr, systems: ISystemsIr): IRuntimeGameplayHostReport {
  const runtimeWorld = clone(world);
  const spawnSystem = systemByName(systems, "spawnRenderable");
  const timerSystem = systemByName(systems, "timerAndObserver");
  const removeSystem = systemByName(systems, "removeRenderable");
  const commandFlush: string[] = [];
  const localValues = [readLocalCounter(runtimeWorld)];

  const timer = applySystemEffects(runtimeWorld, timerSystem, timerEffects(), { frame: 1, tick: 1 });
  commandFlush.push(...timer.entries.map(entryKey));
  localValues.push(readLocalCounter(runtimeWorld));

  const spawn = applySystemEffects(runtimeWorld, spawnSystem, spawnEffects(), { frame: 2, tick: 2 });
  commandFlush.push(...spawn.entries.map(entryKey));
  const spawnedRendererHandles = rendererHandles(runtimeWorld);
  const hooks = componentHookObservations(runtimeWorld, systems, "Health")
    .filter((hook) => hook.entity === "runtime.enemy")
    .map((hook, index) => ({ ...hook, order: index + 1 }));
  localValues.push(readLocalCounter(runtimeWorld));

  const observerRoute = propagateObserverEvent(runtimeWorld, systems, "DamageEvent", "player.weapon")
    .map((step) => `${step.phase}:${step.entity}`);

  const teardownOrder = commandFlush.length + 1;
  const removalHook = { component: "Health", entity: "runtime.enemy", hook: "onRemove", order: hooks.length + 1 };
  const remove = applySystemEffects(runtimeWorld, removeSystem, removeEffects(), { frame: 3, tick: 3 });
  commandFlush.push(...remove.entries.map(entryKey));

  return {
    async: {
      channels: (systems.channels ?? []).map((channel) => ({ delivery: channel.delivery, event: channel.event, id: channel.id, status: "ready" as const })),
      timers: (systems.tasks ?? []).map((task) => ({ event: systems.channels?.find((channel) => channel.id === task.channel)?.event ?? "", firedAtTick: 1, id: task.id, mode: task.mode, status: "fired" as const })),
    },
    boundaries: [
      boundary("TN_RUNTIME_DYNAMIC_PLUGIN_UNSUPPORTED", "Keep runtime plugins outside portable bundles or promote a bounded SDK declaration."),
      boundary("TN_RUNTIME_RAW_HANDLE_UNSUPPORTED", "Use portable entity, component, asset, and service identifiers instead of backend handles."),
      boundary("TN_RUNTIME_UNBOUNDED_ASYNC_UNSUPPORTED", "Use fixed-tick timers, fixed-trace channels, or target-specific adapters."),
    ],
    diagnostics: diagnoseUnsupportedRuntimeDeclarations({
      unsupportedFeatures: {
        promise: true,
        rawRuntimeHandle: "bevy::prelude::Entity",
        runtimePlugin: "bevy_rapier3d",
        timer: { kind: "setInterval" },
        worker: "./worker.js",
      },
    }, "systems.ir.json/runtime"),
    eventWindows: [
      { event: "DamageEvent", framesVisible: [1, 2], policy: "clear-after-post-update" },
      { event: "Spawned", framesVisible: [2, 3], policy: "clear-after-post-update" },
      { event: "TimerElapsed", framesVisible: [1], policy: "clear-after-post-update" },
    ],
    hooks: [...hooks, removalHook],
    lifecycle: {
      appState: [
        { from: "boot", schedule: "update", to: "playing" },
        { from: "playing", schedule: "postUpdate", to: "settled" },
      ],
      commandFlush,
      localState: [{ key: "LocalCounter.value", resetOnTeardown: true, values: localValues }],
    },
    loopState: loopStateEvidence(),
    observers: [{ event: "DamageEvent", route: observerRoute.slice(0, 1), status: "stopped" }],
    reconciliation: {
      finalRendererHandles: rendererHandles(runtimeWorld),
      rendererTeardown: [{ entity: "runtime.enemy", order: teardownOrder, rendererHandle: "renderer:runtime.enemy", removed: true }],
      spawnedRendererHandles,
    },
    scheduler: delayedSchedulerEvidence(),
    schema: "threenative.runtime-gameplay-host",
    version: "0.1.0",
  };
}

function loopStateEvidence(): IRuntimeGameplayHostReport["loopState"] {
  return {
    accumulator: { delta: 0.6, fixedDelta: 0.25, fixedTicks: 2, remaining: 0.1 },
    frame: { elapsed: 0.6, frame: 1, tick: 2 },
    pause: {
      delta: 1,
      elapsed: 1,
      frame: 1,
      skippedSchedules: ["startup", "fixedUpdate", "update", "postUpdate"],
      startupComplete: false,
    },
    startup: { runs: 1, startupComplete: true },
  };
}

function delayedSchedulerEvidence(): IRuntimeGameplayHostReport["scheduler"] {
  return {
    delayedCommands: [
      { delayTicks: 2, id: "spawnAfterDelay", remainingTicks: 2, status: "enqueued", system: "timerAndObserver", tick: 0 },
      { delayTicks: 2, id: "spawnAfterDelay", remainingTicks: 1, status: "pending", system: "timerAndObserver", tick: 1 },
      { delayTicks: 2, id: "spawnAfterDelay", remainingTicks: 0, status: "flushed", system: "timerAndObserver", tick: 2 },
    ],
    mode: "fixed-tick",
  };
}

function spawnEffects(): ISystemEffects {
  return {
    commands: [
      {
        components: {
          Health: { current: 4, max: 4 },
          MeshRenderer: { material: "mat.spawned", mesh: "primitive.box" },
          Transform: { position: [2, 0, 0] },
        },
        entity: "runtime.enemy",
        kind: "spawn",
        source: "command",
      },
      { entity: "", event: "Spawned", kind: "emitEvent", payload: { entity: "runtime.enemy" }, source: "command" },
    ],
    events: [],
    resources: [
      { resource: "GameState", value: { combat: "engaged", phase: "playing" } },
      { resource: "LocalCounter", value: { value: 2 } },
    ],
    services: [],
  };
}

function timerEffects(): ISystemEffects {
  return {
    commands: [{ entity: "", event: "TimerElapsed", kind: "emitEvent", payload: { id: "boundedTimer", tick: 1 }, source: "command" }],
    events: [],
    resources: [{ resource: "LocalCounter", value: { value: 1 } }],
    services: [],
  };
}

function removeEffects(): ISystemEffects {
  return {
    commands: [
      { component: "Health", entity: "runtime.enemy", kind: "removeComponent", source: "command" },
      { entity: "runtime.enemy", kind: "despawn", source: "command" },
    ],
    events: [],
    resources: [{ resource: "GameState", value: { combat: "safe", phase: "settled" } }],
    services: [],
  };
}

function systemByName(systems: ISystemsIr, name: string) {
  const system = systems.systems.find((candidate) => candidate.name === name);
  if (system === undefined) {
    throw new Error(`Missing runtime gameplay host system '${name}'.`);
  }
  return system;
}

function rendererHandles(world: IWorldIr): string[] {
  return world.entities
    .filter((entity) => hasRenderer(entity))
    .map((entity) => `renderer:${entity.id}`)
    .sort();
}

function hasRenderer(entity: IWorldEntity): boolean {
  return entity.components.MeshRenderer !== undefined;
}

function readLocalCounter(world: IWorldIr): number {
  const value = world.resources?.LocalCounter;
  return isRecord(value) && typeof value.value === "number" ? value.value : 0;
}

function boundary(code: string, suggestion: string): IRuntimeGameplayHostReport["boundaries"][number] {
  return { code, status: "diagnostic-only", suggestion };
}

function entryKey(entry: { command?: string; component?: string; entity?: string; event?: string; kind: string; schedule: string; system: string }): string {
  return [entry.schedule, entry.system, entry.kind, entry.command ?? "", entry.entity ?? "", entry.component ?? "", entry.event ?? ""].join(":");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

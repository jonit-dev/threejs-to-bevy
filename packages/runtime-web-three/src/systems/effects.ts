import type { IIrSystemDeclaration, IRuntimeDiagnostic, IWorldIr } from "@threenative/ir";

import {
  applyCommands,
  applyEvents,
  applyResourceWrites,
  type IQueuedCommand,
  type IQueuedEvent,
  type IQueuedResourceWrite,
  type IQueuedServiceCall,
} from "./context.js";
import type { ISystemEffectLogEntry } from "./log.js";

export interface ISystemEffects {
  commands: ReadonlyArray<IQueuedCommand>;
  events: ReadonlyArray<IQueuedEvent>;
  resources: ReadonlyArray<IQueuedResourceWrite>;
  services: ReadonlyArray<IQueuedServiceCall>;
}

export function applySystemEffects(
  world: IWorldIr,
  system: IIrSystemDeclaration,
  effects: ISystemEffects,
  options: { frame: number; tick: number },
): { diagnostics: IRuntimeDiagnostic[]; entries: ISystemEffectLogEntry[] } {
  const diagnostics = validateSystemEffects(system, effects);
  const entries = systemEffectLogEntries(system, effects, options);
  if (diagnostics.length > 0) {
    return { diagnostics, entries };
  }
  applyEvents(world, effects.events);
  applyResourceWrites(world, effects.resources);
  applyCommands(world, effects.commands);
  return { diagnostics, entries };
}

export function validateSystemEffects(system: IIrSystemDeclaration, effects: ISystemEffects): IRuntimeDiagnostic[] {
  const diagnostics: IRuntimeDiagnostic[] = [];
  const writableComponents = new Set(system.writes);
  const eventWrites = new Set(system.eventWrites);
  const resourceWrites = new Set(system.resourceWrites);
  const services = new Set(system.services);

  for (const command of effects.commands) {
    if (command.source === "entity") {
      if (command.component !== undefined && !writableComponents.has(command.component)) {
        diagnostics.push(effectDiagnostic("TN_WEB_SYSTEM_WRITE_UNDECLARED", system, `writes/${command.component}`, `System '${system.name}' patched undeclared component '${command.component}'.`));
      }
      continue;
    }
    if (!declaresCommand(system, command)) {
      diagnostics.push(effectDiagnostic("TN_WEB_SYSTEM_COMMAND_UNDECLARED", system, `commands/${command.kind}`, `System '${system.name}' emitted undeclared command '${command.kind}'.`));
    }
  }

  for (const event of effects.events) {
    if (!eventWrites.has(event.event)) {
      diagnostics.push(effectDiagnostic("TN_WEB_SYSTEM_EVENT_WRITE_UNDECLARED", system, `eventWrites/${event.event}`, `System '${system.name}' emitted undeclared event '${event.event}'.`));
    }
  }

  for (const resource of effects.resources) {
    if (!resourceWrites.has(resource.resource)) {
      diagnostics.push(effectDiagnostic("TN_WEB_SYSTEM_RESOURCE_WRITE_UNDECLARED", system, `resourceWrites/${resource.resource}`, `System '${system.name}' wrote undeclared resource '${resource.resource}'.`));
    }
  }

  for (const service of effects.services) {
    if (!services.has(service.service)) {
      diagnostics.push(effectDiagnostic("TN_WEB_SYSTEM_SERVICE_UNDECLARED", system, `services/${service.service}`, `System '${system.name}' called undeclared service '${service.service}'.`));
    }
  }

  return diagnostics;
}

export function systemEffectLogEntries(
  system: IIrSystemDeclaration,
  effects: ISystemEffects,
  options: { frame: number; tick: number },
): ISystemEffectLogEntry[] {
  return [
    ...effects.commands.map((command) => ({
      command: command.source === "entity" ? "setComponent" : command.kind,
      component: command.component,
      entity: command.entity,
      frame: options.frame,
      kind: command.source === "entity" ? "patch" as const : "command" as const,
      payload: command.payload,
      schedule: system.schedule,
      system: system.name,
      tick: options.tick,
      value: command.value ?? command.components,
    })),
    ...effects.events.map((event) => ({
      event: event.event,
      frame: options.frame,
      kind: "event" as const,
      payload: event.payload,
      schedule: system.schedule,
      system: system.name,
      tick: options.tick,
    })),
    ...effects.resources.map((resource) => ({
      frame: options.frame,
      kind: "resource" as const,
      resource: resource.resource,
      schedule: system.schedule,
      system: system.name,
      tick: options.tick,
      value: resource.value,
    })),
    ...effects.services.map((service) => ({
      frame: options.frame,
      kind: "service" as const,
      payload: service.payload,
      schedule: system.schedule,
      service: service.service,
      system: system.name,
      tick: options.tick,
    })),
  ];
}

function declaresCommand(system: IIrSystemDeclaration, command: IQueuedCommand): boolean {
  return system.commands.some((declared) => {
    if (declared.kind !== command.kind) {
      return false;
    }
    if ("component" in declared && declared.component !== command.component) {
      return false;
    }
    if ("event" in declared && declared.event !== command.event) {
      return false;
    }
    if ("components" in declared) {
      return Object.keys(command.components ?? {}).every((component) => declared.components.includes(component));
    }
    return true;
  });
}

function effectDiagnostic(code: string, system: IIrSystemDeclaration, path: string, message: string): IRuntimeDiagnostic {
  return {
    code,
    message,
    path: `systems.ir.json/systems/${system.name}/${path}`,
    severity: "error",
  };
}

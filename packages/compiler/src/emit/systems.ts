import type { IFeedbackPreset, ISystemsIr } from "@threenative/ir";

interface ISystemCommandLike {
  child?: string;
  component?: string;
  components?: string[];
  entity?: string;
  event?: string;
  kind: string;
  parent?: string;
  prefab?: string;
  prefix?: string;
  property?: "emissiveIntensity" | "opacity" | "position" | "rotation" | "scale";
  tag?: string;
}

interface ISystemLike {
  after?: string[];
  before?: string[];
  commands: ReadonlyArray<ISystemCommandLike>;
  delayedCommands?: ReadonlyArray<Omit<NonNullable<ISystemsIr["systems"][number]["delayedCommands"]>[number], "command"> & { command: ISystemCommandLike }>;
  eventReads: string[];
  eventWrites: string[];
  name: string;
  queries: ISystemsIr["systems"][number]["queries"];
  reads: string[];
  resourceReads: string[];
  resourceWrites: string[];
  services: ISystemsIr["systems"][number]["services"];
  script?: unknown;
  schedule: ISystemsIr["systems"][number]["schedule"];
  source?: ISystemsIr["systems"][number]["source"];
  writes: string[];
}

interface ICountdownLike {
  autostart?: boolean;
  direction: "down" | "up";
  event: string;
  field: string;
  id: string;
  limit: number;
  resource: string;
}

export function systemsToIr(
  systems: ReadonlyArray<ISystemLike>,
  countdowns: ReadonlyArray<ICountdownLike> = [],
  feedbackPresets: ReadonlyArray<IFeedbackPreset> = [],
): ISystemsIr {
  return {
    schema: "threenative.systems",
    version: "0.1.0",
    ...(countdowns.length === 0 ? {} : {
      countdowns: countdowns
        .map((countdown) => ({ ...countdown }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }),
    ...(feedbackPresets.length === 0 ? {} : {
      feedbackPresets: feedbackPresets.map((preset) => ({
        ...preset,
        ...(preset.audio === undefined ? {} : { audio: { ...preset.audio } }),
        ...(preset.camera === undefined ? {} : { camera: { ...preset.camera } }),
        ...(preset.particles === undefined ? {} : { particles: preset.particles.map((particle) => ({ ...particle })) }),
      })).sort((left, right) => left.id.localeCompare(right.id)),
    }),
    systems: [...systems]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((system) => ({
        ...((system.after ?? []).length === 0 ? {} : { after: [...(system.after ?? [])].sort() }),
        ...((system.before ?? []).length === 0 ? {} : { before: [...(system.before ?? [])].sort() }),
        commands: system.commands.map(serializeCommand),
        ...delayedCommandsIr(system.delayedCommands),
        eventReads: [...system.eventReads].sort(),
        eventWrites: [...system.eventWrites].sort(),
        name: system.name,
        queries: system.queries.map((query) => ({
          ...(query.changed === undefined ? {} : { changed: [...query.changed].sort() }),
          ...(query.limit === undefined ? {} : { limit: query.limit }),
          ...(query.offset === undefined ? {} : { offset: query.offset }),
          ...(query.orderBy === undefined ? {} : { orderBy: query.orderBy }),
          with: [...query.with].sort(),
          without: [...query.without].sort(),
        })),
        reads: [...system.reads].sort(),
        resourceReads: [...system.resourceReads].sort(),
        resourceWrites: [...system.resourceWrites].sort(),
        services: [...system.services].sort(),
        ...scriptIr(system.script),
        schedule: system.schedule,
        ...(system.source === undefined ? {} : { source: system.source }),
        writes: [...system.writes].sort(),
      })),
  };
}

function delayedCommandsIr(delayedCommands: ISystemLike["delayedCommands"]): Partial<Pick<ISystemsIr["systems"][number], "delayedCommands">> {
  if (delayedCommands === undefined || delayedCommands.length === 0) {
    return {};
  }
  return {
    delayedCommands: delayedCommands
      .map((declaration) => ({
        cancelPolicy: declaration.cancelPolicy,
        command: serializeCommand(declaration.command),
        id: declaration.id,
        maxDelayTicks: declaration.maxDelayTicks,
        ownership: { ...declaration.ownership },
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function serializeCommand(command: ISystemCommandLike): ISystemsIr["systems"][number]["commands"][number] {
  if (command.kind === "spawn") {
    return { components: [...(command.components ?? [])].sort(), entity: command.entity ?? "", kind: command.kind };
  }
  if (command.kind === "emitEvent") {
    return { event: command.event ?? "", kind: command.kind };
  }
  if (command.kind === "despawn") {
    return { entity: command.entity ?? "", kind: command.kind };
  }
  if (command.kind === "instantiate") {
    return { kind: command.kind, prefab: command.prefab ?? "", prefix: command.prefix ?? "" };
  }
  if (command.kind === "setParent") {
    return { child: command.child ?? "", kind: command.kind, parent: command.parent ?? "" };
  }
  if (command.kind === "clearParent") {
    return { child: command.child ?? "", kind: command.kind };
  }
  if (command.kind === "tween") {
    return { entity: command.entity ?? "", kind: command.kind, property: command.property ?? "opacity" };
  }
  if (command.kind === "worldText") {
    return { entity: command.entity ?? "", kind: command.kind };
  }
  return { component: command.component ?? "", entity: command.entity ?? "", kind: command.kind as "addComponent" | "removeComponent" | "setComponent" };
}

function scriptIr(script: unknown): Pick<ISystemsIr["systems"][number], "script"> {
  if (typeof script !== "object" || script === null || !("exportName" in script) || typeof script.exportName !== "string") {
    return {};
  }
  return { script: { bundle: "scripts.bundle.js", exportName: script.exportName } };
}

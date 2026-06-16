import type { ISystemsIr } from "@threenative/ir";

interface ISystemLike {
  after?: string[];
  before?: string[];
  commands: ISystemsIr["systems"][number]["commands"];
  eventReads: string[];
  eventWrites: string[];
  name: string;
  queries: ISystemsIr["systems"][number]["queries"];
  reads: string[];
  resourceReads: string[];
  resourceWrites: string[];
  services: ISystemsIr["systems"][number]["services"];
  script?: {
    exportName: string;
  };
  schedule: ISystemsIr["systems"][number]["schedule"];
  writes: string[];
}

export function systemsToIr(systems: ReadonlyArray<ISystemLike>): ISystemsIr {
  return {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [...systems]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((system) => ({
        ...((system.after ?? []).length === 0 ? {} : { after: [...(system.after ?? [])].sort() }),
        ...((system.before ?? []).length === 0 ? {} : { before: [...(system.before ?? [])].sort() }),
        commands: system.commands.map((command) => {
          if (command.kind === "spawn") {
            return { components: [...command.components].sort(), entity: command.entity, kind: command.kind };
          }
          if (command.kind === "emitEvent") {
            return { event: command.event, kind: command.kind };
          }
          if (command.kind === "despawn") {
            return { entity: command.entity, kind: command.kind };
          }
          return { component: command.component, entity: command.entity, kind: command.kind };
        }),
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
        ...(system.script === undefined ? {} : { script: { bundle: "scripts.bundle.js" as const, exportName: system.script.exportName } }),
        schedule: system.schedule,
        writes: [...system.writes].sort(),
      })),
  };
}

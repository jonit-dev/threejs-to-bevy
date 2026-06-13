import type { ISystemsIr } from "@threenative/ir";

interface ISystemLike {
  commands: ISystemsIr["systems"][number]["commands"];
  eventReads: string[];
  eventWrites: string[];
  name: string;
  queries: ISystemsIr["systems"][number]["queries"];
  reads: string[];
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
          with: [...query.with].sort(),
          without: [...query.without].sort(),
        })),
        reads: [...system.reads].sort(),
        schedule: system.schedule,
        writes: [...system.writes].sort(),
      })),
  };
}

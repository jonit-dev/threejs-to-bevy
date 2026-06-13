import type { IIrSystemQuery, IWorldEntity, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "../input.js";

export interface ISystemEntityView {
  components: IWorldEntity["components"];
  id: string;
}

export interface ISystemCommandBuffer {
  addComponent(entity: string, component: string, value?: unknown): void;
  despawn(entity: string): void;
  emitEvent(event: string, payload: unknown): void;
  removeComponent(entity: string, component: string): void;
  setComponent(entity: string, component: string, value: unknown): void;
  spawn(entity: string, components?: Record<string, unknown>): void;
}

export interface ISystemContext {
  commands: ISystemCommandBuffer;
  events: {
    emit(event: string, payload: unknown): void;
    read(event: string): unknown[];
  };
  input: {
    action(name: string): boolean;
    axis(name: string): number;
    pressed(name: string): boolean;
    released(name: string): boolean;
  };
  query(query: IIrSystemQuery): ISystemEntityView[];
  resources: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
  time: {
    delta: number;
    elapsed: number;
    fixedDelta: number;
    paused: boolean;
  };
}

export interface IQueuedCommand {
  components?: Record<string, unknown>;
  component?: string;
  entity: string;
  event?: string;
  kind: "addComponent" | "despawn" | "emitEvent" | "removeComponent" | "setComponent" | "spawn";
  payload?: unknown;
  value?: unknown;
}

export interface IQueuedEvent {
  event: string;
  payload: unknown;
}

export function createSystemContext(world: IWorldIr, options: { delta: number; elapsed?: number; fixedDelta: number; input?: IWebInputState; paused?: boolean }): {
  commands: IQueuedCommand[];
  context: ISystemContext;
  events: IQueuedEvent[];
} {
  const commands: IQueuedCommand[] = [];
  const events: IQueuedEvent[] = [];
  return {
    commands,
    context: {
      commands: {
        addComponent(entity, component, value = {}) {
          commands.push({ component, entity, kind: "addComponent", value });
        },
        despawn(entity) {
          commands.push({ entity, kind: "despawn" });
        },
        emitEvent(event, payload) {
          commands.push({ entity: "", event, kind: "emitEvent", payload });
        },
        removeComponent(entity, component) {
          commands.push({ component, entity, kind: "removeComponent" });
        },
        setComponent(entity, component, value) {
          commands.push({ component, entity, kind: "setComponent", value });
        },
        spawn(entity, components = {}) {
          commands.push({ components, entity, kind: "spawn" });
        },
      },
      events: {
        emit(event, payload) {
          events.push({ event, payload });
        },
        read(event) {
          const queue = world.events?.[event];
          return Array.isArray(queue) ? queue : [];
        },
      },
      input: {
        action(name) {
          return options.input?.action(name) ?? false;
        },
        axis(name) {
          return options.input?.axis(name) ?? 0;
        },
        pressed(name) {
          return options.input?.pressed(name) ?? false;
        },
        released(name) {
          return options.input?.released(name) ?? false;
        },
      },
      query(query) {
        return world.entities
          .filter((entity) => matchesQuery(entity, query))
          .map((entity) => ({
            components: entity.components,
            id: entity.id,
          }));
      },
      resources: {
        get(name) {
          return world.resources?.[name];
        },
        set(name, value) {
          world.resources = {
            ...(world.resources ?? {}),
            [name]: value,
          };
        },
      },
      time: {
        delta: options.delta,
        elapsed: options.elapsed ?? 0,
        fixedDelta: options.fixedDelta,
        paused: options.paused ?? false,
      },
    },
    events,
  };
}

export function applyCommands(world: IWorldIr, commands: ReadonlyArray<IQueuedCommand>): void {
  for (const command of commands) {
    if (command.kind === "spawn") {
      if (world.entities.every((entity) => entity.id !== command.entity)) {
        world.entities.push({ components: { ...(command.components ?? {}) }, id: command.entity });
      }
      continue;
    }
    if (command.kind === "despawn") {
      world.entities = world.entities.filter((entity) => entity.id !== command.entity);
      continue;
    }
    if (command.kind === "emitEvent") {
      if (command.event !== undefined) {
        applyEvents(world, [{ event: command.event, payload: command.payload }]);
      }
      continue;
    }
    const entity = world.entities.find((item) => item.id === command.entity);
    if (entity === undefined || command.component === undefined) {
      continue;
    }
    if (command.kind === "removeComponent") {
      delete entity.components[command.component];
      continue;
    }
    if (command.kind === "addComponent" || command.kind === "setComponent") {
      entity.components[command.component] = command.value;
    }
  }
}

export function applyEvents(world: IWorldIr, events: ReadonlyArray<IQueuedEvent>): void {
  if (events.length === 0) {
    return;
  }
  const queues = { ...(world.events ?? {}) };
  for (const event of events) {
    const queue = queues[event.event];
    queues[event.event] = Array.isArray(queue) ? [...queue, event.payload] : [event.payload];
  }
  world.events = queues;
}

function matchesQuery(entity: IWorldEntity, query: IIrSystemQuery): boolean {
  return query.with.every((component) => entity.components[component] !== undefined) && query.without.every((component) => entity.components[component] === undefined);
}

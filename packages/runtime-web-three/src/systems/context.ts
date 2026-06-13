import type { IIrSystemQuery, IWorldEntity, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "../input.js";
import { animationPlayPayload } from "./services/animation.js";
import { raycastPrimitive, type IRaycastRequest, type IRaycastResult } from "./services/physics.js";

export interface ISystemEntityView {
  components: IWorldEntity["components"];
  get<T = unknown>(component: unknown): T;
  has(component: unknown): boolean;
  id: string;
  patch(component: unknown, value: Record<string, unknown>): void;
  set(component: unknown, value: unknown): void;
}

export interface ISystemCommandBuffer {
  addComponent(entity: string, component: unknown, value?: unknown): void;
  despawn(entity: string): void;
  emitEvent(event: unknown, payload: unknown): void;
  removeComponent(entity: string, component: unknown): void;
  setComponent(entity: string, component: unknown, value: unknown): void;
  spawn(entity: string, components?: Record<string, unknown>): void;
}

export interface ISystemContext {
  animation: {
    play(entity: string, clip: string, options?: Record<string, unknown>): void;
  };
  commands: ISystemCommandBuffer;
  events: {
    emit(event: unknown, payload: unknown): void;
    read(event: unknown): unknown[];
  };
  input: {
    action(name: string): boolean;
    axis(name: string): number;
    pressed(name: string): boolean;
    released(name: string): boolean;
  };
  query(query?: IIrSystemQuery): ISystemEntityView[];
  resources: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
  physics: {
    raycast(options: IRaycastRequest): IRaycastResult;
  };
  time: {
    delta: number;
    dt: number;
    elapsed: number;
    fixedDelta: number;
    fixedDt: number;
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
  source: "command" | "entity";
  value?: unknown;
}

export interface IQueuedEvent {
  event: string;
  payload: unknown;
}

export interface IQueuedServiceCall {
  payload: unknown;
  service: "animation.play" | "physics.raycast";
}

export function createSystemContext(
  world: IWorldIr,
  options: { defaultQuery?: IIrSystemQuery; delta: number; elapsed?: number; fixedDelta: number; input?: IWebInputState; paused?: boolean },
): {
  commands: IQueuedCommand[];
  context: ISystemContext;
  events: IQueuedEvent[];
  services: IQueuedServiceCall[];
} {
  const commands: IQueuedCommand[] = [];
  const events: IQueuedEvent[] = [];
  const services: IQueuedServiceCall[] = [];
  return {
    commands,
    context: {
      animation: {
        play(entity, clip, playOptions = {}) {
          services.push({ payload: animationPlayPayload({ clip, entity, options: cloneValue(playOptions) as Record<string, unknown> }), service: "animation.play" });
        },
      },
      commands: {
        addComponent(entity, component, value = {}) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "addComponent", source: "command", value: cloneValue(value) });
        },
        despawn(entity) {
          commands.push({ entity, kind: "despawn", source: "command" });
        },
        emitEvent(event, payload) {
          commands.push({ entity: "", event: normalizeHandleName(event), kind: "emitEvent", payload: cloneValue(payload), source: "command" });
        },
        removeComponent(entity, component) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "removeComponent", source: "command" });
        },
        setComponent(entity, component, value) {
          commands.push({ component: normalizeHandleName(component), entity, kind: "setComponent", source: "command", value: cloneValue(value) });
        },
        spawn(entity, components = {}) {
          commands.push({ components: cloneValue(components) as Record<string, unknown>, entity, kind: "spawn", source: "command" });
        },
      },
      events: {
        emit(event, payload) {
          events.push({ event: normalizeHandleName(event), payload: cloneValue(payload) });
        },
        read(event) {
          const queue = world.events?.[normalizeHandleName(event)];
          return Array.isArray(queue) ? cloneValue(queue) as unknown[] : [];
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
      query(query = options.defaultQuery ?? { with: [], without: [] }) {
        return world.entities
          .filter((entity) => matchesQuery(entity, query))
          .map((entity) => createEntityView(entity, commands));
      },
      resources: {
        get(name) {
          return cloneValue(world.resources?.[name]);
        },
        set(name, value) {
          world.resources = {
            ...(world.resources ?? {}),
            [name]: cloneValue(value),
          };
        },
      },
      physics: {
        raycast(serviceOptions) {
          const request = cloneValue(serviceOptions);
          const result = raycastPrimitive(world, request);
          services.push({ payload: { request, result }, service: "physics.raycast" });
          return result;
        },
      },
      time: {
        delta: options.delta,
        dt: options.delta,
        elapsed: options.elapsed ?? 0,
        fixedDelta: options.fixedDelta,
        fixedDt: options.fixedDelta,
        paused: options.paused ?? false,
      },
    },
    events,
    services,
  };
}

function createEntityView(entity: IWorldEntity, commands: IQueuedCommand[]): ISystemEntityView {
  const components = deepFreeze(cloneValue(entity.components)) as IWorldEntity["components"];
  return {
    components,
    get<T = unknown>(component: unknown): T {
      return cloneValue(components[normalizeHandleName(component)]) as T;
    },
    has(component: unknown): boolean {
      return components[normalizeHandleName(component)] !== undefined;
    },
    id: entity.id,
    patch(component: unknown, value: Record<string, unknown>): void {
      const componentName = normalizeHandleName(component);
      const existing = components[componentName];
      commands.push({
        component: componentName,
        entity: entity.id,
        kind: "setComponent",
        source: "entity",
        value: {
          ...(isRecord(existing) ? existing : {}),
          ...cloneValue(value),
        },
      });
    },
    set(component: unknown, value: unknown): void {
      commands.push({ component: normalizeHandleName(component), entity: entity.id, kind: "setComponent", source: "entity", value: cloneValue(value) });
    },
  };
}

function normalizeHandleName(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "function" && typeof value.name === "string" && value.name !== "") {
    return value.name;
  }
  if (typeof value === "object" && value !== null && "name" in value && typeof value.name === "string") {
    return value.name;
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyCommands(world: IWorldIr, commands: ReadonlyArray<IQueuedCommand>): void {
  for (const command of commands) {
    if (command.kind === "spawn") {
      if (world.entities.every((entity) => entity.id !== command.entity)) {
        world.entities.push({ components: cloneValue(command.components ?? {}) as IWorldEntity["components"], id: command.entity });
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
      entity.components[command.component] = cloneValue(command.value);
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

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return globalThis.structuredClone !== undefined ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  return value;
}

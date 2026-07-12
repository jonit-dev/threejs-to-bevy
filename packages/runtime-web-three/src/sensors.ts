import type { IColliderComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

export interface IPhysicsSensorTraceInput {
  fixedDelta?: number;
  phases?: ReadonlyArray<"enter" | "exit" | "stay">;
  steps?: number;
}

export interface IPhysicsSensorEvent {
  filteredOut: string[];
  interactionKind?: string;
  occupants: string[];
  phase: "enter" | "exit" | "stay";
  sensor: string;
  step: number;
}

export interface IPhysicsSensorAdvanceOptions {
  fixedDelta?: number;
  tick: number;
}

export interface IPhysicsSensorRuntimeState {
  advance(world: IWorldIr, options: IPhysicsSensorAdvanceOptions): IPhysicsSensorEvent[];
  reset(): void;
}

interface IBounds {
  center: Vec3;
  halfExtents: Vec3;
  id: string;
  layer?: string;
  mask: readonly string[];
  sensor?: NonNullable<IColliderComponent["sensor"]>;
}

export function tracePhysicsSensors(world: IWorldIr, input: IPhysicsSensorTraceInput = {}): IPhysicsSensorEvent[] {
  const steps = input.steps ?? 1;
  const fixedDelta = input.fixedDelta ?? 1;
  const requestedPhases = new Set(input.phases ?? ["enter", "stay", "exit"]);
  const entities = world.entities.map(cloneEntity);
  const previous = new Map<string, string[]>();
  const events: IPhysicsSensorEvent[] = [];
  for (let step = 1; step <= steps; step += 1) {
    integrate(entities, fixedDelta);
    for (const sensor of entities.filter(isSensor).sort(compareEntities)) {
      const bounds = entityBounds(sensor);
      if (bounds === undefined || bounds.sensor === undefined) {
        continue;
      }
      const current = occupantsFor(bounds, entities);
      const prior = previous.get(sensor.id) ?? [];
      const phases = phaseEvents(sensor.id, bounds, prior, current, step).filter((event) => requestedPhases.has(event.phase));
      events.push(...phases);
      previous.set(sensor.id, current.occupants);
    }
  }
  return events.sort((left, right) => left.step - right.step || left.sensor.localeCompare(right.sensor) || left.phase.localeCompare(right.phase));
}

export function createPhysicsSensorRuntimeState(): IPhysicsSensorRuntimeState {
  const occupancy = new Map<string, string[]>();
  let lastTick: number | undefined;
  let lastEvents: IPhysicsSensorEvent[] = [];

  return {
    advance(world, options) {
      const tick = Number.isFinite(options.tick) ? Math.max(0, Math.floor(options.tick)) : 0;
      if (lastTick === tick) {
        return cloneEvents(lastEvents);
      }
      if (lastTick !== undefined && tick < lastTick) {
        occupancy.clear();
      }

      const entities = world.entities.map(cloneEntity);
      const liveSensors = new Set(entities.filter(isSensor).map((entity) => entity.id));
      for (const sensor of [...occupancy.keys()]) {
        if (!liveSensors.has(sensor)) {
          occupancy.delete(sensor);
        }
      }

      const events: IPhysicsSensorEvent[] = [];
      for (const sensor of entities.filter(isSensor).sort(compareEntities)) {
        const bounds = entityBounds(sensor);
        if (bounds === undefined || bounds.sensor === undefined) {
          continue;
        }
        const current = occupantsFor(bounds, entities);
        const prior = occupancy.get(sensor.id) ?? [];
        events.push(...phaseEvents(sensor.id, bounds, prior, current, tick));
        occupancy.set(sensor.id, current.occupants);
      }

      lastTick = tick;
      lastEvents = events.sort((left, right) => left.sensor.localeCompare(right.sensor) || left.phase.localeCompare(right.phase));
      return cloneEvents(lastEvents);
    },
    reset() {
      occupancy.clear();
      lastTick = undefined;
      lastEvents = [];
    },
  };
}

function occupantsFor(sensor: IBounds, entities: readonly IWorldEntity[]): { filteredOut: string[]; occupants: string[] } {
  const occupants: string[] = [];
  const filteredOut: string[] = [];
  for (const entity of [...entities].sort(compareEntities)) {
    if (entity.id === sensor.id || entity.components.Collider === undefined) {
      continue;
    }
    const bounds = entityBounds(entity);
    if (bounds === undefined || !overlaps(sensor, bounds)) {
      continue;
    }
    if (!passesFilter(sensor, bounds)) {
      filteredOut.push(entity.id);
      continue;
    }
    occupants.push(entity.id);
  }
  return { filteredOut, occupants: occupants.slice(0, sensor.sensor?.occupantLimit ?? occupants.length) };
}

function phaseEvents(sensor: string, bounds: IBounds, previous: readonly string[], current: { filteredOut: string[]; occupants: string[] }, step: number): IPhysicsSensorEvent[] {
  const allowed = new Set(bounds.sensor?.phases ?? ["enter", "stay", "exit"]);
  const previousSet = new Set(previous);
  const currentSet = new Set(current.occupants);
  const events: IPhysicsSensorEvent[] = [];
  const push = (phase: IPhysicsSensorEvent["phase"], occupants: string[]): void => {
    if (!allowed.has(phase)) {
      return;
    }
    events.push({
      filteredOut: current.filteredOut,
      ...(bounds.sensor?.interactionKind === undefined ? {} : { interactionKind: bounds.sensor.interactionKind }),
      occupants,
      phase,
      sensor,
      step,
    });
  };
  const entered = current.occupants.filter((id) => !previousSet.has(id));
  const stayed = current.occupants.filter((id) => previousSet.has(id));
  const exited = previous.filter((id) => !currentSet.has(id));
  if (entered.length > 0) push("enter", entered);
  if (stayed.length > 0) push("stay", stayed);
  if (exited.length > 0) push("exit", exited);
  return events;
}

function integrate(entities: IWorldEntity[], fixedDelta: number): void {
  for (const entity of entities) {
    const body = entity.components.RigidBody;
    const transform = entity.components.Transform;
    if (transform?.position === undefined || body?.velocity === undefined || (body.kind !== "dynamic" && body.kind !== "kinematic")) {
      continue;
    }
    transform.position = [
      transform.position[0] + body.velocity[0] * fixedDelta,
      transform.position[1] + body.velocity[1] * fixedDelta,
      transform.position[2] + body.velocity[2] * fixedDelta,
    ];
  }
}

function isSensor(entity: IWorldEntity): boolean {
  return entity.components.Collider?.sensor !== undefined;
}

function entityBounds(entity: IWorldEntity): IBounds | undefined {
  const collider = entity.components.Collider;
  if (collider === undefined) {
    return undefined;
  }
  return {
    center: vector(entity.components.Transform?.position),
    halfExtents: halfExtents(collider),
    id: entity.id,
    layer: collider.layer,
    mask: collider.mask ?? [],
    sensor: collider.sensor,
  };
}

function halfExtents(collider: IColliderComponent): Vec3 {
  if (collider.kind === "box") {
    const [x = 1, y = 1, z = 1] = collider.size ?? [];
    return [x / 2, y / 2, z / 2];
  }
  if (collider.kind === "sphere") {
    const radius = collider.radius ?? 0.5;
    return [radius, radius, radius];
  }
  const radius = collider.radius ?? 0.5;
  return [radius, (collider.height ?? 1) / 2, radius];
}

function overlaps(left: IBounds, right: IBounds): boolean {
  return (
    Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
    Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
    Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
  );
}

function passesFilter(left: IBounds, right: IBounds): boolean {
  return left.mask.length === 0 || (right.layer !== undefined && left.mask.includes(right.layer));
}

function cloneEntity(entity: IWorldEntity): IWorldEntity {
  return JSON.parse(JSON.stringify(entity)) as IWorldEntity;
}

function cloneEvents(events: readonly IPhysicsSensorEvent[]): IPhysicsSensorEvent[] {
  return events.map((event) => ({ ...event, filteredOut: [...event.filteredOut], occupants: [...event.occupants] }));
}

function compareEntities(left: IWorldEntity, right: IWorldEntity): number {
  return left.id.localeCompare(right.id);
}

function vector(value: readonly number[] | undefined): Vec3 {
  return [value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0];
}

import type { IPrefabsIr, ISpawnerComponent, ITransformComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

interface ISpawnerState {
  nextTick: number;
  sequence: number;
  total: number;
}

export interface ISpawnerObservation {
  entity: string;
  prefab: string;
  root: string;
  spawned: readonly string[];
  tick: number;
}

const spawnerStateByWorld = new WeakMap<IWorldIr, Map<string, ISpawnerState>>();

export function hasSpawners(world: IWorldIr): boolean {
  return world.entities.some((entity) => entity.components.Spawner !== undefined);
}

export function stepSpawners(world: IWorldIr, options: { fixedDelta?: number; prefabs?: IPrefabsIr; tick: number }): ISpawnerObservation[] {
  const state = spawnerStateByWorld.get(world) ?? new Map<string, ISpawnerState>();
  spawnerStateByWorld.set(world, state);
  const observations: ISpawnerObservation[] = [];
  const fixedDelta = options.fixedDelta ?? 1 / 60;

  for (const entity of [...world.entities]) {
    const spawner = entity.components.Spawner;
    if (spawner === undefined || spawner.enabled === false) {
      continue;
    }
    const template = options.prefabs?.prefabs.find((candidate) => candidate.id === spawner.prefab);
    if (template === undefined) {
      continue;
    }
    const spawnerState = stateFor(entity.id, spawner, fixedDelta, state);
    if (options.tick < spawnerState.nextTick || isDepleted(spawner, spawnerState)) {
      continue;
    }
    const alive = aliveSpawnCount(world, entity.id);
    const capacity = Math.max(0, (spawner.maxAlive ?? Number.POSITIVE_INFINITY) - alive);
    const batchSize = Math.min(capacity, batchSizeFor(spawner), remainingFor(spawner, spawnerState));
    if (batchSize <= 0) {
      continue;
    }
    for (let index = 0; index < batchSize; index += 1) {
      const sequence = spawnerState.sequence;
      const prefix = `${entity.id}.spawn.${sequence}`;
      const spawned = instantiatePrefab(world, template, prefix, entity, spawner, sequence);
      if (spawned.length > 0) {
        observations.push({ entity: entity.id, prefab: spawner.prefab, root: `${prefix}.${template.root}`, spawned, tick: options.tick });
        spawnerState.total += 1;
        spawnerState.sequence += 1;
      }
    }
    spawnerState.nextTick = nextTickFor(spawner, fixedDelta, options.tick);
  }

  if (observations.length > 0) {
    appendSpawnerEvents(world, "spawner.spawned", observations.map((observation) => ({ entity: observation.entity, prefab: observation.prefab, root: observation.root, tick: observation.tick })));
  }
  return observations;
}

function stateFor(id: string, spawner: ISpawnerComponent, fixedDelta: number, states: Map<string, ISpawnerState>): ISpawnerState {
  const existing = states.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const initial = { nextTick: 0, sequence: 0, total: 0 };
  if (spawner.mode === "interval" && spawner.interval !== undefined) {
    initial.nextTick = intervalTicks(spawner.interval, fixedDelta);
  }
  states.set(id, initial);
  return initial;
}

function batchSizeFor(spawner: ISpawnerComponent): number {
  if (spawner.mode === "interval") {
    return 1;
  }
  return Math.max(1, Math.floor(spawner.waveSize ?? 1));
}

function remainingFor(spawner: ISpawnerComponent, state: ISpawnerState): number {
  return Math.max(0, (spawner.maxTotal ?? Number.POSITIVE_INFINITY) - state.total);
}

function isDepleted(spawner: ISpawnerComponent, state: ISpawnerState): boolean {
  return spawner.maxTotal !== undefined && state.total >= spawner.maxTotal;
}

function nextTickFor(spawner: ISpawnerComponent, fixedDelta: number, currentTick: number): number {
  if (spawner.mode === "once" || (spawner.mode === "wave" && spawner.interval === undefined)) {
    return Number.POSITIVE_INFINITY;
  }
  return currentTick + intervalTicks(spawner.interval ?? fixedDelta, fixedDelta);
}

function intervalTicks(interval: number, fixedDelta: number): number {
  return Math.max(1, Math.ceil(interval / Math.max(fixedDelta, 1 / 600)));
}

function aliveSpawnCount(world: IWorldIr, spawnerId: string): number {
  const prefix = `${spawnerId}.spawn.`;
  return world.entities.filter((entity) => entity.id.startsWith(prefix)).length;
}

function instantiatePrefab(world: IWorldIr, prefab: IPrefabsIr["prefabs"][number], prefix: string, spawner: IWorldEntity, config: ISpawnerComponent, sequence: number): string[] {
  const spawned: string[] = [];
  const offset = spawnOffset(config, sequence);
  const origin = vector(spawner.components.Transform?.position);
  for (const template of prefab.entities) {
    const id = `${prefix}.${template.id}`;
    if (world.entities.some((entity) => entity.id === id)) {
      continue;
    }
    const components = clone(template.components) as IWorldEntity["components"];
    components.Transform = offsetTransform(components.Transform, origin, offset);
    world.entities.push({ components, id });
    spawned.push(id);
  }
  return spawned;
}

function offsetTransform(transform: ITransformComponent | undefined, origin: Vec3, offset: Vec3): ITransformComponent {
  const position = vector(transform?.position);
  return {
    ...(transform ?? {}),
    position: [position[0] + origin[0] + offset[0], position[1] + origin[1] + offset[1], position[2] + origin[2] + offset[2]],
  };
}

function spawnOffset(spawner: ISpawnerComponent, sequence: number): Vec3 {
  const area = spawner.area;
  if (area === undefined || area.shape === "point") {
    return [0, 0, 0];
  }
  const rng = seededRandom((spawner.jitterSeed ?? 0) + sequence * 1013);
  if (area.shape === "circle") {
    const radius = typeof area.size === "number" ? area.size : vector2(area.size)[0];
    const angle = rng() * Math.PI * 2;
    const distance = Math.sqrt(rng()) * radius;
    return [Math.cos(angle) * distance, 0, Math.sin(angle) * distance];
  }
  const size = vector(area.size);
  return [(rng() - 0.5) * size[0], (rng() - 0.5) * size[1], (rng() - 0.5) * size[2]];
}

function appendSpawnerEvents(world: IWorldIr, event: string, payloads: readonly unknown[]): void {
  const queue = world.events?.[event];
  world.events = {
    ...(world.events ?? {}),
    [event]: Array.isArray(queue) ? [...queue, ...payloads] : [...payloads],
  };
}

function seededRandom(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function vector(value: unknown): Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1], value[2]]
    : [0, 0, 0];
}

function vector2(value: unknown): readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1]]
    : [0, 0];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

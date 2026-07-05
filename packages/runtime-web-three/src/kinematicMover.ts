import type { IKinematicMoverComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

interface IMoverOriginState {
  position: Vec3;
}

export interface IKinematicMoverObservation {
  entity: string;
  position: Vec3;
  velocity: Vec3;
}

const moverOriginsByWorld = new WeakMap<IWorldIr, Map<string, IMoverOriginState>>();

export function hasKinematicMovers(world: IWorldIr): boolean {
  return world.entities.some((entity) => entity.components.KinematicMover !== undefined);
}

export function stepKinematicMovers(world: IWorldIr, elapsedSeconds: number): IKinematicMoverObservation[] {
  const origins = moverOriginsByWorld.get(world) ?? new Map<string, IMoverOriginState>();
  moverOriginsByWorld.set(world, origins);
  const observations: IKinematicMoverObservation[] = [];
  for (const entity of world.entities) {
    const mover = entity.components.KinematicMover;
    if (mover === undefined) {
      continue;
    }
    const origin = originFor(entity, origins);
    if (mover.mode === "sine") {
      observations.push(applySineMover(entity, mover, origin.position, elapsedSeconds));
    }
  }
  return observations;
}

function originFor(entity: IWorldEntity, origins: Map<string, IMoverOriginState>): IMoverOriginState {
  const existing = origins.get(entity.id);
  if (existing !== undefined) {
    return existing;
  }
  const origin = { position: vector(entity.components.Transform?.position) };
  origins.set(entity.id, origin);
  return origin;
}

function applySineMover(entity: IWorldEntity, mover: IKinematicMoverComponent, origin: Vec3, elapsedSeconds: number): IKinematicMoverObservation {
  const direction = normalize(mover.direction ?? axisVector(mover.axis ?? "x"));
  const radius = Math.max(0, finite(mover.radius, 1));
  const speed = finite(mover.speed, 0);
  const theta = finite(mover.phase, 0) + Math.max(0, finite(elapsedSeconds, 0)) * speed;
  const offset = Math.sin(theta) * radius;
  const velocityScale = Math.cos(theta) * speed * radius;
  const position: Vec3 = [
    origin[0] + direction[0] * offset,
    origin[1] + direction[1] * offset,
    origin[2] + direction[2] * offset,
  ];
  const velocity: Vec3 = [
    direction[0] * velocityScale,
    direction[1] * velocityScale,
    direction[2] * velocityScale,
  ];
  entity.components.Transform = { ...entity.components.Transform, position };
  if (entity.components.RigidBody !== undefined) {
    entity.components.RigidBody = { ...entity.components.RigidBody, velocity };
  }
  return { entity: entity.id, position, velocity };
}

function axisVector(axis: "x" | "y" | "z"): Vec3 {
  if (axis === "y") {
    return [0, 1, 0];
  }
  if (axis === "z") {
    return [0, 0, 1];
  }
  return [1, 0, 0];
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length <= 1e-9 ? [0, 0, 0] : [value[0] / length, value[1] / length, value[2] / length];
}

function vector(value: Vec3 | undefined): Vec3 {
  return value ?? [0, 0, 0];
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

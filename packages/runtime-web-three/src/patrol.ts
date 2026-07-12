import type { IPatrolComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

import { markScriptAuthoredTransform } from "./physics.js";

type MutableVec3 = [number, number, number];

export interface IPatrolObservation {
  direction: 1 | -1;
  entity: string;
  paused: boolean;
  position: Vec3;
  segment: number;
  velocity: Vec3;
}

interface IPatrolRuntimeState {
  direction: 1 | -1;
  pauseRemaining: number;
  segment: number;
  waypointsKey: string;
}

const patrolStateByWorld = new WeakMap<IWorldIr, Map<string, IPatrolRuntimeState>>();
const EPSILON = 1e-7;

export function stepPatrols(world: IWorldIr, fixedDelta: number): IPatrolObservation[] {
  const states = patrolStateByWorld.get(world) ?? new Map<string, IPatrolRuntimeState>();
  patrolStateByWorld.set(world, states);
  const observations: IPatrolObservation[] = [];
  const delta = Math.max(0, finite(fixedDelta, 0));
  for (const entity of [...world.entities].sort((left, right) => left.id.localeCompare(right.id))) {
    const patrol = entity.components.Patrol;
    if (patrol === undefined || patrol.waypoints.length < 2) {
      states.delete(entity.id);
      continue;
    }
    const state = stateFor(entity, patrol, states);
    const position = vector(entity.components.Transform?.position);
    const velocity: MutableVec3 = [0, 0, 0];
    if (patrol.paused === true || delta <= 0 || entity.components.RigidBody?.kind === "dynamic") {
      observations.push(observation(entity, state, position, velocity, patrol.paused === true));
      continue;
    }

    let remaining = delta;
    const speed = Math.max(0, finite(patrol.speed, 0));
    if (state.pauseRemaining > 0) {
      const pause = state.pauseRemaining;
      state.pauseRemaining = Math.max(0, pause - remaining);
      if (state.pauseRemaining > 0 || speed <= 0) {
        observations.push(observation(entity, state, position, velocity, false));
        continue;
      }
      remaining -= pause;
    }

    const maxTransitions = patrol.waypoints.length * 2 + 1;
    for (let transition = 0; transition < maxTransitions && remaining > EPSILON; transition += 1) {
      const target = patrol.waypoints[state.segment] ?? patrol.waypoints[0]!;
      const offset: Vec3 = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
      const distance = Math.hypot(offset[0], offset[1], offset[2]);
      if (distance <= EPSILON) {
        arriveAtWaypoint(state, patrol);
        if (state.pauseRemaining > 0) {
          break;
        }
        continue;
      }
      const travel = speed * remaining;
      if (travel < distance || speed <= EPSILON) {
        const scale = speed <= EPSILON ? 0 : travel / distance;
        position[0] += offset[0] * scale;
        position[1] += offset[1] * scale;
        position[2] += offset[2] * scale;
        velocity[0] = offset[0] / distance * speed;
        velocity[1] = offset[1] / distance * speed;
        velocity[2] = offset[2] / distance * speed;
        remaining = 0;
        break;
      }
      position[0] = target[0];
      position[1] = target[1];
      position[2] = target[2];
      velocity[0] = offset[0] / distance * speed;
      velocity[1] = offset[1] / distance * speed;
      velocity[2] = offset[2] / distance * speed;
      remaining -= distance / speed;
      arriveAtWaypoint(state, patrol);
      if (state.pauseRemaining > 0) {
        break;
      }
    }

    const transform = entity.components.Transform ?? {};
    entity.components.Transform = { ...transform, position };
    if (patrol.faceHeading === true && Math.hypot(velocity[0], velocity[2]) > EPSILON) {
      entity.components.Transform.rotation = yawRotation(Math.atan2(velocity[0], velocity[2]));
    }
    if (entity.components.RigidBody?.kind === "kinematic") {
      entity.components.RigidBody = { ...entity.components.RigidBody, velocity };
      markScriptAuthoredTransform(world, entity.id);
    }
    observations.push(observation(entity, state, position, velocity, false));
  }
  return observations;
}

export function resetPatrolState(world: IWorldIr, entityId?: string): void {
  if (entityId === undefined) {
    patrolStateByWorld.delete(world);
    return;
  }
  patrolStateByWorld.get(world)?.delete(entityId);
}

function stateFor(entity: IWorldEntity, patrol: IPatrolComponent, states: Map<string, IPatrolRuntimeState>): IPatrolRuntimeState {
  const waypointsKey = JSON.stringify(patrol.waypoints);
  const existing = states.get(entity.id);
  if (existing !== undefined && existing.waypointsKey === waypointsKey) {
    return existing;
  }
  const next: IPatrolRuntimeState = {
    direction: 1,
    pauseRemaining: 0,
    segment: 1,
    waypointsKey,
  };
  states.set(entity.id, next);
  return next;
}

function arriveAtWaypoint(state: IPatrolRuntimeState, patrol: IPatrolComponent): void {
  if (patrol.pauseAtWaypoint !== undefined && patrol.pauseAtWaypoint > 0) {
    state.pauseRemaining = patrol.pauseAtWaypoint;
  }
  if (patrol.mode === "loop") {
    state.segment = (state.segment + 1) % patrol.waypoints.length;
    return;
  }
  if (state.segment >= patrol.waypoints.length - 1) {
    state.direction = -1;
  } else if (state.segment <= 0) {
    state.direction = 1;
  }
  state.segment += state.direction;
}

function observation(entity: IWorldEntity, state: IPatrolRuntimeState, position: Vec3, velocity: Vec3, paused: boolean): IPatrolObservation {
  return {
    direction: state.direction,
    entity: entity.id,
    paused,
    position: [...position],
    segment: state.segment,
    velocity: [...velocity],
  };
}

function vector(value: Vec3 | undefined): MutableVec3 {
  return value === undefined ? [0, 0, 0] : [...value];
}

function yawRotation(yaw: number): [number, number, number, number] {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

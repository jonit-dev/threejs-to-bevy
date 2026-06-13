import type { IEnvironmentInstanceIr, IWalkabilityIr } from "@threenative/ir";

export interface IWalkabilityResolution {
  blockedBy?: string;
  position: [number, number, number];
}

export function resolveWalkableMovement(options: {
  desired: readonly [number, number, number];
  instances?: readonly IEnvironmentInstanceIr[];
  start: readonly [number, number, number];
  walkability: IWalkabilityIr;
}): IWalkabilityResolution {
  const y = options.walkability.terrain.height + options.walkability.movementProfile.eyeHeight;
  const desired: [number, number, number] = [options.desired[0], y, options.desired[2]];
  if (!insideAnyRegion([desired[0], desired[2]], options.walkability.regions)) {
    return { blockedBy: "walkable-boundary", position: [options.start[0], y, options.start[2]] };
  }
  for (const blocker of options.walkability.blockers) {
    const instance = options.instances?.find((item) => item.id === blocker.instance);
    if (instance === undefined) {
      continue;
    }
    const radius = (blocker.collider.radius ?? 0.5) + options.walkability.movementProfile.radius;
    if (Math.hypot(desired[0] - instance.position[0], desired[2] - instance.position[2]) < radius) {
      return { blockedBy: blocker.id, position: [options.start[0], y, options.start[2]] };
    }
  }
  return { position: desired };
}

function insideAnyRegion(point: readonly [number, number], regions: IWalkabilityIr["regions"]): boolean {
  return regions.some((region) => pointInPolygon(point, region.points));
}

function pointInPolygon(point: readonly [number, number], polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (currentPoint === undefined || previousPoint === undefined) {
      continue;
    }
    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) / (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

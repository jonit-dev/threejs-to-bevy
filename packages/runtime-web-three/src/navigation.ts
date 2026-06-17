import type { IWorldIr, Vec3 } from "@threenative/ir";

export interface INavigationPathRequest {
  goal: Vec3;
  id?: string;
  start: Vec3;
}

export interface INavigationPathResult {
  failureReason?: "goal-outside" | "no-route" | "start-outside";
  path: Vec3[];
  query: string;
  status: "failed" | "success";
  totalCost: number;
  visitedRegions: string[];
}

interface INavigationRegion {
  area?: string;
  center: Vec3;
  id: string;
  neighbors?: string[];
  points: Array<readonly [number, number]>;
}

interface INavigationResource {
  areaCosts?: Record<string, number>;
  queries?: INavigationPathRequest[];
  regions: INavigationRegion[];
}

export function traceNavigationPaths(world: IWorldIr, requests?: ReadonlyArray<INavigationPathRequest>): INavigationPathResult[] {
  const navigation = world.resources?.Navigation as INavigationResource | undefined;
  if (navigation === undefined) {
    return [];
  }
  const queries = requests ?? navigation.queries ?? [];
  return queries.map((query, index) => pathQuery(navigation, query, query.id ?? `query-${index}`));
}

export function queryNavigationPath(world: IWorldIr, request: INavigationPathRequest): INavigationPathResult {
  const navigation = world.resources?.Navigation as INavigationResource | undefined;
  if (navigation === undefined) {
    return { failureReason: "no-route", path: [], query: request.id ?? "query", status: "failed", totalCost: 0, visitedRegions: [] };
  }
  return pathQuery(navigation, request, request.id ?? "query");
}

function pathQuery(navigation: INavigationResource, request: INavigationPathRequest, queryId: string): INavigationPathResult {
  const startRegion = regionForPoint(navigation.regions, request.start);
  if (startRegion === undefined) {
    return { failureReason: "start-outside", path: [], query: queryId, status: "failed", totalCost: 0, visitedRegions: [] };
  }
  const goalRegion = regionForPoint(navigation.regions, request.goal);
  if (goalRegion === undefined) {
    return { failureReason: "goal-outside", path: [], query: queryId, status: "failed", totalCost: 0, visitedRegions: [startRegion.id] };
  }
  const route = shortestRoute(navigation, startRegion.id, goalRegion.id);
  if (route.length === 0) {
    return { failureReason: "no-route", path: [], query: queryId, status: "failed", totalCost: 0, visitedRegions: [startRegion.id] };
  }
  return {
      path: [roundVec3(request.start), ...route.slice(1, -1).map((id) => roundVec3(regionById(navigation.regions, id)!.center)), roundVec3(request.goal)],
    query: queryId,
    status: "success",
    totalCost: round(routeCost(navigation, route)),
    visitedRegions: route,
  };
}

function shortestRoute(navigation: INavigationResource, start: string, goal: string): string[] {
  const regions = new Map(navigation.regions.map((region) => [region.id, region]));
  const costs = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const queue = [...regions.keys()].sort((left, right) => left.localeCompare(right));
  while (queue.length > 0) {
    queue.sort((left, right) => (costs.get(left) ?? Number.POSITIVE_INFINITY) - (costs.get(right) ?? Number.POSITIVE_INFINITY) || left.localeCompare(right));
    const current = queue.shift()!;
    if (current === goal) {
      break;
    }
    const currentCost = costs.get(current);
    if (currentCost === undefined) {
      continue;
    }
    for (const neighbor of [...(regions.get(current)?.neighbors ?? [])].sort((left, right) => left.localeCompare(right))) {
      if (!regions.has(neighbor)) {
        continue;
      }
      const candidate = currentCost + regionCost(navigation, regions.get(neighbor)!);
      if (candidate < (costs.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        costs.set(neighbor, candidate);
        previous.set(neighbor, current);
      }
    }
  }
  if (!costs.has(goal)) {
    return [];
  }
  const route = [goal];
  while (route[0] !== start) {
    const prior = previous.get(route[0]!);
    if (prior === undefined) {
      return [];
    }
    route.unshift(prior);
  }
  return route;
}

function routeCost(navigation: INavigationResource, route: readonly string[]): number {
  return route.slice(1).reduce((total, id) => {
    const region = regionById(navigation.regions, id);
    return region === undefined ? total : total + regionCost(navigation, region);
  }, 0);
}

function regionCost(navigation: INavigationResource, region: INavigationRegion): number {
  return navigation.areaCosts?.[region.area ?? "default"] ?? 1;
}

function regionForPoint(regions: readonly INavigationRegion[], point: Vec3): INavigationRegion | undefined {
  return [...regions].sort((left, right) => left.id.localeCompare(right.id)).find((region) => pointInPolygon([point[0], point[2]], region.points));
}

function regionById(regions: readonly INavigationRegion[], id: string): INavigationRegion | undefined {
  return regions.find((region) => region.id === id);
}

function pointInPolygon(point: readonly [number, number], polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (currentPoint === undefined || previousPoint === undefined) {
      continue;
    }
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && point[0] < (previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]) / (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function roundVec3(value: Vec3): Vec3 {
  return [round(value[0]), round(value[1]), round(value[2])];
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

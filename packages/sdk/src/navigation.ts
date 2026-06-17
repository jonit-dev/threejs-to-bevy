import { SdkError } from "./errors.js";

export type NavigationPoint2 = readonly [number, number];
export type NavigationPoint3 = readonly [number, number, number];

export interface INavigationRegionDeclaration {
  area?: string;
  center: NavigationPoint3;
  id: string;
  neighbors?: ReadonlyArray<string>;
  points: ReadonlyArray<NavigationPoint2>;
}

export interface INavigationPathQueryDeclaration {
  goal: NavigationPoint3;
  id: string;
  start: NavigationPoint3;
}

export interface IStaticNavigationDeclaration {
  agentRadius: number;
  areaCosts?: Readonly<Record<string, number>>;
  queries?: ReadonlyArray<INavigationPathQueryDeclaration>;
  regions: ReadonlyArray<INavigationRegionDeclaration>;
}

export function staticNavigation(options: IStaticNavigationDeclaration): IStaticNavigationDeclaration {
  assertRange(options.agentRadius, 0, 100, "TN_SDK_NAVIGATION_AGENT_RADIUS_INVALID", "Navigation.agentRadius");
  if (options.regions.length === 0) {
    throw new SdkError("TN_SDK_NAVIGATION_REGIONS_INVALID", "Navigation.regions must not be empty.");
  }
  return {
    agentRadius: options.agentRadius,
    ...(options.areaCosts === undefined ? {} : { areaCosts: normalizeAreaCosts(options.areaCosts) }),
    ...(options.queries === undefined ? {} : { queries: options.queries.map(normalizeQuery) }),
    regions: options.regions.map(normalizeRegion),
  };
}

function normalizeRegion(region: INavigationRegionDeclaration): INavigationRegionDeclaration {
  assertId(region.id, "Navigation.region.id");
  if (region.points.length < 3) {
    throw new SdkError("TN_SDK_NAVIGATION_REGION_POINTS_INVALID", "Navigation region points must include at least three vertices.");
  }
  return {
    ...(region.area === undefined ? {} : { area: assertId(region.area, "Navigation.region.area") }),
    center: vector3(region.center, "Navigation.region.center"),
    id: region.id,
    ...(region.neighbors === undefined ? {} : { neighbors: region.neighbors.map((neighbor) => assertId(neighbor, "Navigation.region.neighbors")) }),
    points: region.points.map((point) => vector2(point, "Navigation.region.points")),
  };
}

function normalizeQuery(query: INavigationPathQueryDeclaration): INavigationPathQueryDeclaration {
  return {
    goal: vector3(query.goal, "Navigation.query.goal"),
    id: assertId(query.id, "Navigation.query.id"),
    start: vector3(query.start, "Navigation.query.start"),
  };
}

function normalizeAreaCosts(areaCosts: Readonly<Record<string, number>>): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [area, cost] of Object.entries(areaCosts).sort(([left], [right]) => left.localeCompare(right))) {
    assertId(area, "Navigation.areaCosts");
    assertRange(cost, 0, 1000, "TN_SDK_NAVIGATION_AREA_COST_INVALID", `Navigation.areaCosts.${area}`);
    normalized[area] = cost;
  }
  return normalized;
}

function vector2(value: NavigationPoint2, label: string): NavigationPoint2 {
  if (value.length !== 2 || value.some((item) => !Number.isFinite(item))) {
    throw new SdkError("TN_SDK_NAVIGATION_POINT_INVALID", `${label} must be a finite [x, z] tuple.`);
  }
  return [value[0], value[1]];
}

function vector3(value: NavigationPoint3, label: string): NavigationPoint3 {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new SdkError("TN_SDK_NAVIGATION_POINT_INVALID", `${label} must be a finite [x, y, z] tuple.`);
  }
  return [value[0], value[1], value[2]];
}

function assertId(value: string, label: string): string {
  if (value.trim() === "") {
    throw new SdkError("TN_SDK_NAVIGATION_ID_INVALID", `${label} must be a non-empty string.`);
  }
  return value;
}

function assertRange(value: number, minimum: number, maximum: number, code: string, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new SdkError(code, `${label} must be a finite number from ${minimum} to ${maximum}.`);
  }
}

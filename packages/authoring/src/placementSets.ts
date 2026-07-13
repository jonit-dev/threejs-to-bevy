import type { IScenePlacementSet, IScenePrefabInstance } from "./schemas.js";

export interface IExpandedPlacementInstance extends IScenePrefabInstance {
  placement: { column: number; index: number; lane: number; placementSetId: string; row: number };
}

const forbiddenPathSegments = new Set(["__proto__", "constructor", "prototype"]);

export function expandPlacementSets(sets: readonly IScenePlacementSet[] | undefined): IExpandedPlacementInstance[] {
  const expanded = (sets ?? []).flatMap((set) => expandPlacementSet(set));
  const ids = new Set<string>();
  for (const instance of expanded) {
    if (ids.has(instance.id)) throw new Error(`Placement generated duplicate entity id '${instance.id}'.`);
    ids.add(instance.id);
  }
  return expanded;
}

export function expandPlacementSet(set: IScenePlacementSet): IExpandedPlacementInstance[] {
  const points = placementPoints(set);
  return points.map((point, index) => {
    const context = { column: point.column, index, lane: point.lane, positionX: point.position[0], positionY: point.position[1], positionZ: point.position[2], row: point.row };
    const value = clone(set.defaults ?? {}) as Record<string, unknown>;
    const transform = deepMerge(record(value.transform), { position: point.position });
    value.transform = transform;
    for (const [path, binding] of Object.entries(set.indexBindings ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      setDottedPath(value, path, context[binding as keyof typeof context]);
    }
    for (const [path, override] of Object.entries(set.overrides?.[String(index)] ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      setDottedPath(value, path, clone(override));
    }
    return {
      ...(value as Omit<IScenePrefabInstance, "id" | "prefab">),
      id: formatPlacementId(set.idFormat, context, set.idValues?.[index]),
      placement: { column: context.column, index, lane: context.lane, placementSetId: set.id, row: context.row },
      prefab: set.prefab,
    };
  });
}

export function setDottedPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  if (segments.length < 2 || segments.some((segment) => segment === "" || forbiddenPathSegments.has(segment))) {
    throw new Error(`Invalid placement path '${path}'.`);
  }
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (current !== undefined && !isRecord(current)) {
      throw new Error(`Placement path '${path}' crosses non-object field '${segment}'.`);
    }
    if (current === undefined) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1)!] = value;
}

function placementPoints(set: IScenePlacementSet): Array<{ column: number; lane: number; position: [number, number, number]; row: number }> {
  const pattern = set.pattern;
  if (pattern.kind === "explicit") {
    return pattern.positions.map((position, index) => ({ column: index, lane: 0, position: vec3(position), row: 0 }));
  }
  if (pattern.kind === "line") {
    return range(pattern.count).map((index) => ({ column: index, lane: 0, position: add(vec3(pattern.origin), scale(vec3(pattern.step), index)), row: 0 }));
  }
  if (pattern.kind === "grid") {
    return range(pattern.rows).flatMap((row) => range(pattern.columns).map((column) => ({
      column,
      lane: row,
      position: [pattern.origin[0]! + column * pattern.step[0]!, pattern.origin[1]!, pattern.origin[2]! + row * pattern.step[2]!],
      row,
    })));
  }
  if (pattern.kind === "lanes") {
    return range(pattern.lanes).flatMap((lane) => range(pattern.count).map((column) => ({
      column,
      lane,
      position: add(add(vec3(pattern.origin), scale(vec3(pattern.laneStep), lane)), scale(vec3(pattern.step), column)),
      row: column,
    })));
  }
  return range(pattern.count).map((index) => {
    const angle = (pattern.startAngle ?? 0) + index * Math.PI * 2 / pattern.count;
    return { column: index, lane: 0, position: [pattern.center[0]! + Math.cos(angle) * pattern.radius, pattern.center[1]!, pattern.center[2]! + Math.sin(angle) * pattern.radius], row: 0 };
  });
}

function formatPlacementId(format: string, context: { column: number; index: number; lane: number; row: number }, value: string | undefined): string {
  return format.replaceAll(/\{(column|index|lane|row|value)\}/g, (_match, key: keyof typeof context | "value") => key === "value" ? (value ?? "") : String(context[key]));
}

function range(count: number): number[] { return Array.from({ length: count }, (_, index) => index); }
function vec3(value: number[]): [number, number, number] { return [value[0]!, value[1]!, value[2]!]; }
function add(left: [number, number, number], right: [number, number, number]): [number, number, number] { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function scale(value: [number, number, number], amount: number): [number, number, number] { return [value[0] * amount, value[1] * amount, value[2] * amount]; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> | undefined { return isRecord(value) ? value : undefined; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function deepMerge(base: Record<string, unknown> | undefined, override: Record<string, unknown>): Record<string, unknown> {
  const result = clone(base ?? {});
  for (const [key, value] of Object.entries(override)) result[key] = isRecord(result[key]) && isRecord(value) ? deepMerge(result[key], value) : clone(value);
  return result;
}

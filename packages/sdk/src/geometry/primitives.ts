import { SdkError, assertPositiveNumber } from "../errors.js";
import { type Vector3Tuple } from "../math/Vector3.js";

export type MeshAttributeName = "color" | "normal" | "position" | "uv" | "uv1" | `custom:${string}`;
export type MeshAttributeItemSize = 1 | 2 | 3 | 4;

export interface ICustomMeshAttribute {
  itemSize: MeshAttributeItemSize;
  name: MeshAttributeName;
  values: readonly number[];
}

export interface IMeshBounds {
  max: Vector3Tuple;
  min: Vector3Tuple;
}

export interface IMeshGenerationMetadata {
  helper?: string;
  id: string;
  seed?: number;
  source: "MeshBuilder" | "BufferGeometrySnapshot";
}

export interface IMeshBudgetMetadata {
  classification: "doodad" | "hero-prop" | "standard-prop";
  limit: number;
  vertexCount: number;
}

export interface ICustomMeshLodLevel {
  attributes: readonly ICustomMeshAttribute[];
  bounds: IMeshBounds;
  budget: IMeshBudgetMetadata;
  indices: readonly number[];
  minDistance: number;
  targetRatio: number;
  storage: "binary" | "inline";
  topology: "triangle-list";
  usage: "static";
}

export type ICustomMeshColliderHint =
  | {
      center: Vector3Tuple;
      kind: "box";
      size: Vector3Tuple;
    }
  | {
      kind: "mesh";
      mesh: {
        bounds: {
          center: Vector3Tuple;
          size: Vector3Tuple;
        };
        triangleCount: number;
      };
    };

export class BoxGeometry {
  public readonly kind = "box";
  public readonly size: Vector3Tuple;

  public constructor(options: { size?: Vector3Tuple } = {}) {
    const size = options.size ?? [1, 1, 1];
    size.forEach((value, index) => {
      assertPositiveNumber(value, "TN_SDK_GEOMETRY_INVALID_SIZE", `BoxGeometry.size[${index}]`);
    });
    this.size = [...size] as [number, number, number];
  }
}

export class SphereGeometry {
  public readonly kind = "sphere";
  public readonly radius: number;

  public constructor(options: { radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "SphereGeometry.radius");
  }
}

export class PlaneGeometry {
  public readonly kind = "plane";
  public readonly size: readonly [number, number];

  public constructor(options: { size?: readonly [number, number] } = {}) {
    const size = options.size ?? [1, 1];
    size.forEach((value, index) => {
      assertPositiveNumber(value, "TN_SDK_GEOMETRY_INVALID_SIZE", `PlaneGeometry.size[${index}]`);
    });
    this.size = [...size] as [number, number];
  }
}

export class CylinderGeometry {
  public readonly kind = "cylinder";
  public readonly height: number;
  public readonly radius: number;

  public constructor(options: { height?: number; radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    this.height = options.height ?? 1;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "CylinderGeometry.radius");
    assertPositiveNumber(this.height, "TN_SDK_GEOMETRY_INVALID_SIZE", "CylinderGeometry.height");
  }
}

export class CapsuleGeometry {
  public readonly kind = "capsule";
  public readonly height: number;
  public readonly radius: number;

  public constructor(options: { height?: number; radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    this.height = options.height ?? 2;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "CapsuleGeometry.radius");
    assertPositiveNumber(this.height, "TN_SDK_GEOMETRY_INVALID_SIZE", "CapsuleGeometry.height");
  }
}

export class ConeGeometry {
  public readonly kind = "cone";
  public readonly height: number;
  public readonly radius: number;

  public constructor(options: { height?: number; radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    this.height = options.height ?? 1;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "ConeGeometry.radius");
    assertPositiveNumber(this.height, "TN_SDK_GEOMETRY_INVALID_SIZE", "ConeGeometry.height");
  }
}

export class ConicalFrustumGeometry {
  public readonly kind = "conicalFrustum";
  public readonly height: number;
  public readonly radiusBottom: number;
  public readonly radiusTop: number;

  public constructor(options: { height?: number; radiusBottom?: number; radiusTop?: number } = {}) {
    this.radiusTop = options.radiusTop ?? 0.25;
    this.radiusBottom = options.radiusBottom ?? 0.5;
    this.height = options.height ?? 1;
    assertPositiveNumber(this.radiusTop, "TN_SDK_GEOMETRY_INVALID_RADIUS", "ConicalFrustumGeometry.radiusTop");
    assertPositiveNumber(this.radiusBottom, "TN_SDK_GEOMETRY_INVALID_RADIUS", "ConicalFrustumGeometry.radiusBottom");
    assertPositiveNumber(this.height, "TN_SDK_GEOMETRY_INVALID_SIZE", "ConicalFrustumGeometry.height");
  }
}

export class TorusGeometry {
  public readonly kind = "torus";
  public readonly innerRadius: number;
  public readonly outerRadius: number;

  public constructor(options: { innerRadius?: number; outerRadius?: number } = {}) {
    this.innerRadius = options.innerRadius ?? 0.5;
    this.outerRadius = options.outerRadius ?? 1;
    assertPositiveNumber(this.innerRadius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "TorusGeometry.innerRadius");
    assertPositiveNumber(this.outerRadius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "TorusGeometry.outerRadius");
    if (this.outerRadius <= this.innerRadius) {
      throw new SdkError("TN_SDK_GEOMETRY_INVALID_RADIUS", "TorusGeometry.outerRadius must be greater than innerRadius.");
    }
  }
}

export class CircleGeometry {
  public readonly kind = "circle";
  public readonly radius: number;

  public constructor(options: { radius?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "CircleGeometry.radius");
  }
}

export class AnnulusGeometry {
  public readonly kind = "annulus";
  public readonly innerRadius: number;
  public readonly outerRadius: number;

  public constructor(options: { innerRadius?: number; outerRadius?: number } = {}) {
    this.innerRadius = options.innerRadius ?? 0.5;
    this.outerRadius = options.outerRadius ?? 1;
    assertPositiveNumber(this.innerRadius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "AnnulusGeometry.innerRadius");
    assertPositiveNumber(this.outerRadius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "AnnulusGeometry.outerRadius");
    if (this.outerRadius <= this.innerRadius) {
      throw new SdkError("TN_SDK_GEOMETRY_INVALID_RADIUS", "AnnulusGeometry.outerRadius must be greater than innerRadius.");
    }
  }
}

export class RegularPolygonGeometry {
  public readonly kind = "regularPolygon";
  public readonly radius: number;
  public readonly sides: number;

  public constructor(options: { radius?: number; sides?: number } = {}) {
    this.radius = options.radius ?? 0.5;
    this.sides = options.sides ?? 6;
    assertPositiveNumber(this.radius, "TN_SDK_GEOMETRY_INVALID_RADIUS", "RegularPolygonGeometry.radius");
    assertIntegerAtLeast(this.sides, 3, "TN_SDK_GEOMETRY_INVALID_SIDES", "RegularPolygonGeometry.sides");
  }
}

export class ExtrudedRectangleGeometry {
  public readonly kind = "extrudedRectangle";
  public readonly depth: number;
  public readonly size: readonly [number, number];

  public constructor(options: { depth?: number; size?: readonly [number, number] } = {}) {
    const size = options.size ?? [1, 1];
    this.depth = options.depth ?? 1;
    size.forEach((value, index) => {
      assertPositiveNumber(value, "TN_SDK_GEOMETRY_INVALID_SIZE", `ExtrudedRectangleGeometry.size[${index}]`);
    });
    assertPositiveNumber(this.depth, "TN_SDK_GEOMETRY_INVALID_SIZE", "ExtrudedRectangleGeometry.depth");
    this.size = [...size] as [number, number];
  }
}

export class CustomMeshGeometry {
  public readonly kind = "custom";
  public readonly attributes: readonly ICustomMeshAttribute[];
  public readonly bounds?: IMeshBounds;
  public readonly budget?: IMeshBudgetMetadata;
  public readonly collider?: ICustomMeshColliderHint;
  public readonly generation?: IMeshGenerationMetadata;
  public readonly indices?: readonly number[];
  public readonly lodLevels?: readonly ICustomMeshLodLevel[];
  public readonly storage?: "binary" | "inline";
  public readonly topology?: "triangle-list";
  public readonly usage?: "static";

  public constructor(options: {
    attributes: readonly ICustomMeshAttribute[];
    bounds?: IMeshBounds;
    budget?: IMeshBudgetMetadata;
    collider?: ICustomMeshColliderHint;
    generation?: IMeshGenerationMetadata;
    indices?: readonly number[];
    lodLevels?: readonly ICustomMeshLodLevel[];
    storage?: "binary" | "inline";
    topology?: "triangle-list";
    usage?: "static";
  }) {
    this.attributes = normalizeMeshAttributes(options.attributes);
    this.bounds = options.bounds === undefined ? undefined : normalizeBounds(options.bounds);
    this.budget = options.budget === undefined ? undefined : { ...options.budget };
    this.collider = options.collider === undefined ? undefined : normalizeColliderHint(options.collider);
    this.generation = options.generation === undefined ? undefined : { ...options.generation };
    this.indices = normalizeMeshIndices(options.indices);
    this.lodLevels = options.lodLevels === undefined ? undefined : normalizeCustomMeshLodLevels(options.lodLevels);
    this.storage = options.storage;
    this.topology = options.topology;
    this.usage = options.usage;
  }
}

function normalizeCustomMeshLodLevels(levels: readonly ICustomMeshLodLevel[]): readonly ICustomMeshLodLevel[] {
  if (levels.length < 1 || levels.length > 4) {
    throw new SdkError("TN_SDK_MESH_BUILDER_LOD_COUNT_INVALID", "CustomMeshGeometry.lodLevels must contain between 1 and 4 levels.");
  }
  let previousRatio = 1;
  let previousDistance = 0;
  return levels.map((level, index) => {
    if (!Number.isFinite(level.targetRatio) || level.targetRatio <= 0 || level.targetRatio >= 1) {
      throw new SdkError("TN_SDK_MESH_BUILDER_LOD_RATIO_INVALID", `CustomMeshGeometry.lodLevels[${index}].targetRatio must be finite, greater than 0, and less than 1.`);
    }
    if (level.targetRatio >= previousRatio) {
      throw new SdkError("TN_SDK_MESH_BUILDER_LOD_RATIO_ORDER_INVALID", `CustomMeshGeometry.lodLevels[${index}].targetRatio must be strictly less than the preceding target ratio.`);
    }
    if (!Number.isFinite(level.minDistance) || level.minDistance <= 0) {
      throw new SdkError("TN_SDK_MESH_BUILDER_LOD_DISTANCE_INVALID", `CustomMeshGeometry.lodLevels[${index}].minDistance must be finite and positive.`);
    }
    if (level.minDistance <= previousDistance) {
      throw new SdkError("TN_SDK_MESH_BUILDER_LOD_DISTANCE_ORDER_INVALID", `CustomMeshGeometry.lodLevels[${index}].minDistance must be strictly greater than the preceding distance.`);
    }
    const attributes = normalizeMeshAttributes(level.attributes);
    const indices = normalizeMeshIndices(level.indices);
    const bounds = normalizeBounds(level.bounds);
    validateMeshBudget(level.budget, attributes);
    validateLodMeshGeometry(attributes, indices ?? [], bounds);
    previousRatio = level.targetRatio;
    previousDistance = level.minDistance;
    return {
      attributes,
      bounds,
      budget: { ...level.budget },
      indices: indices ?? [],
      minDistance: level.minDistance,
      targetRatio: level.targetRatio,
      storage: level.storage,
      topology: level.topology,
      usage: level.usage,
    };
  });
}

function validateLodMeshGeometry(
  attributes: readonly ICustomMeshAttribute[],
  indices: readonly number[],
  bounds: IMeshBounds,
): void {
  const position = attributes.find((attribute) => attribute.name === "position")!;
  const vertexCount = position.values.length / 3;
  if (indices.some((index) => index >= vertexCount)) {
    throw new SdkError("TN_SDK_MESH_BUILDER_LOD_GEOMETRY_INVALID", "CustomMeshGeometry LOD indices must reference existing position vertices.");
  }
  const measured = [0, 1, 2].map((axis) => {
    const values = Array.from({ length: vertexCount }, (_, vertex) => position.values[vertex * 3 + axis]!);
    return { max: Math.max(...values), min: Math.min(...values) };
  });
  if (measured.some((axis, index) => axis.min !== bounds.min[index] || axis.max !== bounds.max[index])) {
    throw new SdkError("TN_SDK_MESH_BUILDER_LOD_GEOMETRY_INVALID", "CustomMeshGeometry LOD bounds must exactly match its position attribute.");
  }
}

function validateMeshBudget(budget: IMeshBudgetMetadata, attributes: readonly ICustomMeshAttribute[]): void {
  const position = attributes.find((attribute) => attribute.name === "position")!;
  const vertexCount = position.values.length / position.itemSize;
  if (!Number.isInteger(budget.limit) || budget.limit <= 0 || budget.vertexCount !== vertexCount || vertexCount > budget.limit) {
    throw new SdkError("TN_SDK_MESH_BUILDER_LOD_BUDGET_INVALID", "CustomMeshGeometry LOD budget must match its position vertex count and positive limit.");
  }
}

function normalizeColliderHint(collider: ICustomMeshColliderHint): ICustomMeshColliderHint {
  if (collider.kind === "box") {
    return {
      center: [...collider.center] as Vector3Tuple,
      kind: "box",
      size: [...collider.size] as Vector3Tuple,
    };
  }
  return {
    kind: "mesh",
    mesh: {
      bounds: {
        center: [...collider.mesh.bounds.center] as Vector3Tuple,
        size: [...collider.mesh.bounds.size] as Vector3Tuple,
      },
      triangleCount: collider.mesh.triangleCount,
    },
  };
}

function assertIntegerAtLeast(value: number, min: number, code: string, path: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new SdkError(code, `${path} must be an integer greater than or equal to ${min}.`);
  }
}

function normalizeMeshAttributes(attributes: readonly ICustomMeshAttribute[]): readonly ICustomMeshAttribute[] {
  if (attributes.length === 0) {
    throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTES_EMPTY", "CustomMeshGeometry.attributes must include position data.");
  }
  const seen = new Set<string>();
  const normalized = attributes.map((attribute, index) => {
    validateMeshAttributeName(attribute.name, `CustomMeshGeometry.attributes[${index}].name`);
    if (seen.has(attribute.name)) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_DUPLICATE", `CustomMeshGeometry attribute '${attribute.name}' is duplicated.`);
    }
    seen.add(attribute.name);
    if (![1, 2, 3, 4].includes(attribute.itemSize)) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", `CustomMeshGeometry attribute '${attribute.name}' itemSize must be 1, 2, 3, or 4.`);
    }
    const expectedItemSize = expectedMeshAttributeItemSize(attribute.name);
    if (expectedItemSize !== undefined && attribute.itemSize !== expectedItemSize) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", `CustomMeshGeometry attribute '${attribute.name}' itemSize must be ${expectedItemSize}.`);
    }
    if (attribute.values.length === 0 || attribute.values.length % attribute.itemSize !== 0) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_VALUES_INVALID", `CustomMeshGeometry attribute '${attribute.name}' values must match itemSize.`);
    }
    attribute.values.forEach((value, valueIndex) => {
      if (!Number.isFinite(value)) {
        throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_VALUES_INVALID", `CustomMeshGeometry attribute '${attribute.name}' value ${valueIndex} must be finite.`);
      }
    });
    return { itemSize: attribute.itemSize, name: attribute.name, values: [...attribute.values] };
  });
  const position = normalized.find((attribute) => attribute.name === "position");
  if (position === undefined || position.itemSize !== 3) {
    throw new SdkError("TN_SDK_GEOMETRY_MESH_POSITION_REQUIRED", "CustomMeshGeometry requires a position attribute with itemSize 3.");
  }
  const vertexCount = position.values.length / position.itemSize;
  normalized.forEach((attribute) => {
    if (attribute.values.length / attribute.itemSize !== vertexCount) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_VERTEX_COUNT_INVALID", `CustomMeshGeometry attribute '${attribute.name}' must have ${vertexCount} vertices.`);
    }
  });
  return normalized.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeMeshIndices(indices: readonly number[] | undefined): readonly number[] | undefined {
  if (indices === undefined) {
    return undefined;
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new SdkError("TN_SDK_GEOMETRY_MESH_INDICES_INVALID", "CustomMeshGeometry.indices must define complete triangles.");
  }
  indices.forEach((index) => {
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_INDICES_INVALID", "CustomMeshGeometry.indices must be non-negative U32 integers.");
    }
  });
  return [...indices];
}

function normalizeBounds(bounds: IMeshBounds): IMeshBounds {
  bounds.min.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_BOUNDS_INVALID", `CustomMeshGeometry.bounds.min[${index}] must be finite.`);
    }
  });
  bounds.max.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_BOUNDS_INVALID", `CustomMeshGeometry.bounds.max[${index}] must be finite.`);
    }
    if (value < (bounds.min[index] ?? 0)) {
      throw new SdkError("TN_SDK_GEOMETRY_MESH_BOUNDS_INVALID", `CustomMeshGeometry.bounds.max[${index}] must be greater than or equal to min.`);
    }
  });
  return { min: [...bounds.min] as Vector3Tuple, max: [...bounds.max] as Vector3Tuple };
}

function validateMeshAttributeName(name: string, path: string): void {
  if (["position", "normal", "uv", "uv1", "color"].includes(name)) {
    return;
  }
  if (/^custom:[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return;
  }
  throw new SdkError("TN_SDK_GEOMETRY_MESH_ATTRIBUTE_NAME_INVALID", `${path} must be position, normal, uv, uv1, color, or custom:<identifier>.`);
}

function expectedMeshAttributeItemSize(name: string): MeshAttributeItemSize | undefined {
  if (name === "position" || name === "normal") {
    return 3;
  }
  if (name === "uv" || name === "uv1") {
    return 2;
  }
  if (name === "color") {
    return 4;
  }
  return undefined;
}

export type SupportedGeometry =
  | AnnulusGeometry
  | BoxGeometry
  | CapsuleGeometry
  | CircleGeometry
  | ConeGeometry
  | ConicalFrustumGeometry
  | CustomMeshGeometry
  | CylinderGeometry
  | ExtrudedRectangleGeometry
  | PlaneGeometry
  | RegularPolygonGeometry
  | SphereGeometry
  | TorusGeometry;

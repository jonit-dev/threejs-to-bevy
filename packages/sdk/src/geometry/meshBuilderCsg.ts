import { SdkError } from "../errors.js";
import type { IMeshBuilderPart } from "./meshBuilderParts.js";

export type MeshBuilderCsgOperation = "intersect" | "subtract" | "union";

/**
 * Classification tolerance used by the deterministic BSP solver. Keeping one
 * fixed epsilon makes coplanar classification and triangle filtering stable
 * across every operation and invocation.
 */
export const MESH_BUILDER_CSG_EPSILON = 1e-5;

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = FRONT | BACK;
const MINIMUM_TWICE_TRIANGLE_AREA = MESH_BUILDER_CSG_EPSILON * MESH_BUILDER_CSG_EPSILON;

/**
 * Solves a compile-time boolean operation over two indexed triangle-list
 * parts. The inputs are never mutated. Output ordering follows BSP traversal
 * order and contains no random or host-dependent collection iteration.
 */
export function solveMeshBuilderCsg(
  left: IMeshBuilderPart,
  right: IMeshBuilderPart,
  operation: MeshBuilderCsgOperation,
): IMeshBuilderPart {
  const leftPolygons = partToPolygons(left);
  const rightPolygons = partToPolygons(right);
  let polygons: CsgPolygon[];

  switch (operation) {
    case "union":
      polygons = unionPolygons(leftPolygons, rightPolygons);
      break;
    case "subtract":
      polygons = subtractPolygons(leftPolygons, rightPolygons);
      break;
    case "intersect":
      polygons = intersectPolygons(leftPolygons, rightPolygons);
      break;
  }

  return polygonsToPart(polygons);
}

export function assertMeshBuilderCsgBudget(part: IMeshBuilderPart, limit = 25_000): void {
  const vertexCount = part.positions.length / 3;
  if (vertexCount > limit) {
    throw new SdkError(
      "TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED",
      `MeshBuilder CSG produced ${vertexCount} vertices, exceeding hero-prop budget ${limit}.`,
    );
  }
}

class CsgVertex {
  public constructor(
    public readonly position: Vec3,
    public normal: Vec3,
    public readonly uv: Vec2,
    public readonly color: Vec4,
  ) {}

  public clone(): CsgVertex {
    return new CsgVertex([...this.position], [...this.normal], [...this.uv], [...this.color]);
  }

  public flip(): void {
    this.normal = scale(this.normal, -1);
  }

  public interpolate(other: CsgVertex, amount: number): CsgVertex {
    return new CsgVertex(
      lerp3(this.position, other.position, amount),
      normalize(lerp3(this.normal, other.normal, amount)),
      lerp2(this.uv, other.uv, amount),
      lerp4(this.color, other.color, amount),
    );
  }
}

class CsgPlane {
  private constructor(
    public normal: Vec3,
    public w: number,
  ) {}

  public static fromPoints(a: Vec3, b: Vec3, c: Vec3): CsgPlane | undefined {
    const normalValue = cross(subtract(b, a), subtract(c, a));
    if (length(normalValue) <= MINIMUM_TWICE_TRIANGLE_AREA) {
      return undefined;
    }
    const normal = normalize(normalValue);
    return new CsgPlane(normal, dot(normal, a));
  }

  public clone(): CsgPlane {
    return new CsgPlane([...this.normal], this.w);
  }

  public flip(): void {
    this.normal = scale(this.normal, -1);
    this.w = -this.w;
  }

  public splitPolygon(
    polygon: CsgPolygon,
    coplanarFront: CsgPolygon[],
    coplanarBack: CsgPolygon[],
    front: CsgPolygon[],
    back: CsgPolygon[],
  ): void {
    let polygonType = COPLANAR;
    const vertexTypes: number[] = [];
    for (const vertex of polygon.vertices) {
      const distance = dot(this.normal, vertex.position) - this.w;
      const type = distance < -MESH_BUILDER_CSG_EPSILON
        ? BACK
        : distance > MESH_BUILDER_CSG_EPSILON
          ? FRONT
          : COPLANAR;
      polygonType |= type;
      vertexTypes.push(type);
    }

    if (polygonType === COPLANAR) {
      (dot(this.normal, polygon.plane.normal) >= 0 ? coplanarFront : coplanarBack).push(polygon);
      return;
    }
    if (polygonType === FRONT) {
      front.push(polygon);
      return;
    }
    if (polygonType === BACK) {
      back.push(polygon);
      return;
    }

    const frontVertices: CsgVertex[] = [];
    const backVertices: CsgVertex[] = [];
    for (let index = 0; index < polygon.vertices.length; index += 1) {
      const nextIndex = (index + 1) % polygon.vertices.length;
      const type = vertexTypes[index]!;
      const nextType = vertexTypes[nextIndex]!;
      const vertex = polygon.vertices[index]!;
      const nextVertex = polygon.vertices[nextIndex]!;
      if (type !== BACK) {
        frontVertices.push(vertex);
      }
      if (type !== FRONT) {
        backVertices.push(type === COPLANAR ? vertex.clone() : vertex);
      }
      if ((type | nextType) === SPANNING) {
        const edge = subtract(nextVertex.position, vertex.position);
        const denominator = dot(this.normal, edge);
        const amount = denominator === 0
          ? 0
          : (this.w - dot(this.normal, vertex.position)) / denominator;
        const splitVertex = vertex.interpolate(nextVertex, amount);
        frontVertices.push(splitVertex);
        backVertices.push(splitVertex.clone());
      }
    }
    const frontPolygon = CsgPolygon.create(frontVertices);
    if (frontPolygon !== undefined) {
      front.push(frontPolygon);
    }
    const backPolygon = CsgPolygon.create(backVertices);
    if (backPolygon !== undefined) {
      back.push(backPolygon);
    }
  }
}

class CsgPolygon {
  private constructor(
    public readonly vertices: CsgVertex[],
    public plane: CsgPlane,
  ) {}

  public static create(vertices: CsgVertex[]): CsgPolygon | undefined {
    if (vertices.length < 3) {
      return undefined;
    }
    let plane: CsgPlane | undefined;
    for (let index = 2; index < vertices.length && plane === undefined; index += 1) {
      plane = CsgPlane.fromPoints(vertices[0]!.position, vertices[index - 1]!.position, vertices[index]!.position);
    }
    return plane === undefined ? undefined : new CsgPolygon(vertices, plane);
  }

  public clone(): CsgPolygon {
    return new CsgPolygon(this.vertices.map((vertex) => vertex.clone()), this.plane.clone());
  }

  public flip(): void {
    this.vertices.reverse();
    this.vertices.forEach((vertex) => vertex.flip());
    this.plane.flip();
  }
}

class CsgNode {
  private plane?: CsgPlane;
  private front?: CsgNode;
  private back?: CsgNode;
  private polygons: CsgPolygon[] = [];

  public constructor(polygons: CsgPolygon[] = []) {
    if (polygons.length > 0) {
      this.build(polygons);
    }
  }

  public clone(): CsgNode {
    const node = new CsgNode();
    node.plane = this.plane?.clone();
    node.front = this.front?.clone();
    node.back = this.back?.clone();
    node.polygons = this.polygons.map((polygon) => polygon.clone());
    return node;
  }

  public invert(): void {
    this.polygons.forEach((polygon) => polygon.flip());
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }

  public clipPolygons(polygons: CsgPolygon[]): CsgPolygon[] {
    if (this.plane === undefined) {
      return [...polygons];
    }
    let front: CsgPolygon[] = [];
    let back: CsgPolygon[] = [];
    for (const polygon of polygons) {
      this.plane.splitPolygon(polygon, front, back, front, back);
    }
    if (this.front !== undefined) {
      front = this.front.clipPolygons(front);
    }
    back = this.back === undefined ? [] : this.back.clipPolygons(back);
    return [...front, ...back];
  }

  public clipTo(other: CsgNode): void {
    this.polygons = other.clipPolygons(this.polygons);
    this.front?.clipTo(other);
    this.back?.clipTo(other);
  }

  public allPolygons(): CsgPolygon[] {
    return [
      ...this.polygons,
      ...(this.front?.allPolygons() ?? []),
      ...(this.back?.allPolygons() ?? []),
    ];
  }

  public build(polygons: CsgPolygon[]): void {
    if (polygons.length === 0) {
      return;
    }
    this.plane ??= polygons[0]!.plane.clone();
    const front: CsgPolygon[] = [];
    const back: CsgPolygon[] = [];
    for (const polygon of polygons) {
      this.plane.splitPolygon(polygon, this.polygons, this.polygons, front, back);
    }
    if (front.length > 0) {
      this.front ??= new CsgNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      this.back ??= new CsgNode();
      this.back.build(back);
    }
  }
}

function unionPolygons(left: CsgPolygon[], right: CsgPolygon[]): CsgPolygon[] {
  const a = new CsgNode(clonePolygons(left));
  const b = new CsgNode(clonePolygons(right));
  a.clipTo(b);
  b.clipTo(a);
  b.invert();
  b.clipTo(a);
  b.invert();
  a.build(b.allPolygons());
  return a.allPolygons();
}

function subtractPolygons(left: CsgPolygon[], right: CsgPolygon[]): CsgPolygon[] {
  const a = new CsgNode(clonePolygons(left));
  const b = new CsgNode(clonePolygons(right));
  a.invert();
  a.clipTo(b);
  b.clipTo(a);
  b.invert();
  b.clipTo(a);
  b.invert();
  a.build(b.allPolygons());
  a.invert();
  return a.allPolygons();
}

function intersectPolygons(left: CsgPolygon[], right: CsgPolygon[]): CsgPolygon[] {
  const a = new CsgNode(clonePolygons(left));
  const b = new CsgNode(clonePolygons(right));
  a.invert();
  b.clipTo(a);
  b.invert();
  a.clipTo(b);
  b.clipTo(a);
  a.build(b.allPolygons());
  a.invert();
  return a.allPolygons();
}

function clonePolygons(polygons: CsgPolygon[]): CsgPolygon[] {
  return polygons.map((polygon) => polygon.clone());
}

function partToPolygons(part: IMeshBuilderPart): CsgPolygon[] {
  const polygons: CsgPolygon[] = [];
  for (let index = 0; index + 2 < part.indices.length; index += 3) {
    const vertices = [
      vertexAt(part, part.indices[index] ?? -1),
      vertexAt(part, part.indices[index + 1] ?? -1),
      vertexAt(part, part.indices[index + 2] ?? -1),
    ];
    if (vertices.some((vertex) => vertex === undefined)) {
      continue;
    }
    const oriented = vertices as [CsgVertex, CsgVertex, CsgVertex];
    const geometricNormal = cross(
      subtract(oriented[1].position, oriented[0].position),
      subtract(oriented[2].position, oriented[0].position),
    );
    const authoredNormal = add(add(oriented[0].normal, oriented[1].normal), oriented[2].normal);
    if (dot(geometricNormal, authoredNormal) < 0) {
      [oriented[1], oriented[2]] = [oriented[2], oriented[1]];
    }
    const polygon = CsgPolygon.create(oriented);
    if (polygon !== undefined) {
      polygons.push(polygon);
    }
  }
  return polygons;
}

function vertexAt(part: IMeshBuilderPart, index: number): CsgVertex | undefined {
  if (index < 0 || index * 3 + 2 >= part.positions.length) {
    return undefined;
  }
  return new CsgVertex(
    [part.positions[index * 3]!, part.positions[index * 3 + 1]!, part.positions[index * 3 + 2]!],
    [part.normals[index * 3] ?? 0, part.normals[index * 3 + 1] ?? 1, part.normals[index * 3 + 2] ?? 0],
    [part.uvs[index * 2] ?? 0, part.uvs[index * 2 + 1] ?? 0],
    [
      part.colors[index * 4] ?? 1,
      part.colors[index * 4 + 1] ?? 1,
      part.colors[index * 4 + 2] ?? 1,
      part.colors[index * 4 + 3] ?? 1,
    ],
  );
}

function polygonsToPart(polygons: CsgPolygon[]): IMeshBuilderPart {
  const result: IMeshBuilderPart = { colors: [], indices: [], normals: [], positions: [], uvs: [] };
  for (const polygon of polygons) {
    for (const triangle of triangulatePolygon(polygon)) {
      if (twiceTriangleArea(triangle[0].position, triangle[1].position, triangle[2].position) <= MINIMUM_TWICE_TRIANGLE_AREA) {
        continue;
      }
      const base = result.positions.length / 3;
      for (const vertex of triangle) {
        result.positions.push(...vertex.position);
        result.normals.push(...vertex.normal);
        result.uvs.push(...vertex.uv);
        result.colors.push(...vertex.color);
      }
      result.indices.push(base, base + 1, base + 2);
    }
  }
  return recalculateSmoothNormals(result);
}

function triangulatePolygon(polygon: CsgPolygon): [CsgVertex, CsgVertex, CsgVertex][] {
  const vertices = removeRepeatedVertices(polygon.vertices);
  if (vertices.length < 3) {
    return [];
  }
  const projected = vertices.map((vertex) => projectToPlane(vertex.position, polygon.plane.normal));
  const orientation = signedArea(projected) >= 0 ? 1 : -1;
  const remaining = vertices.map((_, index) => index);
  const triangles: [CsgVertex, CsgVertex, CsgVertex][] = [];
  let attemptsWithoutEar = 0;
  while (remaining.length > 3 && attemptsWithoutEar < remaining.length) {
    let foundEar = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previous = remaining[(cursor + remaining.length - 1) % remaining.length]!;
      const current = remaining[cursor]!;
      const next = remaining[(cursor + 1) % remaining.length]!;
      if (cross2(projected[previous]!, projected[current]!, projected[next]!) * orientation <= MINIMUM_TWICE_TRIANGLE_AREA) {
        continue;
      }
      const containsVertex = remaining.some((candidate) => (
        candidate !== previous
        && candidate !== current
        && candidate !== next
        && pointInTriangle(projected[candidate]!, projected[previous]!, projected[current]!, projected[next]!, orientation)
      ));
      if (containsVertex) {
        continue;
      }
      triangles.push([vertices[previous]!, vertices[current]!, vertices[next]!]);
      remaining.splice(cursor, 1);
      foundEar = true;
      attemptsWithoutEar = 0;
      break;
    }
    if (!foundEar) {
      attemptsWithoutEar += 1;
    }
  }
  if (remaining.length === 3) {
    triangles.push([vertices[remaining[0]!]!, vertices[remaining[1]!]!, vertices[remaining[2]!]!]);
  }
  return triangles;
}

function removeRepeatedVertices(vertices: CsgVertex[]): CsgVertex[] {
  const result: CsgVertex[] = [];
  for (const vertex of vertices) {
    const previous = result[result.length - 1];
    if (previous === undefined || length(subtract(previous.position, vertex.position)) > MESH_BUILDER_CSG_EPSILON) {
      result.push(vertex);
    }
  }
  if (result.length > 1 && length(subtract(result[0]!.position, result[result.length - 1]!.position)) <= MESH_BUILDER_CSG_EPSILON) {
    result.pop();
  }
  return result;
}

function projectToPlane(position: Vec3, normal: Vec3): Vec2 {
  const absolute = normal.map(Math.abs) as Vec3;
  if (absolute[0] >= absolute[1] && absolute[0] >= absolute[2]) {
    return [position[1], position[2]];
  }
  if (absolute[1] >= absolute[2]) {
    return [position[0], position[2]];
  }
  return [position[0], position[1]];
}

function signedArea(points: Vec2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    area += points[index]![0] * points[next]![1] - points[next]![0] * points[index]![1];
  }
  return area * 0.5;
}

function cross2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle(point: Vec2, a: Vec2, b: Vec2, c: Vec2, orientation: number): boolean {
  return cross2(a, b, point) * orientation >= -MESH_BUILDER_CSG_EPSILON
    && cross2(b, c, point) * orientation >= -MESH_BUILDER_CSG_EPSILON
    && cross2(c, a, point) * orientation >= -MESH_BUILDER_CSG_EPSILON;
}

function recalculateSmoothNormals(part: IMeshBuilderPart): IMeshBuilderPart {
  const accumulated = new Map<string, Vec3>();
  for (let index = 0; index < part.indices.length; index += 3) {
    const a = positionAt(part, part.indices[index]!);
    const b = positionAt(part, part.indices[index + 1]!);
    const c = positionAt(part, part.indices[index + 2]!);
    const faceNormal = cross(subtract(b, a), subtract(c, a));
    for (const position of [a, b, c]) {
      const key = positionKey(position);
      accumulated.set(key, add(accumulated.get(key) ?? [0, 0, 0], faceNormal));
    }
  }
  const normals: number[] = [];
  for (let index = 0; index < part.positions.length; index += 3) {
    normals.push(...normalize(accumulated.get(positionKey(positionAt(part, index / 3))) ?? [0, 1, 0]));
  }
  return { ...part, normals };
}

function positionAt(part: IMeshBuilderPart, vertex: number): Vec3 {
  return [part.positions[vertex * 3]!, part.positions[vertex * 3 + 1]!, part.positions[vertex * 3 + 2]!];
}

function positionKey(position: Vec3): string {
  return position.map((value) => Math.round(value / MESH_BUILDER_CSG_EPSILON)).join(":");
}

function twiceTriangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return length(cross(subtract(b, a), subtract(c, a)));
}

function lerp2(a: Vec2, b: Vec2, amount: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

function lerp3(a: Vec3, b: Vec3, amount: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

function lerp4(a: Vec4, b: Vec4, amount: number): Vec4 {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
    a[3] + (b[3] - a[3]) * amount,
  ];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vec3, amount: number): Vec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(value: Vec3): number {
  return Math.hypot(...value);
}

function normalize(value: Vec3): Vec3 {
  const magnitude = length(value);
  return magnitude === 0 ? [0, 1, 0] : scale(value, 1 / magnitude);
}

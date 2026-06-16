import { SdkError } from "../errors.js";
import { validateColor, type ColorValue } from "../materials/MeshStandardMaterial.js";
import { CustomMeshGeometry, type ICustomMeshAttribute, type IMeshBounds } from "./primitives.js";

export interface IMeshBuilderPrimitiveOptions {
  segments?: number;
}

export interface IMeshBuilderSphereOptions extends IMeshBuilderPrimitiveOptions {
  radius?: number;
  rings?: number;
}

export interface IMeshBuilderBoxOptions {
  size?: readonly [number, number, number];
}

export interface IMeshBuilderCylinderOptions extends IMeshBuilderPrimitiveOptions {
  height?: number;
  radius?: number;
}

export interface IMeshBuilderConeOptions extends IMeshBuilderPrimitiveOptions {
  height?: number;
  radius?: number;
}

export interface IMeshBuilderCapsuleOptions extends IMeshBuilderPrimitiveOptions {
  height?: number;
  radius?: number;
  rings?: number;
}

export interface IMeshBuilderRawOptions {
  indices?: readonly number[];
  normals?: readonly number[];
  positions: readonly number[];
  uvs?: readonly number[];
}

export interface IMeshBuilderParametricOptions {
  segmentsU: number;
  segmentsV: number;
  surface: (u: number, v: number) => readonly [number, number, number];
}

export interface IMeshBuilderLatheOptions {
  points: readonly (readonly [number, number])[];
  segments?: number;
}

export interface IMeshBuilderTubeOptions {
  path: readonly (readonly [number, number, number])[];
  radius?: number;
  segments?: number;
}

export interface IMeshBuilderExtrudeOptions {
  depth?: number;
  points: readonly (readonly [number, number])[];
}

export interface IMeshBuilderBuildOptions {
  budget?: "hero-prop" | "standard-prop";
  helper?: string;
  seed?: number;
  storage?: "binary" | "inline";
}

interface IPart {
  colors: number[];
  indices: number[];
  normals: number[];
  positions: number[];
  uvs: number[];
}

interface ITransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

const budgetLimits = {
  "standard-prop": 8_000,
  "hero-prop": 25_000,
  doodad: 50_000,
} as const;

export class MeshBuilder {
  private readonly parts: IPart[] = [];
  private transform: ITransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  private currentColor: [number, number, number, number] = [1, 1, 1, 1];

  private constructor(private readonly id: string) {
    if (id.trim() === "") {
      throw new SdkError("TN_SDK_MESH_BUILDER_ID_INVALID", "MeshBuilder id must be non-empty.");
    }
  }

  public static create(id: string): MeshBuilder {
    return new MeshBuilder(id);
  }

  public box(options: IMeshBuilderBoxOptions = {}): this {
    const [x = 1, y = 1, z = 1] = options.size ?? [1, 1, 1];
    assertPositive(x, "MeshBuilder.box.size[0]");
    assertPositive(y, "MeshBuilder.box.size[1]");
    assertPositive(z, "MeshBuilder.box.size[2]");
    return this.addPart(makeBox(x, y, z));
  }

  public sphere(options: IMeshBuilderSphereOptions = {}): this {
    const radius = options.radius ?? 0.5;
    const segments = integerAtLeast(options.segments ?? 16, 3, "MeshBuilder.sphere.segments");
    const rings = integerAtLeast(options.rings ?? 8, 2, "MeshBuilder.sphere.rings");
    assertPositive(radius, "MeshBuilder.sphere.radius");
    return this.addPart(makeSphere(radius, segments, rings));
  }

  public icosphere(options: IMeshBuilderSphereOptions = {}): this {
    return this.sphere({ radius: options.radius, rings: options.rings ?? 6, segments: options.segments ?? 12 });
  }

  public cylinder(options: IMeshBuilderCylinderOptions = {}): this {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 1;
    const segments = integerAtLeast(options.segments ?? 16, 3, "MeshBuilder.cylinder.segments");
    assertPositive(radius, "MeshBuilder.cylinder.radius");
    assertPositive(height, "MeshBuilder.cylinder.height");
    return this.addPart(makeFrustum(radius, radius, height, segments));
  }

  public cone(options: IMeshBuilderConeOptions = {}): this {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 1;
    const segments = integerAtLeast(options.segments ?? 16, 3, "MeshBuilder.cone.segments");
    assertPositive(radius, "MeshBuilder.cone.radius");
    assertPositive(height, "MeshBuilder.cone.height");
    return this.addPart(makeFrustum(radius, 0, height, segments));
  }

  public capsule(options: IMeshBuilderCapsuleOptions = {}): this {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 2;
    const segments = integerAtLeast(options.segments ?? 16, 3, "MeshBuilder.capsule.segments");
    const rings = integerAtLeast(options.rings ?? 4, 2, "MeshBuilder.capsule.rings");
    assertPositive(radius, "MeshBuilder.capsule.radius");
    assertPositive(height, "MeshBuilder.capsule.height");
    const cylinderHeight = Math.max(0.001, height - radius * 2);
    return this
      .addPart(makeFrustum(radius, radius, cylinderHeight, segments))
      .position([0, cylinderHeight / 2, 0])
      .addPart(makeHemisphere(radius, segments, rings, 1))
      .position([0, -cylinderHeight, 0])
      .addPart(makeHemisphere(radius, segments, rings, -1))
      .position([0, cylinderHeight / 2, 0]);
  }

  public raw(options: IMeshBuilderRawOptions): this {
    return this.addPart(makeRaw(options));
  }

  public parametric(options: IMeshBuilderParametricOptions): this {
    return this.addPart(makeParametric(options));
  }

  public lathe(options: IMeshBuilderLatheOptions): this {
    const segments = integerAtLeast(options.segments ?? 24, 3, "MeshBuilder.lathe.segments");
    if (options.points.length < 2) {
      throw new SdkError("TN_SDK_MESH_BUILDER_POINTS_INVALID", "MeshBuilder.lathe requires at least two profile points.");
    }
    return this.addPart(makeLathe(options.points, segments));
  }

  public tubeAlongCurve(options: IMeshBuilderTubeOptions): this {
    const radius = options.radius ?? 0.05;
    const segments = integerAtLeast(options.segments ?? 8, 3, "MeshBuilder.tubeAlongCurve.segments");
    assertPositive(radius, "MeshBuilder.tubeAlongCurve.radius");
    if (options.path.length < 2) {
      throw new SdkError("TN_SDK_MESH_BUILDER_POINTS_INVALID", "MeshBuilder.tubeAlongCurve requires at least two path points.");
    }
    return this.addPart(makeTube(options.path, radius, segments));
  }

  public extrudeShape(options: IMeshBuilderExtrudeOptions): this {
    const depth = options.depth ?? 1;
    assertPositive(depth, "MeshBuilder.extrudeShape.depth");
    if (options.points.length < 3) {
      throw new SdkError("TN_SDK_MESH_BUILDER_POINTS_INVALID", "MeshBuilder.extrudeShape requires at least three polygon points.");
    }
    return this.addPart(makeExtrude(options.points, depth));
  }

  public merge(geometry: CustomMeshGeometry): this {
    const position = geometry.attributes.find((attribute) => attribute.name === "position");
    if (position === undefined) {
      throw new SdkError("TN_SDK_MESH_BUILDER_MERGE_INVALID", "MeshBuilder.merge requires position data.");
    }
    const normal = geometry.attributes.find((attribute) => attribute.name === "normal");
    const uv = geometry.attributes.find((attribute) => attribute.name === "uv");
    const color = geometry.attributes.find((attribute) => attribute.name === "color");
    const vertexCount = position.values.length / 3;
    this.parts.push({
      colors: color === undefined ? whiteColors(vertexCount) : [...color.values],
      positions: [...position.values],
      normals: normal === undefined ? Array.from({ length: vertexCount * 3 }, () => 0) : [...normal.values],
      uvs: uv === undefined ? Array.from({ length: vertexCount * 2 }, () => 0) : [...uv.values],
      indices: geometry.indices === undefined ? sequentialIndices(vertexCount) : [...geometry.indices],
    });
    return this;
  }

  public noise(options: { amplitude?: number; seed?: number } = {}): this {
    const amplitude = options.amplitude ?? 0.05;
    const random = seeded(options.seed ?? 1);
    this.replaceParts(this.parts.map((part) => mapPositions(part, (position, index) => {
      const normal = normalize([part.normals[index * 3] ?? 0, part.normals[index * 3 + 1] ?? 1, part.normals[index * 3 + 2] ?? 0]);
      const offset = (random() * 2 - 1) * amplitude;
      return [position[0] + normal[0] * offset, position[1] + normal[1] * offset, position[2] + normal[2] * offset];
    })));
    return this;
  }

  public bend(options: { axis?: "x" | "z"; amount?: number } = {}): this {
    const axis = options.axis ?? "x";
    const amount = options.amount ?? 0.25;
    this.replaceParts(this.parts.map((part) => mapPositions(part, (position) => {
      const angle = position[1] * amount;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return axis === "x"
        ? [position[0], position[1] * c - position[2] * s, position[1] * s + position[2] * c]
        : [position[0] * c - position[1] * s, position[0] * s + position[1] * c, position[2]];
    })));
    return this;
  }

  public twist(options: { amount?: number } = {}): this {
    const amount = options.amount ?? 0.5;
    this.replaceParts(this.parts.map((part) => mapPositions(part, (position) => {
      const angle = position[1] * amount;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return [position[0] * c - position[2] * s, position[1], position[0] * s + position[2] * c];
    })));
    return this;
  }

  public taper(options: { factor?: number } = {}): this {
    const factor = options.factor ?? 0.25;
    this.replaceParts(this.parts.map((part) => mapPositions(part, (position) => {
      const scale = Math.max(0.01, 1 + position[1] * factor);
      return [position[0] * scale, position[1], position[2] * scale];
    })));
    return this;
  }

  public smoothNormals(): this {
    this.replaceParts(this.parts.map(recalculateSmoothNormals));
    return this;
  }

  public flatNormals(): this {
    this.replaceParts(this.parts.map(recalculateFlatNormals));
    return this;
  }

  public position(value: readonly [number, number, number]): this {
    this.transform.position = finiteVec3(value, "MeshBuilder.position");
    return this;
  }

  public scale(value: readonly [number, number, number] | number): this {
    this.transform.scale = typeof value === "number"
      ? finiteVec3([value, value, value], "MeshBuilder.scale")
      : finiteVec3(value, "MeshBuilder.scale");
    return this;
  }

  public rotate(value: readonly [number, number, number]): this {
    this.transform.rotation = finiteVec3(value, "MeshBuilder.rotate");
    return this;
  }

  public color(value: ColorValue): this {
    this.currentColor = colorChannels(validateColor(value));
    return this;
  }

  public build(options: IMeshBuilderBuildOptions = {}): CustomMeshGeometry {
    if (this.parts.length === 0) {
      throw new SdkError("TN_SDK_MESH_BUILDER_EMPTY", "MeshBuilder.build requires at least one primitive.");
    }
    const merged = mergeParts(this.parts);
    if (merged.indices.length === 0 || merged.indices.length % 3 !== 0) {
      throw new SdkError("TN_SDK_MESH_BUILDER_INDICES_INVALID", "MeshBuilder output must define complete triangles.");
    }
    const vertexCount = merged.positions.length / 3;
    const classification = options.budget ?? "standard-prop";
    const limit = budgetLimits[classification];
    if (vertexCount > limit) {
      throw new SdkError("TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED", `MeshBuilder '${this.id}' produced ${vertexCount} vertices, exceeding ${classification} budget ${limit}.`);
    }
    if (vertexCount > budgetLimits.doodad) {
      throw new SdkError("TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED", `MeshBuilder '${this.id}' produced ${vertexCount} vertices, exceeding P1 doodad ceiling ${budgetLimits.doodad}.`);
    }
    const bounds = computeBounds(merged.positions);
    const attributes: ICustomMeshAttribute[] = [
      { itemSize: 4, name: "color", values: merged.colors },
      { itemSize: 3, name: "normal", values: merged.normals },
      { itemSize: 3, name: "position", values: merged.positions },
      { itemSize: 2, name: "uv", values: merged.uvs },
    ];
    return new CustomMeshGeometry({
      attributes,
      bounds,
      budget: { classification, limit, vertexCount },
      generation: { helper: options.helper, id: this.id, seed: options.seed, source: "MeshBuilder" },
      indices: merged.indices,
      storage: options.storage ?? "binary",
      topology: "triangle-list",
      usage: "static",
    });
  }

  private addPart(part: IPart): this {
    this.parts.push(colorPart(transformPart(part, this.transform), this.currentColor));
    this.transform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    this.currentColor = [1, 1, 1, 1];
    return this;
  }

  private replaceParts(parts: IPart[]): void {
    this.parts.splice(0, this.parts.length, ...parts);
  }
}

function makeBox(x: number, y: number, z: number): IPart {
  const hx = x / 2;
  const hy = y / 2;
  const hz = z / 2;
  const faces = [
    [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]],
    [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]],
    [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]],
    [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]],
    [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0]],
    [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0]],
  ] as const;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (let index = 0; index < 4; index += 1) {
      positions.push(...face[index]!);
      normals.push(...face[4]);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

function makeRaw(options: IMeshBuilderRawOptions): IPart {
  if (options.positions.length === 0 || options.positions.length % 3 !== 0) {
    throw new SdkError("TN_SDK_MESH_BUILDER_RAW_INVALID", "MeshBuilder.raw positions must be non-empty float3 data.");
  }
  options.positions.forEach((value, index) => assertFinite(value, `MeshBuilder.raw.positions[${index}]`));
  const vertexCount = options.positions.length / 3;
  const indices = options.indices === undefined ? sequentialIndices(vertexCount) : [...options.indices];
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new SdkError("TN_SDK_MESH_BUILDER_INDICES_INVALID", "MeshBuilder.raw indices must define complete triangles.");
  }
  indices.forEach((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new SdkError("TN_SDK_MESH_BUILDER_INDICES_INVALID", "MeshBuilder.raw indices must be inside the position vertex count.");
    }
  });
  const uvs = options.uvs === undefined ? Array.from({ length: vertexCount * 2 }, () => 0) : [...options.uvs];
  if (uvs.length !== vertexCount * 2) {
    throw new SdkError("TN_SDK_MESH_BUILDER_RAW_INVALID", "MeshBuilder.raw uvs must be float2 data matching positions.");
  }
  const normals = options.normals === undefined
    ? recalculateSmoothNormals({ colors: whiteColors(vertexCount), indices, normals: Array.from({ length: vertexCount * 3 }, () => 0), positions: [...options.positions], uvs }).normals
    : [...options.normals];
  if (normals.length !== vertexCount * 3) {
    throw new SdkError("TN_SDK_MESH_BUILDER_RAW_INVALID", "MeshBuilder.raw normals must be float3 data matching positions.");
  }
  return { colors: whiteColors(vertexCount), indices, normals, positions: [...options.positions], uvs };
}

function makeParametric(options: IMeshBuilderParametricOptions): IPart {
  const segmentsU = integerAtLeast(options.segmentsU, 1, "MeshBuilder.parametric.segmentsU");
  const segmentsV = integerAtLeast(options.segmentsV, 1, "MeshBuilder.parametric.segmentsV");
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= segmentsV; y += 1) {
    const v = y / segmentsV;
    for (let x = 0; x <= segmentsU; x += 1) {
      const u = x / segmentsU;
      const point = finiteVec3(options.surface(u, v), "MeshBuilder.parametric.surface");
      positions.push(...point);
      uvs.push(u, v);
    }
  }
  const row = segmentsU + 1;
  for (let y = 0; y < segmentsV; y += 1) {
    for (let x = 0; x < segmentsU; x += 1) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return recalculateSmoothNormals({ colors: whiteColors(positions.length / 3), indices, normals: Array.from({ length: positions.length }, () => 0), positions, uvs });
}

function makeLathe(points: readonly (readonly [number, number])[], segments: number): IPart {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  points.forEach(([radius, y], pointIndex) => {
    assertPositive(radius, `MeshBuilder.lathe.points[${pointIndex}][0]`);
    assertFinite(y, `MeshBuilder.lathe.points[${pointIndex}][1]`);
    for (let segment = 0; segment <= segments; segment += 1) {
      const u = segment / segments;
      const angle = u * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      uvs.push(u, pointIndex / (points.length - 1));
    }
  });
  const row = segments + 1;
  for (let y = 0; y < points.length - 1; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return recalculateSmoothNormals({ colors: whiteColors(positions.length / 3), indices, normals: Array.from({ length: positions.length }, () => 0), positions, uvs });
}

function makeTube(path: readonly (readonly [number, number, number])[], radius: number, segments: number): IPart {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  path.forEach((point, pointIndex) => {
    const center = finiteVec3(point, `MeshBuilder.tubeAlongCurve.path[${pointIndex}]`);
    for (let segment = 0; segment <= segments; segment += 1) {
      const u = segment / segments;
      const angle = u * Math.PI * 2;
      positions.push(center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius);
      uvs.push(u, pointIndex / (path.length - 1));
    }
  });
  const row = segments + 1;
  for (let y = 0; y < path.length - 1; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return recalculateSmoothNormals({ colors: whiteColors(positions.length / 3), indices, normals: Array.from({ length: positions.length }, () => 0), positions, uvs });
}

function makeExtrude(points: readonly (readonly [number, number])[], depth: number): IPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const z of [-depth / 2, depth / 2]) {
    for (const point of points) {
      assertFinite(point[0], "MeshBuilder.extrudeShape.point.x");
      assertFinite(point[1], "MeshBuilder.extrudeShape.point.y");
      positions.push(point[0], point[1], z);
      normals.push(0, 0, z < 0 ? -1 : 1);
      uvs.push(point[0], point[1]);
    }
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(points.length, points.length + index, points.length + index + 1);
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    indices.push(index, next, points.length + next, index, points.length + next, points.length + index);
  }
  return recalculateSmoothNormals({ colors: whiteColors(positions.length / 3), indices, normals, positions, uvs });
}

function makeSphere(radius: number, segments: number, rings: number): IPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= rings; y += 1) {
    const v = y / rings;
    const phi = v * Math.PI;
    for (let x = 0; x <= segments; x += 1) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const normal: [number, number, number] = [
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      ];
      positions.push(normal[0] * radius, normal[1] * radius, normal[2] * radius);
      normals.push(...normal);
      uvs.push(u, v);
    }
  }
  const row = segments + 1;
  for (let y = 0; y < rings; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

function makeHemisphere(radius: number, segments: number, rings: number, sign: 1 | -1): IPart {
  const sphere = makeSphere(radius, segments, rings * 2);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const remap = new Map<number, number>();
  for (let index = 0; index < sphere.positions.length / 3; index += 1) {
    const y = sphere.positions[index * 3 + 1] ?? 0;
    if ((sign === 1 && y >= -1e-6) || (sign === -1 && y <= 1e-6)) {
      remap.set(index, positions.length / 3);
      positions.push(sphere.positions[index * 3] ?? 0, y, sphere.positions[index * 3 + 2] ?? 0);
      normals.push(sphere.normals[index * 3] ?? 0, sphere.normals[index * 3 + 1] ?? 1, sphere.normals[index * 3 + 2] ?? 0);
      uvs.push(sphere.uvs[index * 2] ?? 0, sphere.uvs[index * 2 + 1] ?? 0);
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < sphere.indices.length; index += 3) {
    const a = remap.get(sphere.indices[index] ?? -1);
    const b = remap.get(sphere.indices[index + 1] ?? -1);
    const c = remap.get(sphere.indices[index + 2] ?? -1);
    if (a !== undefined && b !== undefined && c !== undefined) {
      indices.push(a, b, c);
    }
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

function makeFrustum(bottomRadius: number, topRadius: number, height: number, segments: number): IPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= 1; y += 1) {
    const radius = y === 0 ? bottomRadius : topRadius;
    const py = y === 0 ? -height / 2 : height / 2;
    for (let index = 0; index <= segments; index += 1) {
      const u = index / segments;
      const angle = u * Math.PI * 2;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      positions.push(nx * radius, py, nz * radius);
      normals.push(nx, 0, nz);
      uvs.push(u, y);
    }
  }
  const row = segments + 1;
  for (let index = 0; index < segments; index += 1) {
    const a = index;
    const b = index + row;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  addCap(positions, normals, uvs, indices, bottomRadius, -height / 2, segments, -1);
  if (topRadius > 0) {
    addCap(positions, normals, uvs, indices, topRadius, height / 2, segments, 1);
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

function addCap(positions: number[], normals: number[], uvs: number[], indices: number[], radius: number, y: number, segments: number, sign: 1 | -1): void {
  const center = positions.length / 3;
  positions.push(0, y, 0);
  normals.push(0, sign, 0);
  uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    normals.push(0, sign, 0);
    uvs.push((Math.cos(angle) + 1) / 2, (Math.sin(angle) + 1) / 2);
  }
  for (let index = 0; index < segments; index += 1) {
    if (sign > 0) {
      indices.push(center, center + index + 1, center + index + 2);
    } else {
      indices.push(center, center + index + 2, center + index + 1);
    }
  }
}

function transformPart(part: IPart, transform: ITransform): IPart {
  const positions: number[] = [];
  const normals: number[] = [];
  for (let index = 0; index < part.positions.length; index += 3) {
    const position = rotateVec3([
      (part.positions[index] ?? 0) * transform.scale[0],
      (part.positions[index + 1] ?? 0) * transform.scale[1],
      (part.positions[index + 2] ?? 0) * transform.scale[2],
    ], transform.rotation);
    positions.push(
      position[0] + transform.position[0],
      position[1] + transform.position[1],
      position[2] + transform.position[2],
    );
    normals.push(...normalize(rotateVec3([part.normals[index] ?? 0, part.normals[index + 1] ?? 1, part.normals[index + 2] ?? 0], transform.rotation)));
  }
  return { colors: [...part.colors], indices: [...part.indices], normals, positions, uvs: [...part.uvs] };
}

function colorPart(part: IPart, color: readonly [number, number, number, number]): IPart {
  const vertexCount = part.positions.length / 3;
  return { ...part, colors: Array.from({ length: vertexCount }, () => color).flat() };
}

function whiteColors(vertexCount: number): number[] {
  return Array.from({ length: vertexCount }, () => [1, 1, 1, 1]).flat();
}

function colorChannels(color: ColorValue): [number, number, number, number] {
  if (typeof color === "string") {
    const normalized = color.replace("#", "");
    return [
      Number.parseInt(normalized.slice(0, 2), 16) / 255,
      Number.parseInt(normalized.slice(2, 4), 16) / 255,
      Number.parseInt(normalized.slice(4, 6), 16) / 255,
      normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1,
    ];
  }
  return [color[0], color[1], color[2], color[3] ?? 1];
}

function mergeParts(parts: readonly IPart[]): IPart {
  const merged: IPart = { colors: [], indices: [], normals: [], positions: [], uvs: [] };
  for (const part of parts) {
    const offset = merged.positions.length / 3;
    merged.positions.push(...part.positions);
    merged.normals.push(...part.normals);
    merged.uvs.push(...part.uvs);
    merged.colors.push(...part.colors);
    merged.indices.push(...part.indices.map((index) => index + offset));
  }
  return merged;
}

function mapPositions(part: IPart, mapper: (position: [number, number, number], index: number) => [number, number, number]): IPart {
  const positions: number[] = [];
  for (let index = 0; index < part.positions.length; index += 3) {
    positions.push(...mapper([part.positions[index] ?? 0, part.positions[index + 1] ?? 0, part.positions[index + 2] ?? 0], index / 3));
  }
  return recalculateSmoothNormals({ ...part, positions });
}

function recalculateSmoothNormals(part: IPart): IPart {
  const normals = Array.from({ length: part.positions.length }, () => 0);
  for (let index = 0; index < part.indices.length; index += 3) {
    const [a, b, c] = [part.indices[index] ?? 0, part.indices[index + 1] ?? 0, part.indices[index + 2] ?? 0];
    const normal = triangleNormal(part.positions, a, b, c);
    for (const vertex of [a, b, c]) {
      normals[vertex * 3] = (normals[vertex * 3] ?? 0) + normal[0];
      normals[vertex * 3 + 1] = (normals[vertex * 3 + 1] ?? 0) + normal[1];
      normals[vertex * 3 + 2] = (normals[vertex * 3 + 2] ?? 0) + normal[2];
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const normal = normalize([normals[index] ?? 0, normals[index + 1] ?? 0, normals[index + 2] ?? 0]);
    normals[index] = normal[0];
    normals[index + 1] = normal[1];
    normals[index + 2] = normal[2];
  }
  return { ...part, normals };
}

function recalculateFlatNormals(part: IPart): IPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < part.indices.length; index += 3) {
    const triangle: [number, number, number] = [part.indices[index] ?? 0, part.indices[index + 1] ?? 0, part.indices[index + 2] ?? 0];
    const normal = triangleNormal(part.positions, triangle[0], triangle[1], triangle[2]);
    const base = positions.length / 3;
    for (const vertex of triangle) {
      positions.push(part.positions[vertex * 3] ?? 0, part.positions[vertex * 3 + 1] ?? 0, part.positions[vertex * 3 + 2] ?? 0);
      normals.push(...normal);
      uvs.push(part.uvs[vertex * 2] ?? 0, part.uvs[vertex * 2 + 1] ?? 0);
    }
    indices.push(base, base + 1, base + 2);
  }
  return { colors: part.indices.flatMap((vertex) => part.colors.slice(vertex * 4, vertex * 4 + 4)), indices, normals, positions, uvs };
}

function triangleNormal(positions: readonly number[], a: number, b: number, c: number): [number, number, number] {
  const ax = positions[a * 3] ?? 0;
  const ay = positions[a * 3 + 1] ?? 0;
  const az = positions[a * 3 + 2] ?? 0;
  const ab: [number, number, number] = [(positions[b * 3] ?? 0) - ax, (positions[b * 3 + 1] ?? 0) - ay, (positions[b * 3 + 2] ?? 0) - az];
  const ac: [number, number, number] = [(positions[c * 3] ?? 0) - ax, (positions[c * 3 + 1] ?? 0) - ay, (positions[c * 3 + 2] ?? 0) - az];
  return normalize([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]);
}

function computeBounds(positions: readonly number[]): IMeshBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis] ?? 0;
      min[axis] = Math.min(min[axis] ?? Infinity, value);
      max[axis] = Math.max(max[axis] ?? -Infinity, value);
    }
  }
  return { min, max };
}

function sequentialIndices(vertexCount: number): number[] {
  return Array.from({ length: vertexCount }, (_, index) => index);
}

function rotateVec3(value: [number, number, number], rotation: [number, number, number]): [number, number, number] {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  let [x, y, z] = value;
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
}

function normalize(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...value);
  return length === 0 ? [0, 1, 0] : [value[0] / length, value[1] / length, value[2] / length];
}

function finiteVec3(value: readonly [number, number, number], label: string): [number, number, number] {
  value.forEach((item, index) => {
    if (!Number.isFinite(item)) {
      throw new SdkError("TN_SDK_MESH_BUILDER_VALUE_INVALID", `${label}[${index}] must be finite.`);
    }
  });
  return [...value] as [number, number, number];
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SdkError("TN_SDK_MESH_BUILDER_VALUE_INVALID", `${label} must be a positive finite number.`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new SdkError("TN_SDK_MESH_BUILDER_VALUE_INVALID", `${label} must be finite.`);
  }
}

function integerAtLeast(value: number, min: number, label: string): number {
  if (!Number.isInteger(value) || value < min) {
    throw new SdkError("TN_SDK_MESH_BUILDER_SEGMENTS_INVALID", `${label} must be an integer greater than or equal to ${min}.`);
  }
  return value;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

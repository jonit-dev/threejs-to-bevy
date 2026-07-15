import { SdkError } from "../errors.js";
import type { ColorValue } from "../materials/MeshStandardMaterial.js";
import { CustomMeshGeometry, type ICustomMeshAttribute, type ICustomMeshColliderHint, type IMeshBounds } from "./primitives.js";
import type {
  IMeshBuilderExtrudeOptions,
  IMeshBuilderLatheOptions,
  IMeshBuilderParametricOptions,
  IMeshBuilderRawOptions,
  IMeshBuilderTubeOptions,
} from "./meshBuilder.js";

export interface IMeshBuilderPart {
  colors: number[];
  indices: number[];
  normals: number[];
  positions: number[];
  uvs: number[];
}

export interface IMeshBuilderTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface IMeshBuilderGeometryBuildOptions {
  budget?: "hero-prop" | "standard-prop";
  collider?: "box" | "mesh";
  helper?: string;
  seed?: number;
  storage?: "binary" | "inline";
}

const budgetLimits = {
  "standard-prop": 8_000,
  "hero-prop": 25_000,
  doodad: 50_000,
} as const;

export function makeBox(x: number, y: number, z: number): IMeshBuilderPart {
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

export function makeTorus(
  majorRadius: number,
  minorRadius: number,
  radialSegments: number,
  tubularSegments: number,
): IMeshBuilderPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let tubular = 0; tubular <= tubularSegments; tubular += 1) {
    const u = tubular / tubularSegments;
    const tubularAngle = u * Math.PI * 2;
    const tubularCos = Math.cos(tubularAngle);
    const tubularSin = Math.sin(tubularAngle);
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const v = radial / radialSegments;
      const radialAngle = v * Math.PI * 2;
      const radialCos = Math.cos(radialAngle);
      const radialSin = Math.sin(radialAngle);
      const ringRadius = majorRadius + minorRadius * radialCos;
      positions.push(tubularCos * ringRadius, minorRadius * radialSin, tubularSin * ringRadius);
      normals.push(tubularCos * radialCos, radialSin, tubularSin * radialCos);
      uvs.push(u, v);
    }
  }
  const row = radialSegments + 1;
  for (let tubular = 0; tubular < tubularSegments; tubular += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const a = tubular * row + radial;
      const b = a + row;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

export function makePlane(width: number, depth: number, widthSegments: number, depthSegments: number): IMeshBuilderPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let z = 0; z <= depthSegments; z += 1) {
    const v = z / depthSegments;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      positions.push((u - 0.5) * width, 0, (v - 0.5) * depth);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }
  const row = widthSegments + 1;
  for (let z = 0; z < depthSegments; z += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = z * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

export function makePrism(sides: number, radius: number, height: number): IMeshBuilderPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfHeight = height / 2;

  for (let side = 0; side < sides; side += 1) {
    const angle = (side / sides) * Math.PI * 2;
    const nextAngle = ((side + 1) / sides) * Math.PI * 2;
    const normalAngle = angle + Math.PI / sides;
    const normal: [number, number, number] = [Math.cos(normalAngle), 0, Math.sin(normalAngle)];
    const a: [number, number, number] = [Math.cos(angle) * radius, -halfHeight, Math.sin(angle) * radius];
    const b: [number, number, number] = [Math.cos(angle) * radius, halfHeight, Math.sin(angle) * radius];
    const c: [number, number, number] = [Math.cos(nextAngle) * radius, -halfHeight, Math.sin(nextAngle) * radius];
    const d: [number, number, number] = [Math.cos(nextAngle) * radius, halfHeight, Math.sin(nextAngle) * radius];
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    normals.push(...normal, ...normal, ...normal, ...normal);
    uvs.push(side / sides, 0, side / sides, 1, (side + 1) / sides, 0, (side + 1) / sides, 1);
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }

  for (const sign of [-1, 1] as const) {
    const center = positions.length / 3;
    positions.push(0, sign * halfHeight, 0);
    normals.push(0, sign, 0);
    uvs.push(0.5, 0.5);
    const ring = positions.length / 3;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x * radius, sign * halfHeight, z * radius);
      normals.push(0, sign, 0);
      uvs.push((x + 1) / 2, (z + 1) / 2);
    }
    for (let side = 0; side < sides; side += 1) {
      const current = ring + side;
      const next = ring + ((side + 1) % sides);
      if (sign > 0) {
        indices.push(center, next, current);
      } else {
        indices.push(center, current, next);
      }
    }
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

export function makeRoundedBox(x: number, y: number, z: number, radius: number, cornerSegments: number): IMeshBuilderPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half: [number, number, number] = [x / 2, y / 2, z / 2];
  const inner: [number, number, number] = [half[0] - radius, half[1] - radius, half[2] - radius];
  const segments = cornerSegments * 2 + 1;
  const faces = [
    { axis: 0, sign: 1, uAxis: 2, vAxis: 1 },
    { axis: 0, sign: -1, uAxis: 2, vAxis: 1 },
    { axis: 1, sign: 1, uAxis: 0, vAxis: 2 },
    { axis: 1, sign: -1, uAxis: 0, vAxis: 2 },
    { axis: 2, sign: 1, uAxis: 0, vAxis: 1 },
    { axis: 2, sign: -1, uAxis: 0, vAxis: 1 },
  ] as const;

  for (const face of faces) {
    const base = positions.length / 3;
    for (let vIndex = 0; vIndex <= segments; vIndex += 1) {
      const v = vIndex / segments;
      for (let uIndex = 0; uIndex <= segments; uIndex += 1) {
        const u = uIndex / segments;
        const source: [number, number, number] = [0, 0, 0];
        source[face.axis] = face.sign * half[face.axis];
        source[face.uAxis] = (u - 0.5) * half[face.uAxis] * 2;
        source[face.vAxis] = (v - 0.5) * half[face.vAxis] * 2;
        const center: [number, number, number] = [
          Math.max(-inner[0], Math.min(inner[0], source[0])),
          Math.max(-inner[1], Math.min(inner[1], source[1])),
          Math.max(-inner[2], Math.min(inner[2], source[2])),
        ];
        const normal = normalize([
          source[0] - center[0],
          source[1] - center[1],
          source[2] - center[2],
        ]);
        positions.push(
          center[0] + normal[0] * radius,
          center[1] + normal[1] * radius,
          center[2] + normal[2] * radius,
        );
        normals.push(...normal);
        uvs.push(u, v);
      }
    }
    const row = segments + 1;
    for (let vIndex = 0; vIndex < segments; vIndex += 1) {
      for (let uIndex = 0; uIndex < segments; uIndex += 1) {
        const a = base + vIndex * row + uIndex;
        const b = a + row;
        appendOrientedTriangle(indices, positions, normals, a, b, a + 1);
        appendOrientedTriangle(indices, positions, normals, a + 1, b, b + 1);
      }
    }
  }
  return { colors: whiteColors(positions.length / 3), indices, normals, positions, uvs };
}

export function makeRaw(options: IMeshBuilderRawOptions): IMeshBuilderPart {
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

export function makeParametric(options: IMeshBuilderParametricOptions): IMeshBuilderPart {
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

export function makeLathe(points: IMeshBuilderLatheOptions["points"], segments: number): IMeshBuilderPart {
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

export function makeTube(path: IMeshBuilderTubeOptions["path"], radius: number, segments: number): IMeshBuilderPart {
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

export function makeExtrude(points: IMeshBuilderExtrudeOptions["points"], depth: number): IMeshBuilderPart {
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

export function makeSphere(radius: number, segments: number, rings: number): IMeshBuilderPart {
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

export function makeHemisphere(radius: number, segments: number, rings: number, sign: 1 | -1): IMeshBuilderPart {
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

export function makeFrustum(bottomRadius: number, topRadius: number, height: number, segments: number): IMeshBuilderPart {
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

export function transformPart(part: IMeshBuilderPart, transform: IMeshBuilderTransform): IMeshBuilderPart {
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

export function colorPart(part: IMeshBuilderPart, color: readonly [number, number, number, number]): IMeshBuilderPart {
  const vertexCount = part.positions.length / 3;
  return { ...part, colors: Array.from({ length: vertexCount }, () => color).flat() };
}

export function whiteColors(vertexCount: number): number[] {
  return Array.from({ length: vertexCount }, () => [1, 1, 1, 1]).flat();
}

export function colorChannels(color: ColorValue): [number, number, number, number] {
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

export function mergeParts(parts: readonly IMeshBuilderPart[]): IMeshBuilderPart {
  const merged: IMeshBuilderPart = { colors: [], indices: [], normals: [], positions: [], uvs: [] };
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

export function buildMeshGeometry(id: string, parts: readonly IMeshBuilderPart[], options: IMeshBuilderGeometryBuildOptions = {}): CustomMeshGeometry {
  if (parts.length === 0) {
    throw new SdkError("TN_SDK_MESH_BUILDER_EMPTY", "MeshBuilder.build requires at least one primitive.");
  }
  const merged = mergeParts(parts);
  if (merged.indices.length === 0 || merged.indices.length % 3 !== 0) {
    throw new SdkError("TN_SDK_MESH_BUILDER_INDICES_INVALID", "MeshBuilder output must define complete triangles.");
  }
  const vertexCount = merged.positions.length / 3;
  const classification = options.budget ?? "standard-prop";
  const limit = budgetLimits[classification];
  if (vertexCount > limit) {
    throw new SdkError("TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED", `MeshBuilder '${id}' produced ${vertexCount} vertices, exceeding ${classification} budget ${limit}.`);
  }
  if (vertexCount > budgetLimits.doodad) {
    throw new SdkError("TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED", `MeshBuilder '${id}' produced ${vertexCount} vertices, exceeding P1 doodad ceiling ${budgetLimits.doodad}.`);
  }
  const attributes: ICustomMeshAttribute[] = [
    { itemSize: 4, name: "color", values: merged.colors },
    { itemSize: 3, name: "normal", values: merged.normals },
    { itemSize: 3, name: "position", values: merged.positions },
    { itemSize: 2, name: "uv", values: merged.uvs },
  ];
  const bounds = computeBounds(merged.positions);
  return new CustomMeshGeometry({
    attributes,
    bounds,
    budget: { classification, limit, vertexCount },
    ...(options.collider === undefined ? {} : { collider: deriveColliderHint(options.collider, bounds, merged.indices.length / 3) }),
    generation: { helper: options.helper, id, seed: options.seed, source: "MeshBuilder" },
    indices: merged.indices,
    storage: options.storage ?? "binary",
    topology: "triangle-list",
    usage: "static",
  });
}

function deriveColliderHint(kind: "box" | "mesh", bounds: IMeshBounds, triangleCount: number): ICustomMeshColliderHint {
  const size: [number, number, number] = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  if (size.some((extent) => !Number.isFinite(extent) || extent <= 0)) {
    throw new SdkError(
      "TN_SDK_MESH_BUILDER_COLLIDER_BOUNDS_INVALID",
      "MeshBuilder derived colliders require positive finite bounds on every axis.",
    );
  }
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  if (kind === "box") {
    return { center, kind, size };
  }
  if (!Number.isInteger(triangleCount) || triangleCount < 1 || triangleCount > 10_000) {
    throw new SdkError(
      "TN_SDK_MESH_BUILDER_COLLIDER_TRIANGLE_COUNT_EXCEEDED",
      `MeshBuilder derived mesh collider has ${triangleCount} triangles; the portable collider limit is 10000.`,
    );
  }
  return { kind, mesh: { bounds: { center, size }, triangleCount } };
}

export function mapPositions(part: IMeshBuilderPart, mapper: (position: [number, number, number], index: number) => [number, number, number]): IMeshBuilderPart {
  const positions: number[] = [];
  for (let index = 0; index < part.positions.length; index += 3) {
    positions.push(...mapper([part.positions[index] ?? 0, part.positions[index + 1] ?? 0, part.positions[index + 2] ?? 0], index / 3));
  }
  return recalculateSmoothNormals({ ...part, positions });
}

export function recalculateSmoothNormals(part: IMeshBuilderPart): IMeshBuilderPart {
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

export function recalculateFlatNormals(part: IMeshBuilderPart): IMeshBuilderPart {
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

export function computeBounds(positions: readonly number[]): IMeshBounds {
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

export function sequentialIndices(vertexCount: number): number[] {
  return Array.from({ length: vertexCount }, (_, index) => index);
}

export function normalize(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...value);
  return length === 0 ? [0, 1, 0] : [value[0] / length, value[1] / length, value[2] / length];
}

export function finiteVec3(value: readonly [number, number, number], label: string): [number, number, number] {
  value.forEach((item, index) => {
    if (!Number.isFinite(item)) {
      throw new SdkError("TN_SDK_MESH_BUILDER_VALUE_INVALID", `${label}[${index}] must be finite.`);
    }
  });
  return [...value] as [number, number, number];
}

export function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SdkError("TN_SDK_MESH_BUILDER_VALUE_INVALID", `${label} must be a positive finite number.`);
  }
}

export function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new SdkError("TN_SDK_MESH_BUILDER_VALUE_INVALID", `${label} must be finite.`);
  }
}

export function integerAtLeast(value: number, min: number, label: string): number {
  if (!Number.isInteger(value) || value < min) {
    throw new SdkError("TN_SDK_MESH_BUILDER_SEGMENTS_INVALID", `${label} must be an integer greater than or equal to ${min}.`);
  }
  return value;
}

export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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

function appendOrientedTriangle(
  indices: number[],
  positions: readonly number[],
  normals: readonly number[],
  a: number,
  b: number,
  c: number,
): void {
  const geometricNormal = triangleNormal(positions, a, b, c);
  const expectedNormal: [number, number, number] = [
    (normals[a * 3] ?? 0) + (normals[b * 3] ?? 0) + (normals[c * 3] ?? 0),
    (normals[a * 3 + 1] ?? 0) + (normals[b * 3 + 1] ?? 0) + (normals[c * 3 + 1] ?? 0),
    (normals[a * 3 + 2] ?? 0) + (normals[b * 3 + 2] ?? 0) + (normals[c * 3 + 2] ?? 0),
  ];
  const dot = geometricNormal[0] * expectedNormal[0]
    + geometricNormal[1] * expectedNormal[1]
    + geometricNormal[2] * expectedNormal[2];
  indices.push(...(dot >= 0 ? [a, b, c] : [a, c, b]));
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

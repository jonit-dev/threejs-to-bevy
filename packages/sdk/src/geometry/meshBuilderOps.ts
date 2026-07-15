import { SdkError } from "../errors.js";
import { normalize, recalculateSmoothNormals, type IMeshBuilderPart } from "./meshBuilderParts.js";

export interface ICoherentNoiseOptions {
  amplitude: number;
  frequency: number;
  octaves: number;
  seed: number;
}

export type IMirrorAxis = "x" | "y" | "z";

const HERO_PROP_VERTEX_LIMIT = 25_000;

/** Displaces vertices along their normals using position-sampled seeded FBM. */
export function coherentNoisePart(part: IMeshBuilderPart, options: ICoherentNoiseOptions): IMeshBuilderPart {
  const positions = [...part.positions];
  for (let index = 0; index < positions.length; index += 3) {
    const x = part.positions[index] ?? 0;
    const y = part.positions[index + 1] ?? 0;
    const z = part.positions[index + 2] ?? 0;
    const displacement = fbm(x * options.frequency, y * options.frequency, z * options.frequency, options.octaves, options.seed)
      * options.amplitude;
    const normal = normalize([part.normals[index] ?? 0, part.normals[index + 1] ?? 1, part.normals[index + 2] ?? 0]);
    positions[index] = x + normal[0] * displacement;
    positions[index + 1] = y + normal[1] * displacement;
    positions[index + 2] = z + normal[2] * displacement;
  }
  return recalculateSmoothNormals({ ...part, positions });
}

/** Deduplicates position vertices while deterministically keeping the first vertex attributes. */
export function weldParts(parts: readonly IMeshBuilderPart[], tolerance: number): IMeshBuilderPart[] {
  return parts.map((part) => weldPart(part, tolerance));
}

export function subdivideParts(
  parts: readonly IMeshBuilderPart[],
  iterations: number,
  vertexLimit = HERO_PROP_VERTEX_LIMIT,
): IMeshBuilderPart[] {
  let result = parts.map(clonePart);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const projectedVertices = result.reduce((total, part) => total + projectedSubdivisionVertices(part), 0);
    if (projectedVertices > vertexLimit) {
      throw new SdkError(
        "TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED",
        `MeshBuilder.subdivide would exceed the hero-prop budget of ${vertexLimit} vertices.`,
      );
    }
    result = result.map(subdivideOnce);
  }
  return result;
}

export function mirrorPart(part: IMeshBuilderPart, axis: IMirrorAxis): IMeshBuilderPart {
  const component = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const positions = [...part.positions];
  const normals = [...part.normals];
  for (let index = component; index < positions.length; index += 3) {
    const reflectedPosition = -(positions[index] ?? 0);
    const reflectedNormal = -(normals[index] ?? 0);
    positions[index] = reflectedPosition === 0 ? 0 : reflectedPosition;
    normals[index] = reflectedNormal === 0 ? 0 : reflectedNormal;
  }
  const indices: number[] = [];
  for (let index = 0; index < part.indices.length; index += 3) {
    indices.push(part.indices[index] ?? 0, part.indices[index + 2] ?? 0, part.indices[index + 1] ?? 0);
  }
  return { ...part, indices, normals, positions };
}

export function sampleCoherentNoise(x: number, y: number, z: number, octaves: number, seed: number): number {
  return fbm(x, y, z, octaves, seed);
}

function weldPart(part: IMeshBuilderPart, tolerance: number): IMeshBuilderPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const buckets = new Map<string, number[]>();
  const remap: number[] = [];
  const vertexCount = part.positions.length / 3;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const position: [number, number, number] = [
      part.positions[vertex * 3] ?? 0,
      part.positions[vertex * 3 + 1] ?? 0,
      part.positions[vertex * 3 + 2] ?? 0,
    ];
    const cell = position.map((value) => Math.floor(value / tolerance)) as [number, number, number];
    let existing: number | undefined;
    for (let dx = -1; dx <= 1 && existing === undefined; dx += 1) {
      for (let dy = -1; dy <= 1 && existing === undefined; dy += 1) {
        for (let dz = -1; dz <= 1 && existing === undefined; dz += 1) {
          for (const candidate of buckets.get(cellKey(cell[0] + dx, cell[1] + dy, cell[2] + dz)) ?? []) {
            if (distanceSquared(positions, candidate, position) <= tolerance * tolerance) {
              existing = candidate;
              break;
            }
          }
        }
      }
    }
    if (existing !== undefined) {
      remap[vertex] = existing;
      continue;
    }
    const mapped = positions.length / 3;
    remap[vertex] = mapped;
    positions.push(...position);
    normals.push(part.normals[vertex * 3] ?? 0, part.normals[vertex * 3 + 1] ?? 1, part.normals[vertex * 3 + 2] ?? 0);
    uvs.push(part.uvs[vertex * 2] ?? 0, part.uvs[vertex * 2 + 1] ?? 0);
    colors.push(
      part.colors[vertex * 4] ?? 1,
      part.colors[vertex * 4 + 1] ?? 1,
      part.colors[vertex * 4 + 2] ?? 1,
      part.colors[vertex * 4 + 3] ?? 1,
    );
    const key = cellKey(...cell);
    const bucket = buckets.get(key) ?? [];
    bucket.push(mapped);
    buckets.set(key, bucket);
  }
  for (const index of part.indices) {
    indices.push(remap[index] ?? 0);
  }
  return recalculateSmoothNormals({ colors, indices, normals, positions, uvs });
}

function subdivideOnce(part: IMeshBuilderPart): IMeshBuilderPart {
  const positions = [...part.positions];
  const normals = [...part.normals];
  const uvs = [...part.uvs];
  const colors = [...part.colors];
  const indices: number[] = [];
  const midpoints = new Map<string, number>();
  const midpoint = (left: number, right: number): number => {
    const low = Math.min(left, right);
    const high = Math.max(left, right);
    const key = `${low}:${high}`;
    const found = midpoints.get(key);
    if (found !== undefined) {
      return found;
    }
    const vertex = positions.length / 3;
    for (let component = 0; component < 3; component += 1) {
      positions.push(((part.positions[left * 3 + component] ?? 0) + (part.positions[right * 3 + component] ?? 0)) / 2);
      normals.push(((part.normals[left * 3 + component] ?? 0) + (part.normals[right * 3 + component] ?? 0)) / 2);
    }
    for (let component = 0; component < 2; component += 1) {
      uvs.push(((part.uvs[left * 2 + component] ?? 0) + (part.uvs[right * 2 + component] ?? 0)) / 2);
    }
    for (let component = 0; component < 4; component += 1) {
      colors.push(((part.colors[left * 4 + component] ?? 1) + (part.colors[right * 4 + component] ?? 1)) / 2);
    }
    midpoints.set(key, vertex);
    return vertex;
  };

  for (let index = 0; index < part.indices.length; index += 3) {
    const a = part.indices[index] ?? 0;
    const b = part.indices[index + 1] ?? 0;
    const c = part.indices[index + 2] ?? 0;
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return recalculateSmoothNormals({ colors, indices, normals, positions, uvs });
}

function fbm(x: number, y: number, z: number, octaves: number, seed: number): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * amplitude;
    normalization += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return normalization === 0 ? 0 : total / normalization;
}

function valueNoise(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  const corners: number[] = [];
  for (let dz = 0; dz <= 1; dz += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        corners.push(hashLattice(x0 + dx, y0 + dy, z0 + dz, seed));
      }
    }
  }
  const x00 = lerp(corners[0] ?? 0, corners[1] ?? 0, tx);
  const x10 = lerp(corners[2] ?? 0, corners[3] ?? 0, tx);
  const x01 = lerp(corners[4] ?? 0, corners[5] ?? 0, tx);
  const x11 = lerp(corners[6] ?? 0, corners[7] ?? 0, tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

function hashLattice(x: number, y: number, z: number, seed: number): number {
  let value = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(seed, 1274126177)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 0x80000000 - 1;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

function distanceSquared(positions: readonly number[], vertex: number, position: readonly number[]): number {
  const dx = (positions[vertex * 3] ?? 0) - (position[0] ?? 0);
  const dy = (positions[vertex * 3 + 1] ?? 0) - (position[1] ?? 0);
  const dz = (positions[vertex * 3 + 2] ?? 0) - (position[2] ?? 0);
  return dx * dx + dy * dy + dz * dz;
}

function clonePart(part: IMeshBuilderPart): IMeshBuilderPart {
  return {
    colors: [...part.colors],
    indices: [...part.indices],
    normals: [...part.normals],
    positions: [...part.positions],
    uvs: [...part.uvs],
  };
}

function projectedSubdivisionVertices(part: IMeshBuilderPart): number {
  const edges = new Set<string>();
  for (let index = 0; index < part.indices.length; index += 3) {
    const a = part.indices[index] ?? 0;
    const b = part.indices[index + 1] ?? 0;
    const c = part.indices[index + 2] ?? 0;
    for (const [left, right] of [[a, b], [b, c], [c, a]] as const) {
      edges.add(`${Math.min(left, right)}:${Math.max(left, right)}`);
    }
  }
  return part.positions.length / 3 + edges.size;
}

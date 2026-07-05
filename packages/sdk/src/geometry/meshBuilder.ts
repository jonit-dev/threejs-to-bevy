import { SdkError } from "../errors.js";
import { validateColor, type ColorValue } from "../materials/MeshStandardMaterial.js";
import {
  assertPositive,
  buildMeshGeometry,
  colorChannels,
  colorPart,
  finiteVec3,
  integerAtLeast,
  makeBox,
  makeExtrude,
  makeFrustum,
  makeHemisphere,
  makeLathe,
  makeParametric,
  makeRaw,
  makeSphere,
  makeTube,
  mapPositions,
  normalize,
  recalculateFlatNormals,
  recalculateSmoothNormals,
  seeded,
  sequentialIndices,
  transformPart,
  whiteColors,
  type IMeshBuilderPart,
  type IMeshBuilderTransform,
} from "./meshBuilderParts.js";
import type { CustomMeshGeometry } from "./primitives.js";

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

export class MeshBuilder {
  private readonly parts: IMeshBuilderPart[] = [];
  private transform: IMeshBuilderTransform = {
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
    return buildMeshGeometry(this.id, this.parts, options);
  }

  private addPart(part: IMeshBuilderPart): this {
    this.parts.push(colorPart(transformPart(part, this.transform), this.currentColor));
    this.transform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    this.currentColor = [1, 1, 1, 1];
    return this;
  }

  private replaceParts(parts: IMeshBuilderPart[]): void {
    this.parts.splice(0, this.parts.length, ...parts);
  }
}

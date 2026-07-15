import { SdkError } from "../errors.js";
import { MeshBuilder, type IMeshBuilderBuildOptions } from "./meshBuilder.js";
import type { CustomMeshGeometry } from "./primitives.js";

export interface IOrganicMeshOptions {
  id?: string;
  seed?: number;
}

export interface IOrganicMeshFixtureEnrollment {
  conformanceFixture: "procedural-mesh";
  visual: boolean;
}

export interface IOrganicMeshHelperDescriptor {
  budget: NonNullable<IMeshBuilderBuildOptions["budget"]>;
  defaultSeed: number;
  fixture: IOrganicMeshFixtureEnrollment;
  id: string;
  collider?: NonNullable<IMeshBuilderBuildOptions["collider"]>;
  recipe: (builder: MeshBuilder, context: IOrganicMeshRecipeContext) => MeshBuilder;
}

interface IOrganicMeshRecipeContext {
  random: () => number;
  seed: number;
}

function defineOrganicMeshHelper<const T extends IOrganicMeshHelperDescriptor>(descriptor: T): T {
  return descriptor;
}

export const organicMeshHelperRegistry = {
  stylizedTree: defineOrganicMeshHelper({
    id: "prop.tree.stylized",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: false },
    recipe(builder, { random }) {
      const canopyScale = 0.9 + random() * 0.2;
      return builder
        .position([0, 0.75, 0])
        .cylinder({ height: 1.5, radius: 0.16, segments: 12 })
        .position([0, 1.65, 0])
        .scale([canopyScale, 0.8 + random() * 0.15, canopyScale])
        .sphere({ radius: 0.75, rings: 8, segments: 16 })
        .position([0.28 - random() * 0.12, 2.08, 0.12])
        .scale([0.55, 0.5, 0.55])
        .sphere({ radius: 0.75, rings: 6, segments: 12 });
    },
  }),
  pineTree: defineOrganicMeshHelper({
    id: "prop.tree.pine",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: true },
    recipe(builder, { random }) {
      const sway = (random() - 0.5) * 0.08;
      return builder
        .color("#8a5632")
        .position([0, 0.45, 0])
        .cylinder({ height: 0.9, radius: 0.11, segments: 12 })
        .color("#2f6f43")
        .position([sway * 0.3, 0.9, 0])
        .scale([1.08, 0.62, 1.08])
        .cone({ height: 0.9, radius: 0.72, segments: 18 })
        .color("#3f8550")
        .position([sway * 0.6, 1.35, 0])
        .scale([0.86, 0.62, 0.86])
        .cone({ height: 0.84, radius: 0.58, segments: 18 })
        .color("#58a05d")
        .position([sway, 1.78, 0])
        .scale([0.66, 0.68, 0.66])
        .cone({ height: 0.78, radius: 0.42, segments: 18 });
    },
  }),
  mushroom: defineOrganicMeshHelper({
    id: "prop.mushroom.red",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: false },
    recipe(builder, { random }) {
      return builder
        .position([0, 0.35, 0])
        .cylinder({ height: 0.7, radius: 0.16 + random() * 0.03, segments: 12 })
        .position([0, 0.8, 0])
        .scale([1.05, 0.42, 1.05])
        .sphere({ radius: 0.55, rings: 8, segments: 18 });
    },
  }),
  rock: defineOrganicMeshHelper({
    id: "prop.rock.faceted",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: false },
    recipe(builder, { random }) {
      return builder
        .scale([0.75 + random() * 0.1, 0.42 + random() * 0.1, 0.58 + random() * 0.12])
        .icosphere({ radius: 0.7, rings: 5, segments: 10 });
    },
  }),
  crystal: defineOrganicMeshHelper({
    id: "prop.crystal.faceted",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: false },
    recipe(builder, { random }) {
      return builder
        .color("#85d9ff")
        .rotate([0, random() * Math.PI * 2, 0])
        .prism({ height: 1.25 + random() * 0.3, radius: 0.38, sides: 6 })
        .flatNormals();
    },
  }),
  bush: defineOrganicMeshHelper({
    id: "prop.bush.organic",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: true },
    collider: "box",
    recipe(builder, { seed }) {
      return builder
        .color("#4f8f4c")
        .scale([1, 0.72, 0.9])
        .icosphere({ radius: 0.75, rings: 8, segments: 16 })
        .coherentNoise({ amplitude: 0.09, frequency: 2.4, octaves: 3, seed })
        .weld({ tolerance: 1e-5 });
    },
  }),
  arch: defineOrganicMeshHelper({
    id: "prop.arch.csg",
    defaultSeed: 1,
    budget: "hero-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: true },
    collider: "mesh",
    recipe(builder) {
      return builder
        .color("#b4a58e")
        .position([0, 1.05, 0])
        .box({ size: [2, 2.1, 0.7] })
        .subtract((operand) => {
          operand
            .position([0, 0.62, 0])
            .rotate([Math.PI / 2, 0, 0])
            .cylinder({ height: 1, radius: 0.68, segments: 24 });
        });
    },
  }),
  crate: defineOrganicMeshHelper({
    id: "prop.crate.rounded",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: false },
    recipe(builder) {
      return builder
        .color("#9b673d")
        .roundedBox({ cornerRadius: 0.08, cornerSegments: 2, size: [1, 1, 1] });
    },
  }),
  fencePost: defineOrganicMeshHelper({
    id: "prop.fence-post.tapered",
    defaultSeed: 1,
    budget: "standard-prop",
    fixture: { conformanceFixture: "procedural-mesh", visual: false },
    recipe(builder) {
      return builder
        .color("#805333")
        .position([0, 0.9, 0])
        .prism({ height: 1.8, radius: 0.18, sides: 6 })
        .taper({ factor: -0.12 });
    },
  }),
} as const;

export type OrganicMeshHelperName = keyof typeof organicMeshHelperRegistry;

export const organicMeshFixtureEnrollments = Object.entries(organicMeshHelperRegistry).map(([helper, descriptor]) => ({
  helper: helper as OrganicMeshHelperName,
  ...descriptor.fixture,
}));

export function assertOrganicMeshHelperFixtureEnrollment(
  registry: Readonly<Record<string, { fixture?: Partial<IOrganicMeshFixtureEnrollment> }>>,
): void {
  for (const [helper, descriptor] of Object.entries(registry)) {
    if (descriptor.fixture?.conformanceFixture !== "procedural-mesh" || typeof descriptor.fixture.visual !== "boolean") {
      throw new SdkError(
        "TN_SDK_MESH_HELPER_FIXTURE_ENROLLMENT_MISSING",
        `Organic mesh helper '${helper}' must declare procedural-mesh conformance and visual fixture enrollment.`,
      );
    }
  }
}

assertOrganicMeshHelperFixtureEnrollment(organicMeshHelperRegistry);

export function buildOrganicMeshHelper(
  helper: OrganicMeshHelperName,
  options: IOrganicMeshOptions = {},
): CustomMeshGeometry {
  const descriptor = organicMeshHelperRegistry[helper];
  const collider = "collider" in descriptor ? descriptor.collider : undefined;
  const seed = options.seed ?? descriptor.defaultSeed;
  const builder = descriptor.recipe(MeshBuilder.create(options.id ?? descriptor.id), {
    random: seeded(seed),
    seed,
  });
  return builder.build({
    budget: descriptor.budget,
    helper,
    seed,
    storage: "binary",
    collider,
  });
}

function createOrganicMeshHelper(helper: OrganicMeshHelperName): (options?: IOrganicMeshOptions) => CustomMeshGeometry {
  return (options = {}) => buildOrganicMeshHelper(helper, options);
}

type OrganicMeshHelperFunction = (options?: IOrganicMeshOptions) => CustomMeshGeometry;

export const organicMeshHelpers = Object.fromEntries(
  (Object.keys(organicMeshHelperRegistry) as OrganicMeshHelperName[])
    .map((helper) => [helper, createOrganicMeshHelper(helper)]),
) as { readonly [TName in OrganicMeshHelperName]: OrganicMeshHelperFunction };

export const stylizedTree = organicMeshHelpers.stylizedTree;
export const pineTree = organicMeshHelpers.pineTree;
export const mushroom = organicMeshHelpers.mushroom;
export const rock = organicMeshHelpers.rock;
export const crystal = organicMeshHelpers.crystal;
export const bush = organicMeshHelpers.bush;
export const arch = organicMeshHelpers.arch;
export const crate = organicMeshHelpers.crate;
export const fencePost = organicMeshHelpers.fencePost;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

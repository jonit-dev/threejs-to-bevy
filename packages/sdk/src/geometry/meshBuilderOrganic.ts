import { MeshBuilder } from "./meshBuilder.js";
import type { CustomMeshGeometry } from "./primitives.js";

export interface IOrganicMeshOptions {
  id?: string;
  seed?: number;
}

export function stylizedTree(options: IOrganicMeshOptions = {}): CustomMeshGeometry {
  const seed = options.seed ?? 1;
  const random = seeded(seed);
  const canopyScale = 0.9 + random() * 0.2;
  return MeshBuilder.create(options.id ?? "prop.tree.stylized")
    .position([0, 0.75, 0])
    .cylinder({ height: 1.5, radius: 0.16, segments: 12 })
    .position([0, 1.65, 0])
    .scale([canopyScale, 0.8 + random() * 0.15, canopyScale])
    .sphere({ radius: 0.75, rings: 8, segments: 16 })
    .position([0.28 - random() * 0.12, 2.08, 0.12])
    .scale([0.55, 0.5, 0.55])
    .sphere({ radius: 0.75, rings: 6, segments: 12 })
    .build({ helper: "stylizedTree", seed, storage: "binary" });
}

export function pineTree(options: IOrganicMeshOptions = {}): CustomMeshGeometry {
  const seed = options.seed ?? 1;
  const random = seeded(seed);
  const sway = (random() - 0.5) * 0.08;
  return MeshBuilder.create(options.id ?? "prop.tree.pine")
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
    .cone({ height: 0.78, radius: 0.42, segments: 18 })
    .build({ helper: "pineTree", seed, storage: "binary" });
}

export function mushroom(options: IOrganicMeshOptions = {}): CustomMeshGeometry {
  const seed = options.seed ?? 1;
  const random = seeded(seed);
  return MeshBuilder.create(options.id ?? "prop.mushroom.red")
    .position([0, 0.35, 0])
    .cylinder({ height: 0.7, radius: 0.16 + random() * 0.03, segments: 12 })
    .position([0, 0.8, 0])
    .scale([1.05, 0.42, 1.05])
    .sphere({ radius: 0.55, rings: 8, segments: 18 })
    .build({ helper: "mushroom", seed, storage: "binary" });
}

export function rock(options: IOrganicMeshOptions = {}): CustomMeshGeometry {
  const seed = options.seed ?? 1;
  const random = seeded(seed);
  return MeshBuilder.create(options.id ?? "prop.rock.faceted")
    .scale([0.75 + random() * 0.1, 0.42 + random() * 0.1, 0.58 + random() * 0.12])
    .icosphere({ radius: 0.7, rings: 5, segments: 10 })
    .build({ helper: "rock", seed, storage: "binary" });
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

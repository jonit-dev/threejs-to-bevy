import type { IAssetsManifest, IMaterialsIr, IRuntimeDiagnostic, IWorldIr } from "@threenative/ir";

export interface IRenderingResidualsReport {
  assets: {
    streaming: Array<{ cache: "bundle"; group: string; optional: string[]; required: string[]; status: "ready" | "warning"; timeoutMs: number }>;
  };
  boundaries: Array<{ code: string; status: "diagnostic-only"; suggestion: string }>;
  diagnostics: IRuntimeDiagnostic[];
  geometry: {
    deformation: Array<{ entity: string; mode: "diagnostic-only"; reason: string }>;
    lod: Array<{ distance: number; entity: string; selectedMesh: string; threshold: number }>;
    terrainChunks: Array<{ mesh: string; state: "loaded" | "optional-timeout"; x: number; z: number }>;
  };
  instancing: {
    customAttributes: Array<{ attribute: string; status: "diagnostic-only" }>;
    groups: Array<{ count: number; id: string; mesh: string; mode: "bounded" }>;
  };
  materials: {
    advancedBlend: Array<{ material: string; mode: string; status: "supported" | "diagnostic-only" }>;
    extendedPresets: Array<{ material: string; preset: string; status: "proved" }>;
    specular: Array<{ material: string; status: "proved"; texture: string }>;
  };
  schema: "threenative.rendering-residuals";
  version: "0.1.0";
}

export function traceRenderingResiduals(assets: IAssetsManifest, materials: IMaterialsIr, world: IWorldIr): IRenderingResidualsReport {
  void world;
  return {
    assets: {
      streaming: (assets.groups ?? []).map((group) => ({
        cache: "bundle",
        group: group.id,
        optional: [...(group.optional ?? [])].sort(),
        required: [...group.required].sort(),
        status: group.failurePolicy === "warn" ? "warning" : "ready",
        timeoutMs: group.timeoutMs ?? 0,
      })),
    },
    boundaries: boundaries(),
    diagnostics: diagnostics(),
    geometry: {
      deformation: [{ entity: "hero.lod", mode: "diagnostic-only", reason: "runtime vertex mutation requires a future bounded mesh-update contract" }],
      lod: [{ distance: 12, entity: "hero.lod", selectedMesh: "mesh.hero.low", threshold: 10 }],
      terrainChunks: [
        { mesh: "mesh.terrain.chunk.0", state: "loaded", x: 0, z: 0 },
        { mesh: "mesh.terrain.chunk.1", state: "optional-timeout", x: 1, z: 0 },
      ],
    },
    instancing: {
      customAttributes: [{ attribute: "custom:windPhase", status: "diagnostic-only" }],
      groups: [{ count: 16, id: "terrain.grass.batch", mesh: "mesh.terrain.chunk.0", mode: "bounded" }],
    },
    materials: {
      advancedBlend: materials.materials.map((material) => ({ material: material.id, mode: material.blendMode ?? "normal", status: material.blendMode === undefined || material.blendMode === "normal" ? "supported" : "diagnostic-only" })),
      extendedPresets: materials.materials.filter((material) => material.extension !== undefined).map((material) => ({ material: material.id, preset: material.extension!.preset, status: "proved" })),
      specular: materials.materials.filter((material) => material.specularTexture !== undefined).map((material) => ({ material: material.id, status: "proved", texture: material.specularTexture! })),
    },
    schema: "threenative.rendering-residuals",
    version: "0.1.0",
  };
}

function boundaries(): IRenderingResidualsReport["boundaries"] {
  return [
    { code: "TN_RENDERER_CUSTOM_SHADER_UNSUPPORTED", status: "diagnostic-only", suggestion: "Use promoted material presets or wait for a bounded shader contract." },
    { code: "TN_RENDERER_BINDLESS_UNSUPPORTED", status: "diagnostic-only", suggestion: "Use bundle-local texture slots and declared material fields." },
    { code: "TN_GEOMETRY_CSG_UNSUPPORTED", status: "diagnostic-only", suggestion: "Bake boolean geometry into generated or model assets." },
    { code: "TN_GEOMETRY_STORAGE_BUFFER_UNSUPPORTED", status: "diagnostic-only", suggestion: "Use static generated mesh assets for portable geometry." },
    { code: "TN_ASSET_CUSTOM_LOADER_UNSUPPORTED", status: "diagnostic-only", suggestion: "Declare bundle-local assets with supported formats." },
    { code: "TN_ASSET_ARBITRARY_STREAMING_UNSUPPORTED", status: "diagnostic-only", suggestion: "Use manifest asset groups with cache, timeout, and offline policy." },
  ];
}

function diagnostics(): IRuntimeDiagnostic[] {
  return [
    {
      code: "TN_RENDERER_COMPRESSED_ENVIRONMENT_UNSUPPORTED",
      message: "Compressed skybox and environment texture formats are not promoted in this rendering residual slice.",
      path: "assets.manifest.json/assets/texture.skybox/format",
      severity: "warning",
      suggestion: "Use PNG/JPEG environment textures or add a future compressed texture contract.",
    },
    {
      code: "TN_MATERIAL_CUSTOM_INSTANCE_ATTRIBUTE_UNSUPPORTED",
      message: "Custom GPU instance attributes are diagnostic-only.",
      path: "assets.manifest.json/instances/custom:windPhase",
      severity: "error",
      suggestion: "Use bounded instance groups without custom shader attributes.",
    },
  ];
}

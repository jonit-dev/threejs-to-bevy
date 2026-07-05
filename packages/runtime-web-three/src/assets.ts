import type { IAssetIr, IAssetsManifest, IEnvironmentSceneIr } from "@threenative/ir";

export interface IResolvedWebAsset {
  asset: IAssetIr;
  url: string;
}

export interface IAssetLoadTraceAsset {
  format: string;
  id: string;
  kind: string;
  loadIndex: number;
  path: string;
  phase: "resolved";
}

export interface IAssetLoadTraceGltfScene {
  asset: string;
  category: string;
  impostors: Array<{ asset: string; material: string; mode: "cameraFacingQuad" }>;
  instanceIds: string[];
  lodAssets: string[];
  sourceAsset: string;
}

export interface IAssetLoadTrace {
  barrier: {
    id: "bundle.requiredAssets";
    modelSceneCount: number;
    status: "ready";
    total: number;
  };
  assets: IAssetLoadTraceAsset[];
  gltfScenes: IAssetLoadTraceGltfScene[];
  textureDelivery: Array<{
    fallback: string;
    format: string;
    id: string;
    selectedPath: string;
    variants: Array<{ fallback?: boolean; format: string; path: string; targets?: string[] }>;
  }>;
}

export function resolveWebAssets(source: string, manifest: IAssetsManifest): Map<string, IResolvedWebAsset> {
  return new Map(
    manifest.assets
      .filter((asset): asset is IAssetIr & { path: string } => "path" in asset && typeof asset.path === "string")
      .map((asset) => [
        asset.id,
        {
          asset,
          url: `${source.replace(/\/$/, "")}/${asset.path}`,
        },
      ]),
  );
}

export function traceAssetLoadSynchronization(manifest: IAssetsManifest, environmentScene?: IEnvironmentSceneIr): IAssetLoadTrace {
  const assets = manifest.assets
    .filter((asset): asset is IAssetIr & { path: string } => "path" in asset && typeof asset.path === "string")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((asset, index) => ({
      format: asset.format,
      id: asset.id,
      kind: asset.kind,
      loadIndex: index,
      path: asset.path,
      phase: "resolved" as const,
    }));
  const gltfScenes = traceGltfScenes(environmentScene);
  return {
    assets,
    barrier: {
      id: "bundle.requiredAssets",
      modelSceneCount: gltfScenes.length,
      status: "ready",
      total: assets.length,
    },
    gltfScenes,
    textureDelivery: traceTextureDelivery(manifest),
  };
}

function traceTextureDelivery(manifest: IAssetsManifest): IAssetLoadTrace["textureDelivery"] {
  return manifest.assets
    .filter((asset): asset is Extract<IAssetIr, { kind: "texture" }> & { path: string } => asset.kind === "texture" && "path" in asset && typeof asset.path === "string")
    .filter((asset) => asset.variants !== undefined || asset.fallback !== undefined)
    .map((asset) => ({
      fallback: asset.fallback ?? asset.id,
      format: asset.format,
      id: asset.id,
      selectedPath: asset.path,
      variants: [...(asset.variants ?? [])]
        .map((variant) => ({
          ...(variant.fallback === undefined ? {} : { fallback: variant.fallback }),
          format: variant.format,
          path: variant.path,
          ...(variant.targets === undefined ? {} : { targets: [...variant.targets].sort() }),
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function traceGltfScenes(environmentScene: IEnvironmentSceneIr | undefined): IAssetLoadTraceGltfScene[] {
  if (environmentScene === undefined) {
    return [];
  }
  return environmentScene.sourceAssets
    .map((sourceAsset) => ({
      asset: sourceAsset.asset,
      category: sourceAsset.category,
      impostors: (sourceAsset.lod ?? [])
        .flatMap((level) =>
          level.impostor === undefined
            ? []
            : [{ asset: level.asset, material: level.impostor.material, mode: level.impostor.mode }],
        )
        .sort((left, right) => left.asset.localeCompare(right.asset)),
      instanceIds: environmentScene.instances
        .filter((instance) => instance.sourceAsset === sourceAsset.id)
        .map((instance) => instance.id)
        .sort(),
      lodAssets: (sourceAsset.lod ?? []).map((level) => level.asset).sort(),
      sourceAsset: sourceAsset.id,
    }))
    .sort((left, right) => left.sourceAsset.localeCompare(right.sourceAsset));
}

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
}

export function resolveWebAssets(source: string, manifest: IAssetsManifest): Map<string, IResolvedWebAsset> {
  return new Map(
    manifest.assets
      .filter((asset) => "path" in asset)
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
  };
}

function traceGltfScenes(environmentScene: IEnvironmentSceneIr | undefined): IAssetLoadTraceGltfScene[] {
  if (environmentScene === undefined) {
    return [];
  }
  return environmentScene.sourceAssets
    .map((sourceAsset) => ({
      asset: sourceAsset.asset,
      category: sourceAsset.category,
      instanceIds: environmentScene.instances
        .filter((instance) => instance.sourceAsset === sourceAsset.id)
        .map((instance) => instance.id)
        .sort(),
      lodAssets: (sourceAsset.lod ?? []).map((level) => level.asset).sort(),
      sourceAsset: sourceAsset.id,
    }))
    .sort((left, right) => left.sourceAsset.localeCompare(right.sourceAsset));
}

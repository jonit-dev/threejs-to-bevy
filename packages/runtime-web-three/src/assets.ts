import type { IAssetIr, IAssetsManifest } from "@threenative/ir";

export interface IResolvedWebAsset {
  asset: IAssetIr;
  url: string;
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

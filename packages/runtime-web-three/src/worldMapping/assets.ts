import type { IAssetIr } from "@threenative/ir";

export function isLoadableModelFormat(asset: Extract<IAssetIr, { kind: "model" }>): boolean {
  return asset.format === "gltf" || asset.format === "glb";
}

export function bundleUrl(source: string, file: string): string {
  return `${source.replace(/\/$/, "")}/${file}`;
}

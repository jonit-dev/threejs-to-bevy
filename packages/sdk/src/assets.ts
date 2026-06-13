import { SdkError } from "./errors.js";

export type AssetKind = "audio" | "model" | "texture";
export type AssetFormat = "glb" | "gltf" | "jpeg" | "mp3" | "ogg" | "png" | "wav";

export interface IAssetReference {
  format: AssetFormat;
  id: string;
  kind: AssetKind;
  path: string;
}

export function modelAsset(id: string, path: string): IAssetReference {
  return assetRef("model", id, path, ["glb", "gltf"]);
}

export function textureAsset(id: string, path: string): IAssetReference {
  return assetRef("texture", id, path, ["jpeg", "png"]);
}

export function audioAsset(id: string, path: string): IAssetReference {
  return assetRef("audio", id, path, ["mp3", "ogg", "wav"]);
}

function assetRef(kind: AssetKind, id: string, path: string, formats: AssetFormat[]): IAssetReference {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_ASSET_ID_EMPTY", "Asset ID must not be empty.");
  }
  if (path.trim() === "" || path.startsWith("/") || path.includes("..")) {
    throw new SdkError("TN_SDK_ASSET_PATH_INVALID", "Asset path must be bundle-relative and must not traverse parent directories.");
  }
  const format = path.split(".").pop()?.toLowerCase() as AssetFormat | undefined;
  if (format === undefined || !formats.includes(format)) {
    throw new SdkError("TN_SDK_ASSET_FORMAT_UNSUPPORTED", `Unsupported ${kind} asset format for '${path}'.`);
  }
  return { format, id, kind, path };
}

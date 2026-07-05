import type { IAssetsManifest, ITargetProfile } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { validateUnsupportedFields } from "./validationDiagnostics.js";
import { isRecord } from "./validationPrimitives.js";

const MAX_EMBEDDED_ASSET_BYTES = 64 * 1024;

export function validateAssetSource(
  asset: IAssetsManifest["assets"][number],
  sourceMode: unknown,
  targetProfile: ITargetProfile | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (sourceMode !== undefined && sourceMode !== "bundle" && sourceMode !== "embedded" && sourceMode !== "network") {
    diagnostics.push({
      code: "TN_IR_ASSET_SOURCE_MODE_UNSUPPORTED",
      message: `Asset '${asset.id}' uses unsupported sourceMode '${String(sourceMode)}'.`,
      path: `${path}/sourceMode`,
      severity: "error",
      suggestion: "Use sourceMode 'bundle', 'embedded', or 'network'.",
    });
    return;
  }
  const raw = asset as unknown as Record<string, unknown>;
  if (sourceMode === "bundle") {
    if ("embedded" in raw || "network" in raw) {
      diagnostics.push({
        code: "TN_IR_ASSET_SOURCE_CONFLICT",
        message: `Bundle asset '${asset.id}' must not declare embedded or network source metadata.`,
        path,
        severity: "error",
        suggestion: "Remove embedded/network metadata or change sourceMode to the intended source.",
      });
    }
    return;
  }
  if (sourceMode === "embedded") {
    validateEmbeddedAssetSource(asset, raw.embedded, `${path}/embedded`, diagnostics);
    if ("path" in asset && typeof asset.path === "string") {
      diagnostics.push({
        code: "TN_IR_ASSET_SOURCE_CONFLICT",
        message: `Embedded asset '${asset.id}' must not declare a bundle path.`,
        path: `${path}/path`,
        severity: "error",
        suggestion: "Remove path from embedded assets; embedded data is stored in assets.manifest.json.",
      });
    }
    return;
  }
  if (sourceMode === "network") {
    validateNetworkAssetSource(asset, raw.network, targetProfile, `${path}/network`, diagnostics);
    if ("path" in asset && typeof asset.path === "string") {
      diagnostics.push({
        code: "TN_IR_ASSET_SOURCE_CONFLICT",
        message: `Network asset '${asset.id}' must not declare a bundle path.`,
        path: `${path}/path`,
        severity: "error",
        suggestion: "Use a bundle-local asset for offline/native targets or remove path for declared network assets.",
      });
    }
  }
}

function validateEmbeddedAssetSource(
  asset: IAssetsManifest["assets"][number],
  value: unknown,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_ASSET_EMBEDDED_SOURCE_INVALID",
      message: `Embedded asset '${asset.id}' must declare embedded source metadata.`,
      path,
      severity: "error",
      suggestion: "Declare embedded.data, embedded.encoding, embedded.byteLength, and embedded.mediaType.",
    });
    return;
  }
  validateUnsupportedFields(diagnostics, value, ["byteLength", "data", "encoding", "hash", "mediaType"], (key) => ({
    code: "TN_IR_ASSET_EMBEDDED_FIELD_UNSUPPORTED",
    message: `Embedded asset '${asset.id}' uses unsupported field '${key}'.`,
    path: `${path}/${key}`,
    severity: "error",
  }));
  if (value.encoding !== "base64") {
    diagnostics.push({ code: "TN_IR_ASSET_EMBEDDED_ENCODING_UNSUPPORTED", message: "Embedded asset encoding must be base64.", path: `${path}/encoding`, severity: "error" });
  }
  if (typeof value.mediaType !== "string" || value.mediaType.trim() === "") {
    diagnostics.push({ code: "TN_IR_ASSET_EMBEDDED_MEDIA_TYPE_INVALID", message: "Embedded asset mediaType must be a non-empty string.", path: `${path}/mediaType`, severity: "error" });
  }
  if (typeof value.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) {
    diagnostics.push({ code: "TN_IR_ASSET_EMBEDDED_DATA_INVALID", message: "Embedded asset data must be a base64 string.", path: `${path}/data`, severity: "error" });
  }
  if (!Number.isInteger(value.byteLength) || (value.byteLength as number) <= 0 || (value.byteLength as number) > MAX_EMBEDDED_ASSET_BYTES) {
    diagnostics.push({
      code: "TN_IR_ASSET_EMBEDDED_BYTES_INVALID",
      limit: MAX_EMBEDDED_ASSET_BYTES,
      message: `Embedded asset '${asset.id}' byteLength must be between 1 and ${MAX_EMBEDDED_ASSET_BYTES}.`,
      path: `${path}/byteLength`,
      severity: "error",
      suggestion: "Keep embedded assets small or emit the asset as a bundle-local file.",
      value: typeof value.byteLength === "number" ? value.byteLength : undefined,
    });
  }
  if (value.hash !== undefined && (typeof value.hash !== "string" || value.hash.trim() === "")) {
    diagnostics.push({ code: "TN_IR_ASSET_EMBEDDED_HASH_INVALID", message: "Embedded asset hash must be a non-empty string when provided.", path: `${path}/hash`, severity: "error" });
  }
}

function validateNetworkAssetSource(
  asset: IAssetsManifest["assets"][number],
  value: unknown,
  targetProfile: ITargetProfile | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_ASSET_NETWORK_SOURCE_INVALID",
      message: `Network asset '${asset.id}' must declare network source metadata.`,
      path,
      severity: "error",
      suggestion: "Declare network.url and use HTTPS for web-hosted assets.",
    });
    return;
  }
  validateUnsupportedFields(diagnostics, value, ["cachePolicy", "integrity", "url"], (key) => ({
    code: "TN_IR_ASSET_NETWORK_FIELD_UNSUPPORTED",
    message: `Network asset '${asset.id}' uses unsupported field '${key}'.`,
    path: `${path}/${key}`,
    severity: "error",
  }));
  const url = value.url;
  if (typeof url !== "string" || !isHttpsUrl(url)) {
    diagnostics.push({
      code: "TN_IR_ASSET_NETWORK_URL_INVALID",
      message: `Network asset '${asset.id}' must use an HTTPS URL.`,
      path: `${path}/url`,
      severity: "error",
      suggestion: "Use https:// URLs or bundle the asset locally.",
      value: typeof url === "string" ? url : undefined,
    });
  }
  if (value.integrity !== undefined && (typeof value.integrity !== "string" || value.integrity.trim() === "")) {
    diagnostics.push({ code: "TN_IR_ASSET_NETWORK_INTEGRITY_INVALID", message: "Network asset integrity must be a non-empty string when provided.", path: `${path}/integrity`, severity: "error" });
  }
  if (value.cachePolicy !== undefined && !["immutable", "no-store", "revalidate"].includes(String(value.cachePolicy))) {
    diagnostics.push({ code: "TN_IR_ASSET_NETWORK_CACHE_POLICY_INVALID", message: "Network asset cachePolicy must be immutable, no-store, or revalidate.", path: `${path}/cachePolicy`, severity: "error" });
  }
  const targets = targetProfile?.targets ?? [];
  if (targets.length === 0 || targets.some((target) => target !== "web")) {
    diagnostics.push({
      code: "TN_IR_ASSET_NETWORK_TARGET_UNSUPPORTED",
      message: `Asset '${asset.id}' uses network URL '${String(url)}' but target profile '${targets.join(",") || "unknown"}' disallows remote sources.`,
      path,
      severity: "error",
      suggestion: "Bundle the asset locally with sourceMode 'bundle' for native/offline targets, or restrict the target profile to web.",
      value: typeof url === "string" ? url : undefined,
    });
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IAssetsManifest, ITargetProfile } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { validateUnsupportedFields } from "./validationDiagnostics.js";
import { isRecord, validateFiniteRange, validatePositiveFinite, validateUniqueIds, validateVec3 } from "./validationPrimitives.js";

const MAX_RESIDUAL_ANIMATION_TIME_SECONDS = 600;
const MAX_EMBEDDED_ASSET_BYTES = 64 * 1024;
const TEXTURE_DELIVERY_FORMATS = ["basis", "bc", "dds", "etc2", "astc", "jpeg", "ktx2", "png", "webp"] as const;
const BASELINE_TEXTURE_FORMATS = new Set(["jpeg", "png", "webp"]);

export async function validateAssets(
  assets: IAssetsManifest,
  targetProfile: ITargetProfile | undefined,
  bundlePath: string,
  path: string,
  diagnostics: IIrDiagnostic[],
): Promise<void> {
  assets.assets.forEach((asset, index) => validateAssetMetadata(asset, `${path}/assets/${index}`, diagnostics));
  validateTextureDelivery(assets, targetProfile, `${path}/assets`, diagnostics);
  validateAssetGroups(assets, `${path}/groups`, diagnostics);
  await Promise.all(
    assets.assets.map(async (asset, index) => {
      if (asset.kind === "mesh") {
        await validateMeshPayloadFiles(asset, bundlePath, `${path}/assets/${index}`, diagnostics);
      }
      const rawAsset = asset as unknown as Record<string, unknown>;
      const sourceMode = rawAsset.sourceMode ?? ("path" in asset && typeof asset.path === "string" ? "bundle" : undefined);
      validateAssetSource(asset, sourceMode, targetProfile, `${path}/assets/${index}`, diagnostics);
      if (sourceMode !== "bundle") {
        return;
      }
      if (!("path" in asset) || typeof asset.path !== "string") {
        if (asset.kind !== "mesh" && asset.kind !== "render-target") {
          diagnostics.push({
            code: "TN_IR_ASSET_PATH_MISSING",
            message: `Bundle asset '${asset.id}' must declare a bundle-relative path.`,
            path: `${path}/assets/${index}/path`,
            severity: "error",
            suggestion: "Add a bundle-local path or use sourceMode 'embedded' or 'network'.",
          });
        }
        return;
      }
      const assetPath = `${path}/assets/${index}/path`;
      if (asset.path.startsWith("/") || asset.path.includes("..")) {
        diagnostics.push({
          code: "TN_IR_ASSET_PATH_INVALID",
          message: `Asset '${asset.id}' must use a bundle-relative path without parent traversal.`,
          path: assetPath,
          severity: "error",
          suggestion: "Move the asset into the emitted bundle and reference it with a bundle-relative path.",
        });
        return;
      }
      const extension = asset.path.split(".").pop()?.toLowerCase();
      if (!assetFormatMatches(asset.kind, asset.format, extension)) {
        diagnostics.push({
          code: "TN_IR_ASSET_FORMAT_UNSUPPORTED",
          message: `Asset '${asset.id}' uses unsupported ${asset.kind} format '${asset.format}'.`,
          path: `${path}/assets/${index}/format`,
          severity: "error",
          suggestion: "Use a supported asset format for the asset kind or update the target profile before emitting the bundle.",
        });
      }
      try {
        await access(resolve(bundlePath, asset.path));
      } catch {
        diagnostics.push({
          code: "TN_IR_ASSET_PATH_MISSING",
          message: `Asset '${asset.id}' path '${asset.path}' does not exist in the bundle.`,
          path: assetPath,
          severity: "error",
          suggestion: "Copy the referenced file into the bundle or update assets.manifest.json to point at an existing bundle-relative file.",
        });
      }
    }),
  );
}

function validateAssetSource(
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

function validateAssetGroups(assets: IAssetsManifest, path: string, diagnostics: IIrDiagnostic[]): void {
  if (assets.groups === undefined) {
    return;
  }
  if (!Array.isArray(assets.groups)) {
    diagnostics.push({ code: "TN_IR_ASSET_GROUPS_INVALID", message: "Asset manifest groups must be an array.", path, severity: "error" });
    return;
  }
  validateUniqueIds(assets.groups, path, "TN_IR_ASSET_GROUP_DUPLICATE", diagnostics);
  const assetIds = new Set(assets.assets.map((asset) => asset.id));
  assets.groups.forEach((group, index) => {
    const groupPath = `${path}/${index}`;
    if (!isRecord(group)) {
      diagnostics.push({ code: "TN_IR_ASSET_GROUP_INVALID", message: "Asset group must be an object.", path: groupPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(group)) {
      if (!["failurePolicy", "id", "optional", "required", "timeoutMs"].includes(key)) {
        diagnostics.push({ code: "TN_IR_ASSET_GROUP_FIELD_UNSUPPORTED", message: `Asset group '${String(group.id)}' uses unsupported field '${key}'.`, path: `${groupPath}/${key}`, severity: "error" });
      }
    }
    if (typeof group.id !== "string" || group.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_ASSET_GROUP_ID_INVALID", message: "Asset group ID must be a non-empty string.", path: `${groupPath}/id`, severity: "error" });
    }
    validateAssetGroupRefs(group.required, assetIds, `${groupPath}/required`, diagnostics);
    validateAssetGroupRefs(group.optional, assetIds, `${groupPath}/optional`, diagnostics, true);
    if (group.failurePolicy !== undefined && group.failurePolicy !== "fail" && group.failurePolicy !== "warn") {
      diagnostics.push({ code: "TN_IR_ASSET_GROUP_FAILURE_POLICY_INVALID", message: "Asset group failurePolicy must be fail or warn.", path: `${groupPath}/failurePolicy`, severity: "error" });
    }
    if (group.timeoutMs !== undefined && (!Number.isFinite(group.timeoutMs as number) || (group.timeoutMs as number) <= 0)) {
      diagnostics.push({ code: "TN_IR_ASSET_GROUP_TIMEOUT_INVALID", message: "Asset group timeoutMs must be a positive finite number.", path: `${groupPath}/timeoutMs`, severity: "error" });
    }
  });
}

function validateAssetGroupRefs(
  value: unknown,
  assetIds: ReadonlySet<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
  optional = false,
): void {
  if (value === undefined && optional) {
    return;
  }
  if (!Array.isArray(value) || (!optional && value.length === 0)) {
    diagnostics.push({ code: "TN_IR_ASSET_GROUP_REFS_INVALID", message: "Asset group references must be a non-empty string array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((assetId, index) => {
    const itemPath = `${path}/${index}`;
    if (typeof assetId !== "string" || assetId.trim() === "") {
      diagnostics.push({ code: "TN_IR_ASSET_GROUP_REF_INVALID", message: "Asset group references must be non-empty asset IDs.", path: itemPath, severity: "error" });
      return;
    }
    if (seen.has(assetId)) {
      diagnostics.push({ code: "TN_IR_ASSET_GROUP_REF_DUPLICATE", message: `Asset group references asset '${assetId}' more than once.`, path: itemPath, severity: "error" });
    }
    if (!assetIds.has(assetId)) {
      diagnostics.push({
        code: "TN_IR_ASSET_GROUP_ASSET_MISSING",
        message: `Asset group references unknown asset '${assetId}'.`,
        path: itemPath,
        severity: "error",
        suggestion: "Add the asset to assets.manifest.json or remove it from the group.",
      });
    }
    seen.add(assetId);
  });
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function validateMeshPayloadFiles(
  asset: IAssetsManifest["assets"][number],
  bundlePath: string,
  path: string,
  diagnostics: IIrDiagnostic[],
): Promise<void> {
  if (asset.kind !== "mesh") {
    return;
  }
  const binaryAttributes = "binaryAttributes" in asset ? asset.binaryAttributes ?? [] : [];
  await Promise.all(
    binaryAttributes.map(async (attribute, index) => {
      const payloadPath = `${path}/binaryAttributes/${index}/path`;
      try {
        const bytes = await readFile(resolve(bundlePath, attribute.path));
        const expectedBytes = attribute.count * attribute.itemSize * 4;
        if (bytes.byteLength !== expectedBytes) {
          diagnostics.push({ code: "TN_IR_MESH_PAYLOAD_SIZE_INVALID", message: `Binary mesh attribute '${attribute.name}' expected ${expectedBytes} bytes but found ${bytes.byteLength}.`, path: payloadPath, severity: "error" });
          return;
        }
        for (let offset = 0; offset < bytes.byteLength; offset += 4) {
          if (!Number.isFinite(bytes.readFloatLE(offset))) {
            diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VALUES_INVALID", message: `Binary mesh attribute '${attribute.name}' contains a non-finite value.`, path: payloadPath, severity: "error" });
            return;
          }
        }
      } catch {
        diagnostics.push({ code: "TN_IR_ASSET_PATH_MISSING", message: `Binary mesh payload '${attribute.path}' does not exist in the bundle.`, path: payloadPath, severity: "error" });
      }
    }),
  );
  const indices = "binaryIndices" in asset ? asset.binaryIndices : undefined;
  const inlinePosition = "attributes" in asset ? asset.attributes?.find((attribute) => attribute.name === "position") : undefined;
  const positionCount = binaryAttributes.find((attribute) => attribute.name === "position")?.count
    ?? (inlinePosition === undefined ? undefined : inlinePosition.values.length / 3);
  if (indices !== undefined) {
    try {
      const bytes = await readFile(resolve(bundlePath, indices.path));
      const itemBytes = indices.format === "uint16" ? 2 : 4;
      if (bytes.byteLength !== indices.count * itemBytes) {
        diagnostics.push({ code: "TN_IR_MESH_PAYLOAD_SIZE_INVALID", message: `Binary mesh indices expected ${indices.count * itemBytes} bytes but found ${bytes.byteLength}.`, path: `${path}/binaryIndices/path`, severity: "error" });
        return;
      }
      for (let item = 0; item < indices.count; item += 1) {
        const value = indices.format === "uint16" ? bytes.readUInt16LE(item * itemBytes) : bytes.readUInt32LE(item * itemBytes);
        if (positionCount !== undefined && value >= positionCount) {
          diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Binary mesh indices must be within the position vertex count.", path: `${path}/binaryIndices/${item}`, severity: "error" });
          return;
        }
      }
    } catch {
      diagnostics.push({ code: "TN_IR_ASSET_PATH_MISSING", message: `Binary mesh payload '${indices.path}' does not exist in the bundle.`, path: `${path}/binaryIndices/path`, severity: "error" });
    }
  }
}

function validateAssetMetadata(asset: IAssetsManifest["assets"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const raw = asset as unknown as Record<string, unknown>;
  const sourceFields = ["embedded", "network", "sourceMode"];
  const allowed = new Set(
    asset.kind === "mesh"
      ? ["attributes", "binaryAttributes", "binaryIndices", "bounds", "budget", "format", "generation", "id", "indices", "kind", "primitive", "size", "topology", "usage"]
      : asset.kind === "texture"
        ? ["center", "fallback", "format", "id", "kind", "magFilter", "minFilter", "offset", "path", "repeat", "rotation", "variants", "wrapS", "wrapT"]
        : asset.kind === "render-target"
          ? ["format", "height", "id", "kind", "sampleCount", "usage", "width"]
          : asset.kind === "buffer"
            ? ["format", "id", "kind", "path"]
            : ["animationGraph", "animations", "bounds", "format", "id", "kind", "masks", "morphClips", "morphTargets", "particleEmitters", "path", "skeleton"],
  );
  if (asset.kind !== "mesh" && asset.kind !== "render-target") {
    sourceFields.forEach((field) => allowed.add(field));
  }
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      diagnostics.push({
        code: unsupportedAssetFieldCode(key),
        message: `Asset '${asset.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        suggestion: "Use constrained animationGraph and particleEmitters metadata; keep engine controllers, IK, retargeting, and unbounded particles out of portable IR.",
      });
    }
  }
  if (("animations" in raw || "animationGraph" in raw || "particleEmitters" in raw || "masks" in raw || "morphClips" in raw || "morphTargets" in raw || "skeleton" in raw) && asset.kind !== "model") {
    diagnostics.push({
      code: "TN_IR_ANIMATION_MODEL_REQUIRED",
      message: `Asset '${asset.id}' can declare animation graph, particle, or clip metadata only when it is a model asset.`,
      path,
    });
    return;
  }
  const clipIds = asset.kind === "model" && Array.isArray(raw.animations)
    ? new Set(raw.animations.flatMap((clip) => isRecord(clip) && typeof clip.id === "string" ? [clip.id] : []))
    : new Set<string>();
  const maskIds = asset.kind === "model" ? validateAnimationMasks(raw.masks, raw.skeleton, `${path}/masks`, diagnostics) : new Set<string>();
  const morphTargetIds = asset.kind === "model" ? validateMorphTargets(raw.morphTargets, `${path}/morphTargets`, diagnostics) : new Set<string>();
  if (asset.kind === "model" && "animations" in raw) {
    validateAnimationClips(raw.animations, `${path}/animations`, diagnostics, maskIds);
  }
  if (asset.kind === "model" && "animationGraph" in raw) {
    validateAnimationGraph(raw.animationGraph, clipIds, `${path}/animationGraph`, diagnostics);
  }
  if (asset.kind === "model" && "morphClips" in raw) {
    validateMorphClips(raw.morphClips, morphTargetIds, `${path}/morphClips`, diagnostics);
  }
  if (asset.kind === "model" && "particleEmitters" in raw) {
    validateParticleEmitters(raw.particleEmitters, `${path}/particleEmitters`, diagnostics);
  }
  if (asset.kind === "mesh") {
    validateGeneratedMeshAsset(asset, path, diagnostics);
  }
  if (asset.kind === "render-target") {
    validateRenderTargetAsset(asset, path, diagnostics);
  }
}

function validateTextureDelivery(
  assets: IAssetsManifest,
  targetProfile: ITargetProfile | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const targets = targetProfile?.targets ?? [];
  const supportedFormats = new Set(targetProfile?.budgets?.supportedTextureFormats ?? ["jpeg", "png", "webp"]);
  assets.assets.forEach((asset, index) => {
    if (asset.kind !== "texture") {
      return;
    }
    const assetPath = `${path}/${index}`;
    if (asset.fallback !== undefined && asset.fallback !== asset.id) {
      diagnostics.push({
        code: "TN_IR_TEXTURE_FALLBACK_INVALID",
        message: `Texture asset '${asset.id}' fallback must point at its selected manifest texture id.`,
        path: `${assetPath}/fallback`,
        severity: "error",
        suggestion: "Keep the manifest texture as the deterministic fallback and put optional target-specific files in variants.",
        value: asset.fallback,
      });
    }
    if (asset.variants === undefined) {
      return;
    }
    if (!Array.isArray(asset.variants) || asset.variants.length === 0) {
      diagnostics.push({
        code: "TN_IR_TEXTURE_VARIANTS_INVALID",
        message: `Texture asset '${asset.id}' variants must be a non-empty array when declared.`,
        path: `${assetPath}/variants`,
        severity: "error",
        suggestion: "Remove variants or add target-specific texture variant metadata.",
      });
      return;
    }
    let hasSupportedFallback = supportedFormats.has(asset.format) && BASELINE_TEXTURE_FORMATS.has(asset.format);
    asset.variants.forEach((variant, variantIndex) => {
      const variantPath = `${assetPath}/variants/${variantIndex}`;
      validateTextureVariant(asset.id, variant, variantPath, diagnostics);
      if (!isRecord(variant)) {
        return;
      }
      const format = typeof variant.format === "string" ? variant.format : undefined;
      if (variant.fallback === true && format !== undefined && supportedFormats.has(format) && BASELINE_TEXTURE_FORMATS.has(format)) {
        hasSupportedFallback = true;
      }
      const variantTargets = Array.isArray(variant.targets) ? variant.targets.filter((target): target is "desktop" | "web" => target === "desktop" || target === "web") : targets;
      const appliesToTarget = targets.length === 0 || variantTargets.length === 0 || targets.some((target) => variantTargets.includes(target));
      if (format !== undefined && appliesToTarget && !supportedFormats.has(format)) {
        diagnostics.push({
          code: "TN_IR_TEXTURE_VARIANT_FORMAT_UNSUPPORTED_FOR_TARGET",
          limit: [...supportedFormats].sort(),
          message: `Texture asset '${asset.id}' variant format '${format}' is not supported by target profile '${targets.join(",") || "unknown"}'.`,
          path: `${variantPath}/format`,
          severity: "error",
          suggestion: "Add a supported baseline fallback texture or restrict the variant targets to profiles that support the format.",
          target: targets.join(",") || undefined,
          value: format,
        });
      }
    });
    if (!hasSupportedFallback) {
      diagnostics.push({
        code: "TN_IR_TEXTURE_VARIANT_FALLBACK_MISSING",
        limit: [...supportedFormats].sort(),
        message: `Texture asset '${asset.id}' declares variants but no supported baseline fallback for target profile '${targets.join(",") || "unknown"}'.`,
        path: `${assetPath}/fallback`,
        severity: "error",
        suggestion: "Use a manifest texture format supported by the target profile, or mark a baseline jpeg/png/webp variant as fallback.",
        target: targets.join(",") || undefined,
        value: asset.format,
      });
    }
  });
}

function validateTextureVariant(assetId: string, value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_TEXTURE_VARIANT_INVALID", message: `Texture asset '${assetId}' variant must be an object.`, path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["fallback", "format", "path", "targets"].includes(key)) {
      diagnostics.push({ code: "TN_IR_TEXTURE_VARIANT_FIELD_UNSUPPORTED", message: `Texture asset '${assetId}' variant uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (!TEXTURE_DELIVERY_FORMATS.includes(value.format as never)) {
    diagnostics.push({
      code: "TN_IR_TEXTURE_VARIANT_FORMAT_INVALID",
      limit: [...TEXTURE_DELIVERY_FORMATS],
      message: `Texture asset '${assetId}' variant format must be a promoted texture delivery format.`,
      path: `${path}/format`,
      severity: "error",
      suggestion: "Use jpeg, png, webp, ktx2, dds, basis, bc, etc2, or astc.",
      value: typeof value.format === "string" ? value.format : undefined,
    });
  }
  if (typeof value.path !== "string" || value.path.trim() === "" || value.path.startsWith("/") || value.path.includes("..")) {
    diagnostics.push({
      code: "TN_IR_TEXTURE_VARIANT_PATH_INVALID",
      message: `Texture asset '${assetId}' variant path must be bundle-relative and non-empty.`,
      path: `${path}/path`,
      severity: "error",
      suggestion: "Place optional texture variants under the emitted bundle assets directory.",
    });
  }
  if (value.fallback !== undefined && typeof value.fallback !== "boolean") {
    diagnostics.push({ code: "TN_IR_TEXTURE_VARIANT_FALLBACK_INVALID", message: `Texture asset '${assetId}' variant fallback must be boolean.`, path: `${path}/fallback`, severity: "error" });
  }
  if (value.targets !== undefined) {
    if (!Array.isArray(value.targets) || value.targets.length === 0) {
      diagnostics.push({ code: "TN_IR_TEXTURE_VARIANT_TARGETS_INVALID", message: `Texture asset '${assetId}' variant targets must be a non-empty array.`, path: `${path}/targets`, severity: "error" });
    } else {
      value.targets.forEach((target, index) => {
        if (target !== "desktop" && target !== "web") {
          diagnostics.push({ code: "TN_IR_TEXTURE_VARIANT_TARGET_UNSUPPORTED", message: `Texture asset '${assetId}' variant target '${String(target)}' is unsupported.`, path: `${path}/targets/${index}`, severity: "error" });
        }
      });
    }
  }
}

function unsupportedAssetFieldCode(key: string): string {
  if (key === "mask" || key === "boneMask" || key === "boneMasks" || key === "layers") {
    return "TN_IR_ANIMATION_MASKS_UNSUPPORTED";
  }
  if (key === "morphTargetTracks" || key === "morphWeights") {
    return "TN_IR_MORPH_TARGET_ANIMATION_UNSUPPORTED";
  }
  if (key === "retargeting" || key === "retargetMap") {
    return "TN_IR_RETARGETING_UNSUPPORTED";
  }
  if (key === "ik" || key === "inverseKinematics") {
    return "TN_IR_IK_UNSUPPORTED";
  }
  if (key === "propertyAnimations" || key === "propertyTracks" || key === "uiAnimations") {
    return "TN_IR_PROPERTY_ANIMATION_UNSUPPORTED";
  }
  if (key === "blendGraph" || key === "engineController" || key === "particles" || key === "stateMachine") {
    return "TN_IR_ANIMATION_FIELD_UNSUPPORTED";
  }
  return "TN_IR_ASSET_FIELD_UNSUPPORTED";
}

function validateRenderTargetAsset(
  asset: Extract<IAssetsManifest["assets"][number], { kind: "render-target" }>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!Number.isFinite(asset.width) || asset.width <= 0) {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_SIZE_INVALID",
      message: `Render target '${asset.id}' width must be a positive finite number.`,
      path: `${path}/width`,
    });
  }
  if (!Number.isFinite(asset.height) || asset.height <= 0) {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_SIZE_INVALID",
      message: `Render target '${asset.id}' height must be a positive finite number.`,
      path: `${path}/height`,
    });
  }
  if (asset.usage !== "color" && asset.usage !== "depth") {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_USAGE_INVALID",
      message: `Render target '${asset.id}' usage must be 'color' or 'depth'.`,
      path: `${path}/usage`,
    });
  }
  if (asset.sampleCount !== undefined && (!Number.isInteger(asset.sampleCount) || asset.sampleCount < 1)) {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_SAMPLE_COUNT_INVALID",
      message: `Render target '${asset.id}' sampleCount must be a positive integer when declared.`,
      path: `${path}/sampleCount`,
      severity: "error",
      suggestion: "Omit sampleCount for single-sample targets or use a supported sample count.",
    });
  }
}

const GENERATED_MESH_SIZE_ARITY: Record<string, number> = {
  annulus: 2,
  box: 3,
  capsule: 2,
  circle: 1,
  cone: 2,
  conicalFrustum: 3,
  custom: 0,
  cylinder: 2,
  extrudedRectangle: 3,
  plane: 2,
  regularPolygon: 2,
  sphere: 1,
  torus: 2,
};

function validateGeneratedMeshAsset(asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }>, path: string, diagnostics: IIrDiagnostic[]): void {
  const expectedSize = GENERATED_MESH_SIZE_ARITY[asset.primitive];
  if (expectedSize === undefined) {
    diagnostics.push({
      code: "TN_IR_MESH_PRIMITIVE_UNSUPPORTED",
      message: `Generated mesh '${asset.id}' uses unsupported primitive '${asset.primitive}'.`,
      path: `${path}/primitive`,
      severity: "error",
      suggestion: "Use a supported generated primitive or emit a model asset.",
    });
    return;
  }
  if (asset.primitive === "custom") {
    validateCustomMeshAsset(asset as Extract<IAssetsManifest["assets"][number], { kind: "mesh" }> & { attributes?: unknown; indices?: unknown }, path, diagnostics);
    return;
  }
  if ("attributes" in asset || "indices" in asset || "binaryAttributes" in asset || "binaryIndices" in asset) {
    diagnostics.push({
      code: "TN_IR_MESH_CUSTOM_FIELD_UNSUPPORTED",
      message: `Generated mesh '${asset.id}' may declare attributes or indices only when primitive is 'custom'.`,
      path,
      severity: "error",
    });
  }
  const size = asset.size;
  if (size === undefined) {
    return;
  }
  if (size.length !== expectedSize || size.some((value) => !Number.isFinite(value) || value <= 0)) {
    diagnostics.push({
      code: "TN_IR_MESH_SIZE_INVALID",
      message: `Generated mesh '${asset.id}' primitive '${asset.primitive}' expects ${expectedSize} positive finite size values.`,
      path: `${path}/size`,
      severity: "error",
      suggestion: "Emit the canonical size tuple for the generated primitive.",
    });
    return;
  }
  const firstSize = size[0] ?? 0;
  const secondSize = size[1] ?? 0;
  if ((asset.primitive === "annulus" || asset.primitive === "torus") && secondSize <= firstSize) {
    diagnostics.push({
      code: "TN_IR_MESH_SIZE_INVALID",
      message: `Generated mesh '${asset.id}' primitive '${asset.primitive}' requires outer radius greater than inner radius.`,
      path: `${path}/size/1`,
      severity: "error",
    });
  }
  if (asset.primitive === "regularPolygon" && (!Number.isInteger(secondSize) || secondSize < 3)) {
    diagnostics.push({
      code: "TN_IR_MESH_SIZE_INVALID",
      message: `Generated mesh '${asset.id}' regularPolygon requires at least three integer sides.`,
      path: `${path}/size/1`,
      severity: "error",
    });
  }
}

function validateCustomMeshAsset(
  asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }> & { attributes?: unknown; binaryAttributes?: unknown; binaryIndices?: unknown; indices?: unknown },
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (asset.size !== undefined) {
    diagnostics.push({
      code: "TN_IR_MESH_CUSTOM_SIZE_UNSUPPORTED",
      message: `Custom mesh '${asset.id}' must use attributes and indices instead of size.`,
      path: `${path}/size`,
      severity: "error",
    });
  }
  if (asset.topology !== undefined && asset.topology !== "triangle-list") {
    diagnostics.push({ code: "TN_IR_MESH_TOPOLOGY_UNSUPPORTED", message: `Custom mesh '${asset.id}' uses unsupported topology '${String(asset.topology)}'.`, path: `${path}/topology`, severity: "error" });
  }
  if (asset.usage !== undefined && asset.usage !== "static") {
    diagnostics.push({ code: "TN_IR_MESH_USAGE_UNSUPPORTED", message: `Custom mesh '${asset.id}' uses unsupported usage '${String(asset.usage)}'.`, path: `${path}/usage`, severity: "error" });
  }
  validateMeshBounds(asset.bounds, `${path}/bounds`, diagnostics);
  validateMeshBudget(asset.budget, `${path}/budget`, diagnostics);
  validateMeshGeneration(asset.generation, `${path}/generation`, diagnostics);
  const hasInline = Array.isArray(asset.attributes) && asset.attributes.length > 0;
  const hasBinary = Array.isArray(asset.binaryAttributes) && asset.binaryAttributes.length > 0;
  if (!hasInline && !hasBinary) {
    diagnostics.push({
      code: "TN_IR_MESH_ATTRIBUTES_INVALID",
      message: `Custom mesh '${asset.id}' must include inline or binary mesh attributes.`,
      path: `${path}/attributes`,
      severity: "error",
    });
    return;
  }
  const seen = new Set<string>();
  let vertexCount: number | undefined;
  let positionVertexCount: number | undefined;
  (Array.isArray(asset.attributes) ? asset.attributes : []).forEach((attribute, index) => {
    const attributePath = `${path}/attributes/${index}`;
    if (!isRecord(attribute)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTES_INVALID", message: "Mesh attribute must be an object.", path: attributePath, severity: "error" });
      return;
    }
    if (typeof attribute.name !== "string" || !isMeshAttributeName(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_NAME_INVALID", message: "Mesh attribute name must be position, normal, uv, uv1, color, or custom:<identifier>.", path: `${attributePath}/name`, severity: "error" });
      return;
    }
    if (seen.has(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_DUPLICATE", message: `Mesh attribute '${attribute.name}' is duplicated.`, path: `${attributePath}/name`, severity: "error" });
      return;
    }
    seen.add(attribute.name);
    if (![1, 2, 3, 4].includes(attribute.itemSize as number)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: "Mesh attribute itemSize must be 1, 2, 3, or 4.", path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    const expectedItemSize = expectedMeshAttributeItemSize(attribute.name);
    if (expectedItemSize !== undefined && attribute.itemSize !== expectedItemSize) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: `Mesh attribute '${attribute.name}' itemSize must be ${expectedItemSize}.`, path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    if (!Array.isArray(attribute.values) || attribute.values.length === 0 || attribute.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VALUES_INVALID", message: "Mesh attribute values must be a non-empty finite number array.", path: `${attributePath}/values`, severity: "error" });
      return;
    }
    const itemSize = attribute.itemSize as number;
    if (attribute.values.length % itemSize !== 0) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VALUES_INVALID", message: "Mesh attribute values length must divide evenly by itemSize.", path: `${attributePath}/values`, severity: "error" });
      return;
    }
    const count = attribute.values.length / itemSize;
    vertexCount ??= count;
    if (count !== vertexCount) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VERTEX_COUNT_INVALID", message: "All mesh attributes must have the same vertex count.", path: `${attributePath}/values`, severity: "error" });
    }
    if (attribute.name === "position") {
      if (itemSize !== 3) {
        diagnostics.push({ code: "TN_IR_MESH_POSITION_INVALID", message: "Custom mesh position attribute must use itemSize 3.", path: `${attributePath}/itemSize`, severity: "error" });
      }
      positionVertexCount = count;
    }
  });
  (Array.isArray(asset.binaryAttributes) ? asset.binaryAttributes : []).forEach((attribute, index) => {
    const attributePath = `${path}/binaryAttributes/${index}`;
    if (!isRecord(attribute)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTES_INVALID", message: "Binary mesh attribute must be an object.", path: attributePath, severity: "error" });
      return;
    }
    if (typeof attribute.name !== "string" || !isMeshAttributeName(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_NAME_INVALID", message: "Mesh attribute name must be position, normal, uv, uv1, color, or custom:<identifier>.", path: `${attributePath}/name`, severity: "error" });
      return;
    }
    if (seen.has(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_DUPLICATE", message: `Mesh attribute '${attribute.name}' is duplicated.`, path: `${attributePath}/name`, severity: "error" });
      return;
    }
    seen.add(attribute.name);
    if (![1, 2, 3, 4].includes(attribute.itemSize as number)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: "Mesh attribute itemSize must be 1, 2, 3, or 4.", path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    const expectedItemSize = expectedMeshAttributeItemSize(attribute.name);
    if (expectedItemSize !== undefined && attribute.itemSize !== expectedItemSize) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: `Mesh attribute '${attribute.name}' itemSize must be ${expectedItemSize}.`, path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    if (attribute.format !== `float32x${attribute.itemSize}`) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_FORMAT_INVALID", message: "Binary mesh attribute format must match itemSize.", path: `${attributePath}/format`, severity: "error" });
    }
    if (!Number.isInteger(attribute.count) || (attribute.count as number) <= 0) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_COUNT_INVALID", message: "Binary mesh attribute count must be a positive integer.", path: `${attributePath}/count`, severity: "error" });
      return;
    }
    const count = attribute.count as number;
    vertexCount ??= count;
    if (count !== vertexCount) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VERTEX_COUNT_INVALID", message: "All mesh attributes must have the same vertex count.", path: `${attributePath}/count`, severity: "error" });
    }
    validateBundleRelativePath(attribute.path, `${attributePath}/path`, diagnostics);
    if (attribute.name === "position") {
      positionVertexCount = count;
    }
  });
  if (positionVertexCount === undefined) {
    diagnostics.push({
      code: "TN_IR_MESH_POSITION_REQUIRED",
      message: `Custom mesh '${asset.id}' requires a position attribute.`,
      path: `${path}/attributes`,
      severity: "error",
    });
  }
  if (asset.binaryIndices !== undefined) {
    validateBinaryIndicesMetadata(asset.binaryIndices, `${path}/binaryIndices`, diagnostics);
  }
  validateCustomMeshIndices(asset, positionVertexCount, path, diagnostics);
}

function validateMeshBounds(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || !Array.isArray(value.min) || !Array.isArray(value.max)) {
    diagnostics.push({ code: "TN_IR_MESH_BOUNDS_INVALID", message: "Mesh bounds must include min and max vec3 values.", path, severity: "error" });
    return;
  }
  validateVec3(value.min, `${path}/min`, diagnostics);
  validateVec3(value.max, `${path}/max`, diagnostics);
}

function validateMeshBudget(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || !["standard-prop", "hero-prop", "doodad"].includes(String(value.classification)) || !Number.isInteger(value.vertexCount) || !Number.isInteger(value.limit)) {
    diagnostics.push({ code: "TN_IR_MESH_BUDGET_INVALID", message: "Mesh budget must include classification, vertexCount, and limit.", path, severity: "error" });
  }
}

function validateMeshGeneration(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || typeof value.id !== "string" || !["MeshBuilder", "BufferGeometrySnapshot"].includes(String(value.source))) {
    diagnostics.push({ code: "TN_IR_MESH_GENERATION_INVALID", message: "Mesh generation metadata must include id and supported source.", path, severity: "error" });
  }
}

function validateBinaryIndicesMetadata(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Binary mesh indices must be an object.", path, severity: "error" });
    return;
  }
  if (!["uint16", "uint32"].includes(String(value.format))) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_FORMAT_INVALID", message: "Binary mesh indices format must be uint16 or uint32.", path: `${path}/format`, severity: "error" });
  }
  if (!Number.isInteger(value.count) || (value.count as number) <= 0 || (value.count as number) % 3 !== 0) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Binary mesh indices count must define complete triangles.", path: `${path}/count`, severity: "error" });
  }
  validateBundleRelativePath(value.path, `${path}/path`, diagnostics);
}

function validateBundleRelativePath(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "" || value.startsWith("/") || value.includes("..")) {
    diagnostics.push({
      code: "TN_IR_ASSET_PATH_INVALID",
      message: "Binary mesh payloads must use bundle-relative paths without parent traversal.",
      path,
      severity: "error",
      suggestion: "Emit generated mesh payloads under generated/meshes/.",
    });
  }
}

function validateCustomMeshIndices(
  asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }> & { indices?: unknown },
  vertexCount: number | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (asset.indices === undefined) {
    return;
  }
  if (!Array.isArray(asset.indices) || asset.indices.length === 0 || asset.indices.length % 3 !== 0) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Custom mesh indices must define complete triangles.", path: `${path}/indices`, severity: "error" });
    return;
  }
  asset.indices.forEach((index, itemIndex) => {
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff || (vertexCount !== undefined && index >= vertexCount)) {
      diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Custom mesh indices must be non-negative U32 integers within the position vertex count.", path: `${path}/indices/${itemIndex}`, severity: "error" });
    }
  });
}

function isMeshAttributeName(name: string): boolean {
  return ["position", "normal", "uv", "uv1", "color"].includes(name) || /^custom:[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function expectedMeshAttributeItemSize(name: string): number | undefined {
  if (name === "position" || name === "normal") {
    return 3;
  }
  if (name === "uv" || name === "uv1") {
    return 2;
  }
  if (name === "color") {
    return 4;
  }
  return undefined;
}

function validateAnimationMasks(value: unknown, skeleton: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const maskIds = new Set<string>();
  if (value === undefined) {
    return maskIds;
  }
  const joints = isRecord(skeleton) && Array.isArray(skeleton.joints)
    ? new Set(skeleton.joints.filter((joint): joint is string => typeof joint === "string" && joint.trim() !== ""))
    : new Set<string>();
  if (joints.size === 0) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_MASK_SKELETON_MISSING",
      message: "Animation masks require model skeleton joint metadata.",
      path,
      severity: "error",
      suggestion: "Add skeleton.joints to the model asset so mask paths can be validated.",
    });
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_MASKS_INVALID", message: "Animation masks must be an array.", path, severity: "error" });
    return maskIds;
  }
  value.forEach((mask, index) => {
    const maskPath = `${path}/${index}`;
    if (!isRecord(mask)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_MASK_INVALID", message: "Animation mask must be an object.", path: maskPath, severity: "error" });
      return;
    }
    if (typeof mask.id !== "string" || mask.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_MASK_ID_INVALID", message: "Animation mask id must be a non-empty string.", path: `${maskPath}/id`, severity: "error" });
    } else if (maskIds.has(mask.id)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_MASK_ID_DUPLICATE", message: `Animation mask id '${mask.id}' is duplicated.`, path: `${maskPath}/id`, severity: "error" });
    } else {
      maskIds.add(mask.id);
    }
    if (!Array.isArray(mask.joints) || mask.joints.length === 0) {
      diagnostics.push({ code: "TN_IR_ANIMATION_MASK_JOINTS_INVALID", message: "Animation mask joints must be a non-empty array.", path: `${maskPath}/joints`, severity: "error" });
      return;
    }
    mask.joints.forEach((joint, jointIndex) => {
      if (typeof joint !== "string" || joint.trim() === "" || !joints.has(joint)) {
        diagnostics.push({
          code: "TN_IR_ANIMATION_MASK_PATH_MISSING",
          message: `Animation mask '${String(mask.id)}' references joint '${String(joint)}' that is not present in model skeleton metadata.`,
          path: `${maskPath}/joints/${jointIndex}`,
          severity: "error",
          suggestion: "Use only skeleton joint names declared by the model asset.",
          value: joint,
        });
      }
    });
  });
  return maskIds;
}

function validateMorphTargets(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const targetIds = new Set<string>();
  if (value === undefined) {
    return targetIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_MORPH_TARGETS_INVALID", message: "Morph targets must be an array.", path, severity: "error" });
    return targetIds;
  }
  value.forEach((target, index) => {
    const targetPath = `${path}/${index}`;
    if (!isRecord(target)) {
      diagnostics.push({ code: "TN_IR_MORPH_TARGET_INVALID", message: "Morph target metadata must be an object.", path: targetPath, severity: "error" });
      return;
    }
    if (typeof target.id !== "string" || target.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_MORPH_TARGET_ID_INVALID", message: "Morph target id must be a non-empty string.", path: `${targetPath}/id`, severity: "error" });
    } else if (targetIds.has(target.id)) {
      diagnostics.push({ code: "TN_IR_MORPH_TARGET_ID_DUPLICATE", message: `Morph target id '${target.id}' is duplicated.`, path: `${targetPath}/id`, severity: "error" });
    } else {
      targetIds.add(target.id);
    }
    if (target.defaultWeight !== undefined) {
      validateFiniteRange(target.defaultWeight, 0, 1, `${targetPath}/defaultWeight`, "TN_IR_MORPH_TARGET_WEIGHT_INVALID", diagnostics);
    }
  });
  return targetIds;
}

function validateMorphClips(value: unknown, targetIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_MORPH_CLIPS_INVALID", message: "Morph clips must be an array.", path, severity: "error" });
    return;
  }
  value.forEach((clip, index) => {
    const clipPath = `${path}/${index}`;
    if (!isRecord(clip)) {
      diagnostics.push({ code: "TN_IR_MORPH_CLIP_INVALID", message: "Morph clip must be an object.", path: clipPath, severity: "error" });
      return;
    }
    if (typeof clip.id !== "string" || clip.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_MORPH_CLIP_ID_INVALID", message: "Morph clip id must be a non-empty string.", path: `${clipPath}/id`, severity: "error" });
    }
    if (typeof clip.target !== "string" || !targetIds.has(clip.target)) {
      diagnostics.push({ code: "TN_IR_MORPH_TARGET_MISSING", message: `Morph clip '${String(clip.id)}' references an unknown morph target.`, path: `${clipPath}/target`, severity: "error" });
    }
    if (!Array.isArray(clip.keyframes) || clip.keyframes.length < 2) {
      diagnostics.push({ code: "TN_IR_MORPH_KEYFRAMES_INVALID", message: "Morph clips require at least two keyframes.", path: `${clipPath}/keyframes`, severity: "error" });
      return;
    }
    let previous = -Infinity;
    clip.keyframes.forEach((keyframe, keyframeIndex) => {
      const keyframePath = `${clipPath}/keyframes/${keyframeIndex}`;
      if (!isRecord(keyframe)) {
        diagnostics.push({ code: "TN_IR_MORPH_KEYFRAME_INVALID", message: "Morph keyframe must be an object.", path: keyframePath, severity: "error" });
        return;
      }
      validateFiniteRange(keyframe.timeSeconds, 0, MAX_RESIDUAL_ANIMATION_TIME_SECONDS, `${keyframePath}/timeSeconds`, "TN_IR_MORPH_KEYFRAME_TIME_INVALID", diagnostics);
      validateFiniteRange(keyframe.weight, 0, 1, `${keyframePath}/weight`, "TN_IR_MORPH_TARGET_WEIGHT_INVALID", diagnostics);
      if (typeof keyframe.timeSeconds === "number" && keyframe.timeSeconds <= previous) {
        diagnostics.push({ code: "TN_IR_MORPH_KEYFRAME_TIME_INVALID", message: "Morph keyframe times must be strictly increasing.", path: `${keyframePath}/timeSeconds`, severity: "error" });
      }
      if (typeof keyframe.timeSeconds === "number") {
        previous = keyframe.timeSeconds;
      }
    });
  });
}

function validateAnimationClips(value: unknown, path: string, diagnostics: IIrDiagnostic[], maskIds = new Set<string>()): void {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_CLIPS_INVALID",
      message: "Model asset animations must be an array.",
      path,
    });
    return;
  }
  const seen = new Set<string>();
  value.forEach((clip, index) => {
    const clipPath = `${path}/${index}`;
    if (!isRecord(clip)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_CLIP_INVALID",
        message: "Animation clip metadata must be an object.",
        path: clipPath,
      });
      return;
    }
    for (const key of Object.keys(clip)) {
      if (!["id", "loop", "mask", "sourceClip", "speed"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_ANIMATION_FIELD_UNSUPPORTED",
          message: `Animation clip uses unsupported field '${key}'.`,
          path: `${clipPath}/${key}`,
          suggestion: "Animation graphs, blends, IK, retargeting, and particles are deferred to V7.",
        });
      }
    }
    if (typeof clip.id !== "string" || clip.id.trim() === "") {
      diagnostics.push({
        code: "TN_IR_ANIMATION_CLIP_ID_INVALID",
        message: "Animation clip ID must be a non-empty string.",
        path: `${clipPath}/id`,
      });
    } else if (seen.has(clip.id)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_CLIP_DUPLICATE",
        message: `Animation clip ID '${clip.id}' is duplicated.`,
        path: `${clipPath}/id`,
      });
    } else {
      seen.add(clip.id);
    }
    if (clip.loop !== undefined && typeof clip.loop !== "boolean") {
      diagnostics.push({
        code: "TN_IR_ANIMATION_LOOP_INVALID",
        message: "Animation clip loop must be boolean.",
        path: `${clipPath}/loop`,
      });
    }
    if (clip.mask !== undefined && (typeof clip.mask !== "string" || !maskIds.has(clip.mask))) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_MASK_PATH_MISSING",
        message: `Animation clip '${String(clip.id)}' references mask '${String(clip.mask)}' that is not present in model skeleton metadata.`,
        path: `${clipPath}/mask`,
        severity: "error",
        suggestion: "Declare masks with joints that all exist in the model skeleton, or remove the clip mask.",
        ...(typeof clip.mask === "string" || typeof clip.mask === "number" ? { value: clip.mask } : {}),
      });
    }
    if (clip.sourceClip !== undefined && (typeof clip.sourceClip !== "string" || clip.sourceClip.trim() === "")) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_SOURCE_CLIP_INVALID",
        message: "Animation source clip must be a non-empty string.",
        path: `${clipPath}/sourceClip`,
      });
    }
    if (clip.speed !== undefined && (typeof clip.speed !== "number" || !Number.isFinite(clip.speed) || clip.speed <= 0)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_SPEED_INVALID",
        message: "Animation clip speed must be a positive finite number.",
        path: `${clipPath}/speed`,
      });
    }
  });
}

function validateAnimationGraph(value: unknown, clipIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_INVALID",
      message: "Animation graph must be an object.",
      path,
    });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["initialState", "parameters", "states", "transitions"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_GRAPH_FIELD_UNSUPPORTED",
        message: `Animation graph uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        suggestion: "Keep engine-specific controllers and graph runtime handles adapter-private.",
      });
    }
  }
  if (typeof value.initialState !== "string" || value.initialState.trim() === "") {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_INITIAL_STATE_INVALID",
      message: "Animation graph initialState must be a non-empty string.",
      path: `${path}/initialState`,
    });
  }
  const stateIds = validateAnimationGraphStates(value.states, clipIds, `${path}/states`, diagnostics);
  const parameterIds = validateAnimationGraphParameters(value.parameters, `${path}/parameters`, diagnostics);
  if (typeof value.initialState === "string" && value.initialState.trim() !== "" && !stateIds.has(value.initialState)) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_INITIAL_STATE_MISSING",
      message: `Animation graph initialState '${value.initialState}' is not declared in states.`,
      path: `${path}/initialState`,
    });
  }
  validateAnimationGraphTransitions(value.transitions, stateIds, parameterIds, `${path}/transitions`, diagnostics);
}

function validateAnimationGraphStates(value: unknown, clipIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const stateIds = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_STATES_INVALID",
      message: "Animation graph states must be a non-empty array.",
      path,
    });
    return stateIds;
  }
  value.forEach((state, index) => {
    const statePath = `${path}/${index}`;
    if (!isRecord(state)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_STATE_INVALID", message: "Animation graph state must be an object.", path: statePath });
      return;
    }
    for (const key of Object.keys(state)) {
      if (!["clip", "events", "id"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_ANIMATION_GRAPH_STATE_FIELD_UNSUPPORTED",
          message: `Animation graph state uses unsupported field '${key}'.`,
          path: `${statePath}/${key}`,
        });
      }
    }
    if (typeof state.id !== "string" || state.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_STATE_ID_INVALID", message: "Animation graph state ID must be a non-empty string.", path: `${statePath}/id` });
    } else if (stateIds.has(state.id)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_STATE_DUPLICATE", message: `Animation graph state ID '${state.id}' is duplicated.`, path: `${statePath}/id` });
    } else {
      stateIds.add(state.id);
    }
    if (typeof state.clip !== "string" || state.clip.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_CLIP_INVALID", message: "Animation graph state clip must be a non-empty string.", path: `${statePath}/clip` });
    } else if (!clipIds.has(state.clip)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_CLIP_MISSING", message: `Animation graph state references unknown clip '${state.clip}'.`, path: `${statePath}/clip` });
    }
    validateAnimationEvents(state.events, `${statePath}/events`, diagnostics);
  });
  return stateIds;
}

function validateAnimationEvents(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_EVENTS_INVALID", message: "Animation graph events must be an array.", path });
    return;
  }
  value.forEach((event, index) => {
    const eventPath = `${path}/${index}`;
    if (!isRecord(event)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_EVENT_INVALID", message: "Animation graph event must be an object.", path: eventPath });
      return;
    }
    if (typeof event.event !== "string" || event.event.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_EVENT_ID_INVALID", message: "Animation graph event ID must be a non-empty string.", path: `${eventPath}/event` });
    }
    if (typeof event.atSeconds !== "number" || !Number.isFinite(event.atSeconds) || event.atSeconds < 0) {
      diagnostics.push({ code: "TN_IR_ANIMATION_EVENT_TIME_INVALID", message: "Animation graph event atSeconds must be a non-negative finite number.", path: `${eventPath}/atSeconds` });
    }
  });
}

function validateAnimationGraphParameters(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const parameterIds = new Set<string>();
  if (value === undefined) {
    return parameterIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETERS_INVALID", message: "Animation graph parameters must be an array.", path });
    return parameterIds;
  }
  value.forEach((parameter, index) => {
    const parameterPath = `${path}/${index}`;
    if (!isRecord(parameter)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_INVALID", message: "Animation graph parameter must be an object.", path: parameterPath });
      return;
    }
    if (typeof parameter.id !== "string" || parameter.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_ID_INVALID", message: "Animation graph parameter ID must be a non-empty string.", path: `${parameterPath}/id` });
    } else if (parameterIds.has(parameter.id)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_DUPLICATE", message: `Animation graph parameter ID '${parameter.id}' is duplicated.`, path: `${parameterPath}/id` });
    } else {
      parameterIds.add(parameter.id);
    }
    if (!["boolean", "number", "trigger"].includes(parameter.kind as string)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_KIND_UNSUPPORTED", message: `Animation graph parameter kind '${String(parameter.kind)}' is unsupported.`, path: `${parameterPath}/kind` });
    }
  });
  return parameterIds;
}

function validateAnimationGraphTransitions(value: unknown, stateIds: ReadonlySet<string>, parameterIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITIONS_INVALID", message: "Animation graph transitions must be an array.", path });
    return;
  }
  value.forEach((transition, index) => {
    const transitionPath = `${path}/${index}`;
    if (!isRecord(transition)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_INVALID", message: "Animation graph transition must be an object.", path: transitionPath });
      return;
    }
    if (typeof transition.from !== "string" || !stateIds.has(transition.from)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_STATE_MISSING", message: "Animation graph transition from state must reference a declared state.", path: `${transitionPath}/from` });
    }
    if (typeof transition.to !== "string" || !stateIds.has(transition.to)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_STATE_MISSING", message: "Animation graph transition to state must reference a declared state.", path: `${transitionPath}/to` });
    }
    if (transition.blendSeconds !== undefined && (typeof transition.blendSeconds !== "number" || !Number.isFinite(transition.blendSeconds) || transition.blendSeconds < 0)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_BLEND_INVALID", message: "Animation graph transition blendSeconds must be a non-negative finite number.", path: `${transitionPath}/blendSeconds` });
    }
    if (!isRecord(transition.when)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_CONDITION_INVALID", message: "Animation graph transition when condition must be an object.", path: `${transitionPath}/when` });
      return;
    }
    if (typeof transition.when.parameter !== "string" || !parameterIds.has(transition.when.parameter)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_PARAMETER_MISSING", message: "Animation graph transition condition must reference a declared parameter.", path: `${transitionPath}/when/parameter` });
    }
  });
}

function validateParticleEmitters(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_PARTICLE_EMITTERS_INVALID", message: "Particle emitters must be an array.", path });
    return;
  }
  const seen = new Set<string>();
  value.forEach((emitter, index) => {
    const emitterPath = `${path}/${index}`;
    if (!isRecord(emitter)) {
      diagnostics.push({ code: "TN_IR_PARTICLE_EMITTER_INVALID", message: "Particle emitter must be an object.", path: emitterPath });
      return;
    }
    for (const key of Object.keys(emitter)) {
      if (!["id", "lifetimeSeconds", "maxParticles", "radius", "ratePerSecond", "shape"].includes(key)) {
        diagnostics.push({ code: "TN_IR_PARTICLE_FIELD_UNSUPPORTED", message: `Particle emitter uses unsupported field '${key}'.`, path: `${emitterPath}/${key}` });
      }
    }
    if (typeof emitter.id !== "string" || emitter.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_PARTICLE_EMITTER_ID_INVALID", message: "Particle emitter ID must be a non-empty string.", path: `${emitterPath}/id` });
    } else if (seen.has(emitter.id)) {
      diagnostics.push({ code: "TN_IR_PARTICLE_EMITTER_DUPLICATE", message: `Particle emitter ID '${emitter.id}' is duplicated.`, path: `${emitterPath}/id` });
    } else {
      seen.add(emitter.id);
    }
    validatePositiveInteger(emitter.maxParticles, `${emitterPath}/maxParticles`, "TN_IR_PARTICLE_MAX_INVALID", "Particle emitter maxParticles", diagnostics);
    validateNonNegativeFinite(emitter.ratePerSecond, `${emitterPath}/ratePerSecond`, "TN_IR_PARTICLE_RATE_INVALID", "Particle emitter ratePerSecond", diagnostics);
    validatePositiveFiniteValue(emitter.lifetimeSeconds, `${emitterPath}/lifetimeSeconds`, "TN_IR_PARTICLE_LIFETIME_INVALID", "Particle emitter lifetimeSeconds", diagnostics);
    if (!["point", "sphere"].includes(emitter.shape as string)) {
      diagnostics.push({ code: "TN_IR_PARTICLE_SHAPE_UNSUPPORTED", message: `Particle emitter shape '${String(emitter.shape)}' is unsupported.`, path: `${emitterPath}/shape` });
    }
    if (emitter.radius !== undefined) {
      validatePositiveFiniteValue(emitter.radius, `${emitterPath}/radius`, "TN_IR_PARTICLE_RADIUS_INVALID", "Particle emitter radius", diagnostics);
    }
  });
}

function validatePositiveInteger(value: unknown, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    diagnostics.push({ code, message: `${label} must be a positive integer.`, path });
  }
}

function validateNonNegativeFinite(value: unknown, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    diagnostics.push({ code, message: `${label} must be a non-negative finite number.`, path });
  }
}

function validatePositiveFiniteValue(value: unknown, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({ code, message: `${label} must be a positive finite number.`, path });
  }
}

function assetFormatMatches(kind: string, format: string, extension: string | undefined): boolean {
  if (kind === "texture" && format === "jpeg" && extension === "jpg") {
    return true;
  }
  if (format !== extension) {
    return false;
  }
  if (kind === "buffer") {
    return format === "bin";
  }
  if (kind === "model") {
    return format === "glb" || format === "gltf";
  }
  if (kind === "texture") {
    return TEXTURE_DELIVERY_FORMATS.includes(format as never);
  }
  if (kind === "audio") {
    return format === "mp3" || format === "ogg" || format === "wav";
  }
  return true;
}

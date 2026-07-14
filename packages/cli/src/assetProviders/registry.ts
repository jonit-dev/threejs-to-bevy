export type AssetProviderOperation = "categories" | "import" | "preview" | "search" | "status";

export interface IAssetProviderFeature {
  description: string;
  operation: AssetProviderOperation;
  usage: string;
}

export interface IAssetProviderDescriptor {
  displayName: string;
  features: readonly IAssetProviderFeature[];
  id: "poly-haven" | "sketchfab";
  networkDefault: "explicit" | "offline";
}

export const assetProviderRegistry: readonly IAssetProviderDescriptor[] = [{
  displayName: "Poly Haven",
  id: "poly-haven",
  networkDefault: "offline",
  features: [
    { description: "Report snapshot availability and optionally probe the official API.", operation: "status", usage: "tn asset provider status poly-haven [--live] [--json]" },
    { description: "List normalized categories from the snapshot or an explicit live request.", operation: "categories", usage: "tn asset provider categories poly-haven --type <hdris|textures|models|all> [--live] [--limit <n>] [--json]" },
    { description: "Search the shipped snapshot first or explicitly query the official API.", operation: "search", usage: "tn asset provider search poly-haven --query <text> --type <hdris|textures|models|all> [--live] [--page <n>] [--limit <n>] [--json]" },
    { description: "Import one provider-declared model, texture set, or HDRI into durable project assets.", operation: "import", usage: "tn asset provider import poly-haven <provider-asset-id> --type <hdris|textures|models> --resolution <1k|2k|4k|8k> --format <gltf|hdr|exr|jpg|png> --id <asset-id> --project <path> [--max-bytes <n>] [--json]" },
  ],
}, {
  displayName: "Sketchfab",
  id: "sketchfab",
  networkDefault: "explicit",
  features: [
    { description: "Report readiness for THREENATIVE_SKETCHFAB_OAUTH_TOKEN or explicitly validate that user OAuth access token. Personal CLI use is first-party; third-party apps require Sketchfab OAuth integration and the applicable agreement.", operation: "status", usage: "tn asset provider status sketchfab [--live] [--json]" },
    { description: "Search bounded downloadable model rows with creator, license, face, format, and preview metadata.", operation: "search", usage: "tn asset provider search sketchfab --query <text> [--cursor <cursor>] [--limit <n>] [--json]" },
    { description: "Fetch one bounded provider thumbnail for license and model review.", operation: "preview", usage: "tn asset provider preview sketchfab <model-uid> [--json]" },
    { description: "Import a reviewed downloadable glTF archive at an explicit largest-dimension meter scale.", operation: "import", usage: "tn asset provider import sketchfab <model-uid> --accept-license <license-id> --target-size <meters> --id <asset-id> --project <path> [--max-bytes <n>] [--json]" },
  ],
}] as const;

export function findAssetProvider(id: string): IAssetProviderDescriptor | undefined {
  return assetProviderRegistry.find((provider) => provider.id === id);
}

export function renderAssetProviderHelp(): string {
  return assetProviderRegistry.flatMap((provider) => provider.features.map((feature) => `${feature.usage}\n  ${feature.description}`)).join("\n");
}

export const ASSET_PROVIDER_STATUS_MCP_DESCRIPTORS = [{
  argv: { arguments: [{ boolean: true, flag: "--live", name: "live" }], prefix: ["asset", "provider", "status", "poly-haven"] },
  description: "Report Poly Haven snapshot readiness, with an explicit optional live official API probe.",
  inputSchema: { additionalProperties: false, properties: { live: { type: "boolean" } }, type: "object" },
  name: "asset.polyhaven_status",
}, {
  argv: { arguments: [{ flag: "--type", name: "type" }, { flag: "--limit", name: "limit" }, { boolean: true, flag: "--live", name: "live" }], prefix: ["asset", "provider", "categories", "poly-haven"] },
  description: "List normalized Poly Haven categories from the shipped snapshot or an explicit live request.",
  inputSchema: { additionalProperties: false, properties: { limit: { maximum: 50, minimum: 1, type: "number" }, live: { type: "boolean" }, type: { enum: ["all", "hdris", "models", "textures"], type: "string" } }, required: ["type"], type: "object" },
  name: "asset.polyhaven_categories",
}, {
  argv: { arguments: [{ boolean: true, flag: "--live", name: "live" }], prefix: ["asset", "provider", "status", "sketchfab"] },
  description: "Report credential-safe Sketchfab OAuth readiness, with an explicit optional live user probe.",
  inputSchema: { additionalProperties: false, properties: { live: { type: "boolean" } }, type: "object" },
  name: "asset.sketchfab_status",
}] as const;

const assetIdSchema = { pattern: "^[a-z][a-z0-9._-]*$", type: "string" } as const;

export const ASSET_POLY_HAVEN_MCP_DESCRIPTORS = [{
  argv: { arguments: [{ flag: "--query", name: "query" }, { flag: "--type", name: "type" }, { flag: "--limit", name: "limit" }, { flag: "--page", name: "page" }], fixed: ["--live"], prefix: ["asset", "provider", "search", "poly-haven"] },
  description: "Search the live official Poly Haven API through the same bounded CLI provider adapter.",
  inputSchema: { additionalProperties: false, properties: { limit: { maximum: 50, minimum: 1, type: "number" }, page: { maximum: 100, minimum: 1, type: "number" }, query: { type: "string" }, type: { enum: ["all", "hdris", "models", "textures"], type: "string" } }, required: ["query", "type"], type: "object" },
  name: "asset.polyhaven_search",
}, {
  argv: { arguments: [{ name: "providerAssetId", positional: true }, { flag: "--type", name: "type" }, { flag: "--resolution", name: "resolution" }, { flag: "--format", name: "format" }, { flag: "--id", name: "assetId" }, { flag: "--max-bytes", name: "maxBytes" }], prefix: ["asset", "provider", "import", "poly-haven"], projectScoped: true },
  description: "Import one provider-declared Poly Haven asset with bounded downloads and durable provenance through the CLI adapter.",
  inputSchema: { additionalProperties: false, properties: { assetId: assetIdSchema, format: { enum: ["exr", "gltf", "hdr", "jpg", "png"], type: "string" }, maxBytes: { maximum: 1073741824, minimum: 1, type: "number" }, providerAssetId: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", type: "string" }, resolution: { pattern: "^[0-9]+k$", type: "string" }, type: { enum: ["hdris", "models", "textures"], type: "string" } }, required: ["providerAssetId", "type", "resolution", "format", "assetId"], type: "object" },
  name: "asset.polyhaven_import",
}] as const;

export const ASSET_SKETCHFAB_MCP_DESCRIPTORS = [{
  argv: { arguments: [{ flag: "--query", name: "query" }, { flag: "--limit", name: "limit" }, { flag: "--cursor", name: "cursor" }], prefix: ["asset", "provider", "search", "sketchfab"] },
  description: "Search bounded downloadable Sketchfab models with public license, creator, face, format, and preview metadata through the CLI adapter.",
  inputSchema: { additionalProperties: false, properties: { cursor: { pattern: "^[A-Za-z0-9._~-]{1,128}$", type: "string" }, limit: { maximum: 24, minimum: 1, type: "number" }, query: { type: "string" } }, required: ["query"], type: "object" },
  name: "asset.sketchfab_search",
}, {
  argv: { arguments: [{ name: "modelUid", positional: true }], prefix: ["asset", "provider", "preview", "sketchfab"] },
  description: "Fetch one bounded Sketchfab model preview through the CLI adapter and return it as MCP image content.",
  inputSchema: { additionalProperties: false, properties: { modelUid: { pattern: "^[A-Za-z0-9]{8,64}$", type: "string" } }, required: ["modelUid"], type: "object" },
  name: "asset.sketchfab_preview",
}, {
  argv: { arguments: [{ name: "modelUid", positional: true }, { flag: "--accept-license", name: "acceptedLicense" }, { flag: "--target-size", name: "targetSize" }, { flag: "--id", name: "assetId" }, { flag: "--max-bytes", name: "maxBytes" }], prefix: ["asset", "provider", "import", "sketchfab"], projectScoped: true },
  description: "Import one reviewed Sketchfab glTF archive with explicit license acceptance and target meter size through the CLI adapter.",
  inputSchema: { additionalProperties: false, properties: { acceptedLicense: { minLength: 1, type: "string" }, assetId: assetIdSchema, maxBytes: { maximum: 268435456, minimum: 1, type: "number" }, modelUid: { pattern: "^[A-Za-z0-9]{8,64}$", type: "string" }, targetSize: { exclusiveMinimum: 0, maximum: 10000, type: "number" } }, required: ["modelUid", "acceptedLicense", "targetSize", "assetId"], type: "object" },
  name: "asset.sketchfab_import",
}] as const;

export const ASSET_PROVIDER_MCP_DESCRIPTORS = [...ASSET_PROVIDER_STATUS_MCP_DESCRIPTORS, ...ASSET_POLY_HAVEN_MCP_DESCRIPTORS, ...ASSET_SKETCHFAB_MCP_DESCRIPTORS] as const;

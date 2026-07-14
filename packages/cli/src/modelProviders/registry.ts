export type ModelProviderOperation = "generate" | "import" | "poll" | "status";

export interface IModelProviderFeature {
  description: string;
  operation: ModelProviderOperation;
  usage: string;
}

export interface IModelProviderDescriptor {
  displayName: string;
  features: readonly IModelProviderFeature[];
  followUp?: string;
  id: "hunyuan" | "hyper3d";
  status: "experimental" | "unsupported";
  unsupportedReason?: string;
}

export const modelProviderRegistry: readonly IModelProviderDescriptor[] = [
  {
    displayName: "Hyper3D Rodin Gen-2",
    features: [
      { description: "Report credential-safe local readiness; add --live only for an explicit provider probe.", operation: "status", usage: "tn asset model-provider status hyper3d [--live] [--json]" },
      { description: "Submit one Rodin Gen-2 job after reviewing its documented 0.5-credit base cost, Business-plan requirement, provider terms, and input-rights warranty.", operation: "generate", usage: "tn asset model-provider generate hyper3d --id <job-id> (--prompt <text>|--image <project-path>) --accept-cost --accept-provider-terms --confirm-input-rights --project <path> [--bbox <y,z,x>] [--json]" },
      { description: "Poll one durable job exactly once; this command does not recursively wait. Poll conservatively, honor HTTP 429 Retry-After, and review the provider's current API rate limits before automation.", operation: "poll", usage: "tn asset model-provider poll hyper3d <job-id> --project <path> [--json]" },
      { description: "Import a completed job through staged GLB inspection and asset registration.", operation: "import", usage: "tn asset model-provider import hyper3d <job-id> --id <asset-id> --project <path> [--target-size <meters>] [--json]" },
    ],
    id: "hyper3d",
    status: "experimental",
  },
  {
    displayName: "Tencent Hunyuan3D",
    features: [],
    followUp: "docs/PRDs/other/optional-headless-blender-asset-generation.md#open-questions",
    id: "hunyuan",
    status: "unsupported",
    unsupportedReason: "Official hosted API transport, charge semantics, and output-rights evidence have not passed review; generation handlers are intentionally absent.",
  },
] as const;

export function findModelProvider(id: string): IModelProviderDescriptor | undefined {
  return modelProviderRegistry.find((provider) => provider.id === id);
}

const modelIdSchema = { pattern: "^[a-z][a-z0-9._-]{0,63}$", type: "string" } as const;

export const MODEL_PROVIDER_MCP_DESCRIPTORS = [{
  argv: { arguments: [{ boolean: true, flag: "--live", name: "live" }], prefix: ["asset", "model-provider", "status", "hyper3d"] },
  description: "Report credential-safe Hyper3D readiness, with an explicit optional live balance probe.",
  inputSchema: { additionalProperties: false, properties: { live: { type: "boolean" } }, type: "object" },
  name: "asset.hyper3d_status",
}, {
  argv: {
    arguments: [
      { flag: "--id", name: "jobId" }, { flag: "--prompt", name: "prompt" }, { flag: "--image", name: "image" }, { flag: "--bbox", name: "bbox" },
      { boolean: true, flag: "--accept-cost", name: "acceptCost" }, { boolean: true, flag: "--accept-provider-terms", name: "acceptProviderTerms" }, { boolean: true, flag: "--confirm-input-rights", name: "confirmInputRights" },
    ],
    prefix: ["asset", "model-provider", "generate", "hyper3d"], projectScoped: true,
  },
  description: "Submit one explicitly acknowledged Hyper3D Rodin job from text or a project-local image.",
  inputSchema: {
    additionalProperties: false,
    oneOf: [{ required: ["prompt"] }, { required: ["image"] }],
    properties: {
      acceptCost: { const: true, type: "boolean" }, acceptProviderTerms: { const: true, type: "boolean" }, bbox: { pattern: "^[0-9]+(?:\\.[0-9]+)?,[0-9]+(?:\\.[0-9]+)?,[0-9]+(?:\\.[0-9]+)?$", type: "string" },
      confirmInputRights: { const: true, type: "boolean" }, image: { pattern: "^(?!.*(?:^|/)\\.\\.(?:/|$))(?![a-z][a-z0-9+.-]*:)[^\\\\]+\\.(?:jpe?g|png|webp)$", type: "string" }, jobId: modelIdSchema, prompt: { maxLength: 2000, minLength: 3, type: "string" },
    },
    required: ["jobId", "acceptCost", "acceptProviderTerms", "confirmInputRights"], type: "object",
  },
  name: "asset.hyper3d_generate",
}, {
  argv: { arguments: [{ name: "jobId", positional: true }], prefix: ["asset", "model-provider", "poll", "hyper3d"], projectScoped: true },
  description: "Poll one durable Hyper3D job exactly once without recursively waiting.",
  inputSchema: { additionalProperties: false, properties: { jobId: modelIdSchema }, required: ["jobId"], type: "object" },
  name: "asset.hyper3d_poll",
}, {
  argv: { arguments: [{ name: "jobId", positional: true }, { flag: "--id", name: "assetId" }, { flag: "--target-size", name: "targetSize" }], prefix: ["asset", "model-provider", "import", "hyper3d"], projectScoped: true },
  description: "Import one completed Hyper3D GLB through bounded download, inspection, normalization, and registration.",
  inputSchema: { additionalProperties: false, properties: { assetId: modelIdSchema, jobId: modelIdSchema, targetSize: { exclusiveMinimum: 0, maximum: 10000, type: "number" } }, required: ["jobId", "assetId"], type: "object" },
  name: "asset.hyper3d_import",
}, {
  argv: { arguments: [], prefix: ["asset", "model-provider", "status", "hunyuan"] },
  description: "Report the intentional unsupported state for Hunyuan3D without making a network request.",
  inputSchema: { additionalProperties: false, properties: {}, type: "object" },
  name: "asset.hunyuan_status",
}] as const;

export const ASSET_CREATION_STRATEGY_MCP_DESCRIPTOR = {
  argv: { arguments: [], prefix: ["asset", "strategy"] },
  description: "Return descriptor-owned asset sourcing and creation guidance ordered from reuse through bounded generation and proof.",
  inputSchema: { additionalProperties: false, properties: {}, type: "object" },
  name: "asset.creation_strategy",
} as const;

export type BlenderMcpCoverageDisposition = "deferred" | "equivalent" | "full" | "safe-replacement";
export interface IBlenderMcpCoverageRow {
  cliEvidence?: string;
  command?: string;
  coreEvidence?: string;
  disposition: BlenderMcpCoverageDisposition;
  evidence: string;
  id: number;
  mcpTool?: string;
  mcpEvidence?: string;
  owner: string;
  upstreamTool: string;
}

// Fixed inventory from BlenderMCP commit 6e99eb5a442b83766a5796975ec7bb5bfc791341.
// Rows may gain evidence, but must never be removed to inflate coverage.
const blenderMcpOutcomeRows: readonly IBlenderMcpCoverageRow[] = [
  { command: "tn asset inspect", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 1, mcpTool: "asset.inspect", owner: "asset-inspect", upstreamTool: "get_scene_info" },
  { command: "tn asset inspect", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 2, mcpTool: "asset.inspect", owner: "asset-inspect", upstreamTool: "get_object_info" },
  { command: "tn model-test --screenshot", disposition: "equivalent", evidence: "packages/mcp-server/src/index.test.ts", id: 3, mcpTool: "asset.model_test", owner: "model-test", upstreamTool: "get_viewport_screenshot" },
  { command: "tn asset generate --provider blender", disposition: "safe-replacement", evidence: "packages/mcp-server/src/index.test.ts", id: 4, mcpTool: "asset.generate_blender", owner: "blender-recipe", upstreamTool: "execute_blender_code" },
  { command: "tn asset provider categories poly-haven", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 5, mcpTool: "asset.polyhaven_categories", owner: "poly-haven", upstreamTool: "get_polyhaven_categories" },
  { command: "tn asset provider search poly-haven", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 6, mcpTool: "asset.polyhaven_search", owner: "poly-haven", upstreamTool: "search_polyhaven_assets" },
  { command: "tn asset provider import poly-haven", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 7, mcpTool: "asset.polyhaven_import", owner: "poly-haven", upstreamTool: "download_polyhaven_asset" },
  { command: "tn material set", disposition: "equivalent", evidence: "packages/mcp-server/src/index.test.ts", id: 8, mcpTool: "material.set", owner: "materials", upstreamTool: "set_texture" },
  { command: "tn asset provider status poly-haven", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 9, mcpTool: "asset.polyhaven_status", owner: "poly-haven", upstreamTool: "get_polyhaven_status" },
  { command: "tn asset model-provider status hyper3d", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 10, mcpTool: "asset.hyper3d_status", owner: "hyper3d", upstreamTool: "get_hyper3d_status" },
  { command: "tn asset provider status sketchfab", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 11, mcpTool: "asset.sketchfab_status", owner: "sketchfab", upstreamTool: "get_sketchfab_status" },
  { command: "tn asset provider search sketchfab", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 12, mcpTool: "asset.sketchfab_search", owner: "sketchfab", upstreamTool: "search_sketchfab_models" },
  { command: "tn asset provider preview sketchfab", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 13, mcpTool: "asset.sketchfab_preview", owner: "sketchfab", upstreamTool: "get_sketchfab_model_preview" },
  { command: "tn asset provider import sketchfab", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 14, mcpTool: "asset.sketchfab_import", owner: "sketchfab", upstreamTool: "download_sketchfab_model" },
  { command: "tn asset model-provider generate hyper3d --prompt", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 15, mcpTool: "asset.hyper3d_generate", owner: "hyper3d", upstreamTool: "generate_hyper3d_model_via_text" },
  { command: "tn asset model-provider generate hyper3d --image", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 16, mcpTool: "asset.hyper3d_generate", owner: "hyper3d", upstreamTool: "generate_hyper3d_model_via_images" },
  { command: "tn asset model-provider poll hyper3d", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 17, mcpTool: "asset.hyper3d_poll", owner: "hyper3d", upstreamTool: "poll_rodin_job_status" },
  { command: "tn asset model-provider import hyper3d", disposition: "full", evidence: "packages/mcp-server/src/index.test.ts", id: 18, mcpTool: "asset.hyper3d_import", owner: "hyper3d", upstreamTool: "import_generated_asset" },
  { command: "tn asset model-provider status hunyuan", disposition: "equivalent", evidence: "packages/mcp-server/src/index.test.ts", id: 19, mcpTool: "asset.hunyuan_status", owner: "model-provider-registry", upstreamTool: "get_hunyuan3d_status" },
  { disposition: "deferred", evidence: "docs/PRDs/other/optional-headless-blender-asset-generation.md#inspected-upstream-surface", id: 20, owner: "follow-on:hunyuan-provider", upstreamTool: "generate_hunyuan3d_model" },
  { disposition: "deferred", evidence: "docs/PRDs/other/optional-headless-blender-asset-generation.md#inspected-upstream-surface", id: 21, owner: "follow-on:hunyuan-provider", upstreamTool: "poll_hunyuan_job_status" },
  { disposition: "deferred", evidence: "docs/PRDs/other/optional-headless-blender-asset-generation.md#inspected-upstream-surface", id: 22, owner: "follow-on:hunyuan-provider", upstreamTool: "import_generated_asset_hunyuan" },
] as const;

const coreEvidenceByRow = [
  "packages/cli/src/commands/asset.test.ts", "packages/cli/src/commands/asset.test.ts", "packages/cli/src/commands/modelTest.test.ts", "packages/authoring/src/operationRegistry.test.ts",
  ...Array(5).fill("packages/cli/src/assetProviders/polyHaven.test.ts"), "packages/cli/src/modelProviders/hyper3d.test.ts",
  ...Array(4).fill("packages/cli/src/assetProviders/sketchfab.test.ts"), ...Array(4).fill("packages/cli/src/modelProviders/hyper3d.test.ts"), "packages/cli/src/modelProviders/registry.test.ts",
] as const;
const cliEvidenceByRow = [
  "packages/cli/src/commands/asset.test.ts", "packages/cli/src/commands/asset.test.ts", "packages/cli/src/commands/modelTest.test.ts",
  ...Array(4).fill("packages/cli/src/commands/asset.test.ts"), "packages/cli/src/commands/source-documents-command.test.ts", ...Array(11).fill("packages/cli/src/commands/asset.test.ts"),
] as const;

export const blenderMcpOutcomeCoverage: readonly IBlenderMcpCoverageRow[] = blenderMcpOutcomeRows.map((row, index) => row.disposition === "deferred" ? row : {
  ...row,
  cliEvidence: cliEvidenceByRow[index],
  coreEvidence: coreEvidenceByRow[index],
  mcpEvidence: "packages/mcp-server/src/index.test.ts",
});

export const assetCreationStrategy = [
  "Inspect project scene assets and provider status before mutation; capture a baseline for existing work.",
  "Search the shipped reviewed catalog first and reuse an accepted asset when possible.",
  "Use Poly Haven for generic assets and Sketchfab only after preview and license review.",
  "Use one explicitly acknowledged paid model-provider job only for a unique item; never generate an entire scene or fragmented parts by default.",
  "Prefer a bounded Blender recipe for a simple custom object when it is more reliable than external sourcing.",
  "Poll and import explicitly, normalize world-space meter scale, ground the pivot, and check clipping.",
  "Finish with asset inspection, model-test visual evidence, authoring validation, and web/native build proof.",
] as const;

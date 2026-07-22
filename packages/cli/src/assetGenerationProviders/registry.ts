import { getAuthoringOperationDescriptor } from "@threenative/authoring";
import type { AuthoringOperationName, IAuthoringDiagnostic } from "@threenative/authoring";

import { EXTERNAL_TOOL_REGISTRY } from "../externalTools/registry.js";
import type { IBlenderGeneratorDependencies } from "../blender/runBlenderGenerator.js";
import type { IRunImg2ThreejsGeneratorDependencies, IRunImg2ThreejsGeneratorResult } from "../img2threejs/runImg2ThreejsGenerator.js";

export type AssetGenerationProviderId = "blender" | "img2threejs";

export interface IAssetGenerationMcpDescriptor {
  readonly argv: {
    readonly arguments: readonly ({ readonly name: "assetId"; readonly positional: true } | { readonly encoding?: "json"; readonly flag: string; readonly name: string })[];
    readonly fixed: readonly ["--provider", AssetGenerationProviderId];
    readonly prefix: readonly ["asset", "generate"];
    readonly projectScoped: true;
  };
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly name: `asset.generate_${AssetGenerationProviderId}`;
}

export interface IAssetGenerationMcpPathRole {
  readonly allowInlineObject?: boolean;
  readonly argument: "out" | "recipe";
  readonly defaultFromAssetId?: boolean;
  readonly kind: "generated-output" | "reviewed-source";
}

export interface IAssetGenerationProviderDescriptor {
  readonly assetIdPattern: string;
  readonly availability: "available" | "unavailable";
  readonly displayName: string;
  readonly id: AssetGenerationProviderId;
  readonly license: { readonly name: string; readonly spdx: string; readonly url: string };
  readonly mcp: IAssetGenerationMcpDescriptor;
  readonly mcpAvailability: "available" | "unavailable";
  readonly mcpPathRoles: readonly IAssetGenerationMcpPathRole[];
  readonly providerVersion: string;
  readonly provenanceOperation: AuthoringOperationName;
  readonly runGenerator: (context: IAssetGenerationProviderRunContext) => Promise<IAssetGenerationProviderRunResult>;
  readonly unavailableReason?: string;
  readonly upstream?: {
    readonly internalForkTree: string;
    readonly internalForkUrl: string;
    readonly repository: string;
    readonly reviewedCommit: string;
    readonly skillVersion: string;
  };
  readonly usage: string;
}

export interface IAssetGenerationProviderRunContext {
  readonly blenderDependencies?: Partial<IBlenderGeneratorDependencies>;
  readonly generatorId: string;
  readonly img2ThreejsDependencies?: IRunImg2ThreejsGeneratorDependencies;
  readonly img2ThreejsRunner?: (projectPath: string, generatorId: string, dependencies?: IRunImg2ThreejsGeneratorDependencies) => Promise<IRunImg2ThreejsGeneratorResult>;
  readonly projectPath: string;
}

export interface IAssetGenerationProviderRunResult {
  readonly diagnostics: IAuthoringDiagnostic[];
  readonly filesWritten: string[];
  readonly generatorId: string;
  readonly inputHash?: string;
  readonly inspection?: unknown;
  readonly lastRun?: Record<string, unknown>;
  readonly ok: boolean;
  readonly outputHash?: string;
  readonly projectPath: string;
  readonly proofFiles?: readonly string[];
  readonly validation?: unknown;
  readonly visualMetrics?: unknown;
}

const assetIdPattern = "^[a-z][a-z0-9._-]*$";
const blenderTool = EXTERNAL_TOOL_REGISTRY.blender;
const img2ThreejsManifest = getAuthoringOperationDescriptor("generator.record_img2threejs")?.providerManifest;
if (img2ThreejsManifest === undefined || img2ThreejsManifest.id !== "img2threejs") throw new Error("The img2threejs authoring operation must own its reviewed provider manifest.");

export const assetGenerationProviderRegistry = [
  {
    assetIdPattern,
    availability: "available",
    displayName: "Blender",
    id: "blender",
    license: { ...blenderTool.license, spdx: "GPL-3.0-or-later" },
    mcp: {
      argv: {
        arguments: [
          { name: "assetId", positional: true },
          { encoding: "json", flag: "--recipe", name: "recipe" },
          { flag: "--out", name: "out" },
          { flag: "--overwrite-policy", name: "overwritePolicy" },
        ],
        fixed: ["--provider", "blender"],
        prefix: ["asset", "generate"],
        projectScoped: true,
      },
      description: "Generate and register a bounded Blender recipe through tn asset generate --json without installing tools or accepting code.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          assetId: { pattern: assetIdPattern, type: "string" },
          out: { pattern: "^assets/generated/[a-z][a-z0-9._-]*\\.glb$", type: "string" },
          overwritePolicy: { enum: ["manual", "replace", "skip"], type: "string" },
          recipe: { oneOf: [{ pattern: "^content/generators/[a-z][a-z0-9._-]*\\.recipe\\.json$", type: "string" }, { type: "object" }] },
        },
        required: ["assetId", "recipe"],
        type: "object",
      },
      name: "asset.generate_blender",
    },
    mcpAvailability: "available",
    mcpPathRoles: [
      { allowInlineObject: true, argument: "recipe", kind: "reviewed-source" },
      { argument: "out", defaultFromAssetId: true, kind: "generated-output" },
    ],
    providerVersion: blenderTool.version,
    provenanceOperation: "generator.record_blender",
    runGenerator: async (context) => (await import("../blender/runBlenderGenerator.js")).runBlenderGenerator({ generatorId: context.generatorId, projectPath: context.projectPath }, context.blenderDependencies),
    usage: "tn asset generate <asset-id> --provider blender --recipe <path-or-json> [--out <path>] [--overwrite-policy manual|replace|skip] [--project <path>] [--json]",
  },
  {
    assetIdPattern,
    availability: "available",
    displayName: "img2threejs",
    id: "img2threejs",
    license: img2ThreejsManifest.license,
    mcp: {
      argv: {
        arguments: [
          { name: "assetId", positional: true },
          { flag: "--recipe", name: "recipe" },
          { flag: "--out", name: "out" },
          { flag: "--overwrite-policy", name: "overwritePolicy" },
        ],
        fixed: ["--provider", "img2threejs"],
        prefix: ["asset", "generate"],
        projectScoped: true,
      },
      description: "Finalize a reviewed project-local img2threejs workspace through tn asset generate --json.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          assetId: { pattern: assetIdPattern, type: "string" },
          out: { pattern: "^assets/generated/[a-z][a-z0-9._-]*\\.glb$", type: "string" },
          overwritePolicy: { enum: ["manual", "replace", "skip"], type: "string" },
          recipe: { pattern: "^content/generators/[a-z][a-z0-9._-]*\\.img2threejs\\.json$", type: "string" },
        },
        required: ["assetId", "recipe"],
        type: "object",
      },
      name: "asset.generate_img2threejs",
    },
    mcpAvailability: "available",
    mcpPathRoles: [
      { argument: "recipe", kind: "reviewed-source" },
      { argument: "out", defaultFromAssetId: true, kind: "generated-output" },
    ],
    providerVersion: img2ThreejsManifest.skillVersion,
    provenanceOperation: "generator.record_img2threejs",
    runGenerator: async (context) => (context.img2ThreejsRunner ?? (await import("../img2threejs/runImg2ThreejsGenerator.js")).runImg2ThreejsGenerator)(context.projectPath, context.generatorId, context.img2ThreejsDependencies),
    upstream: {
      internalForkTree: img2ThreejsManifest.internalForkTree,
      internalForkUrl: img2ThreejsManifest.internalForkUrl,
      repository: img2ThreejsManifest.repository,
      reviewedCommit: img2ThreejsManifest.reviewedCommit,
      skillVersion: img2ThreejsManifest.skillVersion,
    },
    usage: "tn asset generate <asset-id> --provider img2threejs --recipe <project-path> [--out <path>] [--overwrite-policy manual|replace|skip] [--project <path>] [--json]",
  },
] as const satisfies readonly IAssetGenerationProviderDescriptor[];

export const assetGenerationMcpAdapters = assetGenerationProviderRegistry
  .filter((provider) => provider.mcpAvailability === "available")
  .map((provider) => ({ ...provider.mcp, pathRoles: provider.mcpPathRoles }));

export const BLENDER_ASSET_GENERATION_PROVIDER = assetGenerationProviderRegistry[0];
export const IMG2THREEJS_ASSET_GENERATION_PROVIDER = assetGenerationProviderRegistry[1];

export function findAssetGenerationProvider(id: string): (typeof assetGenerationProviderRegistry)[number] | undefined {
  return assetGenerationProviderRegistry.find((provider) => provider.id === id);
}

export function isReviewedImg2ThreejsCommit(commit: string): boolean {
  return assetGenerationProviderRegistry.some((provider) => provider.id === "img2threejs" && provider.upstream?.reviewedCommit === commit);
}

export function renderAssetGenerationProviderHelp(): string {
  return assetGenerationProviderRegistry.map((provider) => provider.usage).join("\n              ");
}

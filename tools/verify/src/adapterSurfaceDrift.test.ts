import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  getAuthoringOperationDescriptor,
  listAuthoringOperationDescriptors,
  type IAuthoringOperationAdapterExclusion,
  type IAuthoringOperationDescriptor,
} from "@threenative/authoring";
import { assetGenerationProviderRegistry, CLI_COMMAND_REGISTRY } from "@threenative/cli";

test("every batchable operation owns targets and adapter metadata", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const root = resolve(new URL("../../..", import.meta.url).pathname);
  const mcpServer = await readFile(resolve(root, "packages/mcp-server/src/index.ts"), "utf8");
  const missing = descriptors.flatMap(descriptorMetadataGaps);

  assert.equal(mcpServer.includes("AUTHORING_OPERATION_NAMES.map"), true, "MCP exposure must derive from the authoring operation registry.");
  assert.deepEqual(missing, [], `Descriptor-owned adapter metadata is incomplete:\n${missing.join("\n")}`);
});

test("should enroll every local generation provider across owned adapter surfaces", async () => {
  const root = resolve(new URL("../../..", import.meta.url).pathname);
  const mcpServer = await readFile(resolve(root, "packages/mcp-server/src/index.ts"), "utf8");
  const configured = CLI_COMMAND_REGISTRY.asset.adapters?.mcp;
  const adapters = (Array.isArray(configured) ? configured : configured === undefined ? [] : [configured])
    .filter((adapter) => adapter.name.startsWith("asset.generate_"));
  const providers = assetGenerationProviderRegistry.filter((provider) => provider.mcpAvailability === "available");

  assert.deepEqual(adapters.map((adapter) => adapter.name), providers.map((provider) => provider.mcp.name));
  assert.equal(new Set(providers.map((provider) => provider.id)).size, providers.length);
  assert.equal(new Set(providers.map((provider) => provider.mcp.name)).size, providers.length);
  for (const provider of providers) {
    const adapter = adapters.find((candidate) => candidate.name === provider.mcp.name);
    assert.notEqual(adapter, undefined, `${provider.id}:mcp-enrollment`);
    const { pathRoles, ...publicAdapter } = adapter!;
    assert.deepEqual(publicAdapter, provider.mcp, `${provider.id}:public-mcp-contract`);
    assert.deepEqual(pathRoles, provider.mcpPathRoles, `${provider.id}:path-roles`);
    assert.deepEqual(provider.mcp.argv.fixed, ["--provider", provider.id], `${provider.id}:fixed-provider-argv`);
    assert.equal(provider.mcp.name, `asset.generate_${provider.id}`);
    assert.equal(provider.mcpPathRoles.some((role) => role.argument === "recipe" && role.kind === "reviewed-source"), true, `${provider.id}:recipe-role`);
    assert.equal(provider.mcpPathRoles.some((role) => role.argument === "out" && role.kind === "generated-output" && role.defaultFromAssetId === true), true, `${provider.id}:output-role`);
    assert.equal(typeof provider.runGenerator, "function", `${provider.id}:runner`);
    assert.equal(getAuthoringOperationDescriptor(provider.provenanceOperation)?.name, provider.provenanceOperation, `${provider.id}:provenance-operation`);
    assert.equal(CLI_COMMAND_REGISTRY.asset.usage.split(provider.usage).length - 1, 1, `${provider.id}:help`);
  }
  assert.equal(mcpServer.includes("commandRegistryBackedMcpTools"), true, "MCP tools must derive from CLI command adapters.");
  assert.equal(mcpServer.includes('name === "asset.generate_'), false, "MCP implementation must not branch on local provider tool names.");
  assert.equal(mcpServer.includes("runImg2ThreejsGenerator"), false, "MCP must not own an img2threejs exporter.");
});

function descriptorMetadataGaps(descriptor: IAuthoringOperationDescriptor): string[] {
  const gaps: string[] = [];
  if (typeof descriptor.targetResolver !== "function") gaps.push(`${descriptor.name}:target-resolver`);
  requireAdapterOrExclusion(descriptor, "cli", descriptor.adapters?.cli, descriptor.adapterExclusions?.cli, gaps);
  requireAdapterOrExclusion(descriptor, "editor", descriptor.adapters?.editor, descriptor.adapterExclusions?.editor, gaps);
  requireAdapterOrExclusion(descriptor, "editor-smoke", descriptor.adapters?.editor?.smoke, descriptor.adapterExclusions?.editorSmoke, gaps);
  if (descriptor.mutationPolicy === "read-only" && descriptor.adapters?.editor?.smoke !== undefined) {
    gaps.push(`${descriptor.name}:read-only-editor-smoke`);
  }
  return gaps;
}

function requireAdapterOrExclusion(
  descriptor: IAuthoringOperationDescriptor,
  surface: string,
  adapter: unknown,
  exclusion: IAuthoringOperationAdapterExclusion | undefined,
  gaps: string[],
): void {
  if (adapter !== undefined && exclusion !== undefined) {
    gaps.push(`${descriptor.name}:${surface}:both-adapter-and-exclusion`);
    return;
  }
  if (adapter === undefined && !validExclusion(exclusion)) gaps.push(`${descriptor.name}:${surface}`);
}

function validExclusion(exclusion: IAuthoringOperationAdapterExclusion | undefined): boolean {
  return exclusion !== undefined
    && exclusion.category === "product-exclusion"
    && exclusion.owner.trim().length >= 3
    && exclusion.reason.trim().length >= 20
    && /^\d{4}-\d{2}-\d{2}$/u.test(exclusion.reviewed);
}

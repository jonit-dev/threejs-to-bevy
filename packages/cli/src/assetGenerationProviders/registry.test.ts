import assert from "node:assert/strict";
import test from "node:test";

import { getAuthoringOperationDescriptor } from "@threenative/authoring";

import { EXTERNAL_TOOL_REGISTRY } from "../externalTools/registry.js";
import { assetGenerationProviderRegistry, isReviewedImg2ThreejsCommit, renderAssetGenerationProviderHelp } from "./registry.js";

test("should retain one complete descriptor for each local generation provider", () => {
  assert.deepEqual(assetGenerationProviderRegistry.map((provider) => provider.id), ["blender", "img2threejs"]);
  assert.equal(new Set(assetGenerationProviderRegistry.map((provider) => provider.id)).size, assetGenerationProviderRegistry.length);
  assert.equal(new Set(assetGenerationProviderRegistry.map((provider) => provider.mcp.name)).size, assetGenerationProviderRegistry.length);
  for (const provider of assetGenerationProviderRegistry) {
    assert.ok(provider.providerVersion);
    assert.ok(provider.license.name);
    assert.ok(provider.license.spdx);
    assert.ok(provider.license.url);
    assert.ok(provider.usage.startsWith(`tn asset generate <asset-id> --provider ${provider.id}`));
    assert.deepEqual(provider.mcp.argv.fixed, ["--provider", provider.id]);
    assert.equal(provider.mcp.name, `asset.generate_${provider.id}`);
    assert.equal(typeof provider.runGenerator, "function");
    assert.equal(getAuthoringOperationDescriptor(provider.provenanceOperation)?.name, provider.provenanceOperation);
  }
  const img2threejs = assetGenerationProviderRegistry[1];
  assert.equal(assetGenerationProviderRegistry[0]?.providerVersion, EXTERNAL_TOOL_REGISTRY.blender.version);
  assert.equal(assetGenerationProviderRegistry[0]?.license.name, EXTERNAL_TOOL_REGISTRY.blender.license.name);
  assert.equal(assetGenerationProviderRegistry[0]?.license.url, EXTERNAL_TOOL_REGISTRY.blender.license.url);
  assert.equal(img2threejs?.availability, "available");
  assert.equal(img2threejs?.upstream?.reviewedCommit, "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b");
  assert.equal(img2threejs?.upstream?.internalForkTree, "3f410de76c9a7ae53875abe7b47f99edf3beb2a6");
});

test("should reject an unreviewed img2threejs commit", () => {
  assert.equal(isReviewedImg2ThreejsCommit("e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b"), true);
  assert.equal(isReviewedImg2ThreejsCommit("0000000000000000000000000000000000000000"), false);
});

test("should derive provider help in registry order", () => {
  const help = renderAssetGenerationProviderHelp();
  assert.ok(help.indexOf("--provider blender") < help.indexOf("--provider img2threejs"));
  for (const provider of assetGenerationProviderRegistry) assert.equal(help.split(provider.usage).length - 1, 1);
});

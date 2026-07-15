import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  listAuthoringOperationDescriptors,
  type IAuthoringOperationAdapterExclusion,
  type IAuthoringOperationDescriptor,
} from "@threenative/authoring";

test("every batchable operation owns targets and adapter metadata", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const root = resolve(new URL("../../..", import.meta.url).pathname);
  const mcpServer = await readFile(resolve(root, "packages/mcp-server/src/index.ts"), "utf8");
  const missing = descriptors.flatMap(descriptorMetadataGaps);

  assert.equal(mcpServer.includes("AUTHORING_OPERATION_NAMES.map"), true, "MCP exposure must derive from the authoring operation registry.");
  assert.deepEqual(missing, [], `Descriptor-owned adapter metadata is incomplete:\n${missing.join("\n")}`);
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

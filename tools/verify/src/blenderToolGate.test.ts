import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { blenderMcpOutcomeCoverage, EXTERNAL_TOOL_REGISTRY } from "@threenative/cli";

import { validateBlenderToolEvidence, type IBlenderToolGateEvidence } from "./blenderToolGate.js";

const runnerSha256 = createHash("sha256")
  .update(readFileSync(fileURLToPath(new URL("../../../packages/cli/src/blender/runner.py", import.meta.url))))
  .digest("hex");

test("should pass complete pinned host evidence", () => {
  const result = validateBlenderToolEvidence(validEvidence());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("should fail when install was implicit or unverified", () => {
  const evidence = validEvidence(); evidence.hosts[0]!.installAcknowledged = false;
  assertCode(evidence, "TN_VERIFY_BLENDER_INSTALL_UNVERIFIED");
});

test("should fail when forbidden code execution surface appears", () => {
  const evidence = validEvidence(); evidence.hosts[0]!.hardenedArgv = ["--background", "--python", "user.py"];
  assertCode(evidence, "TN_VERIFY_BLENDER_FORBIDDEN_EXECUTION_SURFACE");
});

test("should fail when semantic output exceeds tolerance", () => {
  const evidence = validEvidence(); evidence.hosts[0]!.recipes![0]!.bounds.max[0] = evidence.hosts[0]!.recipes![0]!.bounds.max[0]! + 0.1;
  assertCode(evidence, "TN_VERIFY_BLENDER_SEMANTIC_EVIDENCE_MISSING");
});

test("should require cleanup evidence after negative controls", () => {
  const evidence = validEvidence(); evidence.negativeControls[0]!.cleanup = false;
  assertCode(evidence, "TN_VERIFY_BLENDER_NEGATIVE_CONTROL_MISSING");
});

test("should require evidence for at least nineteen upstream feature rows", () => {
  const evidence = validEvidence(); evidence.coverage[18]!.disposition = "deferred";
  assertCode(evidence, "TN_VERIFY_BLENDER_COVERAGE_INCOMPLETE");
});

test("should keep unsafe code execution labeled safe replacement", () => {
  const evidence = validEvidence(); evidence.coverage[3]!.disposition = "full";
  assertCode(evidence, "TN_VERIFY_BLENDER_UNSAFE_PARITY_CLAIM");
});

test("should keep three deferred Hunyuan rows visible", () => {
  const evidence = validEvidence(); evidence.coverage[21]!.disposition = "equivalent";
  assertCode(evidence, "TN_VERIFY_BLENDER_HUNYUAN_DEFERRAL_INVALID");
});

test("should reject provider evidence containing credentials or signed URLs", () => {
  const evidence = validEvidence(); evidence.providers[0]!.evidence = "https://cdn.test/model?signature=secret-value";
  assertCode(evidence, "TN_VERIFY_BLENDER_PROVIDER_SECRET_FOUND");
});

function assertCode(evidence: IBlenderToolGateEvidence, code: string): void {
  const result = validateBlenderToolEvidence(evidence);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((row) => row.code === code), true);
}

function validEvidence(): IBlenderToolGateEvidence {
  const recipeRows = { "prop.barrier": [4, 12, 1584], "prop.crate": [3, 14, 168], "prop.pickup": [3, 11, 2398] } as const;
  const recipeBounds = {
    "prop.barrier": { min: [-1.675000011920929, 0, -0.4749999940395355], max: [1.675000011920929, 1.6299999803304672, 0.4749999940395355] },
    "prop.crate": { min: [-0.8100000023841858, 0, -0.7550000138580799], max: [0.8100000023841858, 1.297648043179041, 0.75] },
    "prop.pickup": { min: [-0.7000000338827698, 0, -0.8500000450959003], max: [0.7000000338827698, 1.9450000884143757, 0.8500000450959003] },
  } as const;
  const recipe = (id: keyof typeof recipeRows) => { const [materials, meshes, triangles] = recipeRows[id]; return { authoringValid: true, bounds: { max: [...recipeBounds[id].max], min: [...recipeBounds[id].min] }, buildPassed: true, glbBytes: 100, glbSha256: "1".repeat(64), id, materials, meshes, triangles }; };
  const artifact = EXTERNAL_TOOL_REGISTRY.blender.artifacts["linux-x64"];
  return {
    coverage: blenderMcpOutcomeCoverage.map(({ disposition, evidence, id, mcpTool, owner, upstreamTool }) => ({ disposition, evidence, id, mcpTool, owner, upstreamTool })),
    hosts: [
      {
        archiveBytes: 377_898_640, cleanup: { noLocks: true, noProcesses: true, noStaging: true }, disposition: "promoted", durationMs: 1,
        cacheBytes: artifact.expectedBytes + 1, executableVersion: "4.5.11", hardenedArgv: ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", "<owned-runner>", "--", "--job", "<owned-job>"],
        host: "linux-x64", installAcknowledged: true, recipes: [recipe("prop.barrier"), recipe("prop.crate"), recipe("prop.pickup")], runnerSha256, sha256: artifact.sha256, sourceUrl: artifact.url,
      },
      ...(["macos-x64", "macos-arm64", "windows-x64"] as const).map((host) => ({ cleanup: { noLocks: true, noProcesses: true, noStaging: true }, disposition: "rejected" as const, host, rejection: { code: "TN_EXTERNAL_TOOL_HOST_UNPROVEN", message: "Real execution proof is not yet available for this host." } })),
    ],
    negativeControls: ["archive-hash", "archive-tar-traversal", "archive-zip-traversal", "download-interrupted", "lock-stale", "process-timeout", "recipe-budget", "recipe-code-field", "recipe-path", "output-malformed", "output-oversized"].map((id) => ({ cleanup: true, diagnostic: "TN_TEST_REJECTED", evidence: "tools/verify/src/blenderToolGate.test.ts", id, passed: true })),
    providers: ["poly-haven", "sketchfab", "hyper3d"].map((id) => ({ evidence: "docs/PRDs/other/optional-headless-blender-asset-generation.md", id: id as "hyper3d" | "poly-haven" | "sketchfab", offlineAfterAcquisition: true, secretFree: true, status: "verified" as const })),
    schema: "threenative.blender-tool-evidence", version: "0.1.0",
  };
}

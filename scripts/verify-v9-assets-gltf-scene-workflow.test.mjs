import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  allowDocumentedTargetSpecificNetworkDiagnostics,
  compareGltfHandleObservations,
  requiredArtifactPaths,
  validateRequiredArtifacts,
} from "./verify-v9-assets-gltf-scene-workflow.mjs";

test("should require inspection and reload artifacts in the v9 assets report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-assets-artifacts-"));
  const artifactDir = join(root, "artifacts");
  try {
    await mkdir(artifactDir, { recursive: true });
    const artifacts = requiredArtifactPaths(artifactDir);
    await writeFile(artifacts.webReportPath, "{}\n");
    await writeFile(artifacts.nativeReportPath, "{}\n");
    await writeFile(artifacts.diffPath, "{}\n");

    const diagnostics = await validateRequiredArtifacts({ artifacts });

    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_VERIFY_V9_ARTIFACT_MISSING", "TN_VERIFY_V9_ARTIFACT_MISSING"],
    );
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path),
      ["artifacts.inspectionPath", "artifacts.reloadReportPath"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should compare web and native gltf handle observations", () => {
  const diagnostics = compareGltfHandleObservations(
    [{ after: { visible: false }, handle: "handle.door", operation: "visibility", status: "applied" }],
    [{ after: { visible: true }, handle: "handle.door", operation: "visibility", status: "applied" }],
  );

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_VERIFY_V9_GLTF_HANDLE_MISMATCH");
});

test("should allow documented target-specific network diagnostics", () => {
  const diagnostics = allowDocumentedTargetSpecificNetworkDiagnostics(
    { diagnostics: [] },
    {
      diagnostics: [
        {
          assetId: "texture.remote",
          code: "TN_BEVY_ASSET_RELOAD_NETWORK_UNSUPPORTED",
          message: "network asset reload unsupported on native",
          severity: "warning",
        },
      ],
    },
  );

  assert.deepEqual(diagnostics, []);
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { verifyInputUiAccessibility } from "./verify-v9-input-ui-accessibility.mjs";

test("should require picking overlay evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-input-ui-a11y-"));
  try {
    const result = await verifyInputUiAccessibility({ repoRoot: root, writeArtifacts: false });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_V9_PICKING_OVERLAY_MISSING");
    assert.match(result.diagnostics[0]?.repairHint ?? "", /picking-debug/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when accessibility report omits repair hints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-input-ui-a11y-repair-"));
  try {
    const result = await verifyInputUiAccessibility({
      repoRoot: root,
      writeAccessibilityArtifacts: async ({ artifactDir }) => {
        await mkdir(artifactDir, { recursive: true });
        await writeFile(
          resolve(artifactDir, "accessibility-report.json"),
          `${JSON.stringify({ diagnostics: [{ code: "TN_UI_A11Y_NAME_MISSING", path: "ui.nodes[root]", severity: "error" }] })}\n`,
        );
        await writeFile(resolve(artifactDir, "ui-debug-report.json"), `${JSON.stringify({ gizmos: [{}], nodes: [{}] })}\n`);
      },
      writePickingArtifacts: async ({ pickingOverlayDir }) => {
        await mkdir(pickingOverlayDir, { recursive: true });
        await writeFile(
          resolve(pickingOverlayDir, "overlay-report.json"),
          `${JSON.stringify({ eventLog: ["dragStart"], meshBounds: [{}], pointerRays: [{}], uiBounds: [{}] })}\n`,
        );
        await writeFile(
          resolve(pickingOverlayDir, "drag-log.json"),
          `${JSON.stringify({ events: [{ kind: "dragStart" }, { kind: "dragMove" }, { kind: "drop" }, { kind: "dragEnd" }] })}\n`,
        );
      },
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_V9_ACCESSIBILITY_REPAIR_HINT_MISSING"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

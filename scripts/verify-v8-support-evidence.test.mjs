import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { verifyV8SupportEvidence } from "./verify-v8-support-evidence.mjs";

test("should write passing V8 support evidence gate with required artifacts and remaining gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v8-support-"));
  try {
    await writeRequiredEvidenceArtifacts(root);

    const artifactDir = join(root, "artifacts/v8/support-evidence");
    const reportPath = join(artifactDir, "verification-report.json");
    const result = await verifyV8SupportEvidence({
      artifactDir,
      repoRoot: root,
      reportPath,
      run: async ({ args, command, name }) => ({
        durationMs: 4,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({ args, command, name, status: "pass" }),
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    const cameraEvidence = saved.evidence.find((evidence) => evidence.id === "V8-06");
    const saveSlotEvidence = saved.evidence.find((evidence) => evidence.id === "V8-17");
    const supportEvidence = saved.evidence.find((evidence) => evidence.id === "V8-18");

    assert.equal(result.ok, true);
    assert.equal(saved.code, "TN_VERIFY_V8_SUPPORT_EVIDENCE_OK");
    assert.equal(saved.mode, "inventory");
    assert.equal(saved.schema, "threenative.verify.v8-support-evidence");
    assert.equal(saved.steps[0]?.name, "check v8 docs");
    assert.equal(saved.steps[1]?.name, "inventory v8 support evidence");
    assert.equal(saved.steps[1]?.exitCode, 0);
    assert.equal(cameraEvidence.reportPaths[0]?.exists, true);
    assert.equal(cameraEvidence.screenshotPaths[0]?.exists, true);
    assert.equal(cameraEvidence.screenshotPaths[2]?.exists, true);
    assert.equal(saved.evidence.length, 17);
    assert.match(saveSlotEvidence.prdPath, /V8-17-portable-save-slots-settings-local-data\.md/);
    assert.equal(saveSlotEvidence.remainingGaps[0], "Not evaluated by the V8-18 support-evidence slice; use the owning PRD verifier/evidence.");
    assert.match(supportEvidence.reportPaths[0]?.path, /artifacts\/v8\/support-evidence\/verification-report\.json/);
    assert.equal(supportEvidence.remainingGaps.some((gap) => gap.includes("Large-scene stress fixtures")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when required V8 support evidence artifacts are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v8-support-"));
  try {
    await writeFileAt(root, "artifacts/v8/camera-views/verification-report.json", "{}\n");
    await writeFileAt(root, "artifacts/v8/camera-views/web.png", "png\n");
    await writeFileAt(root, "artifacts/v8/camera-views/bevy.png", "png\n");

    const reportPath = join(root, "artifacts/v8/support-evidence/verification-report.json");
    const result = await verifyV8SupportEvidence({
      repoRoot: root,
      reportPath,
      run: async ({ args, command, name }) => ({
        durationMs: 4,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({ args, command, name, status: "pass" }),
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    const missingDiagnostic = saved.diagnostics.find((diagnostic) => diagnostic.code === "TN_VERIFY_V8_SUPPORT_EVIDENCE_ARTIFACT_MISSING");

    assert.equal(result.ok, false);
    assert.equal(saved.status, "fail");
    assert.equal(saved.steps[1]?.name, "inventory v8 support evidence");
    assert.equal(saved.steps[1]?.exitCode, 1);
    assert.match(saved.steps[1]?.stderr, /artifacts\/v8\/camera-views\/contact-sheet\.png/);
    assert.equal(missingDiagnostic.severity, "error");
    assert.equal(missingDiagnostic.artifacts.some((artifact) => /camera-views\/contact-sheet\.png$/.test(artifact.path)), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report docs-check command failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v8-support-"));
  try {
    const reportPath = join(root, "artifacts/v8/support-evidence/verification-report.json");
    const result = await verifyV8SupportEvidence({
      repoRoot: root,
      reportPath,
      run: async () => ({
        durationMs: 2,
        exitCode: 1,
        stderr: "docs failed",
        stdout: "",
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(saved.status, "fail");
    assert.equal(saved.diagnostics[0]?.code, "TN_VERIFY_V8_SUPPORT_EVIDENCE_STEP_FAILED");
    assert.equal(saved.diagnostics[0]?.step, "check v8 docs");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeRequiredEvidenceArtifacts(root) {
  const requiredPaths = [
    "artifacts/v8/procedural-mesh/verification-report.json",
    "artifacts/v8/procedural-mesh/web.png",
    "artifacts/v8/procedural-mesh/bevy.png",
    "artifacts/v8/procedural-mesh/contact-sheet.png",
    "artifacts/v8-overlay-webview/verification-report.json",
    "artifacts/v8/camera-views/verification-report.json",
    "artifacts/v8/camera-views/web.png",
    "artifacts/v8/camera-views/bevy.png",
    "artifacts/v8/camera-views/contact-sheet.png",
    "artifacts/v8/material-parity/verification-report.json",
    "artifacts/v8/material-parity/web.png",
    "artifacts/v8/material-parity/bevy.png",
    "artifacts/v8/material-parity/contact-sheet.png",
  ];
  await Promise.all(requiredPaths.map((path) => writeFileAt(root, path, path.endsWith(".json") ? "{}\n" : "png\n")));
}

async function writeFileAt(root, file, content) {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

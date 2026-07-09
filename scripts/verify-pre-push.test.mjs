import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyPrePushGate } from "./verify-pre-push.mjs";

test("verify pre-push runs workspace, conformance, and parity phases", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-pre-push-"));
  const artifactDir = join(root, "artifacts");
  const commands = [];
  try {
    const report = await verifyPrePushGate({
      artifactDir,
      conformanceVerifier: {
        ok: true,
        reportPath: join(root, "conformance-report.json"),
        steps: [{ durationMs: 1, exitCode: 0, name: "ir conformance fixtures", stderr: "", stdout: "" }],
      },
      parityVerifier: {
        artifacts: { visualReportPath: join(root, "parity-visual.json") },
        ok: true,
        reportPath: join(root, "parity-report.json"),
        steps: [{ durationMs: 1, exitCode: 0, name: "verify baseline visual parity checkpoints", stderr: "", stdout: "" }],
      },
      repoRoot: root,
      run: async ({ name }) => {
        commands.push(name);
        return {
          durationMs: 1,
          exitCode: 0,
          name,
          stderr: "",
          stdout: "",
        };
      },
    });

    assert.equal(report.status, "pass");
    assert.equal(report.code, "TN_VERIFY_PRE_PUSH_OK");
    assert.ok(commands.includes("build workspace"));
    assert.ok(commands.includes("build bevy capture"));
    assert.equal(commands.includes("build verify tools"), false);
    assert.ok(commands.includes("typecheck"));
    assert.equal(commands.includes("lint"), false);
    assert.ok(commands.includes("gameplay parity smoke"));
    assert.ok(commands.includes("package tests"));
    assert.ok(commands.includes("rust tests"));
    assert.equal(commands.includes("script tests"), false);
    assert.match(String(report.artifacts.gameplayParityReportPath), /gameplay-parity\/verification-report\.json$/);
    assert.ok(report.steps.some((step) => step.name === "conformance: ir conformance fixtures"));
    assert.ok(report.steps.some((step) => step.name === "parity: verify baseline visual parity checkpoints"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify pre-push stops after the first failed phase", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-pre-push-fail-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyPrePushGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: name === "typecheck" ? 1 : 0,
        name,
        stderr: name === "typecheck" ? "type error" : "",
        stdout: "",
      }),
    });

    assert.equal(report.status, "fail");
    assert.equal(report.failedPhase, "static checks");
    assert.equal(report.steps.some((step) => step.name.startsWith("conformance:")), false);
    assert.equal(report.steps.some((step) => step.name.startsWith("parity:")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyPrePushGate } from "./verify-pre-push.mjs";

test("should run Rust quality in static checks", async () => {
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
      run: async (request) => {
        commands.push(request);
        return {
          durationMs: 1,
          exitCode: 0,
          name: request.name,
          stderr: "",
          stdout: request.name === "rust quality"
            ? JSON.stringify({ artifact: { report: "tools/verify/artifacts/rust-quality/report.json" } })
            : "",
        };
      },
    });

    assert.equal(report.status, "pass");
    assert.equal(report.code, "TN_VERIFY_PRE_PUSH_OK");
    const commandNames = commands.map((command) => command.name);
    assert.ok(commandNames.includes("build workspace"));
    assert.ok(commandNames.includes("build bevy capture"));
    assert.equal(commandNames.includes("build verify tools"), false);
    assert.ok(commandNames.includes("typecheck"));
    assert.equal(commandNames.includes("lint"), false);
    assert.ok(commandNames.includes("gameplay parity smoke"));
    assert.ok(commandNames.includes("package tests"));
    assert.ok(commandNames.includes("rust tests"));
    assert.equal(commandNames.includes("script tests"), false);
    assert.equal(commandNames.filter((name) => name === "rust quality").length, 1);
    assert.deepEqual(commands.find((command) => command.name === "rust quality"), {
      args: ["--silent", "check:rust", "--", "--json"],
      command: "pnpm",
      cwd: root,
      env: undefined,
      name: "rust quality",
      timeoutMs: 1_860_000,
    });
    assert.match(String(report.artifacts.gameplayParityReportPath), /gameplay-parity\/verification-report\.json$/);
    assert.ok(report.steps.some((step) => step.name === "conformance: ir conformance fixtures"));
    assert.ok(report.steps.some((step) => step.name === "parity: verify baseline visual parity checkpoints"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should stop when Rust quality fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-pre-push-rust-fail-"));
  const artifactDir = join(root, "artifacts");
  const commands = [];
  const rustArtifact = {
    report: "custom/rust-quality/failure-report.json",
    logs: ["custom/rust-quality/clippy.stderr.log"],
  };
  try {
    const report = await verifyPrePushGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => {
        commands.push(name);
        return {
          durationMs: 1,
          exitCode: name === "rust quality" ? 1 : 0,
          name,
          stderr: "",
          stdout: name === "rust quality"
            ? JSON.stringify({ artifact: rustArtifact })
            : "",
        };
      },
    });

    assert.equal(report.status, "fail");
    assert.equal(report.failedPhase, "static checks");
    assert.deepEqual(report.artifacts.rustQuality, rustArtifact);
    assert.equal(report.artifacts.rustQualityReportPath, join(root, rustArtifact.report));
    assert.equal(commands.includes("gameplay parity smoke"), false);
    assert.equal(commands.includes("package tests"), false);
    assert.equal(commands.includes("rust tests"), false);
    assert.equal(report.steps.some((step) => step.name.startsWith("conformance:")), false);
    assert.equal(report.steps.some((step) => step.name.startsWith("parity:")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve Rust report metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-pre-push-rust-report-"));
  const artifactDir = join(root, "artifacts");
  const rustArtifact = {
    report: "custom/rust-quality/report.json",
    logs: ["custom/rust-quality/clippy.stdout.log"],
  };
  try {
    const report = await verifyPrePushGate({
      artifactDir,
      conformanceVerifier: { ok: true, reportPath: join(root, "conformance.json"), steps: [] },
      parityVerifier: { artifacts: {}, ok: true, reportPath: join(root, "parity.json"), steps: [] },
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: name === "rust quality" ? JSON.stringify({ artifact: rustArtifact }) : "",
      }),
    });

    assert.deepEqual(report.artifacts.rustQuality, rustArtifact);
    assert.equal(report.artifacts.rustQualityReportPath, join(root, rustArtifact.report));
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

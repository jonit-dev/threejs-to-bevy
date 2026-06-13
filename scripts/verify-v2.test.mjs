import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV2 } from "./verify-v2.mjs";

test("should emit v2 verification report", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "tn-v2-gate-"));
  const commands = [];
  try {
    const result = await verifyV2({
      artifactDir,
      repoRoot: process.cwd(),
      run: async ({ args, command, cwd, name }) => {
        commands.push({ args, command, cwd, name });
        return {
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "",
        };
      },
      runReady: async ({ args, command, cwd, name }) => {
        commands.push({ args, command, cwd, name });
        return {
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "TN_DEV_DESKTOP_READY",
        };
      },
    });

    const report = JSON.parse(await readFile(result.reportPath, "utf8"));

    assert.equal(result.ok, true);
    assert.equal(report.status, "pass");
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "check v2 docs",
        "build cli",
        "verify conformance",
        "rebuild v2 arena",
        "validate v2 arena bundle",
        "compile v2 arena tests",
        "test v2 arena gameplay",
        "verify v2 arena web",
        "native v2 runtime tests",
        "native v2 desktop smoke",
      ],
    );
    assert.deepEqual(
      report.capabilities.map((capability) => capability.capability),
      ["cross-runtime conformance", "bundle validation", "web visual", "input", "movement", "physics", "ui", "audio", "native load"],
    );
    assert.equal(commands[2]?.name, "ir conformance fixtures");
    assert.equal(commands[3]?.name, "web runtime conformance");
    assert.equal(commands[4]?.name, "bevy runtime conformance");
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});

test("should fail when arena report fails", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "tn-v2-gate-fail-"));
  try {
    const result = await verifyV2({
      artifactDir,
      repoRoot: process.cwd(),
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: name === "verify v2 arena web" ? 1 : 0,
        stderr: name === "verify v2 arena web" ? "web report failed" : "",
        stdout: "",
      }),
    });
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));

    assert.equal(result.ok, false);
    assert.equal(report.status, "fail");
    assert.equal(report.capabilities.find((capability) => capability.capability === "web visual")?.status, "fail");
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});

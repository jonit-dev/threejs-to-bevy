import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV3 } from "./verify-v3.mjs";

test("should run v3 performance gate", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "tn-v3-gate-"));
  try {
    const commands = [];
    const result = await verifyV3({
      artifactDir,
      repoRoot: process.cwd(),
      environmentVerifier: async ({ artifactDir }) => ({
        artifacts: {
          reportPath: join(artifactDir, "v3-environment-report.json"),
        },
        status: "pass",
      }),
      run: async ({ args, command, cwd, name }) => {
        commands.push({ args, command, cwd, name });
        return { durationMs: 1, exitCode: 0, stderr: "", stdout: "" };
      },
    });
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));

    assert.equal(report.status, "pass");
    assert.deepEqual(commands.map((command) => command.name), ["check v3 docs", "build cli", "build v3 environment", "validate v3 environment bundle"]);
    assert.equal(report.steps.at(-1)?.name, "verify v3 environment performance");
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});

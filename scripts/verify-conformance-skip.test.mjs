import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyConformance } from "./verify-conformance.mjs";

test("verify conformance can skip runtime unit steps covered by full test suites", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-conformance-skip-"));
  try {
    const commands = [];
    const report = await verifyConformance({
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
      skipDuplicateRuntimeTests: true,
    });

    assert.equal(report.ok, true);
    assert.equal(commands.includes("ir conformance fixtures"), false);
    assert.equal(commands.includes("web runtime conformance"), false);
    assert.equal(commands.includes("bevy runtime conformance"), false);
    assert.ok(commands.includes("bevy native observation report"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

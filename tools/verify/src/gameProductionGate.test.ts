import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runGameProductionGate } from "./gameProductionGate.js";

test("fails release when required artifacts are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-production-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({ projectPath: ".", reportPath, root });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      ok: boolean;
      report: { diagnostics: Array<{ code: string }> };
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_SCREENSHOT_EVIDENCE_MISSING"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_PLAYABLE_LOOP_MISSING"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_RELEASE_BUILD_PROOF_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { playtestScaffoldCommand } from "./playtestScaffold.js";
import { loadPlaytestScenario } from "./playtestScenario.js";

test("should emit a loader-valid scenario when scaffolding pickup mechanic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-scaffold-"));
  try {
    const result = await playtestScaffoldCommand(
      ["--assert", "pickup", "--project", ".", "--subject", "player", "--resource", "GameState", "--hud", "score-label", "--json"],
      root,
    );
    const payload = JSON.parse(result.stdout) as { scenarioPath: string; scenario: { assert: { hud: Array<{ id: string }>; resources: Array<{ id: string }> }; subject: string } };
    const loaded = await loadPlaytestScenario(root, payload.scenarioPath);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.scenarioPath, "playtests/proof-pickup.playtest.json");
    assert.equal(loaded.name, "proof-pickup");
    assert.equal(loaded.subject, "player");
    assert.equal(loaded.assert?.resources?.[0]?.id, "GameState");
    assert.equal(loaded.assert?.hud?.[0]?.id, "score-label");
    assert.equal(loaded.assert?.movement?.entity, "player");
    assert.equal(loaded.assert?.contacts?.[0]?.with, "pickup");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown mechanic with fix guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-scaffold-"));
  try {
    const result = await playtestScaffoldCommand(["--assert", "boss-fight", "--project", ".", "--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; fix: { instruction: string }; supportedMechanics: string[] };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_PLAYTEST_SCAFFOLD_ASSERTION_UNKNOWN");
    assert.match(payload.fix.instruction, /movement, pickup, win-state, retry/);
    assert.deepEqual(payload.supportedMechanics, ["movement", "pickup", "win-state", "retry"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

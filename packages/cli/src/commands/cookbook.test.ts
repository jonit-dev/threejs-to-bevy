import test from "node:test";
import assert from "node:assert/strict";

import { cookbookCommand } from "./cookbook.js";

test("should list all entries when docs present", async () => {
  const result = await cookbookCommand(["list", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { count: number; entries: Array<{ id: string }> };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.count >= 16, true);
  assert.equal(payload.entries.some((entry) => entry.id === "player-move-wasd"), true);
});

test("should suggest nearest id when id unknown", async () => {
  const result = await cookbookCommand(["show", "player-move-was", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; suggestion?: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_COOKBOOK_UNKNOWN_ID");
  assert.equal(payload.suggestion, "player-move-wasd");
});

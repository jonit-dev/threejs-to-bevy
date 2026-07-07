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

test("should show entry through direct topic shorthand", async () => {
  const result = await cookbookCommand(["hud-score-binding", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; entry?: { goal: string; id: string; proof: string } };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_COOKBOOK_SHOW_OK");
  assert.equal(payload.entry?.id, "hud-score-binding");
  assert.match(payload.entry?.goal ?? "", /HUD/);
  assert.match(payload.entry?.proof ?? "", /tn playtest/);
});

test("should suggest nearest id through direct topic shorthand", async () => {
  const result = await cookbookCommand(["hud-score-bnding", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; suggestion?: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_COOKBOOK_UNKNOWN_ID");
  assert.equal(payload.suggestion, "hud-score-binding");
});

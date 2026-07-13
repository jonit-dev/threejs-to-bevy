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

test("should suggest the best matching id when id is unknown", async () => {
  const result = await cookbookCommand(["show", "player-move-was", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; suggestion?: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_COOKBOOK_UNKNOWN_ID");
  assert.equal(payload.suggestion, "player-move-wasd");
});

test("should rank matching entries for a search query", async () => {
  const result = await cookbookCommand(["search", "coin", "pickup", "respawn", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; count: number; matches: Array<{ id: string; score: number }> };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_COOKBOOK_SEARCH_OK");
  assert.equal(payload.matches[0]?.id, "collectible-respawn");
  assert.equal(payload.count <= 5, true);
});

test("should return empty search result with guidance when nothing matches", async () => {
  const result = await cookbookCommand(["search", "zzzz", "qqqq", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; count: number; diagnostics?: Array<{ code: string }> };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.count, 0);
  assert.equal(payload.diagnostics?.[0]?.code, "TN_COOKBOOK_SEARCH_EMPTY");
});

test("should suggest entry from descriptive query on unknown id", async () => {
  const result = await cookbookCommand(["show", "coin-pickup", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; suggestion?: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_COOKBOOK_UNKNOWN_ID");
  assert.equal(payload.suggestion, "collectible-respawn");
});

test("should suggest listing entries when an unknown id has no match", async () => {
  const result = await cookbookCommand(["show", "zzzz-qqqq", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; suggestion?: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_COOKBOOK_UNKNOWN_ID");
  assert.equal(payload.suggestion, "tn cookbook list --json");
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

test("should suggest the best matching id through direct topic shorthand", async () => {
  const result = await cookbookCommand(["hud-score-bnding", "--json"], process.cwd());
  const payload = JSON.parse(result.stdout) as { code: string; suggestion?: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_COOKBOOK_UNKNOWN_ID");
  assert.equal(payload.suggestion, "hud-score-binding");
});

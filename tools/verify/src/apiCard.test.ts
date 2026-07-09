import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { API_CARD_BUDGET_BYTES, renderScriptApiCardFromSource, scriptContextMembers, validateApiCard } from "./apiCard.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const scriptContextPath = resolve(repoRoot, "packages/script-stdlib/src/script-context.ts");

test("should list every ScriptContext member in the generated API card", async () => {
  const source = await readFile(scriptContextPath, "utf8");
  const card = renderScriptApiCardFromSource(source);
  const validation = validateApiCard({ card, source });

  assert.deepEqual(validation.missingMembers, []);
  assert.equal(validation.ok, true);
  const members = scriptContextMembers(source);
  for (const member of [
    "entity",
    "entities",
    "input",
    "getAxis",
    "getButton",
    "query",
    "resources",
    "patch",
    "state",
    "fixedDelta",
    "time",
  ]) {
    assert.equal(members.includes(member), true, `${member} should be extracted from ScriptContext`);
  }
});

test("should keep the API card below the context budget", async () => {
  const source = await readFile(scriptContextPath, "utf8");
  const card = renderScriptApiCardFromSource(source);

  assert.ok(Buffer.byteLength(card, "utf8") <= API_CARD_BUDGET_BYTES);
});

test("should prefer in-distribution helper aliases in the generated API card", async () => {
  const source = await readFile(scriptContextPath, "utf8");
  const card = renderScriptApiCardFromSource(source);

  assert.match(card, /`Mathf`, `Vector2`, `Vector3`/);
  assert.match(card, /Legacy aliases `NumberEx`, `Vec2`, and `Vec3` remain supported/);
  assert.equal(card.indexOf("`Mathf`") < card.indexOf("`NumberEx`"), true);
});

test("should include typegen behavior and actor shortcuts in the generated API card", async () => {
  const source = await readFile(scriptContextPath, "utf8");
  const card = renderScriptApiCardFromSource(source);

  assert.match(card, /tn types generate --project \. --json/);
  assert.match(card, /defineBehavior\(metadata, fn\)/);
  assert.match(card, /tn actor add character/);
});

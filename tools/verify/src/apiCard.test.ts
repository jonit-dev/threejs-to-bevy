import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { API_CARD_BUDGET_BYTES, renderScriptApiCardFromSource, scriptContextMembers, validateApiCard } from "./apiCard.js";

test("should list every ScriptContext member in the generated API card", async () => {
  const source = await readFile("packages/script-stdlib/src/script-context.ts", "utf8");
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
  const source = await readFile("packages/script-stdlib/src/script-context.ts", "utf8");
  const card = renderScriptApiCardFromSource(source);

  assert.ok(Buffer.byteLength(card, "utf8") <= API_CARD_BUDGET_BYTES);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("persistence reload verifier should declare stable artifacts and native trace command", async () => {
  const script = await readFile(new URL("./verify-persistence-reload.mjs", import.meta.url), "utf8");
  assert.match(script, /persistence-reload\/game\.bundle/);
  assert.match(script, /threenative_persistence_reload_trace/);
  assert.match(script, /tools\/verify\/artifacts\/persistence-reload\/verification-report\.json/);
  assert.match(script, /compareReports/);
});

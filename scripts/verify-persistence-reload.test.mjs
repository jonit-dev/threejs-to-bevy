import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { assessColdRestart } from "./verify-persistence-reload.mjs";

test("persistence reload verifier should declare stable artifacts and native trace command", async () => {
  const script = await readFile(new URL("./verify-persistence-reload.mjs", import.meta.url), "utf8");
  assert.match(script, /persistence-reload\/game\.bundle/);
  assert.match(script, /threenative_persistence_reload_trace/);
  assert.match(script, /tools\/verify\/artifacts\/persistence-reload\/verification-report\.json/);
  assert.match(script, /compareReports/);
});

test("should fail the persistence gate when the second process cannot restore progress", () => {
  const result = assessColdRestart(
    { process: "write" },
    { process: "read", persistence: { restore: { resourceValue: 3, settingValue: 0.6 }, storage: { atomicCommit: true, backend: "native-atomic-json" } } },
  );
  assert.equal(result.ok, false);
  assert.equal(result.mismatches.some((entry) => entry.key === "progress"), true);
});

test("should fail when restored settings differ", () => {
  const result = assessColdRestart(
    { process: "write" },
    { process: "read", persistence: { restore: { resourceValue: 7, settingValue: 0.8 }, storage: { atomicCommit: true, backend: "native-atomic-json" } } },
  );
  assert.equal(result.ok, false);
  assert.equal(result.mismatches.some((entry) => entry.key === "settings"), true);
});

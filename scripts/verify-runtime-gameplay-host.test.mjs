import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runtime gameplay host verifier should declare native trace and promoted evidence", async () => {
  const source = await readFile(new URL("./verify-runtime-gameplay-host.mjs", import.meta.url), "utf8");

  assert.match(source, /runtime-gameplay-host/);
  assert.match(source, /threenative_runtime_gameplay_host_trace/);
  assert.match(source, /live rendered-entity reconciliation/);
});

test("should include runtime gameplay host in package scripts", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts["verify:runtime-gameplay-host"], /verify-runtime-gameplay-host\.mjs/);
});

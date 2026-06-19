import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runtime gameplay host verifier should declare native trace and promoted evidence", async () => {
  const source = await readFile(new URL("./verify-runtime-gameplay-host.mjs", import.meta.url), "utf8");

  assert.match(source, /runtime-gameplay-host/);
  assert.match(source, /threenative_runtime_gameplay_host_trace/);
  assert.match(source, /live rendered-entity reconciliation/);
});

test("should register runtime gameplay host in the focused gate registry", async () => {
  const tools = await import(new URL("../tools/verify/dist/cli/run.js", import.meta.url).href);

  assert.ok(tools.FOCUSED_GATES["verify:runtime-gameplay-host"]);
  assert.match(tools.FOCUSED_GATES["verify:runtime-gameplay-host"].commands.at(-1)?.[1] ?? "", /verify-runtime-gameplay-host\.mjs/);
});

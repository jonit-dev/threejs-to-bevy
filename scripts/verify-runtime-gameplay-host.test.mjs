import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runtime gameplay host verifier should declare native trace and promoted evidence", async () => {
  const source = await readFile(new URL("./verify-runtime-gameplay-host.mjs", import.meta.url), "utf8");

  assert.match(source, /runtime-gameplay-host/);
  assert.match(source, /threenative_runtime_gameplay_host_trace/);
  assert.match(source, /live rendered-entity reconciliation/);
  assert.match(source, /native loop-state parity/);
});

test("should register runtime gameplay host in the focused gate registry", async () => {
  const tools = await import(new URL("../tools/verify/dist/cli/run.js", import.meta.url).href);

  assert.ok(tools.FOCUSED_GATES["verify:runtime-gameplay-host"]);
  assert.match(tools.FOCUSED_GATES["verify:runtime-gameplay-host"].commands.at(-1)?.[1] ?? "", /verify-runtime-gameplay-host\.mjs/);
});

test("should accept matching native loop-state evidence", async () => {
  const { compareReports } = await import(new URL("./verify-runtime-gameplay-host.mjs", import.meta.url).href);
  const report = runtimeGameplayHostReport();

  assert.deepEqual(compareReports(report, structuredClone(report)), { mismatches: [], ok: true });
});

test("should fail runtime gameplay host proof when loop-state evidence is missing", async () => {
  const { compareReports } = await import(new URL("./verify-runtime-gameplay-host.mjs", import.meta.url).href);
  const web = runtimeGameplayHostReport();
  const native = structuredClone(web);
  delete native.loopState;

  const diff = compareReports(web, native);

  assert.equal(diff.ok, false);
  assert.equal(diff.mismatches.some((mismatch) => mismatch.key === "loopState"), true);
});

function runtimeGameplayHostReport() {
  return {
    async: { channels: [], timers: [] },
    boundaries: [],
    diagnostics: [],
    eventWindows: [],
    hooks: [],
    lifecycle: { appState: [], commandFlush: [], localState: [] },
    loopState: {
      accumulator: { delta: 0.6, fixedDelta: 0.25, fixedTicks: 2, remaining: 0.1 },
      frame: { elapsed: 0.6, frame: 1, tick: 2 },
      pause: {
        delta: 1,
        elapsed: 1,
        frame: 1,
        skippedSchedules: ["startup", "fixedUpdate", "update", "postUpdate"],
        startupComplete: false,
      },
      startup: { runs: 1, startupComplete: true },
    },
    observers: [],
    reconciliation: { finalRendererHandles: [], rendererTeardown: [], spawnedRendererHandles: [] },
  };
}

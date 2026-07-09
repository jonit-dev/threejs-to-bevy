import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { ISystemsIr, IWorldIr } from "@threenative/ir";

import { traceRuntimeGameplayHost } from "./runtimeGameplayHost.js";

const fixture = resolve("../../packages/ir/fixtures/conformance/runtime-gameplay-host/game.bundle");

test("should reconcile spawned rendered entities when command buffer flushes", async () => {
  const world = JSON.parse(await readFile(resolve(fixture, "world.ir.json"), "utf8")) as IWorldIr;
  const systems = JSON.parse(await readFile(resolve(fixture, "systems.ir.json"), "utf8")) as ISystemsIr;

  const report = traceRuntimeGameplayHost(world, systems);

  assert.equal(report.schema, "threenative.runtime-gameplay-host");
  assert.equal(report.reconciliation.spawnedRendererHandles.includes("renderer:runtime.enemy"), true);
  assert.equal(report.reconciliation.finalRendererHandles.includes("renderer:runtime.enemy"), false);
  assert.deepEqual(report.eventWindows.find((entry) => entry.event === "Spawned")?.framesVisible, [2, 3]);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_UNSUPPORTED_FEATURE_RAW_RUNTIME_HANDLE"), true);
  assert.deepEqual(report.scheduler.delayedCommands.map((entry) => [entry.id, entry.status, entry.tick]), [
    ["spawnAfterDelay", "enqueued", 0],
    ["spawnAfterDelay", "pending", 1],
    ["spawnAfterDelay", "flushed", 2],
  ]);
});

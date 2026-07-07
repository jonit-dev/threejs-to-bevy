import assert from "node:assert/strict";
import test from "node:test";

import { deriveSessionCostMetricsFromEvents } from "./sessionMetrics.js";

test("should derive tool step count from event log", () => {
  const metrics = deriveSessionCostMetricsFromEvents([
    JSON.stringify({ type: "item.started", item: { id: "a", type: "command_execution" } }),
    JSON.stringify({ type: "item.completed", item: { id: "a", type: "command_execution", aggregated_output: "ok", exit_code: 0, status: "completed" } }),
    JSON.stringify({ type: "item.completed", item: { id: "b", type: "command_execution", aggregated_output: "done", exit_code: 0, status: "completed" } }),
    JSON.stringify({ type: "item.completed", item: { id: "msg", type: "agent_message", text: "ignored" } }),
  ]);

  assert.equal(metrics.toolStepCount, 2);
  assert.equal(metrics.toolOutputBytes, 6);
});

test("should derive failed command count", () => {
  const metrics = deriveSessionCostMetricsFromEvents([
    JSON.stringify({ type: "item.completed", item: { id: "a", type: "command_execution", aggregated_output: "", exit_code: 0, status: "completed" } }),
    JSON.stringify({ type: "item.completed", item: { id: "b", type: "command_execution", aggregated_output: "bad", exit_code: 1, status: "failed" } }),
    JSON.stringify({ type: "item.completed", item: { id: "c", type: "command_execution", aggregated_output: "also bad", exit_code: 2, status: "completed" } }),
  ]);

  assert.equal(metrics.toolStepCount, 3);
  assert.equal(metrics.failedCommandCount, 2);
});

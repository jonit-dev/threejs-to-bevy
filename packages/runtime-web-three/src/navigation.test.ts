import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { traceNavigationPaths } from "./navigation.js";

test("navigation should return shortest deterministic paths across static regions", () => {
  assert.deepEqual(traceNavigationPaths(navigationWorld()), [
    {
      path: [[0, 0, 0], [2, 0, 0]],
      query: "ok",
      status: "success",
      totalCost: 3,
      visitedRegions: ["a", "b"],
    },
    {
      failureReason: "goal-outside",
      path: [],
      query: "bad",
      status: "failed",
      totalCost: 0,
      visitedRegions: ["a"],
    },
  ]);
});

function navigationWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [],
    resources: {
      Navigation: {
        agentRadius: 0.4,
        areaCosts: { default: 1, slow: 3 },
        regions: [
          { area: "default", center: [0, 0, 0], id: "a", neighbors: ["b"], points: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
          { area: "slow", center: [2, 0, 0], id: "b", neighbors: ["a"], points: [[1, -1], [3, -1], [3, 1], [1, 1]] },
        ],
        queries: [
          { goal: [2, 0, 0], id: "ok", start: [0, 0, 0] },
          { goal: [8, 0, 0], id: "bad", start: [0, 0, 0] },
        ],
      },
    },
  };
}

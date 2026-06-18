import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeTestBundle } from "./testFixtures.js";

test("should reject dynamic navmesh rebake over budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-navigation-residuals-budget-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [],
        resources: {
          Navigation: {
            agentRadius: 0.5,
            dynamicRebake: { intervalMs: 8, maxObstacles: 99, maxRegions: 99 },
            regions: [
              { center: [0, 0, 0], id: "a", points: [[-1, -1], [1, -1], [1, 1]] },
            ],
          },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_NAVIGATION_DYNAMIC_REBAKE_BUDGET_INVALID",
        "TN_IR_NAVIGATION_DYNAMIC_REBAKE_BUDGET_INVALID",
        "TN_IR_NAVIGATION_DYNAMIC_REBAKE_INTERVAL_INVALID",
      ],
    );
    assert.equal(result.diagnostics[0]?.path, "world.ir.json/resources/Navigation/dynamicRebake/maxRegions");
    assert.match(result.diagnostics[0]?.message ?? "", /1 and 64/);
    assert.equal(result.diagnostics[1]?.path, "world.ir.json/resources/Navigation/dynamicRebake/maxObstacles");
    assert.match(result.diagnostics[1]?.message ?? "", /0 and 32/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

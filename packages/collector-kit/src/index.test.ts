import assert from "node:assert/strict";
import test from "node:test";

import { CollectorKit } from "./index.js";

test("collector reducer scores unique rewards and wins at requirement", () => {
  const start = CollectorKit.initial({ lives: 2 });
  const first = CollectorKit.collect(start, { id: "coin-1", kind: "reward", points: 5 }, { requiredRewards: 2 });
  const duplicate = CollectorKit.collect(first, { id: "coin-1", kind: "reward", points: 5 }, { requiredRewards: 2 });
  const second = CollectorKit.collect(duplicate, { id: "coin-2", kind: "reward", points: 10 }, { requiredRewards: 2 });

  assert.deepEqual(first.collected, ["coin-1"]);
  assert.equal(duplicate.score, 5);
  assert.equal(second.status, "won");
  assert.equal(CollectorKit.hud(second), "Score 15 | Lives 2");
});

test("collector reducer fails when hazards exhaust lives", () => {
  const start = CollectorKit.initial({ lives: 1 });
  const failed = CollectorKit.collect(start, { id: "spike", kind: "hazard" });
  const ignored = CollectorKit.collect(failed, { id: "coin", kind: "reward", points: 99 });

  assert.equal(failed.status, "failed");
  assert.equal(ignored.score, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import { mushroom, pineTree, stylizedTree } from "./meshBuilderOrganic.js";

test("should build a deterministic stylized tree helper", () => {
  const first = stylizedTree({ seed: 12 });
  const second = stylizedTree({ seed: 12 });

  assert.deepEqual(second.attributes, first.attributes);
  assert.deepEqual(second.indices, first.indices);
  assert.deepEqual(second.bounds, first.bounds);
  assert.equal(first.generation?.helper, "stylizedTree");
  assert.equal(first.budget?.classification, "standard-prop");
});

test("should vary organic helpers only by seed", () => {
  const first = mushroom({ seed: 1 });
  const same = mushroom({ seed: 1 });
  const different = mushroom({ seed: 2 });

  assert.deepEqual(same.attributes, first.attributes);
  assert.notDeepEqual(different.attributes, first.attributes);
  assert.ok(first.bounds?.max[1]);
  assert.ok(different.bounds?.max[1]);
});

test("should build a single pine tree helper for visual parity fixtures", () => {
  const pine = pineTree({ seed: 12 });

  assert.equal(pine.generation?.helper, "pineTree");
  assert.equal(pine.storage, "binary");
  assert.ok((pine.bounds?.max[1] ?? 0) > 2);
  assert.ok((pine.indices?.length ?? 0) > 0);
});

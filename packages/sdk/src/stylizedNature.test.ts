import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  STYLIZED_NATURE_AUTHORED_DEFAULTS,
  STYLIZED_NATURE_DENSITY_DEFAULTS,
  stylizedNature,
} from "./stylizedNature.js";

test("stylizedNature defaults should match the shared contract fixture", async () => {
  const contract = JSON.parse(
    await readFile(resolve(process.cwd(), "../ir/fixtures/stylized-nature-contract.json"), "utf8"),
  ) as {
    authoredDefaults: typeof STYLIZED_NATURE_AUTHORED_DEFAULTS;
    densityDefaults: typeof STYLIZED_NATURE_DENSITY_DEFAULTS;
  };

  assert.deepEqual(STYLIZED_NATURE_AUTHORED_DEFAULTS, contract.authoredDefaults);
  assert.deepEqual(STYLIZED_NATURE_DENSITY_DEFAULTS, contract.densityDefaults);
  assert.deepEqual(stylizedNature().data, {
    ...contract.authoredDefaults,
    grassCount: contract.densityDefaults.medium.grassCount,
    treeCount: contract.densityDefaults.medium.treeCount,
  });
  assert.equal(stylizedNature({ density: "high" }).data.grassCount, contract.densityDefaults.high.grassCount);
  assert.equal(stylizedNature({ density: "low" }).data.treeCount, contract.densityDefaults.low.treeCount);
});

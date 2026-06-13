import assert from "node:assert/strict";
import test from "node:test";

import { expectedV2ArenaSmokeReport } from "./v2Arena.js";

test("should report movement and damage smoke results", () => {
  const report = expectedV2ArenaSmokeReport();

  assert.equal(report.status, "pass");
  assert.deepEqual(
    report.checks.map((check) => check.capability),
    ["input", "movement", "collision", "hud", "audio", "native"],
  );
});

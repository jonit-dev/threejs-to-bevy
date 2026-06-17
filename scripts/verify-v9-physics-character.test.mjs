import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v9 physics-character verification report records promoted and deferred checklist items", async () => {
  const report = JSON.parse(await readFile("artifacts/conformance/v9-physics-character/verification-report.json", "utf8"));

  assert.equal(report.status, "passed");
  assert.deepEqual(report.promoted, ["primitive-solver-v2", "broad-sensors", "character-push", "static-navigation", "backend-boundary-diagnostics"]);
  assert.ok(report.deferred.includes("dynamic-mesh-colliders"));
  assert.equal(report.artifacts.diff, "artifacts/conformance/v9-physics-character/diff-v9-physics-character.json");
});

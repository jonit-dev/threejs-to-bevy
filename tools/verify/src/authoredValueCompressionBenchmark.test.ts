import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("matched PlacementSet and Interaction benchmark clears the operation ratchet", async () => {
  const report = JSON.parse(await readFile(resolve(repoRoot, "tools/verify/artifacts/authored-value-compression/benchmark-report.json"), "utf8")) as {
    cases: Array<{ id: string; baseline: { failedCommands: number; operations: number; proof: string[] }; migrated: { failedCommands: number; operations: number; proof: string[] } }>;
    limitations: string;
    method: string;
    summary: { baselineFailedCommands: number; baselineOperations: number; migratedFailedCommands: number; migratedOperations: number; reductionPercent: number };
  };
  assert.equal(report.cases.length, 2);
  assert.deepEqual(report.cases.map((item) => item.id), ["placement-eight-orbs", "interaction-orb-objective"]);
  for (const item of report.cases) {
    assert.deepEqual(item.migrated.proof, item.baseline.proof, "proof requirements must be matched");
    assert.ok(item.migrated.operations < item.baseline.operations);
    assert.ok(item.migrated.failedCommands <= item.baseline.failedCommands);
  }
  assert.equal(report.summary.baselineOperations, 13);
  assert.equal(report.summary.migratedOperations, 2);
  assert.equal(report.summary.baselineFailedCommands, 0);
  assert.equal(report.summary.migratedFailedCommands, 0);
  assert.equal(report.summary.reductionPercent, Number((((13 - 2) / 13) * 100).toFixed(2)));
  assert.match(report.method, /matched deterministic source-mutation replay/i);
  assert.match(report.limitations, /not LLM tokens/i);
});

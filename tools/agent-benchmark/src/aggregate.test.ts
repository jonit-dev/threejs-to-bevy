import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { aggregateRunReports } from "./aggregate.js";

test("should compute 2x verdict when aggregating fixture runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const vanilla = join(root, "vanilla.json");
  const threenative = join(root, "threenative.json");
  await writeFile(vanilla, JSON.stringify(run("vanilla", 1000), null, 2));
  await writeFile(threenative, JSON.stringify(run("threenative", 1800), null, 2));
  const report = await aggregateRunReports([vanilla, threenative]);
  assert.equal(report.verdict.status, "pass");
  assert.equal(report.promptSummaries[0]?.withinTwoX, true);
});

function run(condition: "threenative" | "vanilla", tokenCount: number) {
  return {
    artifacts: {},
    candidate: `/tmp/${condition}`,
    condition,
    diagnostics: [],
    generatedAt: "2026-07-06T00:00:00.000Z",
    ok: true,
    promptId: "collector",
    runId: `${condition}-1`,
    schema: "threenative.agent-benchmark-run",
    session: {
      condition,
      humanRubric: { playability: 2, visual: 2 },
      iterationCount: 1,
      promptId: "collector",
      runId: `${condition}-1`,
      schema: "threenative.agent-benchmark-session",
      stopReason: "claimed-playable",
      tokenCount,
      version: 1,
    },
    version: 1,
  };
}

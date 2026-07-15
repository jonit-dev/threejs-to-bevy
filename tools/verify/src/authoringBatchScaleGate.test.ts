import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyAuthoringBatch, AUTHORING_BATCH_SCHEMA, AUTHORING_BATCH_VERSION } from "@threenative/authoring";

import { runAuthoringBatchScaleGate } from "./authoringBatchScaleGate.js";

test("two-file batch copies no unrelated project bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-bounded-scale-"));
  try {
    await mkdir(join(root, "content/input"), { recursive: true });
    for (const id of ["one", "two"]) await writeFile(join(root, `content/input/${id}.input.json`), inputDocument(id));
    const unrelatedPath = join(root, "content/input/unrelated.input.json");
    await writeFile(unrelatedPath, inputDocument(`unrelated-${"x".repeat(50 * 1024 * 1024)}`));
    const unrelatedBefore = await readFile(unrelatedPath);
    const result = await applyAuthoringBatch({
      batch: {
        id: "bounded-two-file",
        operations: ["one", "two"].map((id) => ({ name: "input.add_action", args: { actionId: `added-${id}`, file: `content/input/${id}.input.json`, inputDocId: id, keys: ["keyboard.Enter"] } })),
        schema: AUTHORING_BATCH_SCHEMA,
        version: AUTHORING_BATCH_VERSION,
      },
      projectPath: root,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.filesRead, ["content/input/one.input.json", "content/input/two.input.json"]);
    assert.deepEqual(result.filesStaged, result.filesRead);
    assert.equal(result.copiedBytes, result.inputBytes);
    assert.deepEqual(await readFile(unrelatedPath), unrelatedBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("large document matrix emits deterministic bounded metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-scale-report-"));
  try {
    const baselinePath = join(root, "baseline.json");
    await writeFile(baselinePath, JSON.stringify({ cases: [
      { fileCount: 1, medianElapsedMs: 10_000, medianPeakRssBytes: 2_000_000_000, targetBytes: 64 * 1024 },
      { fileCount: 2, medianElapsedMs: 10_000, medianPeakRssBytes: 2_000_000_000, targetBytes: 64 * 1024 },
    ] }));
    const result = await runAuthoringBatchScaleGate({ baselinePath, fileCounts: [1, 2], reportPath: join(root, "report.json"), samples: 1, sizes: [64 * 1024] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.cases.map(({ fileCount, filesRead, filesStaged, filesWritten, targetBytes }) => ({ fileCount, filesRead, filesStaged, filesWritten, targetBytes })), [
      { fileCount: 1, filesRead: 1, filesStaged: 1, filesWritten: 1, targetBytes: 64 * 1024 },
      { fileCount: 2, filesRead: 2, filesStaged: 2, filesWritten: 2, targetBytes: 64 * 1024 },
    ]);
    assert.equal(JSON.parse(await readFile(result.reportPath, "utf8")).schema, "threenative.verify.authoring-batch-scale");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function inputDocument(id: string): string {
  return `${JSON.stringify({ schema: "threenative.input", version: "0.1.0", id, actions: [] }, null, 2)}\n`;
}

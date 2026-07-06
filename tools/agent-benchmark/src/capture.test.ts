import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { captureCandidate } from "./capture.js";

test("should report TN_BENCH_NO_CANVAS when page has no canvas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-no-canvas-"));
  await writeFile(join(root, "index.html"), "<!doctype html><p>No canvas</p>");
  const result = await captureCandidate({ candidate: root, outDir: join(root, "artifacts") });
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_NO_CANVAS"), true);
});

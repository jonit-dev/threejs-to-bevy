import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("verify-v10-editor-panels should write sequential frame evidence", async () => {
  await execFileAsync(process.execPath, ["scripts/verify-v10-editor-panels.mjs"]);

  const report = JSON.parse(await readFile("tools/verify/artifacts/editor-panels/verification-report.json", "utf8"));
  assert.equal(report.ok, true);
  assert.equal(report.status, "pass");
  assert.equal(report.comparisons.length, 3);
  assert.ok(existsSync(report.artifacts.contactSheet));
  for (const frame of report.artifacts.frames) {
    assert.ok(existsSync(frame.web));
    assert.ok(existsSync(frame.native));
  }
});

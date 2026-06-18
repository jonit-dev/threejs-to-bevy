import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("v10 advanced physics verifier writes sequential frame comparison artifacts", async () => {
  await execFileAsync(process.execPath, ["scripts/verify-v10-advanced-physics.mjs"]);

  const report = JSON.parse(await readFile("tools/verify/artifacts/advanced-physics/verification-report.json", "utf8"));

  assert.equal(report.ok, true);
  assert.equal(report.artifacts.frames.length, 3);
  assert.equal(report.comparisons.every((comparison) => comparison.changedPixelRatio === 0), true);
  assert.equal(report.promoted.includes("swept-aabb CCD vertical track contact"), true);
  await stat("tools/verify/artifacts/advanced-physics/contact-sheet.png");
  await stat("tools/verify/artifacts/advanced-physics/frames/web-frame-01.png");
  await stat("tools/verify/artifacts/advanced-physics/frames/native-frame-01.png");
});

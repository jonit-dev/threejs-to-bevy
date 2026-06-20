import assert from "node:assert/strict";
import test from "node:test";

import { recordCommand, screenshotCommand } from "./visualProof.js";

test("screenshot command should validate required arguments and png extension", async () => {
  const missing = await screenshotCommand(["--json"]);
  assert.equal(missing.exitCode, 1);
  assert.equal(JSON.parse(missing.stdout).code, "TN_SCREENSHOT_USAGE");

  const badExtension = await screenshotCommand(["--url", "http://localhost:3000", "--out", "proof.jpg", "--json"]);
  assert.equal(badExtension.exitCode, 1);
  assert.equal(JSON.parse(badExtension.stdout).code, "TN_SCREENSHOT_OUT_EXTENSION");
});

test("record command should validate required arguments and video extension", async () => {
  const missing = await recordCommand(["--json"]);
  assert.equal(missing.exitCode, 1);
  assert.equal(JSON.parse(missing.stdout).code, "TN_RECORD_USAGE");

  const badExtension = await recordCommand(["--url", "http://localhost:3000", "--out", "proof.gif", "--json"]);
  assert.equal(badExtension.exitCode, 1);
  assert.equal(JSON.parse(badExtension.stdout).code, "TN_RECORD_OUT_EXTENSION");
});

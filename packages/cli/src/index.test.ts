import assert from "node:assert/strict";
import test from "node:test";

import { dispatch, renderHelp } from "./index.js";

test("should print help when requested", async () => {
  const result = await dispatch(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /V1 commands:/);
  assert.match(result.stdout, /create/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /build/);
  assert.match(result.stdout, /compare-images/);
  assert.match(result.stdout, /dev/);
  assert.match(result.stdout, /verify/);
});

test("should tolerate a leading package script separator", async () => {
  const result = await dispatch(["--", "--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /V1 commands:/);
});

test("should keep rendered help stable for the package bin", () => {
  assert.match(renderHelp(), /tn dev --target <web\|desktop>/);
  assert.match(renderHelp(), /tn compare-images <first\.png> <second\.png>/);
  assert.match(renderHelp(), /tn verify \[--project <path>\] \[--url <preview-url>\]/);
});

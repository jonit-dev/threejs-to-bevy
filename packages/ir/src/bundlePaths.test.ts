import assert from "node:assert/strict";
import test from "node:test";

import { validateBundleRelativePath } from "./bundlePaths.js";

test("should accept valid relative bundle paths", () => {
  assert.equal(validateBundleRelativePath("world.ir.json").ok, true);
  assert.equal(validateBundleRelativePath("assets/mesh.bin").ok, true);
});

test("should reject absolute bundle paths", () => {
  assert.equal(validateBundleRelativePath("/tmp/escape.json").ok, false);
  assert.equal(validateBundleRelativePath("\\tmp\\escape.json").ok, false);
});

test("should reject parent traversal bundle paths", () => {
  assert.equal(validateBundleRelativePath("../manifest.json").ok, false);
  assert.equal(validateBundleRelativePath("assets/../escape.json").ok, false);
});

test("should reject URL shaped bundle paths", () => {
  assert.equal(validateBundleRelativePath("file:///tmp/escape.json").ok, false);
  assert.equal(validateBundleRelativePath("https://example.invalid/world.ir.json").ok, false);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  validateColorParityExampleSource,
  validateColorParitySwatchRegions,
  validateColorParityThresholdsLocked,
} from "./colorParityContract.js";
import { COLOR_PARITY_SWATCHES } from "./colorParitySwatches.js";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const colorParityExamplePath = resolve(repoRoot, "examples/v8-color-parity/src/game.ts");

test("should keep color parity thresholds from loosening", () => {
  const diagnostics = validateColorParityThresholdsLocked();
  assert.deepEqual(diagnostics, []);
});

test("should keep color parity swatch regions valid", () => {
  const diagnostics = validateColorParitySwatchRegions();
  assert.deepEqual(diagnostics, []);
});

test("should keep v8 color parity example aligned with swatch contract", async () => {
  const source = await readFile(colorParityExamplePath, "utf8");
  const diagnostics = validateColorParityExampleSource(source);
  assert.deepEqual(diagnostics, []);
});

test("should reject example sources that drop authored swatch colors", () => {
  const diagnostics = validateColorParityExampleSource('const swatches = [{ color: "#000000", id: "swatch.red" }];');
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_COLOR_PARITY_EXAMPLE_SWATCH_COLOR_MISSING"));
  assert.equal(
    diagnostics.filter((diagnostic) => diagnostic.code === "TN_COLOR_PARITY_EXAMPLE_SWATCH_COLOR_MISSING").length,
    COLOR_PARITY_SWATCHES.length,
  );
});

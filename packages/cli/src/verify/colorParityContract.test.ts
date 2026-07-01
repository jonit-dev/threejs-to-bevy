import assert from "node:assert/strict";
import test from "node:test";

import {
  validateColorParitySwatchRegions,
  validateColorParityThresholdsLocked,
  validateLightingToneSampleRegions,
} from "./colorParityContract.js";

test("should keep color parity thresholds from loosening", () => {
  const diagnostics = validateColorParityThresholdsLocked();
  assert.deepEqual(diagnostics, []);
});

test("should keep color parity swatch regions valid", () => {
  const diagnostics = validateColorParitySwatchRegions();
  assert.deepEqual(diagnostics, []);
});

test("should keep lighting tone sample regions valid", () => {
  const diagnostics = validateLightingToneSampleRegions();
  assert.deepEqual(diagnostics, []);
});

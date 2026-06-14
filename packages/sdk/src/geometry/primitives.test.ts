import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { AnnulusGeometry, BoxGeometry, RegularPolygonGeometry, TorusGeometry } from "./primitives.js";

test("should reject non-finite box size", () => {
  assert.throws(
    () => new BoxGeometry({ size: [1, Number.NaN, 1] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_SIZE",
  );
});

test("should reject invalid catalog primitive dimensions", () => {
  assert.throws(
    () => new TorusGeometry({ innerRadius: 1, outerRadius: 0.5 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_RADIUS",
  );
  assert.throws(
    () => new AnnulusGeometry({ innerRadius: 1, outerRadius: 1 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_RADIUS",
  );
  assert.throws(
    () => new RegularPolygonGeometry({ sides: 2 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_SIDES",
  );
});

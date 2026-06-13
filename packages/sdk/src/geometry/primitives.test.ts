import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { BoxGeometry } from "./primitives.js";

test("should reject non-finite box size", () => {
  assert.throws(
    () => new BoxGeometry({ size: [1, Number.NaN, 1] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_SIZE",
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { MeshStandardMaterial } from "./MeshStandardMaterial.js";

test("should store standard material color", () => {
  const material = new MeshStandardMaterial({ color: "#2f80ed" });

  assert.equal(material.color, "#2f80ed");
});

import assert from "node:assert/strict";
import test from "node:test";

import { MeshExtendedMaterial } from "./MeshExtendedMaterial.js";

test("should declare extended material preset inputs", () => {
  const material = new MeshExtendedMaterial({
    alphaCutoff: 0.4,
    alphaMode: "mask",
    color: "#3fbf6b",
    doubleSided: true,
    preset: "foliage",
    renderOrder: 1,
  });

  assert.equal(material.preset, "foliage");
  assert.equal(material.alphaMode, "mask");
  assert.equal(material.doubleSided, true);
  assert.equal(material.renderOrder, 1);
});

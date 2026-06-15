import assert from "node:assert/strict";
import test from "node:test";

import { MeshStandardMaterial } from "./MeshStandardMaterial.js";

test("should store standard material color", () => {
  const material = new MeshStandardMaterial({ color: "#2f80ed" });

  assert.equal(material.color, "#2f80ed");
});

test("should store alpha mode, cutoff, and opacity", () => {
  const material = new MeshStandardMaterial({ alphaCutoff: 0.35, alphaMode: "mask", opacity: 0.75 });

  assert.equal(material.alphaMode, "mask");
  assert.equal(material.alphaCutoff, 0.35);
  assert.equal(material.opacity, 0.75);
});

test("should store emissive color and intensity", () => {
  const material = new MeshStandardMaterial({ emissive: "#33ccff", emissiveIntensity: 2.5 });

  assert.equal(material.emissive, "#33ccff");
  assert.equal(material.emissiveIntensity, 2.5);
});

test("should reject invalid alpha values", () => {
  assert.throws(() => new MeshStandardMaterial({ alphaCutoff: 1.5 }), /alphaCutoff/);
  assert.throws(() => new MeshStandardMaterial({ opacity: -0.1 }), /opacity/);
  assert.throws(() => new MeshStandardMaterial({ alphaMode: "screen" as never }), /alphaMode/);
});

test("should reject invalid emissive intensity", () => {
  assert.throws(() => new MeshStandardMaterial({ emissiveIntensity: -1 }), /emissiveIntensity/);
});

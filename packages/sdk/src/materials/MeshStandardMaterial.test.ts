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

test("should store physical material factors", () => {
  const material = new MeshStandardMaterial({
    clearcoat: 0.8,
    clearcoatRoughness: 0.25,
    clearcoatRoughnessTexture: "tex.clearcoatRoughness",
    clearcoatTexture: "tex.clearcoat",
    specularIntensity: 0.7,
    transmission: 0.45,
    transmissionTexture: "tex.transmission",
  });

  assert.equal(material.clearcoat, 0.8);
  assert.equal(material.clearcoatRoughness, 0.25);
  assert.equal(material.clearcoatRoughnessTexture, "tex.clearcoatRoughness");
  assert.equal(material.clearcoatTexture, "tex.clearcoat");
  assert.equal(material.specularIntensity, 0.7);
  assert.equal(material.transmission, 0.45);
  assert.equal(material.transmissionTexture, "tex.transmission");
});

test("should reject invalid alpha values", () => {
  assert.throws(() => new MeshStandardMaterial({ alphaCutoff: 1.5 }), /alphaCutoff/);
  assert.throws(() => new MeshStandardMaterial({ opacity: -0.1 }), /opacity/);
  assert.throws(() => new MeshStandardMaterial({ alphaMode: "screen" as never }), /alphaMode/);
});

test("should reject invalid emissive intensity", () => {
  assert.throws(() => new MeshStandardMaterial({ emissiveIntensity: -1 }), /emissiveIntensity/);
});

test("should reject invalid physical material factors", () => {
  assert.throws(() => new MeshStandardMaterial({ clearcoat: 1.1 }), /clearcoat/);
  assert.throws(() => new MeshStandardMaterial({ clearcoatRoughness: -0.1 }), /clearcoatRoughness/);
  assert.throws(() => new MeshStandardMaterial({ specularIntensity: 2 }), /specularIntensity/);
  assert.throws(() => new MeshStandardMaterial({ transmission: -0.1 }), /transmission/);
});

test("should store specular texture map", () => {
  const material = new MeshStandardMaterial({
    specularIntensity: 0.85,
    specularTexture: "tex.specular",
  });

  assert.equal(material.specularTexture, "tex.specular");
  assert.equal(material.specularIntensity, 0.85);
});

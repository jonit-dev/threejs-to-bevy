import assert from "node:assert/strict";
import test from "node:test";

import {
  ShaderMaterial,
  shaderLiteral,
  shaderTexture,
  shaderTextureSample,
  shaderUniform,
  shaderUniformRef,
} from "./ShaderMaterial.js";

test("should create bounded shader material declarations", () => {
  const material = new ShaderMaterial({
    alphaMode: "blend",
    inputs: ["normal", "uv0", "elapsedTime"],
    outputs: ["baseColor", "alpha"],
    program: {
      fragment: {
        outputs: {
          alpha: shaderLiteral(0.85),
          baseColor: shaderUniformRef("tint"),
          emissive: shaderTextureSample("ramp"),
        },
      },
      vertex: {
        displacement: {
          amount: shaderUniformRef("waveAmount"),
          axis: "normal",
        },
      },
    },
    textures: [shaderTexture("ramp", "tex.ramp")],
    uniforms: [
      shaderUniform("tint", "color", "#33ccff"),
      shaderUniform("waveAmount", "float", 0.1),
    ],
  });

  assert.equal(material.kind, "shader");
  assert.equal(material.program.language, "threenative-shader-v1");
  assert.deepEqual(material.uniforms, [
    { default: "#33ccff", name: "tint", type: "color" },
    { default: 0.1, name: "waveAmount", type: "float" },
  ]);
  assert.deepEqual(material.textures, [{ asset: "tex.ramp", name: "ramp" }]);
  assert.equal(material.program.fragment.outputs.baseColor?.kind, "uniform");
});

test("should reject non-portable shader binding names", () => {
  assert.throws(
    () =>
      new ShaderMaterial({
        program: { fragment: { outputs: { baseColor: shaderLiteral("#ffffff") } } },
        uniforms: [shaderUniform("bad-name", "float", 1)],
      }),
    /portable identifier/,
  );
});

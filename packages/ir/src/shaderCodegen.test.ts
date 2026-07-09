import assert from "node:assert/strict";
import test from "node:test";

import { generatePortableShaderMaterial } from "./shaderCodegen.js";
import type { IShaderMaterialIr } from "./types.js";

test("should generate stable GLSL and WGSL from portable shader IR", () => {
  const material: IShaderMaterialIr = {
    alphaMode: "mask",
    color: "#ffffff",
    id: "mat.shader",
    inputs: ["uv0", "normal", "elapsedTime"],
    kind: "shader",
    outputs: ["baseColor", "alpha"],
    program: {
      fragment: {
        outputs: {
          alpha: { kind: "uniform", uniform: "cutoff" },
          baseColor: { kind: "sampleTexture", texture: "albedo" },
        },
      },
      language: "threenative-shader-v1",
      vertex: {
        displacement: {
          amount: { kind: "uniform", uniform: "waveHeight" },
          axis: "normal",
        },
      },
    },
    textures: [{ asset: "tex.albedo", name: "albedo" }],
    uniforms: [
      { default: 0.2, name: "waveHeight", type: "float" },
      { default: 0.5, name: "cutoff", type: "float" },
    ],
  };

  const generated = generatePortableShaderMaterial(material);

  assert.deepEqual(generated.bindingLayout, [
    { binding: 0, kind: "uniform", name: "cutoff", type: "float" },
    { binding: 1, kind: "uniform", name: "waveHeight", type: "float" },
    { binding: 2, kind: "sampler2d", name: "albedo", type: "texture2d" },
  ]);
  assert.deepEqual(generated.fragmentOutputs, ["alpha", "baseColor"]);
  assert.equal(generated.glsl.language, "glsl100");
  assert.equal(generated.wgsl.language, "wgsl");
  assert.match(generated.glsl.code, /uniform sampler2D albedo;/);
  assert.match(generated.glsl.code, /transformed \+= normal \* \(waveHeight\);/);
  assert.match(generated.glsl.code, /texture2D\(albedo, vUv0\)/);
  assert.match(generated.wgsl.code, /@group\(1\) @binding\(2\) var albedo: texture_2d<f32>;/);
  assert.match(generated.wgsl.code, /let displaced = input\.position \+ \(input\.normal \* \(waveHeight\)\);/);
  assert.match(generated.wgsl.code, /textureSample\(albedo, albedoSampler, input\.uv0\)/);
});

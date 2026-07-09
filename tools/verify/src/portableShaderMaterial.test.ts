import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  collectPortableShaderMaterialReport,
  runPortableShaderMaterialGate,
  validatePortableShaderArtifactSet,
  validatePortableShaderSampleRegions,
  validatePortableShaderTextureAssets,
  type PortableShaderSampleDocument,
} from "./portableShaderMaterial.js";

const samples: PortableShaderSampleDocument = {
  samples: [
    sample("color-ramp", "color"),
    sample("texture-sample", "texture"),
    sample("alpha-mask", "alpha"),
    sample("time-uniform", "time"),
    sample("vertex-displacement", "displacement"),
  ],
};

test("should fail when shader artifacts are missing for either engine", () => {
  const diagnostics = validatePortableShaderArtifactSet({ samples });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_PORTABLE_SHADER_ENGINE_ARTIFACT_MISSING",
    "TN_PORTABLE_SHADER_ENGINE_ARTIFACT_MISSING",
  ]);
});

test("should compare shader material sample regions", () => {
  assert.deepEqual(validatePortableShaderSampleRegions(samples), []);

  const diagnostics = validatePortableShaderSampleRegions({
    samples: [
      { ...sample("color-ramp", "color"), threshold: { maxDelta: 1.5 } },
    ],
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_PORTABLE_SHADER_SAMPLE_KIND_MISSING"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_PORTABLE_SHADER_SAMPLE_THRESHOLD_INVALID"), true);
});

test("should pass when web and native shader metadata match", () => {
  const materials = [{
    id: "mat.shader.vertex-displacement",
    kind: "shader",
    outputs: ["baseColor"],
    program: {
      fragment: { outputs: { baseColor: { kind: "literal", value: [1, 1, 1, 1] } } },
      language: "threenative-shader-v1",
      vertex: { displacement: { axis: "normal", amount: { kind: "uniform", uniform: "waveHeight" } } },
    },
    textures: [{ asset: "tex.checker", name: "checker" }],
    uniforms: [{ default: 0.2, name: "waveHeight", type: "float" }],
  }];
  const web = collectPortableShaderMaterialReport(materials, "web-three");
  const native = collectPortableShaderMaterialReport(materials, "bevy");

  assert.deepEqual(validatePortableShaderArtifactSet({ native, samples, web }), []);
});

test("should fail when shader texture files are missing from the fixture bundle", async () => {
  const bundlePath = await mkdtemp(join(tmpdir(), "tn-portable-shader-bundle-"));
  await writeFile(
    join(bundlePath, "assets.manifest.json"),
    `${JSON.stringify({
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "tex.checker", kind: "texture", format: "png", path: "assets/checker.png" }],
    })}\n`,
    "utf8",
  );

  const diagnostics = await validatePortableShaderTextureAssets({
    bundlePath: resolve(bundlePath),
    materials: [{
      id: "mat.shader.texture-sample",
      kind: "shader",
      program: { fragment: { outputs: { baseColor: { kind: "sampleTexture", texture: "checker" } } } },
      textures: [{ asset: "tex.checker", name: "checker" }],
    }],
  });

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_PORTABLE_SHADER_TEXTURE_FILE_MISSING");
});

test("should write portable shader material gate artifacts", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "tn-portable-shader-material-"));
  const result = await runPortableShaderMaterialGate({ artifactDir });

  assert.equal(result.ok, true);
  assert.equal(result.status, "pass");
  assert.match(result.artifacts.webReportPath, /web-shader-materials\.json$/);
  assert.match(result.artifacts.nativeReportPath, /native-shader-materials\.json$/);
  assert.match(result.artifacts.webScreenshotPath, /web\.png$/);
  assert.match(result.artifacts.nativeScreenshotPath, /bevy\.png$/);
  assert.match(result.artifacts.diffScreenshotPath, /diff\.png$/);
  assert.match(result.artifacts.contactSheetPath, /contact-sheet\.svg$/);
  assert.match(result.artifacts.regionMetricsPath, /region-metrics\.json$/);

  const pngSignature = await readFile(result.artifacts.webScreenshotPath);
  assert.deepEqual([...pngSignature.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const metrics = JSON.parse(await readFile(result.artifacts.regionMetricsPath, "utf8")) as {
    evidenceMode: string;
    regions: Array<{ id: string; ok: boolean }>;
  };
  assert.equal(metrics.evidenceMode, "deterministic-portable-shader-preview");
  assert.deepEqual(metrics.regions.map((region) => [region.id, region.ok]), [
    ["color-ramp", true],
    ["texture-sample", true],
    ["alpha-mask", true],
    ["time-uniform", true],
    ["vertex-displacement", true],
  ]);
});

function sample(id: string, kind: PortableShaderSampleDocument["samples"][number]["kind"]): PortableShaderSampleDocument["samples"][number] {
  return {
    id,
    kind,
    material: `mat.shader.${id}`,
    region: { height: 16, width: 16, x: 0, y: 0 },
    threshold: { maxDelta: 0.1 },
  };
}

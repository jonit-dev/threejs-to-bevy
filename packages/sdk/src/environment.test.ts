import assert from "node:assert/strict";
import test from "node:test";

import { modelAsset, textureAsset } from "./assets.js";
import { environmentMap, lightProbe, skybox } from "./environment.js";
import { SdkError } from "./errors.js";

test("environment should serialize skybox and light probe declarations when valid", () => {
  const px = textureAsset("tex.sky.px", "assets/sky/px.png");
  const nx = textureAsset("tex.sky.nx", "assets/sky/nx.png");
  const py = textureAsset("tex.sky.py", "assets/sky/py.png");
  const ny = textureAsset("tex.sky.ny", "assets/sky/ny.png");
  const pz = textureAsset("tex.sky.pz", "assets/sky/pz.png");
  const nz = textureAsset("tex.sky.nz", "assets/sky/nz.png");
  const equirect = textureAsset("tex.env.studio", "assets/studio.png");

  assert.deepEqual(
    skybox({ faces: { negativeX: nx, negativeY: ny, negativeZ: nz, positiveX: px, positiveY: py, positiveZ: pz }, mode: "cubemap" }, { intensity: 0.9, rotationY: 1.25 }).toJSON(),
    {
      faces: {
        negativeX: "tex.sky.nx",
        negativeY: "tex.sky.ny",
        negativeZ: "tex.sky.nz",
        positiveX: "tex.sky.px",
        positiveY: "tex.sky.py",
        positiveZ: "tex.sky.pz",
      },
      intensity: 0.9,
      mode: "cubemap",
      rotationY: 1.25,
    },
  );
  assert.deepEqual(environmentMap({ asset: equirect, mode: "equirect" }).toJSON(), {
    asset: "tex.env.studio",
    intent: "reflection-and-irradiance",
    mode: "equirect",
  });
  assert.deepEqual(
    lightProbe("probe.center", {
      bounds: { min: [-4, 0, -4], max: [4, 4, 4] },
      influenceRadius: 6,
      intent: "irradiance",
      source: { asset: equirect, mode: "equirect" },
    }).toJSON(),
    {
      bounds: { min: [-4, 0, -4], max: [4, 4, 4] },
      id: "probe.center",
      influenceRadius: 6,
      intent: "irradiance",
      source: { asset: "tex.env.studio", mode: "equirect" },
    },
  );
});

test("environment should reject backend or non-texture environment assets", () => {
  assert.throws(
    () => skybox({ asset: modelAsset("model.sky", "assets/sky.glb"), mode: "equirect" }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ENVIRONMENT_TEXTURE_ASSET_KIND_INVALID",
  );
  assert.throws(
    () => lightProbe("probe.bad", { bounds: { min: [0, 0, 0], max: [0, 2, 2] }, influenceRadius: 2, source: { asset: "tex.sky", mode: "equirect" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ENVIRONMENT_LIGHT_PROBE_BOUNDS_INVALID",
  );
});

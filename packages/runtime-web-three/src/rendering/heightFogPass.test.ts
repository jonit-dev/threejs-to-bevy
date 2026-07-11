import assert from "node:assert/strict";
import test from "node:test";
import type { IAtmosphereProfileIr } from "@threenative/ir";
import * as THREE from "three";
import { HeightFogPass, webHeightFogSettings } from "./heightFogPass.js";

test("height fog settings map enabled authored values and fog color", () => {
  const atmosphere = profile();
  atmosphere.volumetrics = {
    heightFog: { baseHeight: 2, density: 0.25, enabled: true, falloffHeight: 16 },
  };

  assert.deepEqual(webHeightFogSettings(atmosphere), {
    baseHeight: 2,
    color: [0.2, 0.3, 0.4],
    density: 0.02,
    falloffHeight: 16,
  });
});

test("height fog settings remain absent when disabled", () => {
  const atmosphere = profile();
  atmosphere.volumetrics = {
    heightFog: { baseHeight: 0, density: 0.2, enabled: false, falloffHeight: 10 },
  };
  assert.equal(webHeightFogSettings(atmosphere), undefined);
});

test("height fog pass owns full-depth and half-resolution fog targets", () => {
  const pass = new HeightFogPass(
    new THREE.Scene(),
    new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    { baseHeight: 0, color: [0.5, 0.6, 0.7], density: 0.02, falloffHeight: 12 },
  );

  pass.setSize(801, 601);
  assert.deepEqual(pass.resourceObservation(), {
    depthSize: [801, 601],
    disposed: false,
    fogSize: [401, 301],
  });
  pass.dispose();
  assert.equal(pass.resourceObservation().disposed, true);
});

test("height fog pass accepts orthographic camera projection", () => {
  const pass = new HeightFogPass(
    new THREE.Scene(),
    new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100),
    { baseHeight: 0, color: [0.5, 0.6, 0.7], density: 0.02, falloffHeight: 12 },
  );
  pass.setSize(640, 480);
  assert.deepEqual(pass.resourceObservation().fogSize, [320, 240]);
  pass.dispose();
});

function profile(): IAtmosphereProfileIr {
  return {
    active: true,
    ambient: { color: "#ffffff", intensity: 1, mode: "constant" },
    colorManagement: { exposure: 1, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    fog: { color: [0.2, 0.3, 0.4], density: 0.02, enabled: true, mode: "exponential" },
    id: "atmosphere.test",
    shadows: { bias: 0, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 80, normalBias: 0, receiverPolicy: "terrain-and-path" },
    sky: { color: "#88aaff" },
    sun: { castsShadow: true, color: "#ffffff", direction: [-1, -1, 0], id: "sun", intensity: 3 },
  };
}

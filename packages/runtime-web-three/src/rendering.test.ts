import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { applyAtmosphereProfile } from "./rendering.js";

test("rendering should map atmosphere profile to three scene settings", () => {
  const scene = new THREE.Scene();
  const observation = applyAtmosphereProfile(scene, {
    active: true,
    id: "atmosphere.forest",
    sun: { castsShadow: true, color: "#ffd39a", direction: [-0.4, -0.8, -0.2], id: "sun.forest", intensity: 3.2 },
    ambient: { color: "#8fb2a5", intensity: 0.8, mode: "constant" },
    fog: { color: "#9eb6aa", density: 0.028, enabled: true, mode: "exponential" },
    sky: { color: "#9eb6aa", horizonColor: "#d6c39d" },
    colorManagement: { exposure: 1.05, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    shadows: { bias: -0.0005, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 45, normalBias: 0.02, receiverPolicy: "terrain-and-path" },
  });

  assert.equal(observation.profileId, "atmosphere.forest");
  assert.deepEqual(observation.colorManagement, { exposure: 1.05, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" });
  assert.equal(observation.fogColor, "#9eb6aa");
  assert.equal(observation.fogDensity, 0.028);
  assert.equal(observation.fogMode, "exponential");
  assert.equal(observation.shadowBias, -0.0005);
  assert.equal(observation.shadowCascadeCount, 1);
  assert.equal(observation.shadowMaxDistance, 45);
  assert.equal(observation.shadowMapSize, 1024);
  assert.equal(observation.shadowNormalBias, 0.02);
  assert.equal(observation.skyHorizonColor, "#d6c39d");
  assert.equal(scene.children.some((child) => child instanceof THREE.DirectionalLight), true);
  assert.equal(scene.fog instanceof THREE.FogExp2, true);
});

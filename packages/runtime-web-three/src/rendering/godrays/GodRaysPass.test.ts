import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { IAtmosphereProfileIr } from "@threenative/ir";
import { GodRaysPass, webGodRaysSettings } from "./GodRaysPass.js";

test("god rays quality maps to bounded steps and resolution", () => {
  const atmosphere = profile();
  atmosphere.volumetrics = {
    godRays: { density: 0.4, enabled: true, intensity: 1.2, maxDistance: 90, quality: "high" },
  };
  const settings = webGodRaysSettings(atmosphere);
  assert.ok(settings !== undefined);
  assert.ok(Math.abs(settings.density - 0.01) < 1e-6);
  assert.deepEqual({ ...settings, density: 0.01 }, {
    density: 0.01, intensity: 0.6, maxDistance: 90, resolutionScale: 0.75, steps: 64,
  });
});

test("god rays pass owns bounded render targets and teardown", () => {
  const pass = new GodRaysPass(
    new THREE.Scene(),
    new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    [new THREE.DirectionalLight()],
    { density: 0.4, intensity: 1, maxDistance: 80, resolutionScale: 0.5, steps: 32 },
  );
  pass.setSize(801, 601);
  assert.deepEqual(pass.resourceObservation(), {
    depthSize: [801, 601],
    disposed: false,
    illuminationSize: [401, 301],
    steps: 32,
  });
  pass.dispose();
  assert.equal(pass.resourceObservation().disposed, true);
});

test("god rays quality is capped by the resolved render-look tier", () => {
  const atmosphere = profile();
  atmosphere.volumetrics = {
    godRays: { density: 0.4, enabled: true, intensity: 1, maxDistance: 80, quality: "high" },
  };
  assert.equal(webGodRaysSettings(atmosphere, "low")?.steps, 16);
  assert.equal(webGodRaysSettings(atmosphere, "medium")?.steps, 32);
});

function profile(): IAtmosphereProfileIr {
  return {
    active: true,
    ambient: { color: "#ffffff", intensity: 1, mode: "constant" },
    colorManagement: { exposure: 1, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    id: "atmosphere.test",
    shadows: { bias: 0, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 80, normalBias: 0, receiverPolicy: "terrain-and-path" },
    sky: { color: "#88aaff" },
    sun: { castsShadow: true, color: "#ffffff", direction: [-1, -1, 0], id: "sun", intensity: 3 },
  };
}

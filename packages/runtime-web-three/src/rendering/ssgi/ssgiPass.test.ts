import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { IAtmosphereProfileIr, IRuntimeConfigIr } from "@threenative/ir";
import { SsgiPass, webSsgiSettings } from "./ssgiPass.js";
import { ssgiCompositeFragmentShader, ssgiSpatialFragmentShader } from "./ssgi.frag.js";

test("SSGI settings map the three bounded quality tiers", () => {
  assert.deepEqual(settings("low"), { rayCount: 4, resolutionScale: 0.5, stepCount: 8 });
  assert.deepEqual(settings("medium"), { rayCount: 8, resolutionScale: 0.5, stepCount: 12 });
  assert.deepEqual(settings("high"), { rayCount: 8, resolutionScale: 1, stepCount: 16 });
});

test("SSGI high quality stays full resolution on desktop and clamps on mobile web", () => {
  const desktop = webSsgiSettings(config("high"), atmosphere(), "desktop-web");
  const mobile = webSsgiSettings(config("high"), atmosphere(), "mobile-web");
  assert.ok(desktop);
  assert.ok(mobile);
  assert.deepEqual({ quality: desktop.quality, resolutionScale: desktop.resolutionScale, stepCount: desktop.stepCount }, { quality: "high", resolutionScale: 1, stepCount: 16 });
  assert.deepEqual({ quality: mobile.quality, resolutionScale: mobile.resolutionScale, stepCount: mobile.stepCount }, { quality: "medium", resolutionScale: 0.5, stepCount: 12 });
});

test("SSGI remains absent when disabled", () => {
  assert.equal(webSsgiSettings(config("medium", false), atmosphere()), undefined);
});

test("SSGI shader keeps bounded hit refinement and linear-depth upsampling", () => {
  assert.match(ssgiSpatialFragmentShader, /const int REFINE_STEPS = 4/);
  assert.match(ssgiSpatialFragmentShader, /lowDistance = midDistance/);
  assert.match(ssgiSpatialFragmentShader, /highDistance = midDistance/);
  assert.match(ssgiCompositeFragmentShader, /linearViewDepth/);
  assert.match(ssgiCompositeFragmentShader, /relativeDepthDelta/);
});

test("SSGI pass owns full depth and quality-scaled indirect targets", () => {
  const mapped = webSsgiSettings(config("medium"), atmosphere());
  assert.ok(mapped);
  const pass = new SsgiPass(new THREE.Scene(), new THREE.PerspectiveCamera(60, 1, 0.1, 100), mapped);
  pass.setSize(801, 601);
  assert.deepEqual(pass.resourceObservation(), { depthSize: [801, 601], disposeCount: 0, disposed: false, indirectSize: [401, 301] });
  pass.dispose();
  pass.dispose();
  assert.deepEqual(pass.resourceObservation(), { depthSize: [801, 601], disposeCount: 1, disposed: true, indirectSize: [401, 301] });
});

function settings(quality: "low" | "medium" | "high"): Pick<NonNullable<ReturnType<typeof webSsgiSettings>>, "rayCount" | "resolutionScale" | "stepCount"> {
  const value = webSsgiSettings(config(quality), atmosphere());
  assert.ok(value);
  return { rayCount: value.rayCount, resolutionScale: value.resolutionScale, stepCount: value.stepCount };
}

function config(quality: "low" | "medium" | "high", enabled = true): IRuntimeConfigIr {
  return {
    renderer: { antialias: "none", screenSpaceGlobalIllumination: { enabled, intensity: 1, quality, radius: 12 } },
    schema: "threenative.runtime-config",
    time: { fixedDelta: 1 / 60, paused: false },
    version: "0.1.0",
    window: { height: 720, title: "SSGI test", width: 1280 },
  };
}

function atmosphere(): IAtmosphereProfileIr {
  return {
    active: true,
    ambient: { color: "#8090a0", intensity: 0.4, mode: "constant" },
    colorManagement: { exposure: 1, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    fog: { color: "#8090a0", density: 0.01, enabled: false, mode: "exponential" },
    id: "atmosphere.test",
    shadows: { bias: 0, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 80, normalBias: 0, receiverPolicy: "terrain-and-path" },
    sky: { color: "#405060" },
    sun: { castsShadow: true, color: "#ffffff", direction: [-1, -1, 0], id: "sun", intensity: 3 },
  };
}

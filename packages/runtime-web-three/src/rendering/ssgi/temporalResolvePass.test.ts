import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { SsgiTemporalResolvePass, temporalResolveFragmentShader, temporalViewChangeRequiresReset } from "./temporalResolvePass.js";

test("SSGI temporal reset detects teleports and large view changes but keeps ordinary motion", () => {
  const previous = new THREE.Matrix4();
  const ordinaryMotion = new THREE.Matrix4().makeTranslation(0.5, 0, 0);
  const teleport = new THREE.Matrix4().makeTranslation(8, 0, 0);
  const turnAround = new THREE.Matrix4().makeRotationY(Math.PI);
  assert.equal(temporalViewChangeRequiresReset(previous, ordinaryMotion, 10), false);
  assert.equal(temporalViewChangeRequiresReset(previous, teleport, 10), true);
  assert.equal(temporalViewChangeRequiresReset(previous, turnAround, 10), true);
});

test("SSGI temporal shader keeps reprojection, bilateral denoise, neighborhood clamp, depth confidence, and hit confidence", () => {
  assert.match(temporalResolveFragmentShader, /previousViewProjection/);
  assert.match(temporalResolveFragmentShader, /bilateralCurrent/);
  assert.match(temporalResolveFragmentShader, /relativeDepthDelta/);
  assert.match(temporalResolveFragmentShader, /neighborhoodMin/);
  assert.match(temporalResolveFragmentShader, /depthConfidence/);
  assert.match(temporalResolveFragmentShader, /hitConfidence/);
});

test("SSGI temporal history resets on resize and disposes once", () => {
  const pass = new SsgiTemporalResolvePass(10);
  pass.setSize(400, 300);
  assert.deepEqual(pass.observation(), { disposeCount: 0, disposed: false, hasHistory: false, historySize: [400, 300], resetCount: 0 });
  pass.setSize(800, 600);
  pass.dispose();
  pass.dispose();
  assert.deepEqual(pass.observation(), { disposeCount: 1, disposed: true, hasHistory: false, historySize: [800, 600], resetCount: 0 });
});

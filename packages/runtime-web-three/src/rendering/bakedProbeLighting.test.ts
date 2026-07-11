import assert from "node:assert/strict";
import test from "node:test";
import type { ILightProbeIr } from "@threenative/ir";
import * as THREE from "three";
import { createWebBakedProbeLighting } from "./bakedProbeLighting.js";

test("web baked probe lighting should map SH2 coefficients exactly", () => {
  const coefficients = Array.from({ length: 27 }, (_, index) => index / 100);
  const lighting = createWebBakedProbeLighting([probe("warm", coefficients, [-1, -1, -1], [1, 1, 1])]);
  assert.ok(lighting);
  lighting.sync(new THREE.Vector3(0, 0, 0));
  assert.equal(lighting.light.intensity, 1);
  assert.deepEqual(lighting.light.sh.toArray(), coefficients);
  assert.deepEqual(lighting.appliedProbeIds, ["warm"]);
});

test("web baked probe lighting should blend bounded probes and disable outside influence", () => {
  const red = Array(27).fill(0).map((_, index) => index % 3 === 0 ? 1 : 0);
  const blue = Array(27).fill(0).map((_, index) => index % 3 === 2 ? 1 : 0);
  const lighting = createWebBakedProbeLighting([
    probe("red", red, [-2, -1, -1], [0, 1, 1]),
    probe("blue", blue, [0, -1, -1], [2, 1, 1]),
  ]);
  assert.ok(lighting);
  lighting.sync(new THREE.Vector3(0, 0, 0));
  assert.deepEqual(lighting.light.sh.coefficients[0]?.toArray(), [0.5, 0, 0.5]);
  lighting.sync(new THREE.Vector3(20, 0, 0));
  assert.equal(lighting.light.intensity, 0);
  assert.deepEqual(lighting.light.sh.toArray(), Array(27).fill(0));
});

function probe(id: string, coefficients: number[], min: [number, number, number], max: [number, number, number]): ILightProbeIr {
  return { bounds: { max, min }, id, influenceRadius: 2, intent: "irradiance", source: { bakeVersion: 1, coefficients, format: "sh2", sceneContentHash: `sha256:${"a".repeat(64)}` } };
}

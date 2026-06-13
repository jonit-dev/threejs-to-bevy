import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createFirstPersonState, updateFirstPersonController } from "./firstPerson.js";

test("firstPerson should move camera forward when forward action is pressed", () => {
  const camera = new THREE.Object3D();
  const state = createFirstPersonState();

  updateFirstPersonController({
    camera,
    controller: makeController(),
    deltaSeconds: 1,
    input: { action: (name) => name === "MoveForward", axis: () => 0 },
    state,
  });

  assert.equal(camera.position.y, 1.7);
  assert.equal(camera.position.z < 0, true);
});

test("firstPerson should clamp pitch when mouse delta exceeds limits", () => {
  const camera = new THREE.Object3D();
  const state = createFirstPersonState();

  updateFirstPersonController({
    camera,
    controller: makeController({ pitch: { min: -10, max: 10 }, sensitivity: 1 }),
    deltaSeconds: 1 / 60,
    input: { action: () => false, axis: (name) => (name === "LookY" ? -100 : 0) },
    state,
  });

  assert.equal(Math.round(THREE.MathUtils.radToDeg(state.pitch)), 10);
});

function makeController(overrides: Partial<Parameters<typeof updateFirstPersonController>[0]["controller"]> = {}): Parameters<typeof updateFirstPersonController>[0]["controller"] {
  return {
    acceleration: 18,
    camera: "camera.firstPerson",
    height: 1.7,
    input: {
      backward: "MoveBackward",
      forward: "MoveForward",
      left: "MoveLeft",
      lookX: "LookX",
      lookY: "LookY",
      right: "MoveRight",
    },
    maxSpeed: 4.5,
    pitch: { min: -75, max: 75 },
    pointerLock: "required",
    sensitivity: 0.0025,
    ...overrides,
  };
}

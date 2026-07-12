import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { enqueuePresentationEffects, createPresentationRuntimeState, shakeEnvelope, stepPresentation } from "./presentation.js";
import type { IThreeWorld } from "./mapWorld.js";
import type { IWorldIr } from "@threenative/ir";

function fixture(): { mapped: IThreeWorld; world: IWorldIr } {
  const object = new THREE.Object3D();
  return {
    mapped: {
      camera: new THREE.PerspectiveCamera(),
      cameraViews: [],
      cameras: new Map(),
      diagnostics: [],
      layerAllocation: new Map(),
      objectsById: new Map([["pickup", object]]),
      scene: new THREE.Scene(),
    },
    world: {
      entities: [{ components: { Transform: { scale: [1, 1, 1] as [number, number, number] } }, id: "pickup" }],
      schema: "threenative.world",
      version: "0.1.0",
    },
  };
}

test("tween scale with ease out finishes exactly at the target", () => {
  const { mapped, world } = fixture();
  const state = createPresentationRuntimeState();
  enqueuePresentationEffects(world, mapped, state, [{
    entity: "pickup",
    kind: "tween",
    property: "scale",
    source: "command",
    value: { duration: 1, easing: "ease-out", to: [2, 2, 2] },
  }], []);
  stepPresentation(world, mapped, state, 0.5);
  assert.deepEqual(world.entities[0]?.components.Transform?.scale, [1.75, 1.75, 1.75]);
  stepPresentation(world, mapped, state, 0.5);
  assert.deepEqual(world.entities[0]?.components.Transform?.scale, [2, 2, 2]);
  assert.equal(state.logs.at(-1)?.kind, "complete");
});

test("owned tween cancels when the entity despawns", () => {
  const { mapped, world } = fixture();
  const state = createPresentationRuntimeState();
  enqueuePresentationEffects(world, mapped, state, [{ entity: "pickup", kind: "tween", property: "scale", source: "command", value: { duration: 1, to: [2, 2, 2] } }], []);
  world.entities = [];
  stepPresentation(world, mapped, state, 1 / 60);
  assert.equal(state.logs.at(-1)?.kind, "cancel");
  assert.equal(state.tweens.size, 0);
});

test("portable shake envelope uses real elapsed delta", () => {
  assert.equal(shakeEnvelope(0.1, 0.2), 0.5);
  assert.equal(shakeEnvelope(0.2, 0.2), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { syncWorldText } from "./worldText.js";
import type { IThreeWorld } from "./mapWorld.js";
import type { IWorldIr } from "@threenative/ir";

test("world text follows its target, floats, and expires", () => {
  const target = new THREE.Object3D();
  target.position.set(4, 2, 1);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
  const world: IWorldIr = {
    entities: [
      { components: { Transform: { position: [0, 0, 0] as [number, number, number] } }, id: "target" },
      { components: { WorldText: { elapsed: 0, floatDistance: 1, lifetime: 1, offset: [0, 1, 0], target: "target", text: "+1" } }, id: "label" },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const mapped: IThreeWorld = {
    camera: new THREE.PerspectiveCamera(),
    cameraViews: [],
    cameras: new Map(),
    diagnostics: [],
    layerAllocation: new Map(),
    objectsById: new Map([["target", target], ["label", label]]),
    scene: new THREE.Scene(),
  };
  syncWorldText(world, mapped, 0.5);
  assert.deepEqual(label.position.toArray(), [4, 3.5, 1]);
  syncWorldText(world, mapped, 0.5);
  assert.equal(world.entities.some((entity) => entity.id === "label"), false);
});

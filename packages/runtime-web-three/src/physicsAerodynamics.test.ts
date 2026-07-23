import assert from "node:assert/strict";
import test from "node:test";

import type { IAerodynamicBodyComponent, IWorldIr } from "@threenative/ir";
import { applyPhysicsAerodynamicBindings, disposePhysicsAerodynamics, observePhysicsAerodynamics, setPhysicsAerodynamicInputs, stepPhysicsAerodynamics } from "./physicsAerodynamics.js";

const FIXED_DELTA = 1 / 60;

test("should produce zero aerodynamic force at zero relative airspeed", () => {
  const world = aerodynamicWorld([0, 0, 0]);
  const observation = stepPhysicsAerodynamics(world, FIXED_DELTA, 0)[0]!;
  assert.deepEqual(observation.surfaces[0]?.lift, [0, 0, 0]);
  assert.deepEqual(observation.surfaces[0]?.drag, [0, 0, 0]);
  assert.deepEqual(observation.relativeAirVelocity, [0, 0, 0]);
  assert.deepEqual(observation.diagnostics, []);
});

test("should increase drag quadratically with airspeed", () => {
  const slow = stepPhysicsAerodynamics(aerodynamicWorld([0, 0, -10]), FIXED_DELTA, 0)[0]!.surfaces[0]!.drag;
  const fast = stepPhysicsAerodynamics(aerodynamicWorld([0, 0, -20]), FIXED_DELTA, 0)[0]!.surfaces[0]!.drag;
  assert.ok(Math.abs(length(fast) / length(slow) - 4) < 0.0001);
});

test("should reverse control torque when elevator deflection reverses", () => {
  const world = aerodynamicWorld([0, 0, -20]);
  assert.equal(setPhysicsAerodynamicInputs(world, "craft", { surfaces: { elevator: 1 } }), true);
  const positive = stepPhysicsAerodynamics(world, 1, 0)[0]!.surfaces[0]!.lift[1];
  disposePhysicsAerodynamics(world);
  assert.equal(setPhysicsAerodynamicInputs(world, "craft", { surfaces: { elevator: -1 } }), true);
  const negative = stepPhysicsAerodynamics(world, 1, 0)[0]!.surfaces[0]!.lift[1];
  assert.ok(positive > 0 && negative < 0);
});

test("should preserve explicit aerodynamic inputs over declarative binding polling", () => {
  const world = aerodynamicWorld([0, 0, -20]);
  assert.equal(setPhysicsAerodynamicInputs(world, "craft", { surfaces: { elevator: 1 } }), true);
  applyPhysicsAerodynamicBindings(world, { action: () => false, axis: () => 0 } as never);
  assert.ok(stepPhysicsAerodynamics(world, 1, 0)[0]!.surfaces[0]!.controlDeflection > 0);
});

test("should enter and leave stall under a recorded maneuver", () => {
  const world = aerodynamicWorld([0, 10, -10]);
  assert.equal(stepPhysicsAerodynamics(world, FIXED_DELTA, 0)[0]!.surfaces[0]!.stalled, true);
  world.entities[0]!.components.RigidBody!.velocity = [0, 1, -20];
  assert.equal(stepPhysicsAerodynamics(world, FIXED_DELTA, 1)[0]!.surfaces[0]!.stalled, false);
  assert.equal(observePhysicsAerodynamics(world)[0]!.surfaces[0]!.stalled, false);
});

test("should include deterministic wind only inside the authored volume", () => {
  const world = aerodynamicWorld([0, 0, -10]);
  world.entities.push({ id: "wind", components: { Transform: { position: [0, 0, 0] }, WindVolume: { airDensity: 1, gust: { amplitude: [1, 0, 0], frequency: 1, seed: 7 }, shape: "box", size: [10, 10, 10], velocity: [2, 0, 0] } } });
  const inside = stepPhysicsAerodynamics(world, FIXED_DELTA, 12)[0]!;
  const repeated = stepPhysicsAerodynamics(aerodynamicWorldWithWind(), FIXED_DELTA, 12)[0]!;
  assert.deepEqual(inside.windVelocity, repeated.windVelocity);
  world.entities[0]!.components.Transform!.position = [6, 0, 0];
  assert.deepEqual(stepPhysicsAerodynamics(world, FIXED_DELTA, 12)[0]!.windVelocity, [0, 0, 0]);
});

function aerodynamicWorldWithWind(): IWorldIr { const world = aerodynamicWorld([0, 0, -10]); world.entities.push({ id: "wind", components: { Transform: { position: [0, 0, 0] }, WindVolume: { airDensity: 1, gust: { amplitude: [1, 0, 0], frequency: 1, seed: 7 }, shape: "box", size: [10, 10, 10], velocity: [2, 0, 0] } } }); return world; }
function aerodynamicWorld(velocity: [number, number, number]): IWorldIr { return { schema: "threenative.world", version: "0.1.0", entities: [{ id: "craft", components: { AerodynamicBody: body(), Collider: { kind: "box", size: [2, 1, 4] }, RigidBody: { kind: "dynamic", velocity }, Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } }] }; }
function body(): IAerodynamicBodyComponent { return { dragArea: [1, 1, 1], maxForce: 1_000_000, surfaces: [{ area: 2, aspectRatio: 6, centerOfPressure: [0, 0, -2], control: { input: 0, maxDeflection: 0.4, response: 10 }, dragCurve: [{ angle: -1.5, coefficient: 0.1 }, { angle: 0, coefficient: 0.1 }, { angle: 1.5, coefficient: 0.1 }], id: "elevator", liftCurve: [{ angle: -1.5, coefficient: -1 }, { angle: 0, coefficient: 0 }, { angle: 1.5, coefficient: 1 }], recoveryAngle: 0.2, stallAngle: 0.5 }] }; }
function length(value: readonly number[]): number { return Math.hypot(...value); }

import assert from "node:assert/strict";
import test from "node:test";

import { FlightRig } from "./flight.js";

const bindings = {
  aileronLeft: "aileron.left",
  aileronRight: "aileron.right",
  elevator: "elevator",
  thruster: "engine",
};

test("FlightRig owns throttle integration and elevator sign convention", () => {
  const state = FlightRig.initialState({ initialThrottle: 0.5 });
  const result = FlightRig.step(
    state,
    { pitch: 0.75, throttleUp: true },
    { altitude: 100, dt: 0.5, velocity: [0, 0, -50] },
    bindings,
    { elevatorSign: -1, throttleRate: 0.2 },
  );

  assert.equal(result.state.throttle, 0.6);
  assert.equal(result.controls.surfaces.elevator, -0.75);
  assert.equal(result.controls.thrusters.engine, 0.6);
});

test("FlightRig coordinates bank and yaw while damping pitch and roll", () => {
  const result = FlightRig.step(
    FlightRig.initialState(),
    { roll: 0.6, yaw: 0.2 },
    { altitude: 100, angularVelocity: [0.4, 0.1, -0.3], dt: 1 / 60, velocity: [0, 0, -72] },
    bindings,
    { stallSpeed: 20 },
  );

  assert.equal(result.controls.surfaces["aileron.left"], 0.6);
  assert.equal(result.controls.surfaces["aileron.right"], -0.6);
  assert.ok(result.torque[0] < 0, "pitch torque should restore positive pitch rate");
  assert.ok(result.torque[2] > 0, "roll torque should restore negative roll rate");
  assert.ok(result.torque[1] < 0, "positive bank/yaw input should command the configured coordinated yaw");
  assert.ok(result.velocity[0] < 0, "positive yaw rate should rotate forward velocity toward -X");
  assert.ok(Math.abs(Math.hypot(...result.velocity) - 72) < 1e-9, "coordinated turn must preserve speed");
});

test("FlightRig reports stall, ditch, and deterministic retry reset", () => {
  const stalled = FlightRig.step(
    { ...FlightRig.initialState({ initialThrottle: 0.8 }), elapsed: 4, retryCount: 2 },
    {},
    { altitude: 30, dt: 0.25, velocity: [0, 0, -20] },
    bindings,
  );
  assert.equal(stalled.state.phase, "stall");
  assert.equal(stalled.state.failed, false);

  const ditched = FlightRig.step(
    stalled.state,
    {},
    { altitude: 4, dt: 0.25, velocity: [0, 0, -40] },
    bindings,
  );
  assert.equal(ditched.state.phase, "ditched");
  assert.equal(ditched.state.elapsed, stalled.state.elapsed);

  const retried = FlightRig.step(
    ditched.state,
    { retry: true },
    { altitude: 4, dt: 0.25, velocity: [0, 0, -40] },
    bindings,
    { initialThrottle: 0.82, retryPose: { position: [0, 260, 0], velocity: [0, 0, -72] } },
  );
  assert.equal(retried.state.phase, "retry");
  assert.equal(retried.state.failed, false);
  assert.equal(retried.state.elapsed, 0);
  assert.equal(retried.state.retryCount, 3);
  assert.equal(retried.state.throttle, 0.82);
  assert.deepEqual(retried.retryPose, {
    position: [0, 260, 0],
    rotation: [0, 0, 0, 1],
    velocity: [0, 0, -72],
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  CoordinatedTurnEx,
  FxEx,
  GuidedFlightEx,
  GunneryEx,
  HitTestEx,
  ProjectileEx,
  ShipFxEx,
} from "./index.js";

test("ProjectileEx preserves ring allocation, integration, expiry, and entity ids", () => {
  const pool = ProjectileEx.pool(2);
  const spawned = ProjectileEx.spawn(pool, 3, {
    life: 0.5,
    position: [2, 3, 4],
    targetId: "target",
    velocity: [10, -2, 5],
  });
  assert.equal(spawned.index, 1);
  assert.equal(spawned.cursor, 4);
  assert.deepEqual(spawned.round, {
    life: 0.5,
    px: 2,
    py: 3,
    pz: 4,
    targetId: "target",
    vx: 10,
    vy: -2,
    vz: 5,
  });
  assert.equal(ProjectileEx.step(spawned.round, 0.1), "flying");
  assert.deepEqual(spawned.round, {
    life: 0.4,
    px: 3,
    py: 2.8,
    pz: 4.5,
    targetId: "target",
    vx: 10,
    vy: -2,
    vz: 5,
  });
  spawned.round.py = 0.5;
  assert.equal(ProjectileEx.step(spawned.round, 0.1), "expired");
  assert.equal(spawned.round.life, 0);
  assert.equal(spawned.round.py, -9999);
  assert.equal(ProjectileEx.entityId("tracer.", 3, 2), "tracer.03");
});

test("GunneryEx reproduces clamped lead pursuit with deterministic scatter", () => {
  const result = GunneryEx.leadPoint([0, 0, 0], [0, 0, -280], [10, 2, 0], {
    maxLead: 2.8,
    minLead: 0.2,
    scatter: [4, -3, 2],
    speed: 280,
  });
  assert.equal(result.flightTime, 1);
  assert.deepEqual(result.aim, [14, -1, -278]);
  const length = Math.hypot(...result.velocity);
  assert.ok(Math.abs(length - 280) < 1e-12);
});

test("GunneryEx accepts an owning behavior's precomputed lead time", () => {
  const result = GunneryEx.leadPoint([10, 20, 30], [100, 50, -300], [12, -3, 40], {
    leadTime: 2.25,
    maxLead: 2.8,
    minLead: 0.2,
    speed: 280,
  });
  assert.equal(result.flightTime, 2.25);
  assert.deepEqual(result.aim, [127, 43.25, -210]);
});

test("FxEx reproduces the existing pooled and player fireball envelopes", () => {
  const pooled = FxEx.fireball({ life: 0.65, x: 4, y: 5, z: 6 }, 0.05, {
    duration: 0.65,
    grow: 14,
    rise: 6,
    startSize: 10,
    verticalScale: 1.15,
  });
  const age = 1 - 0.6 / 0.65;
  const expected = Math.max(0.001, Math.sin(Math.min(1, age * 1.15) * Math.PI) * (10 + age * 14));
  assert.equal(pooled.life, 0.6);
  assert.deepEqual(pooled.position, [4, 5 + age * 6, 6]);
  assert.deepEqual(pooled.scale, [expected, expected * 1.15, expected]);
  assert.equal(FxEx.flash(0.06, 0.12), 1);
  assert.deepEqual(FxEx.parkPose(), {
    position: [0, -9999, 0],
    scale: [0.001, 0.001, 0.001],
  });
});

test("HitTestEx preserves Pacific hull and spherical hit boundaries", () => {
  const hull = { halfX: 74, halfZ: 8.5, maxY: 36, minY: 2 };
  assert.equal(HitTestEx.insideBox([74, 36, -891.5], [0, 0, -900], hull), true);
  assert.equal(HitTestEx.insideBox([74.001, 36, -891.5], [0, 0, -900], hull), false);
  assert.equal(HitTestEx.insideSphereSq([7.5, 0, 0], [0, 0, 0], 56.25), true);
  assert.equal(HitTestEx.risingEdge(true, false), true);
  assert.equal(HitTestEx.risingEdge(true, true), false);
});

test("ShipFxEx preserves the shared destroyer sink and roll timing", () => {
  const pose = ShipFxEx.sinkPose([450, 4.95, -2000], 5, {
    drift: 5,
    roll: 0.52,
    rollDuration: 7,
    sinkDepth: 22,
    sinkDuration: 10,
  });
  const roll = (5 / 7) * 0.52;
  assert.deepEqual(pose, {
    position: [450, -6.05, -2002.5],
    rotation: [Math.sin(roll / 2), 0, 0, Math.cos(roll / 2)],
  });
});

test("GuidedFlightEx exactly reproduces the current guided steering formula", () => {
  const position = [15, 300, -900] as const;
  const velocity = [20, -3, -80] as const;
  const target = [-250, 360, -1300] as const;
  const dt = 1 / 60;
  const result = GuidedFlightEx.step({
    dt,
    limits: {
      acceleration: 12,
      climbAcceleration: 30,
      climbGain: 0.4,
      climbMax: 16,
      climbMin: -22,
      deceleration: 16,
      speed: 82,
      yawGain: 1.15,
      yawRate: 0.55,
    },
    position,
    target,
    velocity,
  });

  const desiredYaw = Math.atan2(-(target[0] - position[0]), -(target[2] - position[2]));
  const horizontalSpeed = Math.max(0.001, Math.hypot(velocity[0], velocity[2]));
  const headingYaw = Math.atan2(-velocity[0], -velocity[2]);
  let yawError = desiredYaw - headingYaw;
  while (yawError > Math.PI) yawError -= Math.PI * 2;
  while (yawError < -Math.PI) yawError += Math.PI * 2;
  const yawRate = Math.max(-0.55, Math.min(0.55, yawError * 1.15));
  const speed = horizontalSpeed + Math.max(-16 * dt, Math.min(12 * dt, 82 - horizontalSpeed));
  const theta = yawRate * dt;
  const headingX = (velocity[0] * Math.cos(theta) + velocity[2] * Math.sin(theta)) / horizontalSpeed;
  const headingZ = (-velocity[0] * Math.sin(theta) + velocity[2] * Math.cos(theta)) / horizontalSpeed;
  const climbTarget = Math.max(-22, Math.min(16, (target[1] - position[1]) * 0.4));
  const climb = velocity[1] + Math.max(-30 * dt, Math.min(30 * dt, climbTarget - velocity[1]));
  assert.deepEqual(result.velocity, [headingX * speed, climb, headingZ * speed]);
  assert.equal(result.yawRate, yawRate);
  assert.equal(result.bankTarget, Math.max(-0.5, Math.min(0.5, -yawRate * 1.05)));
  assert.equal(
    result.pitchTarget,
    Math.max(-0.32, Math.min(0.32, Math.asin(Math.max(-1, Math.min(1, climb / Math.max(20, Math.hypot(...velocity)))))))
  );
});

test("CoordinatedTurnEx exactly reproduces player torque and velocity rotation", () => {
  const result = CoordinatedTurnEx.step({
    angularVelocity: [0.2, -0.3, 0.4],
    dt: 1 / 60,
    gains: {
      pitchDamping: 30000,
      rollDamping: 55000,
      yawAuthority: 14000,
      yawDamping: 25000,
    },
    turnInput: 0.75,
    velocity: [12, -2, -72],
  });
  const theta = -0.3 / 60;
  assert.deepEqual(result.torque, [-6000, -3000, -22000]);
  assert.deepEqual(result.velocity, [
    12 * Math.cos(theta) + -72 * Math.sin(theta),
    -2,
    -12 * Math.sin(theta) + -72 * Math.cos(theta),
  ]);
});

test("CoordinatedTurnEx pins constant-input turn radius without sideslip speed loss", () => {
  const dt = 1 / 60;
  let velocity: readonly [number, number, number] = [0, 0, -72];
  let position: readonly [number, number, number] = [0, 0, 0];
  for (let tick = 0; tick < 180; tick += 1) {
    velocity = CoordinatedTurnEx.step({
      angularVelocity: [0, -0.3, 0],
      dt,
      gains: {
        pitchDamping: 30000,
        rollDamping: 55000,
        yawAuthority: 14000,
        yawDamping: 25000,
      },
      turnInput: 0.75,
      velocity,
    }).velocity;
    position = [
      position[0] + velocity[0] * dt,
      position[1] + velocity[1] * dt,
      position[2] + velocity[2] * dt,
    ];
  }
  assert.ok(Math.abs(Math.hypot(...velocity) - 72) < 1e-12);
  assert.deepEqual(position, [91.28341456572218, 0, -187.77103262794031]);
});

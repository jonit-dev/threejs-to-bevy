import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAerodynamicViability, analyzeAerodynamicWorldEntityViability } from "./aerodynamicViability.js";
import type { IWorldIr } from "./types.js";

const balancedBody = {
  dragArea: [0.2, 0.1, 0.3],
  maxForce: 20_000,
  surfaces: [
    {
      area: 16,
      aspectRatio: 8,
      centerOfPressure: [0, 0, 0],
      dragCurve: [{ angle: -1, coefficient: 0.03 }, { angle: 0, coefficient: 0.03 }, { angle: 1, coefficient: 0.03 }],
      id: "main-wing",
      liftCurve: [{ angle: -1, coefficient: -1.2 }, { angle: 0, coefficient: 0.8 }, { angle: 1, coefficient: 1.2 }],
      recoveryAngle: 0.3,
      stallAngle: 0.6,
    },
  ],
  thrusters: [{ direction: [0, 0, -1], id: "engine", maxForce: 5_000, point: [0, 0, 0], response: 10 }],
};

test("should reject lift below weight at spawn", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: { ...balancedBody, surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, area: 0.1 })) },
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 1_000, velocity: [0, 0, -20] },
    transform: {},
  });
  const diagnostic = result.diagnostics.find((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT");
  assert.equal(result.status, "analyzed");
  assert.match(diagnostic?.message ?? "", /Spawn lift .*\(weight/u);
  assert.match(diagnostic?.message ?? "", /20\.000 m\/s/u);
  assert.equal(diagnostic?.path, "/entities/0/components/AerodynamicBody/surfaces");
  assert.match(diagnostic?.fix?.instruction ?? "", /airspeed|wing/u);
});

test("should reject thrust below cruise drag", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: { ...balancedBody, dragArea: [20, 20, 20], thrusters: [{ ...balancedBody.thrusters[0], maxForce: 10 }] },
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -35] },
    transform: {},
  });
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_THRUST_BUDGET_INSUFFICIENT" && /Available forward thrust/u.test(item.message)));
});

test("should warn on double-counted damping", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: balancedBody,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { damping: 0.25, kind: "dynamic", mass: 80, velocity: [0, 0, -35] },
    transform: {},
  });
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_DAMPING_DOUBLE_COUNTED" && item.severity === "warning"));
});

test("should report stowed trim moment", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: { ...balancedBody, surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, centerOfPressure: [0, 0, -4] })) },
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -35] },
    transform: {},
  });
  const diagnostic = result.diagnostics.find((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_STOWED_TRIM_UNBALANCED");
  assert.match(diagnostic?.message ?? "", /moment \[/u);
  assert.match(diagnostic?.suggestion ?? "", /main-wing/u);
});

test("should accept the stable flight fixture", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: balancedBody,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -35] },
    transform: {},
  });
  assert.equal(result.status, "analyzed");
  assert.deepEqual(result.diagnostics, []);
  assert.ok((result.measurements?.lift ?? 0) > (result.measurements?.weight ?? Infinity));
});

test("should return not-applicable without declared spawn state", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: balancedBody,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80 },
    transform: {},
  });
  assert.deepEqual(result, { diagnostics: [], reason: "spawn-velocity-missing", status: "not-applicable" });
});

test("should use containing wind and density for relative spawn airspeed", () => {
  const stillAir = analyzeAerodynamicViability({
    aerodynamicBody: balancedBody,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, 0] },
    transform: {},
  });
  const windy = analyzeAerodynamicViability({
    aerodynamicBody: balancedBody,
    airDensity: 0.9,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, 0] },
    transform: {},
    windVelocity: [0, 0, 35],
  });
  assert.equal(stillAir.status, "not-applicable");
  assert.equal(windy.status, "analyzed");
  assert.equal(windy.measurements?.airDensity, 0.9);
  assert.equal(windy.measurements?.speed, 35);
});

test("should preserve zero air density and reject lift in a vacuum", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: balancedBody,
    airDensity: 0,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -35] },
    transform: {},
  });
  assert.equal(result.measurements?.airDensity, 0);
  assert.equal(result.measurements?.lift, 0);
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT"));
});

test("should compare thrust and drag under one saturated force budget", () => {
  const zeroCurve = [{ angle: -1, coefficient: 0 }, { angle: 1, coefficient: 0 }];
  const result = analyzeAerodynamicViability({
    aerodynamicBody: {
      ...balancedBody,
      dragArea: [0, 0, 10],
      maxForce: 500,
      surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, area: 0.0001, dragCurve: zeroCurve, liftCurve: zeroCurve })),
      thrusters: [{ ...balancedBody.thrusters[0], maxForce: 1_000 }],
    },
    airDensity: 1,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 1, velocity: [0, 0, -20] },
    transform: {},
  });
  assert.equal(result.measurements?.availableThrust, 500);
  assert.equal(result.measurements?.cruiseDrag, 1_000);
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_THRUST_BUDGET_INSUFFICIENT"));
});

test("should treat a near-runway spawn as a supported launch state", () => {
  const world = {
    entities: [
      {
        components: {
          AerodynamicBody: { ...balancedBody, surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, area: 8 })) },
          Collider: { kind: "box", size: [1.2, 0.8, 4] },
          RigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -12] },
          Transform: { position: [0, 2, 0] },
        },
        id: "craft",
      },
      {
        components: {
          Collider: { kind: "box", size: [20, 0.2, 40] },
          RigidBody: { kind: "static" },
          Transform: { position: [0, -1.2, 0] },
        },
        id: "runway",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  } as unknown as IWorldIr;
  const supported = analyzeAerodynamicWorldEntityViability(world, 0, "/entities/0/components/AerodynamicBody");
  const airborne = analyzeAerodynamicWorldEntityViability({
    ...world,
    entities: world.entities.map((entity) => entity.id === "craft"
      ? { ...entity, components: { ...entity.components, Transform: { position: [0, 20, 0] as [number, number, number] } } }
      : entity),
  } as IWorldIr, 0, "/entities/0/components/AerodynamicBody");
  assert.ok(!supported.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT"));
  assert.ok(airborne.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT"));
});

test("should reject a supported launch state that can never produce lift", () => {
  const zeroCurve = [{ angle: -1, coefficient: 0 }, { angle: 1, coefficient: 0 }];
  const world = {
    entities: [
      {
        components: {
          AerodynamicBody: { ...balancedBody, surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, liftCurve: zeroCurve })) },
          Collider: { kind: "box", size: [1.2, 0.8, 4] },
          RigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -12] },
          Transform: { position: [0, 2, 0] },
        },
        id: "craft",
      },
      {
        components: {
          Collider: { kind: "box", size: [20, 0.2, 40] },
          RigidBody: { kind: "static" },
          Transform: { position: [0, -1.2, 0] },
        },
        id: "runway",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  } as unknown as IWorldIr;
  const result = analyzeAerodynamicWorldEntityViability(world, 0, "/entities/0/components/AerodynamicBody");
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT"));
});

test("should not sample supported liftoff beyond terminal speed", () => {
  const zeroDrag = [{ angle: -1, coefficient: 0 }, { angle: 1, coefficient: 0 }];
  const body = {
    ...balancedBody,
    dragArea: [0, 0, 18.9468],
    maxForce: 20_000,
    surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, area: 23.041, dragCurve: zeroDrag })),
    thrusters: [{ ...balancedBody.thrusters[0], maxForce: 1_000 }],
  };
  const result = analyzeAerodynamicViability({
    aerodynamicBody: body,
    airDensity: 1,
    nearGroundSupport: true,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 1_000 / 9.81, velocity: [0, 0, -10] },
    transform: {},
  });
  assert.ok((result.measurements?.lift ?? Infinity) < (result.measurements?.weight ?? 0) * 0.85);
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT"));
});

test("should not treat downward motion as a supported runway launch", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: {
      ...balancedBody,
      surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, area: 0.1 })),
      thrusters: balancedBody.thrusters.map((thruster) => ({ ...thruster, direction: [0, -1, 0] })),
    },
    nearGroundSupport: true,
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, -12, 0] },
    transform: {},
  });
  assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT"));
});

test("should reject malformed non-finite controls without throwing", () => {
  const result = analyzeAerodynamicViability({
    aerodynamicBody: { ...balancedBody, surfaces: balancedBody.surfaces.map((surface) => ({ ...surface, control: { input: Number.NaN, maxDeflection: Number.POSITIVE_INFINITY, response: 1 } })) },
    path: "/entities/0/components/AerodynamicBody",
    rigidBody: { kind: "dynamic", mass: 80, velocity: [0, 0, -35] },
    transform: {},
  });
  assert.deepEqual(result, { diagnostics: [], reason: "aerodynamic-contract-invalid", status: "not-applicable" });
});

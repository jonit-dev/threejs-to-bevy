import assert from "node:assert/strict";
import test from "node:test";

import type { IFractureManifest, IWorldIr } from "@threenative/ir";

import { disposePhysicsRuntime, initializePhysicsRuntime, preparePhysicsRuntime, raycastLive, stepPhysics } from "./physics.js";
import { collectPhysicsDebugCore, collectPhysicsDebugSnapshot, renderPhysicsDebugOverlay } from "./physicsDebug.js";
import { createPhysicsDestructionRuntime, queuePhysicsDestructionDamage, registerPhysicsDestructible, stepPhysicsDestruction } from "./physicsDestruction.js";
import { stepPhysicsAerodynamics } from "./physicsAerodynamics.js";
import { disposePhysicsVehicleRuntime, stepPhysicsVehicles } from "./physicsVehicle.js";

test("physics debug should cap the summary while preserving the bounded deep artifact shape", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    entities: Array.from({ length: 12 }, (_, index) => ({
      components: { Collider: { kind: "box" as const, size: [1, 1, 1] }, RigidBody: { gravityScale: 0, kind: "dynamic" as const }, Transform: { position: [index * 2, 0, 0] } },
      id: `body.${String(index).padStart(2, "0")}`,
    })),
    schema: "threenative.world",
    version: "0.1.0",
  };
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  raycastLive(world, { direction: [1, 0, 0], maxDistance: 100, origin: [-2, 0, 0] });
  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  const snapshot = collectPhysicsDebugSnapshot(world, { fixedDt: 1 / 60, maxArtifactPrimitives: 100, maxSummaryPrimitives: 4, tick: 7, timings: [{ milliseconds: -1, system: "invalid" }, { milliseconds: 0.25, system: "physics" }] });

  assert.equal(snapshot.schema, "threenative.physics-debug-snapshot");
  assert.equal(snapshot.summary.primitives.length, 4);
  assert.equal(snapshot.summary.truncated, true);
  assert.ok(snapshot.summary.omittedPrimitives > 0);
  assert.equal(snapshot.artifact.primitives.length, 36);
  assert.equal(snapshot.artifact.truncated, false);
  assert.deepEqual(snapshot.artifact.primitives.map((primitive) => primitive.id), [...snapshot.artifact.primitives.map((primitive) => primitive.id)].sort());
  assert.equal(JSON.stringify(snapshot).includes("handle"), false);
  assert.equal(snapshot.artifact.telemetry.queries, 1);
  assert.deepEqual(snapshot.artifact.telemetry.timings, [{ milliseconds: 0, system: "invalid" }, { milliseconds: 0.25, system: "physics" }]);
  assertFiniteNonnegative(snapshot.artifact.telemetry);
  const overlay = renderPhysicsDebugOverlay(snapshot);
  assert.equal(overlay.primitives.length, 4);
  assert.equal(overlay.rows.length, 3);
  disposePhysicsRuntime(world);
});

test("physics debug core should expose retained destruction chunks with stable portable IDs", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    entities: [{ id: "wall", components: { Collider: { kind: "box", size: [2, 1, 1] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 8 }, Transform: { position: [0, 2, 0] } } }],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const runtime = createPhysicsDestructionRuntime();
  registerPhysicsDestructible(runtime, { entity: "wall", fractureManifest: "fractures/debug.wall.json" }, manifest());
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  queuePhysicsDestructionDamage(runtime, { amount: 10, assembly: "wall", bond: "bond.main", cause: { kind: "script" }, tick: 1 });
  stepPhysicsDestruction(runtime, world, 1, 1 / 60);

  const core = collectPhysicsDebugCore(world, { categories: ["bond", "budget", "piece"], destructionRuntime: runtime, fixedDt: 1 / 60, maxPrimitives: 32, tick: 1 });

  assert.deepEqual(core.primitives.map(({ category, id, kind, value }) => ({ category, id, kind, value })), [
    { category: "bond", id: "bond:wall:bond.main", kind: "line", value: 0 },
    { category: "budget", id: "budget:wall", kind: "point", value: 1 },
    { category: "piece", id: "piece:wall:piece.left", kind: "box", value: 1 },
    { category: "piece", id: "piece:wall:piece.right", kind: "sphere", value: 1 },
  ]);
  assert.deepEqual(core.primitives.filter((primitive) => primitive.category === "piece").map((primitive) => primitive.position), [[-0.5, 2, 0], [0.5, 2, 0]]);
  assert.equal(core.telemetry.allocatedPieces, 2);
  assert.equal(core.truncated, false);
  disposePhysicsRuntime(world);
});

test("center-of-mass debug should use the portable body origin for offset compound colliders", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    entities: [{
      components: {
        CompoundCollider: { children: [{ id: "offset", localPose: { position: [2, 0, 0] }, shape: { kind: "box", size: [1, 1, 1] } }] },
        RigidBody: { gravityScale: 0, kind: "dynamic" },
        Transform: { position: [5, 1, 0] },
      },
      id: "offset-body",
    }],
    schema: "threenative.world",
    version: "0.1.0",
  };
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);

  const center = collectPhysicsDebugCore(world, { categories: ["center-of-mass"], fixedDt: 1 / 60, maxPrimitives: 4, tick: 0 }).primitives[0];

  assert.deepEqual(center?.position, [5, 1, 0]);
  disposePhysicsRuntime(world);
});

test("physics debug should normalize vehicle, aero, contact, force, and joint-load views", async () => {
  await initializePhysicsRuntime();
  const world = debugSystemsWorld();
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  stepPhysicsVehicles(world, 1 / 60);
  stepPhysicsAerodynamics(world, 1 / 60, 0);
  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  const core = collectPhysicsDebugCore(world, { fixedDt: 1 / 60, maxPrimitives: 256, tick: 0 });
  const categories = new Set(core.primitives.map((primitive) => primitive.category));

  for (const category of ["aero", "center-of-mass", "collider", "contact", "force", "joint-load", "sleep", "slip", "suspension", "wheel"] as const) assert.ok(categories.has(category), category);
  assert.equal(core.primitives.every((primitive) => ["box", "line", "point", "sphere", "vector"].includes(primitive.kind)), true);
  assert.deepEqual(core.primitives.map((primitive) => primitive.id), [...core.primitives.map((primitive) => primitive.id)].sort());
  assert.ok(core.telemetry.contacts >= 1);
  assert.ok(core.telemetry.queries >= 1);
  disposePhysicsVehicleRuntime(world);
  disposePhysicsRuntime(world);
});

function manifest(): IFractureManifest {
  return {
    bonds: [{ health: 10, id: "bond.main", impulseThreshold: 10, pieces: ["piece.left", "piece.right"] }],
    budgets: { maxActivePieces: 2, maxDepth: 0, overflowPolicy: "reject-new" },
    id: "debug.wall",
    pieces: [
      { activationDepth: 0, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.left", localPosition: [-0.5, 0, 0], massFraction: 0.5 },
      { activationDepth: 0, collider: { kind: "sphere", radius: 0.5 }, id: "piece.right", localPosition: [0.5, 0, 0], massFraction: 0.5 },
    ],
    schema: "threenative.fracture-manifest",
    source: { kind: "primitive", seed: 3, sourceHash: "debug" },
    version: "0.1.0",
  };
}

function debugSystemsWorld(): IWorldIr {
  return {
    entities: [
      {
        components: {
          AerodynamicBody: { dragArea: [1, 1, 1], maxForce: 100_000, surfaces: [{ area: 1, aspectRatio: 4, centerOfPressure: [0, 0, -1], dragCurve: [{ angle: -1, coefficient: 0.1 }, { angle: 1, coefficient: 0.1 }], id: "wing", liftCurve: [{ angle: -1, coefficient: -1 }, { angle: 1, coefficient: 1 }], recoveryAngle: 0.2, stallAngle: 0.5 }] },
          Collider: { kind: "box", size: [1, 0.4, 2] },
          RigidBody: { gravityScale: 0, kind: "dynamic", mass: 10, velocity: [0, 0, -10] },
          Transform: { position: [0, 1, 4] },
          WheelAssembly: { maxSteeringAngle: 0.5, maxSuspensionForce: 5_000, maxTireForce: 2_000, wheels: [{ attachment: [0, -0.3, 0], braked: true, driven: true, id: "wheel.main", radius: 0.25, steering: true, suspension: { damperRate: 500, springRate: 5_000, travel: 0.6 }, tire: "tire", width: 0.2 }] },
        },
        id: "chassis",
      },
      { components: { TireModel: { lateralSlipCurve: [{ grip: 1, slip: 0 }, { grip: 1, slip: 1 }], loadSensitivity: 0, longitudinalSlipCurve: [{ grip: 1, slip: 0 }, { grip: 1, slip: 1 }], rollingResistance: 0 } }, id: "tire" },
      { components: { Collider: { kind: "box", size: [20, 0.2, 20] }, PhysicsSurface: { combineRule: "multiply", grip: 1, rollingResistance: 0 }, RigidBody: { kind: "static" }, Transform: { position: [0, 0.3, 4] } }, id: "ground" },
      { components: { Collider: { kind: "box", size: [0.5, 0.5, 0.5] }, PhysicsJoint: { connectedEntity: "chassis", kind: "fixed" }, RigidBody: { gravityScale: 0, kind: "dynamic" }, Transform: { position: [0, 1, 5] } }, id: "trailer" },
      { components: { Collider: { kind: "box", size: [1, 1, 1] }, RigidBody: { kind: "static" }, Transform: { position: [4, 1, 0] } }, id: "impact.wall" },
      { components: { Collider: { kind: "sphere", radius: 0.25 }, RigidBody: { ccd: { enabled: true, mode: "linear" }, gravityScale: 0, kind: "dynamic", mass: 1, velocity: [20, 0, 0] }, Transform: { position: [3.2, 1, 0] } }, id: "impact.projectile" },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
}

function assertFiniteNonnegative(value: unknown): void {
  if (typeof value === "number") assert.ok(Number.isFinite(value) && value >= 0, String(value));
  else if (Array.isArray(value)) for (const child of value) assertFiniteNonnegative(child);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) assertFiniteNonnegative(child);
}

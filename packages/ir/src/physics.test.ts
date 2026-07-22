import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateVehicleController } from "./physicsValidation.js";
import { validateBundle, type IIrDiagnostic } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("physics should reject unbounded dynamic mesh collider", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-dynamic-mesh-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        { Collider: { kind: "mesh" }, RigidBody: { kind: "dynamic" } },
        { Collider: { kind: "mesh" }, RigidBody: { kind: "kinematic" } },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
        "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID",
        "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
        "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should accept supported primitive collider dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-primitives-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        { Collider: { friction: 0.5, kind: "box", restitution: 0.25, size: [1, 2, 3] }, RigidBody: { kind: "static" } },
        { Collider: { kind: "sphere", radius: 0.5 }, RigidBody: { damping: 0.2, gravityScale: 0.5, kind: "dynamic", mass: 1, velocity: [0, 0, 1] } },
        { Collider: { kind: "capsule", height: 2, radius: 0.25, trigger: true }, RigidBody: { kind: "kinematic" } },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept primitive dynamic and kinematic bodies when fields are bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v9-solver-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      manifest: {
        name: "v9-primitive-solver",
        requiredCapabilities: {
          physics: ["collider.box", "collider.capsule", "primitive-solver-v2", "rigid-body.dynamic", "rigid-body.kinematic", "rigid-body.static"],
        },
      },
    });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        { Collider: { friction: 0.8, kind: "box", restitution: 0.1, size: [4, 0.5, 4] }, RigidBody: { inverseMass: 0, kind: "static" } },
        {
          Collider: { center: [0, 0.5, 0], friction: 0.6, kind: "box", restitution: 0.25, size: [1, 1, 1] },
          RigidBody: {
            angularVelocity: [0, 0.5, 0],
            damping: 0.05,
            enabledRotations: [false, true, false],
            enabledTranslations: [true, false, true],
            gravityScale: 1,
            inverseMass: 0.5,
            kind: "dynamic",
            mass: 2,
            sleepThreshold: 0.01,
            solverIterations: 12,
            velocity: [0, -1, 0],
          },
        },
        {
          Collider: { kind: "capsule", height: 2, radius: 0.4 },
          RigidBody: { angularVelocity: [0, 0, 0], inverseMass: 0, kind: "kinematic", solverIterations: 4, velocity: [1, 0, 0] },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept bounded dynamic mesh colliders when solver parity is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v10-dynamic-mesh-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      manifest: {
        name: "v10-bounded-dynamic-mesh",
        requiredCapabilities: {
          physics: ["ccd.swept-aabb", "collider.mesh", "collider.mesh.bounds", "rigid-body.dynamic"],
        },
      },
    });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([{ Collider: { kind: "mesh", mesh: { bounds: { size: [2, 0.5, 4] }, source: "mesh.car", triangleCount: 128 } }, RigidBody: { ccd: { enabled: true, mode: "swept-aabb" }, kind: "dynamic", mass: 1 } }]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject unbounded v9 primitive solver metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v9-unbounded-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        {
          Collider: { friction: 11, kind: "box", size: [1, 1, 1] },
          RigidBody: { angularVelocity: [0, 10001, 0], inverseMass: 0.25, kind: "dynamic", mass: 2, sleepThreshold: 101, solverIterations: 65 },
        },
        {
          Collider: { kind: "box", size: [1, 1, 1] },
          RigidBody: { constraint: { kind: "hinge" }, kind: "dynamic", randomSeed: 1, velocity: [0, -10001, 0] },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_PHYSICS_COLLIDER_FRICTION_INVALID",
        "TN_IR_PHYSICS_BODY_ANGULAR_VELOCITY_INVALID",
        "TN_IR_PHYSICS_BODY_SLEEP_THRESHOLD_INVALID",
        "TN_IR_PHYSICS_BODY_SOLVER_ITERATIONS_INVALID",
        "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
        "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED",
        "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED",
        "TN_IR_PHYSICS_BODY_VELOCITY_INVALID",
      ],
    );
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "TN_IR_PHYSICS_BODY_SOLVER_ITERATIONS_INVALID")?.severity, "error");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject invalid primitive collider dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-invalid-dimensions-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        { Collider: { kind: "box", size: [1, 0, 1] }, RigidBody: { kind: "static" } },
        { Collider: { kind: "sphere", radius: -1 }, RigidBody: { kind: "static" } },
        { Collider: { kind: "capsule", height: null, radius: 0.5 }, RigidBody: { kind: "static" } },
        { Collider: { kind: "cylinder", height: 1, radius: 0.5 }, RigidBody: { kind: "static" } },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_PHYSICS_COLLIDER_SIZE_INVALID",
        "TN_IR_PHYSICS_COLLIDER_RADIUS_INVALID",
        "TN_IR_PHYSICS_COLLIDER_HEIGHT_INVALID",
        "TN_IR_PHYSICS_COLLIDER_UNSUPPORTED",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject capsule totals shorter than their diameter", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-capsule-total-height-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", physicsWorld([
      { Collider: { height: 1, kind: "capsule", radius: 0.6 }, RigidBody: { kind: "dynamic" } },
    ]));

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "TN_IR_PHYSICS_COLLIDER_HEIGHT_INVALID")?.path, "world.ir.json/entities/0/components/Collider/height");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject unknown body and collider fields and a missing Transform", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-closed-components-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    const world = physicsWorld([
      {
        Collider: { kind: "box", sensr: {}, size: [1, 1, 1] },
        RigidBody: { ccd: { enabled: true, maxSubstep: 2, mode: "linear" }, gravityscale: 1, kind: "dynamic" },
      },
    ]) as { entities: Array<{ components: Record<string, unknown> }> };
    delete world.entities[0]?.components.Transform;
    await writeJson(root, "world.ir.json", world);

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code.endsWith("FIELD_UNSUPPORTED") || diagnostic.code === "TN_IR_PHYSICS_TRANSFORM_MISSING")
        .map((diagnostic) => ({ code: diagnostic.code, path: diagnostic.path })),
      [
        { code: "TN_IR_PHYSICS_COLLIDER_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/Collider/sensr" },
        { code: "TN_IR_PHYSICS_BODY_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/RigidBody/gravityscale" },
        { code: "TN_IR_PHYSICS_CCD_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/RigidBody/ccd/maxSubstep" },
        { code: "TN_IR_PHYSICS_TRANSFORM_MISSING", path: "world.ir.json/entities/0/components/Transform" },
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should accept portable v7 collider filters and box slopes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v7-filters-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        {
          Collider: { kind: "box", layer: "player", mask: ["world", "sensor"], size: [1, 1, 1], slope: { axis: "x", direction: 1, rise: 1, run: 2 } },
          RigidBody: { kind: "kinematic" },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should accept primitive contact filters", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-contact-filters-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        {
          Collider: {
            contact: { phases: ["begin", "stay", "end"] },
            kind: "box",
            layer: "player",
            mask: ["world", "pushable"],
            material: "boots",
            size: [1, 1, 1],
          },
          RigidBody: { kind: "kinematic" },
        },
        {
          Collider: { contact: { phases: ["begin"] }, kind: "sphere", layer: "pushable", mask: ["player"], material: "crate", radius: 0.5 },
          RigidBody: { kind: "dynamic", mass: 1 },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject backend contact callbacks", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-contact-callbacks-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        {
          Collider: {
            contact: { callback: "onHit", phases: ["impact"] },
            contactCallback: "onContact",
            kind: "box",
            layer: "player",
            maskBits: 255,
            size: [1, 1, 1],
          },
          RigidBody: { kind: "kinematic" },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => ({ code: diagnostic.code, path: diagnostic.path })),
      [
        { code: "TN_IR_PHYSICS_CONTACT_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/Collider/contactCallback" },
        { code: "TN_IR_PHYSICS_CONTACT_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/Collider/maskBits" },
        { code: "TN_IR_PHYSICS_CONTACT_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/Collider/contact/callback" },
        { code: "TN_IR_PHYSICS_CONTACT_PHASES_INVALID", path: "world.ir.json/entities/0/components/Collider/contact/phases" },
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject invalid body fields and backend-specific collider options", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-invalid-body-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        {
          Collider: { kind: "mesh", trigger: true },
          RigidBody: { kind: "static", mass: 0, velocity: [0, null, 0] },
        },
        {
          Collider: { bevyColliderHandle: 7, kind: "box", layer: "", mask: ["world", ""], size: [1, 1, 1] },
          RigidBody: { damping: -1, gravityScale: null, kind: "dynamic", rapierBodyHandle: 2 },
        },
        {
          Collider: { friction: -1, kind: "box", restitution: 2, size: [1, 1, 1] },
          RigidBody: { kind: "static" },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_PHYSICS_MESH_TRIGGER_UNSUPPORTED",
        "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
        "TN_IR_PHYSICS_BODY_MASS_INVALID",
        "TN_IR_PHYSICS_BODY_VELOCITY_INVALID",
        "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED",
        "TN_IR_PHYSICS_FILTER_INVALID",
        "TN_IR_PHYSICS_FILTER_INVALID",
        "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED",
        "TN_IR_PHYSICS_BODY_DAMPING_INVALID",
        "TN_IR_PHYSICS_BODY_GRAVITY_SCALE_INVALID",
        "TN_IR_PHYSICS_COLLIDER_FRICTION_INVALID",
        "TN_IR_PHYSICS_COLLIDER_RESTITUTION_INVALID",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject invalid collider slope metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-invalid-slope-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        {
          Collider: { kind: "box", size: [1, 1, 1], slope: { axis: "y", direction: 1, rise: 1, run: 1 } },
          RigidBody: { kind: "static" },
        },
        {
          Collider: { kind: "sphere", radius: 1, slope: { axis: "x", direction: 1, rise: 1, run: 1 } },
          RigidBody: { kind: "static" },
        },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", "TN_IR_PHYSICS_COLLIDER_SLOPE_UNSUPPORTED"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should report malformed built-in physics components without throwing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-malformed-components-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", physicsWorld([{ Collider: 1, RigidBody: null }]));

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_PHYSICS_COLLIDER_INVALID", "TN_IR_PHYSICS_BODY_INVALID"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should accept primitive broad sensor metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v9-sensor-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        { Collider: { kind: "box", sensor: { interactionKind: "pickup", occupantLimit: 8, phases: ["enter", "stay", "exit"], trackOccupants: true }, size: [1, 1, 1] }, RigidBody: { kind: "static" } },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject mesh sensors and unbounded occupant histories", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v9-sensor-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(
      root,
      "world.ir.json",
      physicsWorld([
        { Collider: { kind: "mesh", sensor: { occupantLimit: 129 } }, RigidBody: { kind: "static" } },
      ]),
    );

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_PHYSICS_SENSOR_MESH_UNSUPPORTED", "TN_IR_PHYSICS_SENSOR_OCCUPANT_LIMIT_INVALID", "TN_IR_PHYSICS_MESH_COLLIDER_INVALID"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject backend navigation handles and malformed dynamic rebakes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-navigation-v9-invalid-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [],
        resources: {
          Navigation: {
            agentRadius: 0.5,
            backendNavmeshHandle: "native",
            dynamicRebake: true,
            regions: [],
          },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_NAVIGATION_BACKEND_UNSUPPORTED", "TN_IR_NAVIGATION_REGIONS_INVALID", "TN_IR_NAVIGATION_DYNAMIC_REBAKE_INVALID"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject duplicate compound child ids, raw handles, and dynamic triangle children", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-compound-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", physicsWorld([{
      CompoundCollider: {
        children: [
          { id: "front", localPose: { position: [0, 0, 0] }, solverHandle: 42, shape: { kind: "box", size: [1, 1, 1] } },
          { id: "front", localPose: { position: [1, 0, 0] }, shape: { kind: "triangleMesh", source: "mesh.raw" } },
        ],
      },
      RigidBody: { kind: "dynamic" },
    }]));

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.code.startsWith("TN_IR_PHYSICS_COMPOUND")).map(({ code, path }) => ({ code, path })), [
      { code: "TN_IR_PHYSICS_COMPOUND_CHILD_FIELD_UNSUPPORTED", path: "world.ir.json/entities/0/components/CompoundCollider/children/0/solverHandle" },
      { code: "TN_IR_PHYSICS_COMPOUND_CHILD_ID_DUPLICATE", path: "world.ir.json/entities/0/components/CompoundCollider/children/1/id" },
      { code: "TN_IR_PHYSICS_COMPOUND_DYNAMIC_TRIANGLE_UNSUPPORTED", path: "world.ir.json/entities/0/components/CompoundCollider/children/1/shape/kind" },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject duplicate and coplanar compound convex hull points before bundle emission", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-compound-degenerate-hull-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", physicsWorld([
      {
        CompoundCollider: {
          children: [{ id: "duplicate", localPose: { position: [0, 0, 0] }, shape: { kind: "convexHull", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0]] } }],
        },
        RigidBody: { kind: "dynamic" },
      },
      {
        CompoundCollider: {
          children: [{ id: "coplanar", localPose: { position: [0, 0, 0] }, shape: { kind: "convexHull", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] } }],
        },
        RigidBody: { kind: "dynamic" },
      },
    ]));

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_PHYSICS_COMPOUND_CONVEX_HULL_DEGENERATE").map(({ message, path }) => ({ message, path })), [
      { message: "Compound convexHull points must be unique.", path: "world.ir.json/entities/0/components/CompoundCollider/children/0/shape/points" },
      { message: "Compound convexHull points must span a non-zero three-dimensional volume.", path: "world.ir.json/entities/1/components/CompoundCollider/children/0/shape/points" },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept bounded wheel, tire, and surface contracts with resolved references", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-wheel-valid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", physicsWorld([
      { TireModel: { lateralSlipCurve: [{ slip: -1, grip: 0.7 }, { slip: 0, grip: 1 }, { slip: 1, grip: 0.7 }], loadSensitivity: 0.9, longitudinalSlipCurve: [{ slip: -1, grip: 0.6 }, { slip: 0, grip: 1 }, { slip: 1, grip: 0.6 }], rollingResistance: 0.02 } },
      { WheelAssembly: { maxSteeringAngle: 0.6, maxSuspensionForce: 20_000, maxTireForce: 12_000, wheels: [{ attachment: [-0.8, -0.3, 1.2], braked: true, driven: true, id: "front-left", radius: 0.35, steering: true, suspension: { damperRate: 2400, springRate: 30_000, travel: 0.25 }, tire: "entity-0", visual: "entity-2", width: 0.24 }] } },
      {},
      { PhysicsSurface: { combineRule: "multiply", grip: 0.65, rollingResistance: 0.04 } },
    ]));

    const result = await validateBundle(root);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid wheel geometry and non-monotonic tire curves at exact paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-wheel-invalid-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", physicsWorld([
      { TireModel: { lateralSlipCurve: [{ slip: 0, grip: 1 }, { slip: 0, grip: 0.8 }], loadSensitivity: 1, longitudinalSlipCurve: [{ slip: -1, grip: 0.5 }, { slip: 1, grip: 0.5 }], rollingResistance: 0.02 } },
      { WheelAssembly: { maxSteeringAngle: 0.6, maxSuspensionForce: 20_000, maxTireForce: 12_000, wheels: [{ attachment: [0, 0, 0], braked: true, driven: true, id: "front-left", radius: 0, steering: true, suspension: { damperRate: 2, springRate: 3, travel: 0.2 }, tire: "entity-0", width: 0.2 }] } },
    ]));

    const result = await validateBundle(root);
    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.filter((item) => item.code === "TN_IR_PHYSICS_TIRE_SLIP_CURVE_NON_MONOTONIC" || item.code === "TN_IR_PHYSICS_WHEEL_GEOMETRY_INVALID").map(({ code, path, suggestion }) => ({ code, path, suggestion })), [
      { code: "TN_IR_PHYSICS_TIRE_SLIP_CURVE_NON_MONOTONIC", path: "world.ir.json/entities/0/components/TireModel/lateralSlipCurve/1/slip", suggestion: "Sort points by slip and remove duplicate slip coordinates; grip may rise or fall." },
      { code: "TN_IR_PHYSICS_WHEEL_GEOMETRY_INVALID", path: "world.ir.json/entities/1/components/WheelAssembly/wheels/0/radius", suggestion: "Author positive real-world wheel radius and width values inside the portable bounds." },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid and out-of-order vehicle gear ratios at the exact transmission path", () => {
  const wheelAssembly = { wheels: [{ driven: true, id: "rear-left" }] };
  const base = {
    brakes: { frontBias: 0.6, handbrakeWheelIds: ["rear-left"] },
    differential: { kind: "open" },
    engine: { engineBraking: 0.1, idleRpm: 900, redlineRpm: 6500, torqueCurve: [{ rpm: 900, torque: 100 }, { rpm: 6500, torque: 80 }] },
    steering: { speedCurve: [{ speed: 0, scale: 1 }, { speed: 40, scale: 0.3 }] },
    transmission: { clutchResponse: 0.2, finalDrive: 3.7, forwardRatios: [3.1, 1.9], reverseRatio: 3, shiftPolicy: "manual" },
  };
  for (const [forwardRatios, code] of [
    [[3.1, 0], "TN_IR_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID"],
    [[1.9, 3.1], "TN_IR_PHYSICS_VEHICLE_GEAR_RATIOS_ORDER_INVALID"],
  ] as const) {
    const diagnostics: IIrDiagnostic[] = [];
    validateVehicleController({ ...base, transmission: { ...base.transmission, forwardRatios } }, "/entities/0/components/VehicleController", wheelAssembly, diagnostics);
    assert.ok(diagnostics.some((item) => item.code === code && item.path === "/entities/0/components/VehicleController/transmission/forwardRatios"), JSON.stringify(diagnostics));
  }
});

test("should validate bounded aerodynamic bodies and wind volumes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-aerodynamics-"));
  try {
    await writeTestBundle(root, { world: physicsWorld([
      { Collider: { kind: "box", size: [2, 1, 4] }, RigidBody: { kind: "dynamic" }, AerodynamicBody: { dragArea: [1, 1, 2], maxForce: 100_000, surfaces: [{ area: 4, aspectRatio: 6, centerOfPressure: [0, 0, -1], dragCurve: [{ angle: -1, coefficient: 0.5 }, { angle: 1, coefficient: 0.5 }], id: "wing", liftCurve: [{ angle: -1, coefficient: -1 }, { angle: 1, coefficient: 1 }], recoveryAngle: 0.25, stallAngle: 0.35 }] } },
      { WindVolume: { shape: "sphere", radius: 10, velocity: [2, 0, 0], gust: { amplitude: [1, 0, 0], frequency: 0.5, seed: 7 } } },
    ]) as never });
    assert.equal((await validateBundle(root)).ok, true);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should reject invalid aerodynamic stall hysteresis and non-dynamic ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-aerodynamics-invalid-"));
  try {
    await writeTestBundle(root, { world: physicsWorld([{ Collider: { kind: "box", size: [2, 1, 4] }, RigidBody: { kind: "static" }, AerodynamicBody: { dragArea: [1, 1, 2], maxForce: 100_000, surfaces: [{ area: 4, aspectRatio: 6, centerOfPressure: [0, 0, -1], dragCurve: [{ angle: 0, coefficient: 0.5 }, { angle: 0, coefficient: 0.6 }], id: "wing", liftCurve: [{ angle: -1, coefficient: -1 }, { angle: 1, coefficient: 1 }], recoveryAngle: 0.4, stallAngle: 0.35 }] } }]) as never });
    const result = await validateBundle(root);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_BODY_DYNAMIC_REQUIRED"));
    assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_STALL_INVALID"));
    assert.ok(result.diagnostics.some((item) => item.code === "TN_IR_PHYSICS_AERODYNAMIC_CURVE_NON_MONOTONIC"));
  } finally { await rm(root, { force: true, recursive: true }); }
});

function physicsWorld(components: Array<Record<string, unknown>>): unknown {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: components.map((entityComponents, index) => ({
      id: `entity-${index}`,
      components: {
        Transform: { position: [index * 2, 0, 0] },
        ...entityComponents,
      },
    })),
  };
}

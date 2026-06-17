import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("physics should reject unsupported dynamic mesh collider", async () => {
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
      ["TN_IR_PHYSICS_DYNAMIC_MESH_UNSUPPORTED", "TN_IR_PHYSICS_DYNAMIC_MESH_UNSUPPORTED"],
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
          Collider: { friction: 0.6, kind: "box", restitution: 0.25, size: [1, 1, 1] },
          RigidBody: {
            angularVelocity: [0, 0.5, 0],
            damping: 0.05,
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

test("should reject dynamic mesh colliders when solver parity is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-v9-dynamic-mesh-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      manifest: {
        name: "v9-rejected-dynamic-mesh",
        requiredCapabilities: {
          physics: ["collider.mesh", "primitive-solver-v2", "rigid-body.dynamic"],
        },
      },
    });
    await writeJson(root, "world.ir.json", physicsWorld([{ Collider: { kind: "mesh" }, RigidBody: { kind: "dynamic", mass: 1 } }]));

    const result = await validateBundle(root);
    const diagnostic = result.diagnostics.find((item) => item.code === "TN_IR_PHYSICS_DYNAMIC_MESH_UNSUPPORTED");

    assert.equal(result.ok, false);
    assert.equal(diagnostic?.path, "world.ir.json/entities/0/components/Collider/kind");
    assert.equal(diagnostic?.suggestion, "Use a static mesh collider or a primitive collider for dynamic or kinematic bodies.");
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
      ["TN_IR_PHYSICS_SENSOR_MESH_UNSUPPORTED", "TN_IR_PHYSICS_SENSOR_OCCUPANT_LIMIT_INVALID"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics should reject backend navigation handles and dynamic rebakes", async () => {
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
      ["TN_IR_NAVIGATION_BACKEND_UNSUPPORTED", "TN_IR_NAVIGATION_BACKEND_UNSUPPORTED", "TN_IR_NAVIGATION_REGIONS_INVALID"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
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

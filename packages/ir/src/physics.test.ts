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

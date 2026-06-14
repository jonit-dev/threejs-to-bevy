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
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "enemy",
          components: {
            Collider: { kind: "mesh" },
            RigidBody: { kind: "dynamic" },
            Transform: { position: [0, 0, 0] },
          },
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_PHYSICS_DYNAMIC_MESH_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

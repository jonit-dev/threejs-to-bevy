import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeTestBundle } from "./testFixtures.js";

test("should reject raw physics backend handle declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-physics-backend-handle-"));
  try {
    await writeTestBundle(root, {
      createAssetsDir: true,
      world: {
        schema: "threenative.world",
        version: "0.1.0",
        entities: [
          {
            components: {
              Collider: { kind: "box", nativeHandle: "rapier-collider", size: [1, 1, 1] },
              RigidBody: { kind: "dynamic", runtimeHandle: "rapier-body" },
            } as any,
            id: "player",
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED").map((diagnostic) => diagnostic.path),
      [
        "world.ir.json/entities/0/components/Collider",
        "world.ir.json/entities/0/components/RigidBody",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

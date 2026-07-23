import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeJson, writeTestBundle } from "./testFixtures.js";
import { validateBundle } from "./validate.js";

test("bundle validation should follow and validate referenced fracture manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-fracture-bundle-validation-"));
  try {
    await writeTestBundle(root, { createAssetsDir: true });
    await writeJson(root, "world.ir.json", {
      entities: [{
        components: {
          Collider: { kind: "box", size: [1, 1, 1] },
          Destructible: { fractureManifest: "fractures/wall.json" },
          RigidBody: { kind: "dynamic" },
          Transform: { position: [0, 0, 0] },
        },
        id: "wall",
      }],
      schema: "threenative.world",
      version: "0.1.0",
    });
    await writeJson(root, "fractures/wall.json", {
      bonds: [],
      budgets: { maxActivePieces: 1, maxDepth: 0, overflowPolicy: "reject-new" },
      id: "wall",
      pieces: [],
      schema: "threenative.fracture-manifest",
      source: { kind: "primitive", seed: 0, sourceHash: `sha256:${"a".repeat(64)}` },
      version: "0.1.0",
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_FRACTURE_PIECE_BUDGET" && diagnostic.path === "fractures/wall.json/pieces"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

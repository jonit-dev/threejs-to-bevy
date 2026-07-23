import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatch } from "./index.js";

test("physics CLI dispatches descriptor-backed destructible operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-destructible-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(
      join(root, "content/scenes/arena.scene.json"),
      `${JSON.stringify({
        entities: [{ components: { Transform: {} }, id: "wall" }],
        id: "arena",
        schema: "threenative.scene",
        version: "0.1.0",
      }, null, 2)}\n`,
    );
    const destructible = {
      activationBudget: 4,
      cleanupPolicy: "sleep",
      fractureManifest: "fractures/wall.json",
      maxDepth: 2,
    };

    const add = await dispatch([
      "physics", "destructible", "add", "arena", "wall",
      "--destructible", JSON.stringify(destructible),
      "--project", root, "--json",
    ]);
    const inspect = await dispatch([
      "physics", "destructible", "inspect", "arena", "wall",
      "--project", root, "--json",
    ]);

    assert.equal(add.exitCode, 0, add.stdout);
    assert.equal(inspect.exitCode, 0, inspect.stdout);
    assert.deepEqual(JSON.parse(inspect.stdout).destructible, destructible);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createScene } from "./operations.js";

test("should preserve scene operation output after module split", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-operations-"));
  try {
    const result = await createScene({ file: "content/scenes/arena.scene.json", projectPath: root, sceneId: "scene.arena" });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as Record<string, unknown>;

    assert.deepEqual(result, {
      ok: true,
      changed: true,
      diagnostics: [],
      projectPath: root,
      filesWritten: ["content/scenes/arena.scene.json"],
      file: "content/scenes/arena.scene.json",
      nextCommands: [
        "tn scene add-entity scene.arena <entity-id> --json",
        "tn scene set-transform scene.arena <entity-id> --position x,y,z --json",
        "tn scene attach-script scene.arena <system-id> --module src/scripts/<system>.ts --export <exportName> --json",
        "tn scene validate scene.arena --json",
        "tn build --json",
        "tn verify --json",
      ],
      sceneId: "scene.arena",
    });
    assert.deepEqual(scene, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.arena",
      entities: [],
      prefabs: [],
      resources: [],
      systems: [],
      ui: { bindings: [], nodes: [] },
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generatorCommand } from "./sourceDocuments.js";

test("generator run executes project-local TypeScript generator through authoring facade", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-generator-run-"));
  try {
    await mkdir(join(root, "src", "generators"), { recursive: true });
    await writeFile(
      join(root, "src", "generators", "arena.ts"),
      `export async function generateArena({ project }) {
  return project.transaction()
    .operation("scene.create", { sceneId: "arena" })
    .operation("scene.add_prefab", { sceneId: "arena", prefabId: "player.prefab", primitive: "box", color: "#3b82f6" })
    .operation("scene.add_entity", { sceneId: "arena", entityId: "player", prefabId: "player.prefab" })
    .operation("scene.set_transform", { sceneId: "arena", entityId: "player", position: [1, 2, 3] })
    .commit();
}
`,
      "utf8",
    );
    const record = await generatorCommand([
      "record",
      "arena.layout",
      "--module",
      "src/generators/arena.ts",
      "--export",
      "generateArena",
      "--outputs",
      "content/scenes/arena.scene.json",
      "--overwrite-policy",
      "manual",
      "--project",
      root,
      "--json",
    ]);
    const run = await generatorCommand(["run", "arena.layout", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
      prefabs: Array<{ id: string; primitive?: string }>;
    };
    const provenance = JSON.parse(await readFile(join(root, "content", "generators", "arena.layout.generator.json"), "utf8")) as {
      inputHash?: string;
      lastRun?: { filesWritten?: string[]; operations?: Array<{ name: string }> };
      outputHash?: string;
    };
    const payload = JSON.parse(run.stdout) as {
      inputHash?: string;
      operations: Array<{ name: string }>;
      outputHash?: string;
    };

    assert.equal(record.exitCode, 0);
    assert.equal(run.exitCode, 0);
    assert.deepEqual(scene.prefabs, [{ color: "#3b82f6", id: "player.prefab", primitive: "box" }]);
    assert.deepEqual(scene.entities[0], { id: "player", prefab: "player.prefab", transform: { position: [1, 2, 3] } });
    assert.deepEqual(payload.operations.map((operation) => operation.name), ["scene.create", "scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
    assert.match(payload.inputHash ?? "", /^sha256:/);
    assert.match(payload.outputHash ?? "", /^sha256:/);
    assert.equal(provenance.inputHash, payload.inputHash);
    assert.equal(provenance.outputHash, payload.outputHash);
    assert.deepEqual(provenance.lastRun?.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(provenance.lastRun?.operations?.map((operation) => operation.name), ["scene.create", "scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects manual output conflicts before executing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-generator-conflict-"));
  try {
    await mkdir(join(root, "src", "generators"), { recursive: true });
    await writeFile(
      join(root, "src", "generators", "arena.ts"),
      `export async function generateArena({ project }) {
  return project.transaction()
    .operation("scene.create", { sceneId: "arena" })
    .commit();
}
`,
      "utf8",
    );
    await generatorCommand([
      "record",
      "arena.layout",
      "--module",
      "src/generators/arena.ts",
      "--export",
      "generateArena",
      "--outputs",
      "content/scenes/arena.scene.json",
      "--overwrite-policy",
      "manual",
      "--project",
      root,
      "--json",
    ]);
    const firstRun = await generatorCommand(["run", "arena.layout", "--project", root, "--json"]);
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), "{\"manual\":true}\n", "utf8");
    const conflict = await generatorCommand(["run", "arena.layout", "--project", root, "--json"]);
    const payload = JSON.parse(conflict.stdout) as { diagnostics: Array<{ code: string }> };

    assert.equal(firstRun.exitCode, 0);
    assert.equal(conflict.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_GENERATOR_OUTPUT_CONFLICT");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

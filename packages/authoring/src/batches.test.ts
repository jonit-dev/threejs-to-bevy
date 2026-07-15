import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
  planAuthoringBatch,
  type IAuthoringBatchDocument,
  type IAuthoringBatchOperation,
} from "./batches.js";
import {
  AUTHORING_OPERATION_REGISTRY,
  type AuthoringOperationName,
  type IAuthoringOperationDescriptor,
} from "./operationRegistry.js";

test("later operation failure leaves every source file byte-identical", async () => {
  const root = await createProject("atomic-failure");
  try {
    const file = join(root, "content/scenes/arena.scene.json");
    const before = await readFile(file);
    const result = await applyAuthoringBatch({
      batch: batch([
        { name: "scene.add_prefab", args: { sceneId: "arena", prefabId: "prefab.player", primitive: "box" } },
        { name: "scene.add_entity", args: { sceneId: "arena" } },
      ]),
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.changed, true);
    assert.equal(result.committed, false);
    assert.deepEqual(result.filesWritten, []);
    assert.deepEqual(await readFile(file), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("multi-file archetype staging including scripts is discarded after a later failure", async () => {
  const root = await createProject("atomic-archetype-failure");
  try {
    const sceneFile = join(root, "content/scenes/arena.scene.json");
    const before = await readFile(sceneFile);
    const result = await applyAuthoringBatch({
      batch: batch([
        { name: "archetype.apply", args: { actorId: "hero", archetype: "character", sceneId: "arena" } },
        { name: "scene.add_entity", args: { sceneId: "arena" } },
      ]),
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.changed, true);
    assert.equal(result.committed, false);
    assert.deepEqual(await readFile(sceneFile), before);
    for (const path of [
      "content/input/hero.input.json",
      "content/schemas/hero.character.schema.json",
      "content/systems/hero.systems.json",
      "src/scripts/hero.behavior.ts",
    ]) {
      await assert.rejects(readFile(join(root, path)), { code: "ENOENT" });
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("semantic validation failure publishes no staged source", async () => {
  const root = await createProject("semantic-failure");
  try {
    const file = join(root, "content/scenes/arena.scene.json");
    const before = await readFile(file);
    const result = await applyAuthoringBatch({
      batch: batch([
        { name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } },
        { name: "scene.attach_script", args: { sceneId: "arena", systemId: "missing-script", modulePath: "src/scripts/missing.ts", exportName: "missingSystem" } },
      ]),
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.committed, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_SCRIPT_MODULE_MISSING"), true);
    assert.deepEqual(await readFile(file), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("batch resolves ids created by an earlier operation", async () => {
  const root = await createProject("cross-operation");
  try {
    const result = await applyAuthoringBatch({
      batch: batch([
        { name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } },
        { name: "scene.set_transform", args: { sceneId: "arena", entityId: "player", position: [1, 2, 3] } },
      ]),
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.equal(result.operationResults.length, 2);
    assert.equal(result.operationResults.every((operation) => operation.result.projectPath === root), true);
    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
    };
    assert.deepEqual(scene.entities[0], { id: "player", transform: { position: [1, 2, 3] } });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("descriptor resolves an entry inside a grouped material document", async () => {
  const root = await createProject("grouped-material-target");
  try {
    const file = join(root, "content/materials/catalog.materials.json");
    await mkdir(join(root, "content/materials"), { recursive: true });
    await writeFile(file, `${JSON.stringify({
      schema: "threenative.materials",
      version: "0.1.0",
      id: "catalog",
      materials: [{ id: "mat.player", color: "#ffffff" }],
    }, null, 2)}\n`);
    const result = await applyAuthoringBatch({
      batch: batch([{ name: "material.set", args: { color: "#224466", materialId: "mat.player" } }]),
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.filesModified, ["content/materials/catalog.materials.json"]);
    const document = JSON.parse(await readFile(file, "utf8")) as { materials: Array<{ color: string }> };
    assert.equal(document.materials[0]?.color, "#224466");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("undeclared operation target fails closed", async () => {
  const root = await createProject("undeclared-target");
  const registry = AUTHORING_OPERATION_REGISTRY as Map<AuthoringOperationName, IAuthoringOperationDescriptor>;
  const original = registry.get("scene.add_entity")!;
  registry.set("scene.add_entity", { ...original, targetResolver: async () => [] });
  try {
    const file = join(root, "content/scenes/arena.scene.json");
    const before = await readFile(file);
    const result = await applyAuthoringBatch({
      batch: batch([{ name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } }]),
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.committed, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_BATCH_UNDECLARED_WRITE"), true);
    assert.deepEqual(await readFile(file), before);
  } finally {
    registry.set("scene.add_entity", original);
    await rm(root, { force: true, recursive: true });
  }
});

test("changed source after plan returns a batch conflict without publishing", async () => {
  const root = await createProject("planned-conflict");
  try {
    const operations: IAuthoringBatchOperation[] = [{ name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } }];
    const planned = await planAuthoringBatch({ batch: batch(operations), projectPath: root });
    const file = join(root, "content/scenes/arena.scene.json");
    const manual = Buffer.from((await readFile(file, "utf8")).replace('"entities": []', '"entities": [],\n  "manual": true'));
    await writeFile(file, manual);

    const result = await applyAuthoringBatch({
      batch: { ...batch(operations), preconditions: { planHash: planned.planHash } },
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.committed, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_BATCH_CONFLICT"), true);
    assert.deepEqual(await readFile(file), manual);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("non-owner cannot overwrite generator output", async () => {
  const root = await createProject("generator-owned-output");
  try {
    const output = join(root, "content/scenes/arena.scene.json");
    const provenance = join(root, "content/generators/arena.layout.generator.json");
    await writeGeneratorProvenance(root, "sha256:recorded-output");
    const outputBefore = await readFile(output);
    const provenanceBefore = await readFile(provenance);

    const result = await applyAuthoringBatch({
      batch: batch([{ name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } }]),
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.committed, false);
    assert.deepEqual(result.filesWritten, []);
    const diagnostic = result.diagnostics.find((entry) => entry.code === "TN_AUTHORING_GENERATED_OUTPUT_OWNED");
    assert.ok(diagnostic);
    assert.equal(diagnostic.file, "content/scenes/arena.scene.json");
    assert.match(diagnostic.message, /arena\.layout/);
    assert.match(diagnostic.suggestion ?? "", /src\/generators\/arena\.ts/);
    assert.match(diagnostic.suggestion ?? "", /tn generator run arena\.layout/);
    assert.deepEqual(await readFile(output), outputBefore);
    assert.deepEqual(await readFile(provenance), provenanceBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("owning generator may publish declared output", async () => {
  const root = await createProject("generator-owner-publish");
  try {
    const output = join(root, "content/scenes/arena.scene.json");
    const provenance = join(root, "content/generators/arena.layout.generator.json");
    await writeGeneratorProvenance(root, "sha256:recorded-output");
    const provenanceBefore = JSON.parse(await readFile(provenance, "utf8")) as { outputHash: string };

    const result = await applyAuthoringBatch({
      batch: batch([{ name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } }]),
      owner: { generatorId: "arena.layout", kind: "generator" },
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.deepEqual(result.filesModified, [
      "content/generators/arena.layout.generator.json",
      "content/scenes/arena.scene.json",
    ]);
    const scene = JSON.parse(await readFile(output, "utf8")) as { entities: Array<{ id: string }> };
    assert.deepEqual(scene.entities, [{ id: "player" }]);
    const provenanceAfter = JSON.parse(await readFile(provenance, "utf8")) as { outputHash: string };
    assert.notEqual(provenanceAfter.outputHash, provenanceBefore.outputHash);
    assert.match(provenanceAfter.outputHash, /^sha256:[a-f0-9]{64}$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("two-file batch does not stage an unrelated large source document", async () => {
  const root = await createProject("bounded-targets");
  try {
    const unrelatedPath = join(root, "content/scenes/unrelated.scene.json");
    await writeFile(unrelatedPath, `${JSON.stringify({
      schema: "threenative.scene",
      version: "0.1.0",
      id: "unrelated",
      entities: [],
      prefabs: [],
      resources: [],
      systems: [],
      ui: { nodes: [], bindings: [] },
      note: "x".repeat(2 * 1024 * 1024),
    })}\n`);
    const unrelatedBefore = await readFile(unrelatedPath);
    const result = await applyAuthoringBatch({
      batch: batch([
        { name: "scene.add_entity", args: { file: "content/scenes/arena.scene.json", sceneId: "arena", entityId: "player" } },
        { name: "input.add_action", args: { file: "content/input/gameplay.input.json", inputDocId: "gameplay", actionId: "jump", keys: ["keyboard.Space"] } },
      ]),
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.filesRead, ["content/scenes/arena.scene.json"]);
    assert.equal(result.filesRead.includes("content/scenes/unrelated.scene.json"), false);
    assert.equal(result.filesStaged.includes("content/scenes/unrelated.scene.json"), false);
    assert.ok(result.copiedBytes < unrelatedBefore.byteLength);
    assert.deepEqual(await readFile(unrelatedPath), unrelatedBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function batch(operations: IAuthoringBatchOperation[]): IAuthoringBatchDocument {
  return { id: "phase-1-regression", operations, schema: AUTHORING_BATCH_SCHEMA, version: AUTHORING_BATCH_VERSION };
}

async function createProject(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `tn-authoring-batch-${label}-`));
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
    schema: "threenative.scene",
    version: "0.1.0",
    id: "arena",
    entities: [],
    prefabs: [],
  }, null, 2)}\n`);
  return root;
}

async function writeGeneratorProvenance(root: string, outputHash: string): Promise<void> {
  await mkdir(join(root, "content/generators"), { recursive: true });
  await writeFile(join(root, "content/generators/arena.layout.generator.json"), `${JSON.stringify({
    schema: "threenative.generator-provenance",
    version: "0.1.0",
    id: "arena.layout",
    module: "src/generators/arena.ts",
    export: "generateArena",
    outputs: ["content/scenes/arena.scene.json"],
    overwritePolicy: "replace",
    outputHash,
  }, null, 2)}\n`);
}

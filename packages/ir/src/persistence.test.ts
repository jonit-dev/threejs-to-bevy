import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeJson, writeTestBundle } from "./testFixtures.js";
import { validateBundle } from "./validate.js";

test("local data should accept save slots settings migrations and autosave", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-local-data-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { localData: "local-data.ir.json" }, files: { localData: "local-data.ir.json" } } });
    await writeJson(root, "local-data.ir.json", {
      schema: "threenative.local-data",
      version: "0.1.0",
      autosave: { checkpointEvents: ["CheckpointReached"], debounceMs: 250, intervalSeconds: 30 },
      components: [{ id: "Inventory", schema: { fields: { items: { kind: "string" } } } }],
      migration: { currentVersion: 2, migrators: [1] },
      resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 2 }],
      settings: [{ defaultValue: 0.8, group: "audio", key: "audio.master", kind: "number", max: 1, min: 0 }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject runtime handles in local data schemas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-local-data-handle-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { localData: "local-data.ir.json" } } });
    await writeJson(root, "local-data.ir.json", {
      schema: "threenative.local-data",
      version: "0.1.0",
      components: [{ id: "Inventory", schema: { fields: { renderer: { runtimeHandle: "mesh" } } } }],
      resources: [],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
      settings: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_LOCAL_DATA_RUNTIME_HANDLE_UNSUPPORTED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("local data should reject missing migration metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-local-data-migration-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { localData: "local-data.ir.json" } } });
    await writeJson(root, "local-data.ir.json", {
      schema: "threenative.local-data",
      version: "0.1.0",
      components: [],
      migration: { currentVersion: 3, migrators: [1] },
      resources: [],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 3 }],
      settings: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_LOCAL_DATA_MIGRATOR_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("local data 0.2.0 should accept declarative migration transforms", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-local-data-transform-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { localData: "local-data.ir.json" } } });
    await writeJson(root, "local-data.ir.json", {
      schema: "threenative.local-data",
      version: "0.2.0",
      components: [],
      migration: {
        currentVersion: 2,
        migrators: [1],
        transforms: [{ fromVersion: 1, operations: [{ from: "OldProgress", kind: "renameResource", to: "Progress" }] }],
      },
      resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 2 }],
      settings: [],
    });

    assert.equal((await validateBundle(root)).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("local data 0.1.0 should reject executable migration transforms", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-local-data-transform-version-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { localData: "local-data.ir.json" } } });
    await writeJson(root, "local-data.ir.json", {
      schema: "threenative.local-data",
      version: "0.1.0",
      components: [],
      migration: {
        currentVersion: 2,
        migrators: [1],
        transforms: [{ fromVersion: 1, operations: [{ from: "OldProgress", kind: "deleteResource" }] }],
      },
      resources: [],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 2 }],
      settings: [],
    });

    const result = await validateBundle(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_LOCAL_DATA_MIGRATION_TRANSFORMS_VERSION_UNSUPPORTED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "@threenative/ir";
import { World, definePersistence, persistComponent, persistResource, persistSetting, saveSlot } from "@threenative/sdk";

import { emitPersistence } from "./persistence.js";
import { emitBundle } from "./bundle.js";

test("should emit local data IR when resources and components are persisted", async () => {
  const declaration = definePersistence({
    components: [persistComponent("Inventory", { fields: { items: { kind: "string" } } })],
    resources: [persistResource("Progress", { fields: { level: { kind: "integer" } } })],
    saveSlots: [saveSlot("slot.main", { appVersion: "1.0.0", schemaVersion: 1 })],
    settings: [persistSetting("audio.master", { defaultValue: 0.75, group: "audio", kind: "number", max: 1, min: 0 })],
  });

  assert.deepEqual(emitPersistence(declaration), {
    components: [{ id: "Inventory", schema: { fields: { items: { kind: "string" } } } }],
    resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.main", schemaVersion: 1 }],
    schema: "threenative.local-data",
    settings: [{ defaultValue: 0.75, group: "audio", key: "audio.master", kind: "number", max: 1, min: 0 }],
    version: "0.1.0",
  });

  const root = await mkdtemp(join(tmpdir(), "tn-persistence-bundle-"));
  try {
    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      { persistence: declaration, world: new World() },
    );

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const localData = JSON.parse(await readFile(join(bundlePath, "local-data.ir.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(manifest.entry.localData, "local-data.ir.json");
    assert.equal(manifest.files.localData, "local-data.ir.json");
    assert.equal(localData.resources[0].id, "Progress");
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

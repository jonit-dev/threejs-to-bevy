import assert from "node:assert/strict";
import test from "node:test";

import { autosave, definePersistence, persistenceMigration, persistComponent, persistResource, persistSetting, saveSlot } from "./persistence.js";

test("should capture save slots and settings when declarations are schema backed", () => {
  const persistence = definePersistence({
    autosave: autosave({ checkpointEvents: ["CheckpointReached"], debounceMs: 250, intervalSeconds: 30 }),
    components: [persistComponent("Inventory", { fields: { items: { kind: "string" } } })],
    migration: persistenceMigration({ currentVersion: 2, migrators: [1] }),
    resources: [persistResource("Progress", { fields: { level: { kind: "integer" } } })],
    saveSlots: [saveSlot("slot.main", { appVersion: "1.0.0", schemaVersion: 2 })],
    settings: [
      persistSetting("audio.master", { defaultValue: 0.8, group: "audio", kind: "number", max: 1, min: 0 }),
      persistSetting("controls.scheme", { defaultValue: "keyboard", enumValues: ["gamepad", "keyboard"], group: "controls", kind: "string" }),
    ],
  });

  assert.deepEqual(persistence.resources.map((resource) => resource.id), ["Progress"]);
  assert.deepEqual(persistence.components.map((component) => component.id), ["Inventory"]);
  assert.equal(persistence.saveSlots[0]?.schemaVersion, 2);
  assert.deepEqual(persistence.settings.map((setting) => [setting.key, setting.defaultValue]), [
    ["audio.master", 0.8],
    ["controls.scheme", "keyboard"],
  ]);
  assert.deepEqual(persistence.autosave?.checkpointEvents, ["CheckpointReached"]);
});

test("should reject runtime handles in persistence schemas", () => {
  assert.throws(() => persistResource("Progress", { fields: { renderer: { runtimeHandle: "mesh" } } }), {
    message: "Persisted resource 'Progress' schema must not include runtime handles.",
    name: "SdkError",
  });
});

import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadBundle } from "./loadBundle.js";
import { tracePersistenceReload } from "./persistenceReload.js";

test("should trace persistence restore and reload policy", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/persistence-reload/game.bundle"));
  assert.ok(bundle.localData);
  const report = tracePersistenceReload(bundle.localData, bundle.world);

  assert.equal(report.schema, "threenative.persistence-reload");
  assert.equal(report.persistence.restore.resourceValue, 3);
  assert.equal(report.persistence.autosave[0]?.event, "CheckpointReached");
  assert.equal(report.persistence.settings["audio.master"], 0.6);
  assert.deepEqual(report.reload.retained, ["Progress", "Inventory", "settings"]);
  assert.equal(report.diagnostics[0]?.code, "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE");
  assert.equal(report.boundaries.some((boundary) => boundary.code === "TN_PERSISTENCE_CLOUD_STORAGE_UNSUPPORTED"), true);
});

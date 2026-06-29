import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { classifyEditorProjectWatchPath } from "./projectWatch.js";

test("should ignore generated bundle paths and notify on content source edits", () => {
  const project = resolve("/tmp/tn-project");
  const source = classifyEditorProjectWatchPath(project, resolve(project, "content/scenes/arena.scene.json"));
  const generated = classifyEditorProjectWatchPath(project, resolve(project, "dist/structured-source-starter.bundle/world.ir.json"));
  const outside = classifyEditorProjectWatchPath(project, "/tmp/elsewhere/world.ir.json");

  assert.equal(source.shouldRefresh, true);
  assert.equal(source.path, "content/scenes/arena.scene.json");
  assert.equal(generated.shouldRefresh, false);
  assert.equal(generated.liveUpdate.kind, "unsupported");
  assert.equal(outside.shouldRefresh, false);
  assert.equal(outside.diagnostics[0]?.code, "TN_EDITOR_WATCH_PATH_REJECTED");
});

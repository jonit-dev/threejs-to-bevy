import assert from "node:assert/strict";
import test from "node:test";

import { validateEditorBootConfig } from "./bootConfig.js";

test("should validate editor boot config", () => {
  const result = validateEditorBootConfig({ cwd: "/repo", projectPath: "templates/structured-source-starter" });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.config?.projectPath, "/repo/templates/structured-source-starter");
});

test("should reject unsafe project paths", () => {
  const result = validateEditorBootConfig({ cwd: "/repo", projectPath: "dist/game.bundle" });

  assert.equal(result.config, undefined);
  assert.equal(result.diagnostics[0]?.code, "TN_EDITOR_BOOT_PROJECT_UNSAFE");
});

test("should validate bundle containment", () => {
  const result = validateEditorBootConfig({ bundlePath: "../outside/game.bundle", cwd: "/repo", projectPath: "game" });

  assert.equal(result.config, undefined);
  assert.equal(result.diagnostics[0]?.code, "TN_EDITOR_BOOT_BUNDLE_UNSAFE");
});

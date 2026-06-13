import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildCommand } from "./build.js";

test("build should emit structured scripts diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-build-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "threenative.config.json"),
      JSON.stringify({
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        schema: "threenative.project",
        version: "0.1.0",
      }),
    );
    await writeFile(
      join(root, "src/game.ts"),
      [
        "import { World, update } from '@threenative/sdk';",
        "export default new World().addSystem(update('badDom', {",
        "  run: () => document.querySelector('canvas')",
        "}));",
        "",
      ].join("\n"),
    );

    const result = await buildCommand(["--json"], root);
    const payload = JSON.parse(result.stderr ?? "{}") as { code: string; severity: string; suggestion: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_SCRIPT_DOM_API_UNSUPPORTED");
    assert.equal(payload.severity, "error");
    assert.match(payload.suggestion, /portable system context/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

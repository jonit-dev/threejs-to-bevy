import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateProject } from "./validate.js";

test("should validate a scaffolded project config and entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-validate-"));
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
    await writeFile(join(root, "src/game.ts"), "export default {};\n");

    const result = await validateProject(["--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; entry: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_VALIDATE_OK");
    assert.equal(payload.entry, "src/game.ts");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject a missing scaffold entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-validate-"));
  try {
    await writeFile(
      join(root, "threenative.config.json"),
      JSON.stringify({
        entry: "src/game.ts",
        schema: "threenative.project",
        version: "0.1.0",
      }),
    );

    const result = await validateProject(["--json"], { cwd: root });
    const payload = JSON.parse(result.stderr ?? "{}") as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_VALIDATE_ENTRY_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

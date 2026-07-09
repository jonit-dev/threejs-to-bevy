import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { typesCommand } from "./types.js";

test("should generate project script types from source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-types-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await mkdir(join(root, "content", "input"), { recursive: true });
    await writeFile(
      join(root, "content", "scenes", "arena.scene.json"),
      `${JSON.stringify({ schema: "threenative.scene", id: "arena", entities: [{ id: "hero" }], resources: [{ id: "GameState", value: { score: 0 } }] }, null, 2)}\n`,
    );
    await writeFile(
      join(root, "content", "input", "arena.input.json"),
      `${JSON.stringify({ schema: "threenative.input", id: "arena-input", axes: [{ id: "MoveX" }] }, null, 2)}\n`,
    );

    const result = await typesCommand(["generate", "--project", root, "--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; files: string[] };
    const generated = await readFile(join(root, ".threenative", "types", "project-context.d.ts"), "utf8");

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(payload.code, "TN_TYPES_GENERATED");
    assert.deepEqual(payload.files, [".threenative/types/project-context.d.ts"]);
    assert.match(generated, /export type ProjectEntityId = "hero";/);
    assert.match(generated, /export type ProjectInputId = "MoveX";/);
    assert.match(generated, /export interface ProjectContext extends ScriptContext/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

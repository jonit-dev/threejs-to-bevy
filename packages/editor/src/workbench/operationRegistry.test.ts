import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatch } from "@threenative/cli";

import { runEditorOperation } from "./operations.js";

test("should match CLI and editor operation result shape", async () => {
  const editorRoot = await createParityProject();
  const cliRoot = await createParityProject();
  try {
    const editor = await runEditorOperation({ args: { entityId: "player", position: [5, 0, 0], sceneId: "scene.arena" }, name: "scene.set_transform", projectPath: editorRoot });
    const cli = await dispatch(["scene", "set-transform", "scene.arena", "player", "--position", "5,0,0", "--project", cliRoot, "--json"]);
    const editorScene = JSON.parse(await readFile(join(editorRoot, "content", "scenes", "arena.scene.json"), "utf8"));
    const cliScene = JSON.parse(await readFile(join(cliRoot, "content", "scenes", "arena.scene.json"), "utf8"));

    assert.equal(editor.ok, true);
    assert.equal(JSON.parse(cli.stdout).ok, true);
    assert.deepEqual(editor.filesWritten, JSON.parse(cli.stdout).filesWritten);
    assert.deepEqual(editorScene, cliScene);
  } finally {
    await rm(editorRoot, { force: true, recursive: true });
    await rm(cliRoot, { force: true, recursive: true });
  }
});

async function createParityProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-operation-parity-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "scene.arena", entities: [{ id: "player" }], prefabs: [], resources: [], systems: [], ui: { nodes: [] } }, null, 2)}\n`,
  );
  return root;
}

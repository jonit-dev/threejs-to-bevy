import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAuthoringProject } from "@threenative/authoring";

import { runEditorOperation } from "./operations.js";
import { buildUiInputSystemModel } from "./uiInputSystemModel.js";

test("should edit retained UI through source operations", async () => {
  const root = await createUiSystemProject();
  try {
    await runEditorOperation({ args: { nodeId: "countdown", text: "3", uiDocId: "hud" }, name: "ui.add_text", projectPath: root });
    const result = await runEditorOperation({ args: { align: "center", nodeId: "countdown", uiDocId: "hud" }, name: "ui.set_layout", projectPath: root });
    const document = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as { nodes: Array<{ id: string; layout?: { align?: string }; text?: string }> };

    assert.equal(result.ok, true);
    assert.deepEqual(document.nodes[0], { id: "countdown", layout: { align: "center" }, text: "3", type: "text" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject generated script bundle paths", async () => {
  const root = await createUiSystemProject();
  try {
    const result = await runEditorOperation({
      args: { exportName: "run", modulePath: "dist/game.bundle/scripts.bundle.js", systemId: "race" },
      name: "system.attach_script",
      projectPath: root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_GENERATED_SOURCE_PATH"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should build UI input and system source model", async () => {
  const root = await createUiSystemProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });
    assert.deepEqual(buildUiInputSystemModel(project.documents).map((row) => [row.kind, row.id]), [
      ["input", "arena"],
      ["system", "race"],
      ["ui", "hud"],
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createUiSystemProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-ui-system-model-"));
  await mkdir(join(root, "content", "ui"), { recursive: true });
  await mkdir(join(root, "content", "input"), { recursive: true });
  await mkdir(join(root, "content", "systems"), { recursive: true });
  await writeFile(join(root, "content", "ui", "hud.ui.json"), `${JSON.stringify({ schema: "threenative.ui", version: "0.1.0", id: "hud", nodes: [] }, null, 2)}\n`);
  await writeFile(join(root, "content", "input", "arena.input.json"), `${JSON.stringify({ schema: "threenative.input", version: "0.1.0", id: "arena", actions: [] }, null, 2)}\n`);
  await writeFile(join(root, "content", "systems", "race.systems.json"), `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "race", systems: [{ id: "race", schedule: "update" }] }, null, 2)}\n`);
  return root;
}

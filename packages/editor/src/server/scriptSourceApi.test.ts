import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { applyEditorOperationApi } from "./operationApi.js";
import { listEditorScriptSources, readEditorScriptSource, scaffoldEditorScriptSource } from "./scriptSourceApi.js";

test("should reject generated script bundle reads", async () => {
  const root = await copyStarterProject();
  try {
    const result = await readEditorScriptSource({ path: "dist/scripts.bundle.js", projectPath: root, rootPath: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_EDITOR_SCRIPT_SOURCE_PATH_UNSUPPORTED");
    assert.match(result.diagnostics[0]?.message ?? "", /src\/scripts/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should scaffold and attach a script from the editor", async () => {
  const root = await copyStarterProject();
  try {
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await writeFile(
      join(root, "content", "systems", "arena.systems.json"),
      `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "arena", systems: [{ id: "spin", schedule: "update" }] }, null, 2)}\n`,
    );

    const scaffold = await scaffoldEditorScriptSource({ exportName: "editorSpin", path: "src/scripts/editor-spin.ts", projectPath: root, rootPath: root });
    assert.equal(scaffold.ok, true);
    assert.equal(scaffold.changed, true);
    assert.match(await readFile(join(root, "src", "scripts", "editor-spin.ts"), "utf8"), /export function editorSpin/);

    const attach = await applyEditorOperationApi({
      projectPath: root,
      request: {
        args: {
          exportName: "editorSpin",
          file: "content/systems/arena.systems.json",
          modulePath: "src/scripts/editor-spin.ts",
          systemId: "spin",
        },
        name: "system.attach_script",
        projectRevision: scaffold.projectRevision,
      },
      rootPath: root,
    });

    assert.equal(attach.ok, true);
    assert.equal(attach.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
    const scripts = await listEditorScriptSources({ projectPath: root, rootPath: root });
    assert.deepEqual(scripts.scripts?.find((script) => script.path === "src/scripts/editor-spin.ts")?.exports, ["editorSpin"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function copyStarterProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-script-source-"));
  await cp(resolve("..", "..", "templates", "structured-source-starter"), root, { recursive: true });
  return root;
}

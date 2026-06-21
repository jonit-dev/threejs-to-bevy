import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAuthoringProject } from "@threenative/authoring";

import { buildMaterialModel } from "./materialModel.js";
import { runEditorOperation } from "./operations.js";

test("should list material source documents", async () => {
  const root = await createMaterialProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });
    const rows = buildMaterialModel(project.documents);

    assert.deepEqual(rows, [{ color: "#ffffff", documentPath: "content/materials/kart.materials.json", id: "kart", roughness: 0.5, textureFieldsReadOnly: true }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should update material through authoring operation", async () => {
  const root = await createMaterialProject();
  try {
    const result = await runEditorOperation({ args: { color: "#ffcc00", materialId: "kart", roughness: 0.25 }, name: "material.set", projectPath: root });
    const document = JSON.parse(await readFile(join(root, "content", "materials", "kart.materials.json"), "utf8")) as { materials: Array<{ color: string; roughness: number }> };

    assert.equal(result.ok, true);
    assert.deepEqual(document.materials[0], { color: "#ffcc00", id: "kart", roughness: 0.25 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createMaterialProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-material-model-"));
  await mkdir(join(root, "content", "materials"), { recursive: true });
  await writeFile(join(root, "content", "materials", "kart.materials.json"), `${JSON.stringify({ schema: "threenative.materials", version: "0.1.0", id: "kart", materials: [{ id: "kart", color: "#ffffff", roughness: 0.5 }] }, null, 2)}\n`);
  return root;
}

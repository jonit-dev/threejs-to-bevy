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

    assert.deepEqual(rows, [{ alphaMode: "mask", baseColorTexture: "tex.kart.albedo", color: "#ffffff", documentPath: "content/materials/kart.materials.json", emissive: "#33ccff", id: "kart", metalness: 0.2, normalTexture: "tex.kart.normal", roughness: 0.5, textureFieldsReadOnly: false }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should update material through authoring operation", async () => {
  const root = await createMaterialProject();
  try {
    const result = await runEditorOperation({ args: { baseColorTexture: "tex.kart.updated", color: "#ffcc00", materialId: "kart", metalness: 0.4, roughness: 0.25 }, name: "material.set", projectPath: root });
    const document = JSON.parse(await readFile(join(root, "content", "materials", "kart.materials.json"), "utf8")) as { materials: Array<Record<string, unknown>> };

    assert.equal(result.ok, true);
    assert.deepEqual(document.materials[0], { alphaMode: "mask", baseColorTexture: "tex.kart.updated", color: "#ffcc00", emissive: "#33ccff", id: "kart", metalness: 0.4, normalTexture: "tex.kart.normal", roughness: 0.25 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createMaterialProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-material-model-"));
  await mkdir(join(root, "content", "materials"), { recursive: true });
  await writeFile(join(root, "content", "materials", "kart.materials.json"), `${JSON.stringify({ schema: "threenative.materials", version: "0.1.0", id: "kart", materials: [{ id: "kart", alphaMode: "mask", baseColorTexture: "tex.kart.albedo", color: "#ffffff", emissive: "#33ccff", metalness: 0.2, normalTexture: "tex.kart.normal", roughness: 0.5 }] }, null, 2)}\n`);
  return root;
}

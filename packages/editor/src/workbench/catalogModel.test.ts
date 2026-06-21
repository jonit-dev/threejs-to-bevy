import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAuthoringProject } from "@threenative/authoring";

import { buildCatalogModel } from "./catalogModel.js";

test("should list mesh prefab and asset documents", async () => {
  const root = await createCatalogProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });
    const rows = buildCatalogModel(project.documents);

    assert.deepEqual(rows.map((row) => [row.kind, row.id, row.mutation]), [
      ["asset", "arena", "inspect-only"],
      ["mesh", "kart", "enabled"],
      ["prefab", "kart", "enabled"],
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should mark asset mutations disabled", async () => {
  const root = await createCatalogProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });
    const asset = buildCatalogModel(project.documents).find((row) => row.kind === "asset");

    assert.equal(asset?.mutation, "inspect-only");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createCatalogProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-catalog-model-"));
  await mkdir(join(root, "content", "assets"), { recursive: true });
  await mkdir(join(root, "content", "meshes"), { recursive: true });
  await mkdir(join(root, "content", "prefabs"), { recursive: true });
  await writeFile(join(root, "content", "assets", "arena.assets.json"), `${JSON.stringify({ schema: "threenative.assets", version: "0.1.0", id: "arena", assets: [] }, null, 2)}\n`);
  await writeFile(join(root, "content", "meshes", "kart.meshes.json"), `${JSON.stringify({ schema: "threenative.meshes", version: "0.1.0", id: "kart", meshes: [] }, null, 2)}\n`);
  await writeFile(join(root, "content", "prefabs", "kart.prefab.json"), `${JSON.stringify({ schema: "threenative.prefab", version: "0.1.0", id: "kart", entities: [] }, null, 2)}\n`);
  return root;
}

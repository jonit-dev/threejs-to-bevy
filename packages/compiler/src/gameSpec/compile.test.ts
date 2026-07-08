import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validateAuthoringProject } from "@threenative/authoring";
import { defineTypedGameSpec } from "@threenative/sdk";

import { buildAuthoringProvenanceDocument } from "../authoring/provenance.js";
import type { IAuthoringGraph } from "../authoring/graph.js";
import { buildProject } from "../index.js";
import { compileTypedGameSpec } from "./compile.js";

test("should emit valid structured source from typed spec", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-typed-game-spec-"));
  const spec = defineTypedGameSpec({
    input: {
      axes: [
        { id: "move-x", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"] },
        { id: "move-z", negative: ["keyboard.KeyS"], positive: ["keyboard.KeyW"] },
      ],
      id: "arena",
    },
    materials: [{ color: "#44aa88", id: "player-material" }],
    scenes: [{
      entities: [{
        components: {
          CharacterController: { blocking: false, grounding: "none", moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
          Collider: { height: 1, kind: "capsule", radius: 0.25 },
          MeshRenderer: { material: "player-material" },
          RigidBody: { kind: "kinematic" },
        },
        id: "player",
        prefab: "player-prefab",
        transform: { position: [0, 0.5, 0] },
      }],
      id: "arena",
      initial: true,
      prefabs: [{ color: "#44aa88", id: "player-prefab", primitive: "capsule" }],
      resources: [{ id: "score", value: 0 }],
      systems: [{ id: "score-system", resourceReads: ["score"], writes: ["Transform"] }],
      ui: {
        bindings: [{ node: "score-label", resource: "score" }],
        nodes: [{ id: "score-label", text: "Score", type: "text" }],
      },
    }],
  });
  const documents = compileTypedGameSpec(spec, { projectPath: root, sourcePath: "src/game.spec.ts" });

  for (const document of documents) {
    const path = join(root, document.projectRelativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(document.data, null, 2)}\n`, "utf8");
  }
  await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
    entry: "content/scenes/arena.scene.json",
    outDir: "dist/typed-spec-smoke.bundle",
    schema: "threenative.project",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  const result = await validateAuthoringProject({ projectPath: root });
  const build = await buildProject(root);

  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  assert.equal(build.bundlePath.endsWith("dist/typed-spec-smoke.bundle"), true);
  const sceneDocument = documents.find((document) => document.projectRelativePath === "content/scenes/arena.scene.json");
  assert.deepEqual((sceneDocument?.data as { prefabs?: unknown[] }).prefabs, [{ color: "#44aa88", id: "player-prefab", primitive: "capsule" }]);
  assert.equal((sceneDocument?.data as { entities?: Array<{ prefab?: string }> }).entities?.[0]?.prefab, "player-prefab");
  const provenance = buildAuthoringProvenanceDocument(authoringGraph(root), { documents, emitted: [] });
  const playerOwner = provenance.ownership.find((entry) => entry.emitted.artifactKind === "entity" && entry.emitted.id === "player");
  assert.equal(playerOwner?.source?.path, "src/game.spec.ts");
  assert.equal(playerOwner?.source?.pointer, "/scenes/0/entities/0");
  assert.deepEqual(documents.map((document) => document.projectRelativePath).sort(), [
    "content/input/arena.input.json",
    "content/materials/game-materials.materials.json",
    "content/scenes/arena.scene.json",
  ]);
});

function authoringGraph(root: string): IAuthoringGraph {
  return {
    declarations: [],
    diagnostics: [],
    entryPath: "src/game.spec.ts",
    modules: [],
    projectRoot: root,
    schema: "threenative.authoring-graph",
    version: "0.1.0",
  };
}

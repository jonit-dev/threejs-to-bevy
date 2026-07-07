import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validateAuthoringProject } from "@threenative/authoring";
import { defineTypedGameSpec } from "@threenative/sdk";

import { compileTypedGameSpec } from "./compile.js";

test("should emit valid structured source from typed spec", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-typed-game-spec-"));
  const spec = defineTypedGameSpec({
    input: { actions: [{ bindings: ["keyboard.KeyD"], id: "move-x" }, { bindings: ["keyboard.KeyW"], id: "move-z" }], id: "arena" },
    materials: [{ color: "#44aa88", id: "player-material" }],
    scenes: [{
      entities: [{
        components: {
          CharacterController: { grounding: "none", moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
          MeshRenderer: { material: "player-material" },
        },
        id: "player",
        transform: { position: [0, 0.5, 0] },
      }],
      id: "arena",
      initial: true,
      resources: [{ id: "score", value: 0 }],
      systems: [{ id: "score-system", resourceReads: ["score"], writes: ["player"] }],
      ui: {
        bindings: [{ node: "score-label", resource: "score" }],
        nodes: [{ id: "score-label", text: "Score", type: "text" }],
      },
    }],
  });
  const documents = compileTypedGameSpec(spec, { projectPath: root });

  for (const document of documents) {
    const path = join(root, document.projectRelativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(document.data, null, 2)}\n`, "utf8");
  }
  const result = await validateAuthoringProject({ projectPath: root });

  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  assert.deepEqual(documents.map((document) => document.projectRelativePath).sort(), [
    "content/input/arena.input.json",
    "content/materials/game-materials.materials.json",
    "content/scenes/arena.scene.json",
  ]);
});

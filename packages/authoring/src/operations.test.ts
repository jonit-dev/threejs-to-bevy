import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { IAuthoringDiagnostic } from "./diagnostics.js";
import { createScene } from "./operations.js";
import { validateTransform } from "./operations/sharedC.js";
import { validateAssetDeclaration, validateInputMetadata } from "./operations/sharedD.js";

test("should preserve scene operation output after module split", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-operations-"));
  try {
    const result = await createScene({ file: "content/scenes/arena.scene.json", projectPath: root, sceneId: "scene.arena" });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as Record<string, unknown>;

    assert.deepEqual(result, {
      ok: true,
      changed: true,
      diagnostics: [],
      projectPath: root,
      filesWritten: ["content/scenes/arena.scene.json"],
      file: "content/scenes/arena.scene.json",
      nextCommands: [
        "tn scene add-entity scene.arena <entity-id> --json",
        "tn scene set-transform scene.arena <entity-id> --position x,y,z --json",
        "tn scene attach-script scene.arena <system-id> --module src/scripts/<system>.ts --export <exportName> --json",
        "tn scene validate scene.arena --json",
        "tn build --json",
        "tn verify --json",
      ],
      sceneId: "scene.arena",
    });
    assert.deepEqual(scene, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.arena",
      entities: [],
      prefabs: [],
      resources: [],
      systems: [],
      ui: { bindings: [], nodes: [] },
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should normalize clamp wrap alias with warning", () => {
  const diagnostics: IAuthoringDiagnostic[] = [];
  const asset = { id: "texture.board", path: "assets/board.png", type: "texture", wrapS: "clamp" };
  validateAssetDeclaration(diagnostics, "/assets/0", asset, "content/assets.json");
  assert.equal(asset.wrapS, "clampToEdge");
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_TEXTURE_WRAP_NORMALIZED" && diagnostic.severity === "warning"), true);
});

test("should convert quaternion rotation to euler with warning", () => {
  const diagnostics: IAuthoringDiagnostic[] = [];
  const transform: { rotation: number[] } = { rotation: [-0.7071, 0, 0, 0.7071] };
  validateTransform(diagnostics, "content/scenes/chess.scene.json", "/entities/0/transform", transform);
  assert.ok(Math.abs((transform.rotation[0] ?? 0) + Math.PI / 2) < 0.001);
  assert.ok(Math.abs(transform.rotation[1] ?? 0) < 0.001);
  assert.ok(Math.abs(transform.rotation[2] ?? 0) < 0.001);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_ROTATION_QUATERNION_CONVERTED" && diagnostic.severity === "warning"), true);
});

test("should attach pointer binding fix snippet for object-form binding", () => {
  const diagnostics = validateInputMetadata("content/input/game.input.json", {
    actions: [{ bindings: [{ button: 0, device: "pointer" }], id: "Select" }],
  });
  assert.equal(diagnostics[0]?.fix?.snippet, '"pointer.0"');
});

test("should not attach unrelated cookbook snippet to shape errors", () => {
  const diagnostics = validateInputMetadata("content/input/game.input.json", {
    actions: [{ bindings: [{ button: 0, device: "pointer" }], id: "Select" }],
  });
  assert.equal(JSON.stringify(diagnostics).includes("collectible-respawn"), false);
});

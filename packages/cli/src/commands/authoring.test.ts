import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { authoringCommand } from "./authoring.js";

test("authoring command inspects and validates structured source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-command-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(
      join(root, "content/scenes/arena.scene.json"),
      `${JSON.stringify(
        {
          schema: "threenative.scene",
          version: "0.1.0",
          id: "arena",
          entities: [],
          prefabs: [],
          resources: [],
          systems: [],
          ui: { nodes: [], bindings: [] },
        },
        null,
        2,
      )}\n`,
    );

    const inspect = await authoringCommand(["inspect", "--project", root, "--json"]);
    const inspectPayload = JSON.parse(inspect.stdout) as {
      code: string;
      documents: Array<{ kind: string; path: string }>;
      projectMap: { documents: Array<{ id?: string; ids: Record<string, string[]>; responsibility: string }> };
    };
    assert.equal(inspect.exitCode, 0);
    assert.equal(inspectPayload.code, "TN_AUTHORING_INSPECT_OK");
    assert.deepEqual(inspectPayload.documents, [{ kind: "scene", path: "content/scenes/arena.scene.json" }]);
    assert.equal(inspectPayload.projectMap.documents[0]?.id, "arena");
    assert.deepEqual(inspectPayload.projectMap.documents[0]?.ids.entities, []);
    assert.match(inspectPayload.projectMap.documents[0]?.responsibility ?? "", /scene entities/);

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const validatePayload = JSON.parse(validate.stdout) as { code: string; next: string; notice: string; ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validatePayload.code, "TN_AUTHORING_VALIDATE_OK");
    assert.equal(validatePayload.next, "tn iterate --project . --json");
    assert.match(validatePayload.notice, /Standalone authoring validation is subsumed/);
    assert.equal(validatePayload.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring validate reports structured input binding diagnostics with source path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-input-diagnostics-"));
  try {
    await mkdir(join(root, "content/input"), { recursive: true });
    await writeFile(
      join(root, "content/input/kart.input.json"),
      `${JSON.stringify(
        {
          schema: "threenative.input",
          version: "0.1.0",
          id: "kart-input",
          actions: [
            { id: "accelerate", bindings: ["keyboard.w"] },
            { id: "debug", bindings: ["keyboard.not-a-code"] },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const payload = JSON.parse(validate.stdout) as {
      diagnostics: Array<{ code: string; file?: string; path?: string; severity: string; suggestion?: string }>;
      ok: boolean;
    };

    assert.equal(validate.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_INPUT_KEYBOARD_CODE_NORMALIZED"
      && diagnostic.file === "content/input/kart.input.json"
      && diagnostic.path === "/actions/0/bindings/0"
      && diagnostic.severity === "warning"
      && diagnostic.suggestion === "Update this binding to 'keyboard.KeyW' so source and emitted IR match."
    ), true);
    assert.equal(payload.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_INPUT_KEYBOARD_CODE_INVALID"
      && diagnostic.file === "content/input/kart.input.json"
      && diagnostic.path === "/actions/1/bindings/0"
      && diagnostic.severity === "error"
    ), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring command compiles typed game spec into structured source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-typed-spec-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "content/systems"), { recursive: true });
    await writeFile(join(root, "src/specParts.ts"), `export const playerMaterial = { color: "#44aa88", id: "player-material" } as const;
`);
    await writeFile(join(root, "content/systems/arena.systems.json"), `${JSON.stringify({
      schema: "threenative.systems",
      version: "0.1.0",
      id: "arena-systems",
      systems: [{
        id: "stale-system",
        script: { module: "src/scripts/player.ts", export: "removedExport" },
      }],
    }, null, 2)}\n`);
    await writeFile(join(root, "src/game.spec.ts"), `import { defineTypedGameSpec } from "@threenative/sdk";
import { playerMaterial } from "./specParts";

export default defineTypedGameSpec({
  input: {
    axes: [
      { id: "move-x", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"] },
      { id: "move-z", negative: ["keyboard.KeyS"], positive: ["keyboard.KeyW"] },
    ],
    id: "arena",
  },
  materials: [playerMaterial],
  scenes: [{
    entities: [{
      components: {
        CharacterController: { blocking: false, grounding: "none", moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
        Collider: { height: 1, kind: "capsule", radius: 0.25 },
        MeshRenderer: { material: "player-material" },
        RigidBody: { kind: "kinematic" },
      },
      id: "player",
    }],
    id: "arena",
    resources: [{ id: "score", value: 0 }],
    ui: { nodes: [{ id: "score-label", text: "Score", type: "text" }] },
  }],
});
`);

    const compile = await authoringCommand(["compile-typed-spec", "--project", root, "--json"]);
    const payload = JSON.parse(compile.stdout) as { code: string; documents: Array<{ kind: string; path: string }> };
    assert.equal(compile.exitCode, 0);
    assert.equal(payload.code, "TN_AUTHORING_TYPED_SPEC_COMPILED");
    assert.deepEqual(payload.documents.map((document) => document.path).sort(), [
      "content/input/arena.input.json",
      "content/materials/game-materials.materials.json",
      "content/scenes/arena.scene.json",
    ]);
    await assert.rejects(access(join(root, "content/systems/arena.systems.json")), { code: "ENOENT" });

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const validatePayload = JSON.parse(validate.stdout) as { ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validatePayload.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

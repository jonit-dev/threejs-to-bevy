import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    const inspectPayload = JSON.parse(inspect.stdout) as { code: string; documents: Array<{ kind: string; path: string }> };
    assert.equal(inspect.exitCode, 0);
    assert.equal(inspectPayload.code, "TN_AUTHORING_INSPECT_OK");
    assert.deepEqual(inspectPayload.documents, [{ kind: "scene", path: "content/scenes/arena.scene.json" }]);

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const validatePayload = JSON.parse(validate.stdout) as { code: string; ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validatePayload.code, "TN_AUTHORING_VALIDATE_OK");
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

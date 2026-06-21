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

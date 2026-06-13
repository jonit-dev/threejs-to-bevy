import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { captureEntry } from "./capture.js";
import { CompilerError } from "./errors.js";

test("should capture starter scene root", async () => {
  const root = await makeProject(`import { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  try {
    const captured = await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    assert.equal(captured.summary.rootType, "Scene");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported root", async () => {
  const root = await makeProject("export default {};\n");
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) => error instanceof CompilerError && error.code === "TN_COMPILER_UNSUPPORTED_ROOT",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeProject(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-compiler-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/game.ts"), source);
  return root;
}

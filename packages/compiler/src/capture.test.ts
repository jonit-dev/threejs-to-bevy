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

test("should reject unsupported side effect import in relative module", async () => {
  const root = await makeProject(`import "./platform";\nimport { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  await writeFile(join(root, "src/platform.ts"), `import "three";\n`);
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/platform.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported import behind nodenext js specifier", async () => {
  const root = await makeProject(`import "./platform.js";\nimport { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  await writeFile(join(root, "src/platform.ts"), `import "three";\n`);
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/platform.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported node subpath import", async () => {
  const root = await makeProject(`import { readFile } from "fs/promises";\nimport { Scene } from "@threenative/sdk";\nvoid readFile;\nexport default new Scene({ id: "scene" });\n`);
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported commented dynamic import", async () => {
  const root = await makeProject(`import { Scene } from "@threenative/sdk";\nvoid import(/* @vite-ignore */ "three");\nvoid import( /* comment */ "fs/promises" );\nexport default new Scene({ id: "scene" });\n`);
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported renderer subpath import", async () => {
  const root = await makeProject(`import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";\nimport { Scene } from "@threenative/sdk";\nvoid GLTFLoader;\nexport default new Scene({ id: "scene" });\n`);
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported react renderer subpath import", async () => {
  const root = await makeProject(`import { Canvas } from "@react-three/fiber/native";\nimport { Scene } from "@threenative/sdk";\nvoid Canvas;\nexport default new Scene({ id: "scene" });\n`);
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported template literal dynamic import", async () => {
  const root = await makeProject("import { Scene } from \"@threenative/sdk\";\nvoid import(`fs/promises`);\nexport default new Scene({ id: \"scene\" });\n");
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
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
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

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createProject } from "./create.js";

test("should create v1 template files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-"));
  try {
    const result = await createProject(["my-game", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");

    const files = await readdir(payload.path);
    assert.equal(files.includes(".gitignore"), true);
    assert.equal(files.includes("README.md"), true);
    assert.equal(files.includes("package.json"), true);
    assert.equal(files.includes("src"), true);
    assert.equal(files.includes("threenative.config.json"), true);

    const source = await readFile(join(payload.path, "src", "game.ts"), "utf8");
    assert.match(source, /new Scene/);
    assert.match(source, /DirectionalLight/);

    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts.validate, "tn validate");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts["dev:web"], "tn dev --target web");
    assert.equal(packageJson.scripts["dev:desktop"], "tn dev --target desktop");
    assert.equal(packageJson.scripts.verify, "tn verify");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.equal(packageJson.dependencies["@threenative/r3f"], undefined);
    assert.equal(packageJson.dependencies["@threenative/ui"], undefined);
    assert.match(packageJson.devDependencies["@threenative/cli"] ?? "", /^file:/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create v2 arena template", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-v2-arena-"));
  try {
    const result = await createProject(["arena", "--template", "v2-arena", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "v2-arena");

    const files = await readdir(join(payload.path, "src"));
    assert.equal(files.includes("game.tsx"), true);
    assert.equal(files.includes("gameplay.ts"), true);
    assert.equal(files.includes("input.ts"), true);
    assert.equal(files.includes("ui.ts"), true);

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      template: string;
    };
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    assert.equal(config.entry, "src/game.tsx");
    assert.equal(config.template, "v2-arena");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.verify, "tn verify --profile v2-arena");
    assert.match(packageJson.dependencies["@threenative/r3f"] ?? "", /^file:/);
    assert.match(packageJson.dependencies["@threenative/ui"] ?? "", /^file:/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create v3 environment template", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-v3-environment-"));
  try {
    const result = await createProject(["forest", "--template", "v3-environment", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "v3-environment");

    const files = await readdir(join(payload.path, "src"));
    assert.equal(files.includes("game.ts"), true);

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      outDir: string;
      template: string;
    };
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const source = await readFile(join(payload.path, "src/game.ts"), "utf8");
    const assetFiles = await readdir(join(payload.path, "assets-source/environment/glTF"));

    assert.equal(config.entry, "src/game.ts");
    assert.equal(config.outDir, "dist/forest.bundle");
    assert.equal(config.template, "v3-environment");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts["dev:web"], "tn dev --target web");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(source, /sourceDir: "assets-source\/environment\/glTF"/);
    assert.doesNotMatch(source, /\.\.\/\.\.\/assets-source/);
    assert.equal(assetFiles.includes("CommonTree_1.gltf"), true);
    assert.equal(assetFiles.includes("CommonTree_1.bin"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create v4 scripting template", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-v4-scripting-"));
  try {
    const result = await createProject(["scripted", "--template", "v4-scripting", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "v4-scripting");

    const files = await readdir(join(payload.path, "src"));
    assert.equal(files.includes("game.ts"), true);
    assert.equal(files.includes("gameplay.ts"), true);
    assert.equal(files.includes("gameplay.test.ts"), true);
    assert.equal(files.includes("node-test.d.ts"), true);

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      outDir: string;
      template: string;
    };
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const source = await readFile(join(payload.path, "src/game.ts"), "utf8");

    assert.equal(config.entry, "src/game.ts");
    assert.equal(config.outDir, "dist/v4-scripting.bundle");
    assert.equal(config.template, "v4-scripting");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.verify, "tn verify --frames 3 --expect-motion --json");
    assert.equal(packageJson.scripts.test, "pnpm build && tsc -p tsconfig.test.json && node --test dist/tests/gameplay.test.js");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(source, /physics\.raycast/);
    assert.match(source, /animation\.play/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject non-empty destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-"));
  try {
    const destination = join(root, "existing");
    await mkdir(destination);
    await writeFile(join(destination, "keep.txt"), "do not overwrite");

    const result = await createProject(["existing", "--json"], { cwd: root });
    const payload = JSON.parse(result.stderr ?? "{}") as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_CREATE_DESTINATION_NOT_EMPTY");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

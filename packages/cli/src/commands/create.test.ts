import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createProject, initProject } from "./create.js";

test("should create starter template files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-"));
  try {
    const result = await createProject(["my-game", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; nextCommands: string[]; path: string; referenceDocs: string[]; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "starter");
    assert.equal(payload.nextCommands.includes("pnpm run dev:web"), true);
    assert.equal(payload.referenceDocs.includes("tn help scaffold"), true);

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
    assert.equal(packageJson.scripts["package:desktop"], "npm run build && tn package --bundle dist/game.bundle --target desktop --out dist/local-distributable --json && tn validate --bundle dist/local-distributable/desktop/game.bundle --json");
    assert.equal(packageJson.scripts.desktop, "npm run package:desktop && tar -czf dist/local-distributable/threenative-simple-game-desktop-0.1.0.tar.gz -C dist/local-distributable desktop");
    assert.equal(packageJson.scripts.verify, "tn verify");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.equal(packageJson.dependencies["@threenative/r3f"], undefined);
    assert.equal(packageJson.dependencies["@threenative/ui"], undefined);
    assert.match(packageJson.devDependencies["@threenative/cli"] ?? "", /^file:/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should initialize starter project through init alias with create payload shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-init-"));
  try {
    const result = await initProject(["my-game", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as {
      code: string;
      command: string;
      nextCommands: string[];
      path: string;
      referenceDocs: string[];
      template: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.command, "init");
    assert.equal(payload.template, "starter");
    assert.deepEqual(payload.nextCommands, ["pnpm install", "pnpm run validate", "pnpm run build", "pnpm run dev:web", "pnpm run verify"]);
    assert.equal(payload.referenceDocs.includes("docs/workflows/developer-workflow.md"), true);

    const files = await readdir(payload.path);
    assert.equal(files.includes("package.json"), true);
    assert.equal(files.includes("threenative.config.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should print explicit first-project next commands in human output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-human-"));
  try {
    const result = await createProject(["my-game"], { cwd: root });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /pnpm install/);
    assert.match(result.stdout, /pnpm run validate/);
    assert.match(result.stdout, /pnpm run build/);
    assert.match(result.stdout, /pnpm run dev:web/);
    assert.match(result.stdout, /pnpm run verify/);
    assert.match(result.stdout, /tn help scaffold/);
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
    assert.equal(payload.template, "arena");

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
    assert.equal(config.template, "arena");
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
    assert.equal(payload.template, "environment");

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
    assert.equal(config.template, "environment");
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
    assert.equal(payload.template, "scripting");

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
    assert.equal(config.template, "scripting");
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

test("should create v5 game starter template", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-v5-game-starter-"));
  try {
    const result = await createProject(["starter", "--template", "v5-game-starter", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "game-starter");

    const files = await readdir(join(payload.path, "src"));
    assert.equal(files.includes("game.ts"), true);
    assert.equal(files.includes("gameplay.ts"), true);
    assert.equal(files.includes("gameplay.test.ts"), true);

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
    assert.equal(config.outDir, "dist/v5-game-starter.bundle");
    assert.equal(config.template, "game-starter");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.verify, "tn verify --frames 2 --json");
    assert.equal(packageJson.scripts.test, "pnpm build && tsc -p tsconfig.test.json && node --test dist/tests/gameplay.test.js");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(source, /defineControls/);
    assert.match(source, /defineGame/);
    assert.match(source, /primitiveActorPrefab/);
    assert.match(source, /movePlayerToGoal/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create starter-functional template by canonical name", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-starter-functional-"));
  try {
    const result = await createProject(["functional", "--template", "starter-functional", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.template, "starter-functional");

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      template: string;
    };
    assert.equal(config.template, "starter-functional");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create legacy v7-functional template with deprecation diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-v7-functional-"));
  try {
    const result = await createProject(["v7", "--template", "v7-functional", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string; legacyAliasUsed?: boolean };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.template, "starter-functional");
    assert.equal(payload.legacyAliasUsed, true);

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      template: string;
    };
    assert.equal(config.template, "starter-functional");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown template with canonical options", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-unknown-template-"));
  try {
    const result = await createProject(["game", "--template", "unknown-template", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; message: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_CREATE_TEMPLATE_UNSUPPORTED");
    assert.match(payload.message, /starter-functional/);
    assert.match(payload.message, /legacy aliases/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create legacy v7-functional template files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-v7-functional-"));
  try {
    const result = await createProject(["v7", "--template", "v7-functional", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "starter-functional");

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
    const gameSource = await readFile(join(payload.path, "src/game.ts"), "utf8");
    const arenaSource = await readFile(join(payload.path, "src/scenes/arena.ts"), "utf8");

    assert.equal(config.entry, "src/game.ts");
    assert.equal(config.outDir, "dist/starter-functional.bundle");
    assert.equal(config.template, "starter-functional");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.validate, "tn validate");
    assert.equal(packageJson.scripts.verify, "tn verify --frames 2 --json");
    assert.equal(packageJson.scripts["package:desktop"], "tn package --bundle dist/starter-functional.bundle --target desktop --out artifacts/package --json");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(packageJson.dependencies["@threenative/ui"] ?? "", /^file:/);
    assert.match(gameSource, /defineGame/);
    assert.match(gameSource, /defineScene/);
    assert.match(arenaSource, /ThreeNative V7 Functional/);
    assert.match(arenaSource, /v7ProofLoop/);
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
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_CREATE_DESTINATION_NOT_EMPTY");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

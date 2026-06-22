import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { authoringCommand } from "./authoring.js";
import { createProject, initProject } from "./create.js";
import { uiCommand } from "./sourceDocuments.js";

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
    assert.equal(packageJson.devDependencies["@threenative/cli"], "file:.threenative/cli");
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
    assert.equal(files.includes("scripts"), true);

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
    const scriptSource = await readFile(join(payload.path, "src/scripts/systems.ts"), "utf8");

    assert.equal(config.entry, "src/game.ts");
    assert.equal(config.outDir, "dist/v4-scripting.bundle");
    assert.equal(config.template, "scripting");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.verify, "tn verify --frames 3 --expect-motion --json");
    assert.equal(packageJson.scripts.test, "pnpm build && tsc -p tsconfig.test.json && node --test dist/tests/gameplay.test.js");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(source, /module: "src\/scripts\/systems\.ts"/);
    assert.match(scriptSource, /physics\.raycast/);
    assert.match(scriptSource, /animation\.play/);
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
    assert.equal(files.includes("input"), true);
    assert.equal(files.includes("scenes"), true);
    assert.equal(files.includes("scripts"), true);

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
    const sceneSource = await readFile(join(payload.path, "src/scenes/arena.ts"), "utf8");
    const systemSource = await readFile(join(payload.path, "src/scenes/arena.systems.ts"), "utf8");

    assert.equal(config.entry, "src/game.ts");
    assert.equal(config.outDir, "dist/v5-game-starter.bundle");
    assert.equal(config.template, "game-starter");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.verify, "tn verify --frames 2 --json");
    assert.equal(packageJson.scripts.test, "pnpm build && tsc -p tsconfig.test.json && node --test dist/tests/gameplay.test.js");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(source, /defineGame/);
    assert.match(source, /scenes: \[arenaScene\]/);
    assert.match(sceneSource, /defineSceneModule/);
    assert.match(systemSource, /module: "src\/scripts\/player\.ts"/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create racing-kart template with scale calibration fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-racing-kart-"));
  try {
    const result = await createProject(["racer", "--template", "racing-kart", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "racing-kart");

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      outDir: string;
      template: string;
    };
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const sceneSource = await readFile(join(payload.path, "src/scenes/arena.entities.ts"), "utf8");
    const hudSource = await readFile(join(payload.path, "src/scenes/arena.ts"), "utf8");
    const calibration = JSON.parse(await readFile(join(payload.path, "assets/kart-scale-calibration.json"), "utf8")) as {
      gameplay: { laneWidthMeters: number };
      visualQa: { rivalsVisible: boolean; trackCurveVisible: boolean };
    };

    assert.equal(config.outDir, "dist/racing-kart.bundle");
    assert.equal(config.template, "racing-kart");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts.verify, "tn verify --frames 2 --json");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(sceneSource, /kart\.player/);
    assert.match(sceneSource, /kart\.rival\.red/);
    assert.match(sceneSource, /track\.curve\.marker/);
    assert.match(sceneSource, /follow: \{ offset: \[0, 3\.4, 6\.2\]/);
    assert.match(hudSource, /RACING KART/);
    assert.equal(calibration.gameplay.laneWidthMeters, 3.6);
    assert.equal(calibration.visualQa.rivalsVisible, true);
    assert.equal(calibration.visualQa.trackCurveVisible, true);
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
    const files = await readdir(join(payload.path, "src"));
    assert.equal(config.template, "starter-functional");
    assert.equal(files.includes("assets"), true);
    assert.equal(files.includes("audio"), true);
    assert.equal(files.includes("input"), true);
    assert.equal(files.includes("scenes"), true);
    assert.equal(files.includes("scripts"), true);
    assert.equal(files.includes("ui"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create structured-source starter template with editable content docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-structured-source-"));
  try {
    const result = await createProject(["structured", "--template", "structured-source-starter", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "structured-source-starter");

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      outDir: string;
      template: string;
    };
    assert.equal(config.entry, "content/scenes/arena.scene.json");
    assert.equal(config.outDir, "dist/structured-source-starter.bundle");
    assert.equal(config.template, "structured-source-starter");

    const sceneDoc = await readFile(join(payload.path, "content/scenes/arena.scene.json"), "utf8");
    const uiDocPath = join(payload.path, "content/ui/hud.ui.json");
    const systemDoc = await readFile(join(payload.path, "content/systems/arena.systems.json"), "utf8");
    const scriptSource = await readFile(join(payload.path, "src/scripts/player.ts"), "utf8");

    assert.match(sceneDoc, /"schema": "threenative.scene"/);
    assert.match(sceneDoc, /"prefab": "prefab.player"/);
    assert.match(systemDoc, /"module": "src\/scripts\/player.ts"/);
    assert.match(scriptSource, /movePlayerToGoal/);
    await assert.rejects(access(join(payload.path, "src/game.ts")));

    const validate = await authoringCommand(["validate", "--project", payload.path, "--json"], { cwd: root });
    const validationPayload = JSON.parse(validate.stdout) as { code: string; ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validationPayload.code, "TN_AUTHORING_VALIDATE_OK");
    assert.equal(validationPayload.ok, true);

    const layout = await uiCommand(["set-layout", "hud", "countdown", "--justify", "center", "--align", "center", "--top", "60", "--project", payload.path, "--json"], { cwd: root });
    assert.equal(layout.exitCode, 0);

    const uiDoc = JSON.parse(await readFile(uiDocPath, "utf8")) as { nodes: Array<{ id: string; layout?: { top?: number } }> };
    const scriptAfter = await readFile(join(payload.path, "src/scripts/player.ts"), "utf8");
    assert.equal(uiDoc.nodes.find((node) => node.id === "countdown")?.layout?.top, 60);
    assert.equal(scriptAfter, scriptSource);
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
    const systemsSource = await readFile(join(payload.path, "src/scenes/arena.systems.ts"), "utf8");

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
    assert.match(gameSource, /scenes: \[arenaScene\]/);
    assert.match(arenaSource, /ThreeNative V7 Functional/);
    assert.match(arenaSource, /defineSceneModule/);
    assert.match(systemsSource, /v7ProofLoop/);
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

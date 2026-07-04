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
    assert.equal(payload.template, "structured-source-starter");
    assert.equal(payload.nextCommands.includes("pnpm run dev:web"), true);
    assert.equal(payload.referenceDocs.includes("tn help scaffold"), true);

    const files = await readdir(payload.path);
    assert.equal(files.includes(".gitignore"), true);
    assert.equal(files.includes("AGENTS.md"), true);
    assert.equal(files.includes("CLAUDE.md"), true);
    assert.equal(files.includes("README.md"), true);
    assert.equal(files.includes("dist"), false);
    assert.equal(files.includes("package.json"), true);
    assert.equal(files.includes("content"), true);
    assert.equal(files.includes("src"), true);
    assert.equal(files.includes("threenative.config.json"), true);
    await access(join(payload.path, "assets", "goal-ping.wav"));
    await access(join(payload.path, ".threenative", "cli", "index.js"));
    await assert.rejects(access(join(payload.path, "dist")));

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      template: string;
    };
    assert.equal(config.entry, "content/scenes/arena.scene.json");
    assert.equal(config.template, "structured-source-starter");
    await assert.rejects(access(join(payload.path, "src", "game.ts")));
    const runtime = JSON.parse(await readFile(join(payload.path, "content", "runtime", "default.runtime.json"), "utf8")) as {
      renderer?: { renderLook?: { profile?: string; version?: number } };
    };
    assert.deepEqual(runtime.renderer?.renderLook, { version: 1, profile: "balanced" });

    const agentInstructions = await readFile(join(payload.path, "AGENTS.md"), "utf8");
    const claudeInstructions = await readFile(join(payload.path, "CLAUDE.md"), "utf8");
    assert.match(agentInstructions, /tn scene \.\.\. --json/);
    assert.match(agentInstructions, /Do not edit them as the fix/);
    assert.match(claudeInstructions, /Use `AGENTS\.md`/);

    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts.validate, "tn validate");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts["dev:web"], "tn dev --target web");
    assert.equal(packageJson.scripts.playtest, "tn playtest --json");
    assert.match(packageJson.scripts["game:plan"] ?? "", /tn game plan --goal/);
    assert.equal(packageJson.scripts["game:improve"], "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json");
    assert.equal(packageJson.scripts["game:qa"], "tn game qa --project . --run-proof --json");
    assert.equal(packageJson.scripts["game:release"], "tn game release --project . --json");
    assert.match(packageJson.scripts["recipe:controller"] ?? "", /tn recipe third-person-controller/);
    assert.equal(packageJson.scripts.verify, "tn verify --frames 2 --json");
    assert.match(packageJson.dependencies["@threenative/sdk"] ?? "", /^file:/);
    assert.match(packageJson.dependencies["@threenative/script-stdlib"] ?? "", /^file:/);
    assert.equal(packageJson.dependencies["@threenative/r3f"], undefined);
    assert.equal(packageJson.dependencies["@threenative/ui"], undefined);
    assert.equal(packageJson.devDependencies["@threenative/cli"], "file:.threenative/cli");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should scaffold parity render look when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-render-profile-"));
  try {
    const result = await createProject(["my-game", "--render-profile", "parity", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; renderProfile: string };
    const runtime = JSON.parse(await readFile(join(payload.path, "content", "runtime", "default.runtime.json"), "utf8")) as {
      renderer?: { renderLook?: { profile?: string; version?: number } };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.renderProfile, "parity");
    assert.deepEqual(runtime.renderer?.renderLook, { version: 1, profile: "parity" });
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
    assert.equal(payload.template, "structured-source-starter");
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
      production?: {
        agent?: {
          highValueSurfaces?: Array<{ id?: string; provenanceStatus?: string; sourcePath?: string }>;
          scriptModules?: Array<{ export?: string; module?: string; referencedBy?: string[] }>;
          sourceShape?: Record<string, string[]>;
        };
        proofCommands?: string[];
      };
      template: string;
    };
    assert.equal(config.entry, "content/scenes/arena.scene.json");
    assert.equal(config.outDir, "dist/structured-source-starter.bundle");
    assert.equal(config.template, "structured-source-starter");
    assert.equal(config.production?.proofCommands?.some((command) => command.includes("tn game qa") && command.includes("--run-proof")), true);
    assert.equal(config.production?.agent?.sourceShape?.runtime?.includes("content/runtime/default.runtime.json"), true);
    assert.equal(config.production?.agent?.sourceShape?.scene?.includes("content/scenes/arena.scene.json"), true);
    assert.equal(config.production?.agent?.sourceShape?.scripts?.includes("src/scripts/player.ts"), true);
    assert.equal(config.production?.agent?.highValueSurfaces?.some((surface) => surface.id === "playerHero" && surface.sourcePath === "content/scenes/arena.scene.json"), true);
    assert.equal(config.production?.agent?.scriptModules?.some((script) => script.module === "src/scripts/player.ts" && script.export === "updatePlayer"), true);

    const sceneDoc = await readFile(join(payload.path, "content/scenes/arena.scene.json"), "utf8");
    const uiDocPath = join(payload.path, "content/ui/hud.ui.json");
    const systemDoc = await readFile(join(payload.path, "content/systems/arena.systems.json"), "utf8");
    const scriptSource = await readFile(join(payload.path, "src/scripts/player.ts"), "utf8");
    const readme = await readFile(join(payload.path, "README.md"), "utf8");

    assert.match(sceneDoc, /"schema": "threenative.scene"/);
    assert.match(sceneDoc, /"prefab": "prefab.player"/);
    assert.match(systemDoc, /"module": "src\/scripts\/player.ts"/);
    assert.match(systemDoc, /"writes": \[\s*"Transform"\s*\]/);
    assert.match(scriptSource, /movePlayerToGoal/);
    assert.match(scriptSource, /@threenative\/script-stdlib/);
    assert.match(scriptSource, /context\.time\.fixedDelta/);
    assert.match(scriptSource, /entity\.transform\(\)/);
    assert.match(readme, /content\/\*\*\/\*\.json/);
    assert.match(readme, /src\/scripts\/\*\*\/\*\.ts/);
    assert.match(readme, /@threenative\/authoring-client/);
    assert.match(readme, /pnpm run recipe:controller/);
    await access(join(payload.path, "assets", "goal-ping.wav"));
    await assert.rejects(access(join(payload.path, "src/game.ts")));
    await assert.rejects(access(join(payload.path, "dist", "structured-source-starter.bundle")));

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

test("should create racing kit rally starter with reusable race scene structure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-racing-kit-"));
  try {
    const result = await createProject(["rally", "--template", "racing-kit-rally-starter", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "racing-kit-rally-starter");

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      outDir: string;
      production?: {
        agent?: {
          highValueSurfaces?: Array<{ id?: string; provenanceStatus?: string; sourcePath?: string }>;
          scriptModules?: Array<{ export?: string; module?: string; referencedBy?: string[] }>;
          sourceShape?: Record<string, string[]>;
        };
        controls?: string[];
        objective?: string;
        playableLoop?: string;
        proofCommands?: string[];
      };
      template: string;
    };
    assert.equal(config.entry, "content/scenes/rally.scene.json");
    assert.equal(config.outDir, "dist/racing-kit-rally.bundle");
    assert.equal(config.template, "racing-kit-rally-starter");
    assert.equal(config.production?.controls?.includes("keyboard.KeyW"), true);
    assert.match(config.production?.playableLoop ?? "", /accelerate/i);
    assert.match(config.production?.objective ?? "", /checkpoint/i);
    assert.equal(config.production?.proofCommands?.some((command) => command.includes("tn playtest") && command.includes("--expect-moved")), true);
    assert.equal(config.production?.proofCommands?.some((command) => command.includes("tn game qa") && command.includes("--run-proof")), true);
    assert.equal(config.production?.agent?.sourceShape?.scene?.includes("content/scenes/rally.scene.json"), true);
    assert.equal(config.production?.agent?.highValueSurfaces?.some((surface) => surface.id === "playerHero" && surface.provenanceStatus === "local-file"), true);
    assert.equal(config.production?.agent?.scriptModules?.some((script) => script.module === "src/scripts/racing.ts" && script.export === "updateRally"), true);

    const sceneDoc = await readFile(join(payload.path, "content/scenes/rally.scene.json"), "utf8");
    const systemDoc = await readFile(join(payload.path, "content/systems/rally.systems.json"), "utf8");
    const scriptSource = await readFile(join(payload.path, "src/scripts/racing.ts"), "utf8");
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    assert.match(sceneDoc, /"id": "player\.car"/);
    assert.match(sceneDoc, /"id": "start\.lights"/);
    assert.match(sceneDoc, /"id": "road\.modular\.000"/);
    assert.match(systemDoc, /"module": "src\/scripts\/racing\.ts"/);
    assert.match(scriptSource, /function updateCamera/);
    assert.match(scriptSource, /CHECKPOINTS/);
    assert.match(packageJson.scripts["game:plan"] ?? "", /tn game plan --goal/);
    assert.equal(packageJson.scripts["game:improve"], "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json");
    assert.equal(packageJson.scripts["game:qa"], "tn game qa --project . --run-proof --json");
    assert.equal(packageJson.scripts["game:release"], "tn game release --project . --json");
    await access(join(payload.path, "assets", "roadCornerLarge.glb"));
    await access(join(payload.path, "assets", "raceCarRed.glb"));

    const validate = await authoringCommand(["validate", "--project", payload.path, "--json"], { cwd: root });
    const validationPayload = JSON.parse(validate.stdout) as { code: string; ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validationPayload.code, "TN_AUTHORING_VALIDATE_OK");
    assert.equal(validationPayload.ok, true);
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
    assert.match(payload.message, /structured-source-starter/);
    assert.match(payload.message, /racing-kit-rally-starter/);
    assert.doesNotMatch(payload.message, /legacy aliases/i);
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

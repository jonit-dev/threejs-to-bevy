import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { authoringCommand } from "./authoring.js";
import { createProject, initProject } from "./create.js";
import { iterateCommand } from "./iterate.js";
import { uiCommand } from "./sourceDocuments.js";

test("should create minimal starter without gameplay residue", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-minimal-"));
  try {
    const result = await createProject(["minimal", "--template", "structured-source-minimal", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { path: string; template: string };
    assert.equal(result.exitCode, 0);
    assert.equal(payload.template, "structured-source-minimal");
    await assert.rejects(access(join(payload.path, "src/scripts/player.ts")));
    await assert.rejects(access(join(payload.path, "assets/goal-ping.wav")));
    assert.deepEqual(await readdir(join(payload.path, "playtests")), ["empty-scene-smoke.playtest.json"]);
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.equal("recipe:controller" in packageJson.scripts, false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should iterate green immediately after minimal create", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-minimal-iterate-"));
  try {
    const created = await createProject(["minimal", "--template", "structured-source-minimal", "--json"], { cwd: root });
    const project = (JSON.parse(created.stdout) as { path: string }).path;
    const result = await iterateCommand(["--project", project, "--json"], process.cwd(), {
      capture: async ({ outPath, url }) => ({ byteSize: 42, capturedAt: "2026-07-12T00:00:00.000Z", checks: { canvas: { height: 720, ok: true, width: 1280 } }, diagnostics: [], outPath, runtimeReady: { ok: true }, url, viewport: { height: 720, width: 1280 } }),
      playtest: async () => ({ exitCode: 0, stdout: `${JSON.stringify({ artifacts: { directory: "artifacts/playtest/empty-scene-smoke", summary: "artifacts/playtest/empty-scene-smoke/summary.json" }, assertions: [], code: "TN_PLAYTEST_OK", diagnostics: [], pass: true, scenario: "empty-scene-smoke", schema: "threenative.playtest-summary" })}\n` }),
      startPreview: async () => ({ close: async () => undefined, url: "http://127.0.0.1:1" }),
    });
    const payload = JSON.parse(result.stdout) as { code: string; ok: boolean };
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.code, "TN_ITERATE_OK");
    assert.equal(payload.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create starter template files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-"));
  try {
    const result = await createProject(["my-game", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; nextCommands: string[]; path: string; planningInstructions: string; referenceDocs: string[]; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "structured-source-starter");
    assert.equal(payload.planningInstructions, "AGENT_GAME_PLAN.md");
    assert.equal(payload.nextCommands.includes("pnpm run dev:web"), true);
    assert.equal(payload.nextCommands.includes("pnpm run iterate"), true);
    assert.equal(payload.nextCommands.includes("pnpm run game:plan"), true);
    assert.equal(payload.referenceDocs.includes("AGENT_GAME_PLAN.md"), true);
    assert.equal(payload.referenceDocs.includes("tn help scaffold"), true);
    assert.deepEqual((payload as { agentSkills?: string[] }).agentSkills, [".claude/skills/threenative-workflow/SKILL.md", ".codex/skills/threenative-workflow/SKILL.md"]);

    const files = await readdir(payload.path);
    assert.equal(files.includes(".gitignore"), true);
    assert.equal(files.includes("AGENTS.md"), true);
    assert.equal(files.includes("AGENT_GAME_PLAN.md"), true);
    assert.equal(files.includes("CLAUDE.md"), true);
    assert.equal(files.includes(".claude"), true);
    assert.equal(files.includes(".codex"), true);
    assert.equal(files.includes("bin"), true);
    assert.equal(files.includes("README.md"), true);
    assert.equal(files.includes("dist"), false);
    assert.equal(files.includes("package.json"), true);
    assert.equal(files.includes("content"), true);
    assert.equal(files.includes("src"), true);
    assert.equal(files.includes("threenative.config.json"), true);
    await access(join(payload.path, "assets", "goal-ping.wav"));
    await access(join(payload.path, ".threenative", "cli", "index.js"));
    await access(join(payload.path, "bin", "tn"));
    const agentSkillNames = ["threenative-workflow", "threenative-authoring", "threenative-game-quality", "threenative-verify"];
    for (const skillName of agentSkillNames) {
      const claudeSkillBody = await readFile(join(payload.path, ".claude", "skills", skillName, "SKILL.md"), "utf8");
      const codexSkillBody = await readFile(join(payload.path, ".codex", "skills", skillName, "SKILL.md"), "utf8");
      assert.equal(claudeSkillBody, codexSkillBody);
    }
    await assert.rejects(access(join(payload.path, "dist")));

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      entry: string;
      template: string;
    };
    assert.equal(config.entry, "content/scenes/arena.scene.json");
    assert.equal(config.template, "structured-source-starter");
    await assert.rejects(access(join(payload.path, "src", "game.ts")));
    const runtime = JSON.parse(await readFile(join(payload.path, "content", "runtime", "default.runtime.json"), "utf8")) as {
      renderer?: { renderLook?: { overrides?: Record<string, unknown>; profile?: string; version?: number } };
    };
    assert.deepEqual(runtime.renderer?.renderLook, {
      version: 1,
      profile: "cinematic",
    });

    const agentInstructions = await readFile(join(payload.path, "AGENTS.md"), "utf8");
    const planningInstructions = await readFile(join(payload.path, "AGENT_GAME_PLAN.md"), "utf8");
    const claudeInstructions = await readFile(join(payload.path, "CLAUDE.md"), "utf8");
    const codexSkill = await readFile(join(payload.path, ".codex", "skills", "threenative-workflow", "SKILL.md"), "utf8");
    assert.match(agentInstructions, /tn scene \.\.\. --json/);
    assert.match(agentInstructions, /Do not edit them as the fix/);
    assert.match(agentInstructions, /AGENT_GAME_PLAN\.md/);
    assert.match(planningInstructions, /tn asset source search --game-category <category> --format glb --direct-only --json/);
    assert.match(planningInstructions, /Player\/hero/);
    assert.match(planningInstructions, /Audio feedback/);
    assert.match(planningInstructions, /React webview UI/);
    assert.match(planningInstructions, /tn game release --project \. --json/);
    assert.match(claudeInstructions, /Use `AGENTS\.md`/);
    assert.match(codexSkill, /Use `AGENTS\.md` as the authoritative local instructions/);
    assert.match(codexSkill, /pnpm tn -- iterate --project \. --json/);

    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts.tn, "node bin/tn");
    assert.equal(packageJson.scripts.validate, "tn validate");
    assert.equal(packageJson.scripts.build, "tn build");
    assert.equal(packageJson.scripts["dev:web"], "tn dev --target web");
    assert.equal(packageJson.scripts.iterate, "tn iterate --project . --json");
    assert.equal(packageJson.scripts.playtest, "tn playtest --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json");
    assert.equal(packageJson.scripts["playtest:archetype"], "tn playtest --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json");
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
    const tnHelp = spawnSync("pnpm", ["--silent", "--dir", payload.path, "tn", "--", "help", "--json"], {
      encoding: "utf8",
    });
    assert.equal(tnHelp.status, 0, `${tnHelp.stdout}\n${tnHelp.stderr}`);
    assert.match(tnHelp.stdout, /TN_HELP/);
    await access(join(payload.path, "playtests", "smoke-movement.playtest.json"));
    await access(join(payload.path, "playtests", "camera-follow.playtest.json"));
    await access(join(payload.path, "playtests", "hud-resource.playtest.json"));
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

test("should create selectable game archetype scaffolds with probe metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-archetype-"));
  try {
    const cases = [
      ["top-down", "updateTopDownArchetype"],
      ["third-person", "updateThirdPersonArchetype"],
      ["first-person", "updateFirstPersonArchetype"],
      ["side-scroller", "updateSideScrollerArchetype"],
      ["racing", "updateRacingArchetype"],
    ] as const;
    for (const [archetype, exportName] of cases) {
      const result = await createProject([`game-${archetype}`, "--archetype", archetype, "--json"], { cwd: root });
      const payload = JSON.parse(result.stdout) as { archetype?: string; archetypeProbe?: string; code: string; path: string };
      const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
        production?: {
          agent?: { archetype?: { id?: string; probe?: string; script?: { exportName?: string; module?: string } }; sourceShape?: Record<string, string[]> };
          archetype?: string;
          archetypeSource?: string;
          lookProfile?: { camera?: string };
          proofCommands?: string[];
        };
      };
      const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as { scripts: Record<string, string> };
      const archetypeDoc = JSON.parse(await readFile(join(payload.path, "content", "archetypes", `${archetype}.archetype.json`), "utf8")) as {
        id: string;
        lookProfile?: { camera?: string };
        probe?: { path?: string; press?: string };
        script?: { exportName?: string; module?: string };
      };
      const probe = JSON.parse(await readFile(join(payload.path, payload.archetypeProbe ?? ""), "utf8")) as {
        assert?: { movement?: { entity?: string } };
        name: string;
        steps: Array<{ press?: string }>;
      };
      const scriptSource = await readFile(join(payload.path, "src", "scripts", "archetype.ts"), "utf8");

      assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(payload.code, "TN_CREATE_OK");
      assert.equal(payload.archetype, archetype);
      assert.equal(config.production?.archetype, archetype);
      assert.equal(config.production?.agent?.archetype?.id, archetype);
      assert.equal(config.production?.agent?.sourceShape?.archetypes?.includes(`content/archetypes/${archetype}.archetype.json`), true);
      assert.equal(config.production?.proofCommands?.some((command) => command.includes(payload.archetypeProbe ?? "")), true);
      assert.equal(packageJson.scripts["playtest:archetype"], `tn playtest --scenario ${payload.archetypeProbe} --stable-artifacts --json`);
      assert.equal(archetypeDoc.id, archetype);
      assert.equal(archetypeDoc.script?.exportName, exportName);
      assert.equal(archetypeDoc.probe?.path, payload.archetypeProbe);
      assert.equal(typeof archetypeDoc.lookProfile?.camera, "string");
      assert.equal(probe.assert?.movement?.entity, "player");
      assert.equal(probe.steps[0]?.press, "KeyD");
      assert.match(scriptSource, new RegExp(`export function ${exportName}`));
    }
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
      planningInstructions: string;
      referenceDocs: string[];
      template: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.command, "init");
    assert.equal(payload.template, "structured-source-starter");
    assert.equal(payload.planningInstructions, "AGENT_GAME_PLAN.md");
    assert.deepEqual(payload.nextCommands, ["pnpm install", "pnpm run game:plan", "pnpm run validate", "pnpm run build", "pnpm run iterate", "pnpm run dev:web", "pnpm run verify"]);
    assert.equal(payload.referenceDocs.includes("AGENT_GAME_PLAN.md"), true);
    assert.equal(payload.referenceDocs.includes("docs/workflows/developer-workflow.md"), true);

    const files = await readdir(payload.path);
    const planningInstructions = await readFile(join(payload.path, "AGENT_GAME_PLAN.md"), "utf8");
    assert.equal(files.includes("package.json"), true);
    assert.equal(files.includes("AGENT_GAME_PLAN.md"), true);
    assert.equal(files.includes("threenative.config.json"), true);
    assert.match(planningInstructions, /Complete this worksheet before creating or substantially changing game source/);
    assert.match(planningInstructions, /tn asset source get <asset-source-id> --json/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit workspace-safe install commands and typecheck a starter with a local helper import", async () => {
  const workspaceRoot = await mkdtemp(join(process.cwd(), ".tn-create-workspace-"));
  try {
    const result = await createProject([join(workspaceRoot, "my-game"), "--json"], { cwd: workspaceRoot });
    const payload = JSON.parse(result.stdout) as { code: string; nextCommands: string[]; path: string; workspace?: { installCommand: string; root: string } };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.nextCommands[0], "pnpm install --ignore-workspace");
    assert.deepEqual(payload.workspace, {
      installCommand: "pnpm install --ignore-workspace",
      root: resolve(process.cwd(), "../.."),
    });
    assert.match(await readFile(join(payload.path, "src", "scripts", "player.ts"), "utf8"), /from "\.\/lib\/movement"/u);
    await access(join(payload.path, "src", "scripts", "lib", "movement.ts"));

    const install = spawnSync("pnpm", ["install", "--ignore-workspace"], {
      cwd: payload.path,
      encoding: "utf8",
    });
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);
    const typecheck = spawnSync("pnpm", ["run", "typecheck"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("should print explicit first-project next commands in human output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-human-"));
  try {
    const result = await createProject(["my-game"], { cwd: root });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /pnpm install/);
    assert.match(result.stdout, /AGENT_GAME_PLAN\.md/);
    assert.match(result.stdout, /pnpm run game:plan/);
    assert.match(result.stdout, /pnpm run validate/);
    assert.match(result.stdout, /pnpm run build/);
    assert.match(result.stdout, /pnpm run iterate/);
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
    assert.match(systemDoc, /"source": "behavior-metadata"/);
    assert.doesNotMatch(systemDoc, /"writes": \[\s*"Transform"\s*\]/);
    assert.match(scriptSource, /movePlayerToGoal/);
    assert.match(scriptSource, /@threenative\/script-stdlib/);
    assert.match(scriptSource, /defineBehavior/);
    assert.match(scriptSource, /writes: \["Transform"\]/);
    assert.match(scriptSource, /context\.time\.fixedDelta/);
    assert.match(scriptSource, /entity\.transform\(\)/);
    assert.match(readme, /content\/\*\*\/\*\.json/);
    assert.match(readme, /src\/scripts\/\*\*\/\*\.ts/);
    assert.match(readme, /@threenative\/authoring-client/);
    assert.match(readme, /pnpm run recipe:controller/);
    await access(join(payload.path, "assets", "goal-ping.wav"));
    await access(join(payload.path, "AGENT_GAME_PLAN.md"));
    await access(join(payload.path, "playtests", "smoke-movement.playtest.json"));
    await access(join(payload.path, "playtests", "camera-follow.playtest.json"));
    await access(join(payload.path, "playtests", "hud-resource.playtest.json"));
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

test("should create typed-spec authoring starter as opt-in mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-typed-spec-"));
  try {
    const result = await createProject(["typed", "--template", "structured-source-starter", "--authoring", "typed-spec", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { authoring: string; code: string; path: string; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.authoring, "typed-spec");
    assert.equal(payload.template, "structured-source-starter");

    const specSource = await readFile(join(payload.path, "src/game.spec.ts"), "utf8");
    assert.match(specSource, /defineTypedGameSpec/);

    const config = JSON.parse(await readFile(join(payload.path, "threenative.config.json"), "utf8")) as {
      outDir: string;
      production?: {
        agent?: { sourceShape?: { typedSpec?: string }; proofCommands?: string[] };
        authoringMode?: string;
        proofCommands?: string[];
      };
    };
    assert.equal(config.outDir, "dist/typed-spec-starter.bundle");
    assert.equal(config.production?.authoringMode, "typed-spec");
    assert.equal(config.production?.agent?.sourceShape?.typedSpec, "src/game.spec.ts");
    assert.equal(config.production?.proofCommands?.[0], "tn authoring compile-typed-spec --project . --json");

    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.equal(packageJson.scripts["authoring:compile"], "pnpm tn -- authoring compile-typed-spec --json");
    assert.equal(packageJson.scripts.build, "pnpm tn -- authoring compile-typed-spec --json && pnpm tn -- build");
    assert.equal(packageJson.scripts.validate, "pnpm tn -- authoring compile-typed-spec --json && pnpm tn -- validate");

    await access(join(payload.path, "content/scenes/arena.scene.json"));
    await access(join(payload.path, "content/input/arena.input.json"));
    await access(join(payload.path, "content/materials/game-materials.materials.json"));

    const compile = await authoringCommand(["compile-typed-spec", "--project", payload.path, "--json"], { cwd: root });
    const compilePayload = JSON.parse(compile.stdout) as { code: string; documents: Array<{ path: string }> };
    assert.equal(compile.exitCode, 0);
    assert.equal(compilePayload.code, "TN_AUTHORING_TYPED_SPEC_COMPILED");
    assert.equal(compilePayload.documents.some((document) => document.path === "content/scenes/arena.scene.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create racing kit rally starter with reusable race scene structure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-racing-kit-"));
  try {
    const result = await createProject(["rally", "--template", "racing-kit-rally-starter", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string; planningInstructions: string; referenceDocs?: string[]; template: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_CREATE_OK");
    assert.equal(payload.template, "racing-kit-rally-starter");
    assert.equal(payload.planningInstructions, "AGENT_GAME_PLAN.md");
    assert.equal(payload.referenceDocs?.includes("AGENT_GAME_PLAN.md"), true);

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
    assert.equal(config.production?.proofCommands?.some((command) => command.includes("tn playtest") && command.includes("--scenario playtests/rally-throttle.playtest.json")), true);
    assert.equal(config.production?.proofCommands?.some((command) => command.includes("tn game qa") && command.includes("--run-proof")), true);
    assert.equal(config.production?.agent?.sourceShape?.scene?.includes("content/scenes/rally.scene.json"), true);
    assert.equal(config.production?.agent?.highValueSurfaces?.some((surface) => surface.id === "playerHero" && surface.provenanceStatus === "local-file"), true);
    assert.equal(config.production?.agent?.scriptModules?.some((script) => script.module === "src/scripts/racing.ts" && script.export === "updateRally"), true);

    const sceneDoc = await readFile(join(payload.path, "content/scenes/rally.scene.json"), "utf8");
    const systemDoc = await readFile(join(payload.path, "content/systems/rally.systems.json"), "utf8");
    const scriptSource = await readFile(join(payload.path, "src/scripts/racing.ts"), "utf8");
    const planningInstructions = await readFile(join(payload.path, "AGENT_GAME_PLAN.md"), "utf8");
    const packageJson = JSON.parse(await readFile(join(payload.path, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    assert.match(sceneDoc, /"id": "player\.car"/);
    assert.match(sceneDoc, /"id": "start\.lights"/);
    assert.match(sceneDoc, /"id": "road\.modular\.000"/);
    assert.match(systemDoc, /"module": "src\/scripts\/racing\.ts"/);
    assert.match(scriptSource, /function updateCamera/);
    assert.match(scriptSource, /CHECKPOINTS/);
    assert.match(planningInstructions, /tn asset source search --game-category <category> --format glb --direct-only --json/);
    assert.match(planningInstructions, /High-Value Surface Inventory/);
    assert.match(planningInstructions, /tn model-test assets\/<model>\.glb --json/);
    assert.equal(packageJson.scripts.tn, "node bin/tn");
    assert.match(packageJson.scripts["game:plan"] ?? "", /tn game plan --goal/);
    assert.equal(packageJson.scripts["game:improve"], "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json");
    assert.equal(packageJson.scripts["game:qa"], "tn game qa --project . --run-proof --json");
    assert.equal(packageJson.scripts["game:release"], "tn game release --project . --json");
    await access(join(payload.path, "assets", "roadCornerLarge.glb"));
    await access(join(payload.path, "assets", "raceCarRed.glb"));
    await access(join(payload.path, "bin", "tn"));
    await access(join(payload.path, ".codex", "skills", "threenative-workflow", "SKILL.md"));
    await access(join(payload.path, ".claude", "skills", "threenative-workflow", "SKILL.md"));
    await access(join(payload.path, "playtests", "smoke-movement.playtest.json"));
    await access(join(payload.path, "playtests", "camera-follow.playtest.json"));
    await access(join(payload.path, "playtests", "hud-resource.playtest.json"));

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

test("should reject unknown archetype with canonical options", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-create-unknown-archetype-"));
  try {
    const result = await createProject(["game", "--archetype", "isometric", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; message: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_CREATE_ARCHETYPE_UNSUPPORTED");
    assert.match(payload.message, /top-down/);
    assert.match(payload.message, /racing/);
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

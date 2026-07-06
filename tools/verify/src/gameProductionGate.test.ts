import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runGameProductionGate } from "./gameProductionGate.js";
import {
  cleanAssetAudioLedgerRows,
  cleanPersistedQualitySections,
  cleanProductionCommandRows,
  currentTestSourceHash,
  validGamePlan,
  validGameplayBlock,
  writeGameplaySystemSource,
  writeMaterialSource,
  writeUiSource,
} from "./gameProductionGateTestUtils.js";

test("fails release when required artifacts are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-production-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({ projectPath: ".", reportPath, root });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      ok: boolean;
      report: { diagnostics: Array<{ code: string }> };
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_SCREENSHOT_EVIDENCE_MISSING"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_PLAYABLE_LOOP_MISSING"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_RELEASE_BUILD_PROOF_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires visual-quality proof for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      reports: Array<{ projectPath: string }>;
      summary: {
        failedProjectCount: number;
        mode: string;
        okProjectCount: number;
        projectCount: number;
        projectPaths: string[];
        requiredProofCounts: { visualQuality: number };
      };
      steps: Array<{ name: string }>;
    };

    assert.equal(result.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_MISSING"), true);
    assert.equal(report.reports.length, 1);
    assert.deepEqual(report.summary, {
      failedProjectCount: 1,
      mode: "custom",
      okProjectCount: 0,
      projectCount: 1,
      projectPaths: ["."],
      requiredProofCounts: { visualQuality: 1 },
    });
    assert.equal(report.steps.some((step) => step.name.includes("game production report validation")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("fails when a generated game lacks agent inventory source owners", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-agent-inventory-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireAgentInventory: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      steps: Array<{ stdout: string }>;
      summary: { requiredProofCounts: { agentInventory: number } };
    };

    assert.equal(result.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_AGENT_INVENTORY_SOURCE_OWNER_MISSING" && diagnostic.path === "content/systems"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_AGENT_INVENTORY_SCRIPT_OWNER_MISSING"), true);
    assert.equal(report.summary.requiredProofCounts.agentInventory, 1);
    assert.equal(report.steps.some((step) => JSON.parse(step.stdout).requireAgentInventory === true), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game aggregate inventory drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-inventory-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "examples/new-random-game/artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "examples/new-random-game/artifacts/game-production/plan.json"), `${JSON.stringify({ schema: "threenative.game-plan", mutate: false }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      generatedGames: true,
      projects: [{ projectPath: "." }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; message: string; path?: string }>;
      ok: boolean;
      summary: { mode: string };
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.summary.mode, "generated-games");
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GENERATED_GAME_INVENTORY_DRIFT" && diagnostic.message.includes("examples/new-random-game")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game README references to missing package scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-readme-script-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "examples/readme-script-game"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "examples/readme-script-game/package.json"), `${JSON.stringify({ scripts: { build: "tn build" } }, null, 2)}\n`);
    await writeFile(join(root, "examples/readme-script-game/README.md"), "Useful commands:\n\n```bash\npnpm run game:qa\n```\n");
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      generatedGames: true,
      projects: [{ projectPath: "." }, { projectPath: "examples/readme-script-game" }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GENERATED_GAME_README_SCRIPT_MISSING" && diagnostic.message.includes("game:qa")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires production plan artifact for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      steps: Array<{ stdout: string }>;
    };

    assert.equal(result.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_MISSING"), true);
    assert.equal(report.steps.some((step) => JSON.parse(step.stdout).requirePlanArtifact === true), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects invalid production plan artifacts for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-invalid-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({ schema: "threenative.game-plan", mutate: true }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects incomplete production plan artifacts for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-incomplete-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      schema: "threenative.game-plan",
      mutate: false,
      design: { objective: "collect things" },
      assetPlan: [{ surface: "player-hero", sourcePreference: "primitive", fallback: "box" }],
      sourcePlan: [],
      scriptPlan: [],
      polishPlan: [],
      proofCommands: [],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_DESIGN_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_SURFACES_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_CATALOG_SEARCH_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_SOURCE_SHAPE_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_SCRIPT_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_POLISH_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_PROOF_COMMANDS_INCOMPLETE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects production plan artifacts without UI and material source-shape guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-source-docs-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const plan = validGamePlan();
    plan.sourcePlan = [
      { document: "scene", path: "content/scenes/arena.scene.json", supportedShape: ["entities, prefabs, resources, systems"] },
      { document: "input", path: "content/input/arena.input.json", supportedShape: ["keyboard.KeyW and action bindings"] },
      { document: "systems", path: "content/systems/arena.systems.json", supportedShape: ["Declare every component/resource read and write"] },
      { document: "assets", path: "content/assets/arena.assets.json", supportedShape: ["asset uri/kind/provenance records"] },
    ];
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_SOURCE_SHAPE_INCOMPLETE" && diagnostic.message.includes("ui") && diagnostic.message.includes("materials")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects production plan artifacts without full proof command guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-proof-commands-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const plan = validGamePlan();
    plan.proofCommands = [
      "tn game qa --project . --run-proof --json",
      "tn game release --project . --json",
    ];
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_PROOF_COMMANDS_INCOMPLETE" && diagnostic.message.includes("build") && diagnostic.message.includes("playtest") && diagnostic.message.includes("screenshot")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve gameplay block plan evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-gameplay-blocks-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const plan = validGamePlan();
    plan.gameplayBlocks = [
      validGameplayBlock("basis.y-up-z-forward", "basis"),
      validGameplayBlock("controller.world-cardinal-character", "controller"),
    ];
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_GAMEPLAY_BLOCKS_INVALID"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects malformed gameplay block plan evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-gameplay-blocks-invalid-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const plan = validGamePlan();
    plan.gameplayBlocks = [
      { id: "controller.world-cardinal-character", kind: "controller", source: "gameblocks-inspired" },
    ];
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_GAMEPLAY_BLOCKS_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects production plan artifacts without generated-game acceptance criteria", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-acceptance-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const plan = validGamePlan();
    plan.acceptanceCriteria = [];
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_ACCEPTANCE_INCOMPLETE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts complete production plan artifacts for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-plan-complete-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify(validGamePlan(), null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requirePlanArtifact: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_PLAN_")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires visual provenance for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-provenance-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena", entities: [] }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualProvenance: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_PROVENANCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts source visual provenance for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-provenance-ok-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      schema: "threenative.scene",
      id: "arena",
      entities: [{
        id: "visual.provenance",
        components: {
          VisualProvenance: {
            catalogSearches: "arcade direct GLB search returned TN_ASSET_SOURCE_NO_MATCH",
            fallback: "custom-authored low-poly kit using durable structured-source primitive compositions",
            surfaces: "player-hero, obstacle-enemy, reward-interactable, world-environment, ui-hud, audio-feedback",
          },
        },
      }],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualProvenance: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_PROVENANCE_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires gameplay source declarations for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-gameplay-source-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireGameplaySource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_GAMEPLAY_SOURCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects gameplay source declarations with missing script modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-gameplay-source-script-gate-"));
  try {
    await writeGameplaySystemSource(root, "src/scripts/player.ts", "arenaGameSystem");
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireGameplaySource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_GAMEPLAY_SCRIPT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects gameplay source declarations with missing script exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-gameplay-source-export-gate-"));
  try {
    await writeGameplaySystemSource(root, "src/scripts/player.ts", "arenaGameSystem");
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/player.ts"), "export function otherSystem() { return undefined; }\n");
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireGameplaySource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_GAMEPLAY_SCRIPT_EXPORT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts gameplay source declarations backed by script exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-gameplay-source-ok-gate-"));
  try {
    await writeGameplaySystemSource(root, "src/scripts/player.ts", "arenaGameSystem");
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/player.ts"), "export function arenaGameSystem() { return undefined; }\n");
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireGameplaySource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_GAMEPLAY_")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires authored material source for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-material-source-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireMaterialSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_MATERIAL_SOURCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects weak authored material source for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-material-source-weak-gate-"));
  try {
    await writeMaterialSource(root, [{ id: "mat.placeholder", color: "#888888" }]);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireMaterialSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_MATERIAL_SOURCE_WEAK"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts authored material source with varied colors and roughness", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-material-source-ok-gate-"));
  try {
    await writeMaterialSource(root);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireMaterialSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_MATERIAL_SOURCE")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires retained UI source for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-ui-source-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireUiSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_UI_SOURCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects retained UI source without gameplay state bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-ui-source-weak-gate-"));
  try {
    await writeUiSource(root, { bindings: [] });
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireUiSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_UI_SOURCE_WEAK"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects retained UI source without required UI state affordances", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-ui-state-source-gate-"));
  try {
    await writeUiSource(root, {
      nodes: [
        { id: "score", text: "Score 0" },
        { id: "status", text: "Ready" },
        { id: "timer", text: "60" },
        { id: "pause", text: "Paused" },
        { id: "settings", text: "Settings" },
        { id: "loading", text: "Loading" },
      ],
    });
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireUiSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_UI_SOURCE_STATES_INCOMPLETE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts retained UI source with text nodes and gameplay state bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-ui-source-ok-gate-"));
  try {
    await writeUiSource(root);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireUiSource: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_UI_SOURCE")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires persisted release report for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects dirty persisted release reports for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-dirty-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [{ code: "TN_GAME_BLOCKED" }],
      diagnostics: [],
      release: { risks: [] },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_NOT_CLEAN"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts clean persisted release reports for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-clean-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      ...cleanPersistedQualitySections(),
      assetAudioLedger: cleanAssetAudioLedgerRows(),
      productionCommands: cleanProductionCommandRows(),
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_RELEASE_REPORT_")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted release reports with incomplete quality sections", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-quality-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      ...cleanPersistedQualitySections({ scorecardScore: 2 }),
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_QUALITY_INCOMPLETE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted release reports with missing production command artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-command-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      ...cleanPersistedQualitySections(),
      productionCommands: [{ command: "tn doctor --project . --json", description: "doctor", phase: "debug", status: "missing-artifact" }],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_COMMAND_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted release reports with artifact-only asset ledger evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-asset-ledger-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), "png");
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      ...cleanPersistedQualitySections(),
      assetAudioLedger: cleanAssetAudioLedgerRows({ artifactOnlySurface: "player-hero" }),
      productionCommands: cleanProductionCommandRows(),
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_ASSET_LEDGER_INCOMPLETE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted release reports with stale evidence paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-evidence-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [],
      diagnostics: [],
      evidence: [{ kind: "artifact", path: "artifacts/game-production/missing.png" }],
      release: { risks: [] },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_EVIDENCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted release reports with stale nested scorecard evidence paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-report-scorecard-evidence-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/release-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "release",
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      scorecard: [{
        id: "art-direction",
        score: 3,
        evidence: [{ kind: "artifact", path: "artifacts/game-production/missing-scorecard.png" }],
      }],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireReleaseReport: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_RELEASE_REPORT_EVIDENCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});


test("requires QA proof report for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      ok: boolean;
      steps: Array<{ stdout: string }>;
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_MISSING"), true);
    assert.equal(report.steps.some((step) => JSON.parse(step.stdout).requireQaProof === true), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA reports without a passing proof run", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-proof-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({ ok: true, proofRun: { ok: false } }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; path?: string }>;
      ok: boolean;
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_NOT_PASSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA reports without persisted qa report shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-shape-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({ ok: true, proofRun: { ok: true, steps: [] } }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects dirty persisted QA reports for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-dirty-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "qa",
      ok: true,
      blockers: [],
      diagnostics: [{ code: "TN_GAME_QA_DIRTY" }],
      release: { risks: [] },
      proofRun: { ok: true, steps: [] },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_NOT_CLEAN"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted QA reports with stale evidence paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-evidence-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "qa",
      ok: true,
      blockers: [],
      diagnostics: [],
      evidence: [{ kind: "artifact", path: "artifacts/game-production/missing.png" }],
      release: { risks: [] },
      proofRun: { ok: true, steps: [] },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_EVIDENCE_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted QA reports with stale nested phase and UI evidence paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-nested-evidence-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "qa",
      ok: true,
      blockers: [],
      diagnostics: [],
      phaseLedgers: [{
        id: "visuals",
        evidence: [{ kind: "artifact", path: "artifacts/game-production/missing-phase.png" }],
      }],
      release: { risks: [] },
      proofRun: { ok: true, steps: [] },
      uiStates: [{
        id: "gameplay",
        present: true,
        evidence: [{ kind: "artifact", path: "artifacts/game-production/missing-ui.png" }],
      }],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_EVIDENCE_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted QA reports with incomplete quality sections", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-quality-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "qa",
      ok: true,
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      proofRun: { ok: true, steps: [] },
      ...cleanPersistedQualitySections({ uiPresent: false }),
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_QUALITY_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted QA reports with missing production command artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-command-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "qa",
      ok: true,
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      proofRun: { ok: true, steps: [] },
      ...cleanPersistedQualitySections(),
      productionCommands: [{ artifactPath: "artifacts/game-production/missing-doctor.json", command: "tn doctor --project . --json", description: "doctor", phase: "debug", status: "available" }],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_COMMAND_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects persisted QA reports with artifact-only asset ledger evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-asset-ledger-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), "png");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      schema: "threenative.game-quality-report",
      mode: "qa",
      ok: true,
      blockers: [],
      diagnostics: [],
      release: { risks: [] },
      proofRun: { ok: true, steps: [] },
      ...cleanPersistedQualitySections(),
      assetAudioLedger: cleanAssetAudioLedgerRows({ artifactOnlySurface: "ui-hud" }),
      productionCommands: cleanProductionCommandRows(),
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_REPORT_ASSET_LEDGER_INCOMPLETE"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA reports without required proof steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-steps-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({ ok: true, proofRun: { ok: true, steps: [] } }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; message: string; path?: string }>;
      ok: boolean;
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING" && diagnostic.message.includes("playtest")), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING" && diagnostic.message.includes("record")), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING" && diagnostic.message.includes("mobile-viewport")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA reports with failed required proof steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-qa-step-failed-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 1 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; message: string; path?: string }>;
      ok: boolean;
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PROOF_STEP_FAILED" && diagnostic.message.includes("playtest")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA playtest proof without input-driven movement", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-playtest-proof-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "artifacts/playtest"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/motion.webm"), "webm");
    await writeFile(join(root, "artifacts/playtest/player-KeyD.png"), "png");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          {
            id: "playtest",
            exitCode: 0,
            code: "TN_PLAYTEST_OK",
            stdout: `${JSON.stringify({
              artifact: join(root, "artifacts/playtest/player-KeyD.png"),
              distance: 0,
              expectMoved: true,
              movementDelta: [0, 0, 0],
              movementThreshold: 0.01,
              pass: true,
            })}\n`,
          },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_PLAYTEST_PROOF_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game proof with only ephemeral playtest coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-ephemeral-playtest-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        scenarioCoverage: {
          kind: "ephemeral",
          scenarios: [{ assertions: ["movement"], kind: "ephemeral", scenario: "player-KeyD", status: "passed", stepId: "playtest" }],
        },
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_SCENARIO_COVERAGE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects stale scenario proof sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-stale-scenario-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "playtests"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "artifacts/playtest/smoke/latest"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "playtests/smoke.playtest.json"), `${JSON.stringify({ schemaVersion: 1, name: "smoke", subject: "player", steps: [{ press: "KeyD" }] }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/playtest/smoke/latest/summary.json"), "{}\n");
    await writeFile(join(root, "artifacts/playtest/smoke/latest/manifest.json"), `${JSON.stringify({ scenario: "smoke", pass: true }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        scenarioCoverage: {
          kind: "committed",
          scenarios: [{
            artifactDirectory: "artifacts/playtest/smoke/latest",
            assertions: ["movement"],
            kind: "committed",
            manifest: "artifacts/playtest/smoke/latest/manifest.json",
            path: "playtests/smoke.playtest.json",
            proofSourceHash: "stale",
            reproduceCommand: "tn playtest --project . --scenario playtests/smoke.playtest.json --stable-artifacts --json",
            scenario: "smoke",
            status: "passed",
            stepId: "playtest:smoke",
            summary: "artifacts/playtest/smoke/latest/summary.json",
          }],
        },
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest:smoke", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_SCENARIO_PROOF_STALE" && diagnostic.suggestedFix?.includes("playtests/smoke.playtest.json")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts committed scenario proof with fresh manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-fresh-scenario-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "playtests"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "artifacts/playtest/smoke/latest"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "playtests/smoke.playtest.json"), `${JSON.stringify({ schemaVersion: 1, name: "smoke", subject: "player", steps: [{ press: "KeyD" }] }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/playtest/smoke/latest/summary.json"), "{}\n");
    await writeFile(join(root, "artifacts/playtest/smoke/latest/manifest.json"), `${JSON.stringify({ scenario: "smoke", pass: true }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        scenarioCoverage: {
          kind: "committed",
          scenarios: [{
            artifactDirectory: "artifacts/playtest/smoke/latest",
            assertions: ["movement"],
            kind: "committed",
            manifest: "artifacts/playtest/smoke/latest/manifest.json",
            path: "playtests/smoke.playtest.json",
            proofSourceHash: await currentTestSourceHash(root),
            reproduceCommand: "tn playtest --project . --scenario playtests/smoke.playtest.json --stable-artifacts --json",
            scenario: "smoke",
            status: "passed",
            stepId: "playtest:smoke",
            summary: "artifacts/playtest/smoke/latest/summary.json",
          }],
        },
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest:smoke", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_QA_SCENARIO_")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA reports without real motion proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-motion-proof-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_MISSING" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      diagnostics: Array<{ code: string; message: string; path?: string }>;
      ok: boolean;
    };

    assert.equal(result.ok, false);
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_MOTION_PROOF_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA artifact-ok motion steps without the motion file", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-motion-artifact-ok-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_MOTION_PROOF_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts generated-game QA reports with direct record proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-record-proof-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/motion.webm"), "webm");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          {
            id: "record",
            exitCode: 0,
            code: "TN_RECORD_OK",
            stdout: `${JSON.stringify({ outPath: join(root, "artifacts/game-production/motion.webm") })}\n`,
          },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_MOTION_PROOF_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires generated-game QA proof sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-sidecar-missing-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/motion.webm"), "webm");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PERFORMANCE_PROOF_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_ASSET_BUDGET_PROOF_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_UI_FIT_PROOF_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects invalid generated-game QA proof sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-sidecar-invalid-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/motion.webm"), "webm");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/performance.json"), `${JSON.stringify({
      schema: "threenative.game-performance-proof",
      status: "pass",
      evidence: {
        distDirectory: false,
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/asset-budget.json"), `${JSON.stringify({
      schema: "threenative.game-asset-budget-proof",
      status: "pass",
      budgets: {
        assetBytes: 10,
        contentBytes: 10,
        distBytes: 10,
      },
      measurements: {
        assets: { byteSize: 0 },
        content: { byteSize: 0 },
        dist: { byteSize: 20, exists: true },
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/ui-fit.json"), `${JSON.stringify({
      schema: "threenative.game-ui-fit-proof",
      status: "pass",
      viewport: {
        height: 667,
        preset: "mobile",
        width: 375,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PERFORMANCE_PROOF_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_ASSET_BUDGET_PROOF_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_UI_FIT_PROOF_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts valid generated-game QA proof sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-sidecar-valid-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/motion.webm"), "webm");
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), "png");
    await writeFile(join(root, "artifacts/game-production/mobile-viewport.png"), "png");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/performance.json"), `${JSON.stringify({
      schema: "threenative.game-performance-proof",
      status: "pass",
      evidence: {
        distDirectory: true,
        mobileViewport: { byteSize: 3, path: "artifacts/game-production/mobile-viewport.png" },
        screenshot: { byteSize: 3, path: "artifacts/game-production/screenshot.png" },
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/asset-budget.json"), `${JSON.stringify({
      schema: "threenative.game-asset-budget-proof",
      status: "pass",
      budgets: {
        assetBytes: 100,
        contentBytes: 100,
        distBytes: 100,
      },
      measurements: {
        assets: { byteSize: 10 },
        content: { byteSize: 10 },
        dist: { byteSize: 10, exists: true },
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/ui-fit.json"), `${JSON.stringify({
      schema: "threenative.game-ui-fit-proof",
      status: "pass",
      evidence: {
        mobileViewport: { byteSize: 3, path: "artifacts/game-production/mobile-viewport.png" },
      },
      viewport: {
        height: 667,
        preset: "mobile",
        width: 375,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_PERFORMANCE_PROOF_")), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_ASSET_BUDGET_PROOF_")), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_VERIFY_GAME_UI_FIT_PROOF_")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game QA sidecars with stale artifact byte sizes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-sidecar-size-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/motion.webm"), "webm");
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), "png");
    await writeFile(join(root, "artifacts/game-production/mobile-viewport.png"), "png");
    await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
      ok: true,
      proofRun: {
        ok: true,
        steps: [
          { id: "doctor", exitCode: 0 },
          { id: "build", exitCode: 0 },
          { id: "playtest", exitCode: 0 },
          { id: "screenshot", exitCode: 0 },
          { id: "mobile-viewport", exitCode: 0 },
          { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
          { id: "visual-quality", exitCode: 0 },
          { id: "performance", exitCode: 0 },
          { id: "asset-budget", exitCode: 0 },
          { id: "ui-fit", exitCode: 0 },
        ],
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/performance.json"), `${JSON.stringify({
      schema: "threenative.game-performance-proof",
      status: "pass",
      evidence: {
        distDirectory: true,
        mobileViewport: { byteSize: 999, path: "artifacts/game-production/mobile-viewport.png" },
        screenshot: { byteSize: 3, path: "artifacts/game-production/screenshot.png" },
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/asset-budget.json"), `${JSON.stringify({
      schema: "threenative.game-asset-budget-proof",
      status: "pass",
      budgets: {
        assetBytes: 100,
        contentBytes: 100,
        distBytes: 100,
      },
      measurements: {
        assets: { byteSize: 10 },
        content: { byteSize: 10 },
        dist: { byteSize: 10, exists: true },
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/ui-fit.json"), `${JSON.stringify({
      schema: "threenative.game-ui-fit-proof",
      status: "pass",
      evidence: {
        mobileViewport: { byteSize: 999, path: "artifacts/game-production/mobile-viewport.png" },
      },
      viewport: {
        height: 667,
        preset: "mobile",
        width: 375,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PERFORMANCE_PROOF_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_UI_FIT_PROOF_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

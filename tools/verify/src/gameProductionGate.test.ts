import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runGameProductionGate } from "./gameProductionGate.js";

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

test("requires visual-quality proof metrics for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-metrics-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_METRICS_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("summarizes generated-game visual metric ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-summary-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      metrics: {
        colorBucketCount: 42,
        height: 720,
        localContrastRatio: 0.018,
        nonblank: { changedPixelRatio: 0.97 },
        visibleBoundsAreaRatio: 0.33,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: false }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      summary: {
        visualQualityMetrics: {
          maxColorBucketCount: number;
          maxLocalContrastRatio: number;
          minColorBucketCount: number;
          minLocalContrastRatio: number;
          minNonblankRatio: number;
          minVisibleBoundsAreaRatio: number;
          projectCount: number;
        };
      };
    };

    assert.deepEqual(report.summary.visualQualityMetrics, {
      maxColorBucketCount: 42,
      maxLocalContrastRatio: 0.018,
      minColorBucketCount: 42,
      minLocalContrastRatio: 0.018,
      minNonblankRatio: 0.97,
      minVisibleBoundsAreaRatio: 0.33,
      projectCount: 1,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game visual-quality proof with weak metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-weak-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      metrics: {
        colorBucketCount: 4,
        height: 720,
        localContrastRatio: 0.002,
        nonblank: { changedPixelRatio: 0.2 },
        visibleBoundsAreaRatio: 0.02,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_NONBLANK_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_BOUNDS_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_COLOR_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_CONTRAST_LOW"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires generated-game visual-quality proof screenshot artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-screenshot-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics: {
        colorBucketCount: 64,
        height: 720,
        localContrastRatio: 0.02,
        nonblank: { changedPixelRatio: 1 },
        visibleBoundsAreaRatio: 1,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game visual-quality proof with stale screenshot dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-dimensions-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), minimalPngHeader(640, 480));
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics: {
        colorBucketCount: 64,
        height: 720,
        localContrastRatio: 0.02,
        nonblank: { changedPixelRatio: 1 },
        visibleBoundsAreaRatio: 1,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_DIMENSIONS_MISMATCH"), true);
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

function cleanPersistedQualitySections(options: { scorecardScore?: number; uiPresent?: boolean } = {}): Record<string, unknown> {
  const scorecardIds = [
    "art-direction",
    "hero-player",
    "obstacles-enemies",
    "rewards-interactables",
    "world-environment",
    "materials-textures",
    "lighting-render",
    "vfx-motion",
    "ui-hud",
    "performance",
  ];
  const phaseIds = ["gameplay", "assets", "visuals", "ui", "debug", "qa", "release"];
  const uiStateIds = ["gameplay", "pause", "settings", "loading", "fail-retry", "win-milestone", "touch-controls"];
  const scorecardScore = options.scorecardScore ?? 3;
  const uiPresent = options.uiPresent ?? true;
  return {
    phaseLedgers: phaseIds.map((id) => ({
      diagnostics: [],
      evidence: [],
      id,
      score: 1,
      status: "pass",
      summary: `${id} summary`,
    })),
    scorecard: scorecardIds.map((id) => ({
      evidence: [],
      id,
      score: scorecardScore,
    })),
    summary: {
      averageVisualScore: scorecardScore,
      blockers: 0,
      phasesPassed: phaseIds.length,
      totalPhases: phaseIds.length,
      uiStatesCovered: uiPresent ? uiStateIds.length : uiStateIds.length - 1,
    },
    uiStates: uiStateIds.map((id, index) => ({
      evidence: [],
      id,
      present: index === 0 ? uiPresent : true,
    })),
  };
}

function cleanProductionCommandRows(): Record<string, unknown>[] {
  return [{
    artifactPath: "content/scenes/arena.scene.json",
    command: "tn doctor --project . --json",
    description: "Inspect project setup.",
    phase: "debug",
    status: "available",
  }];
}

function cleanAssetAudioLedgerRows(options: { artifactOnlySurface?: string } = {}): Record<string, unknown>[] {
  const surfaces = ["player-hero", "obstacle-enemy", "reward-interactable", "world-environment", "ui-hud", "audio-feedback"];
  return surfaces.map((surface) => ({
    evidence: surface === options.artifactOnlySurface
      ? [{ description: "screenshot artifact", kind: "artifact", path: "artifacts/game-production/screenshot.png" }]
      : [{ description: `${surface} structured source`, kind: "source", path: "content/scenes/arena.scene.json" }],
    sourcePath: surface === options.artifactOnlySurface ? "artifacts/game-production/screenshot.png" : "content/scenes/arena.scene.json",
    status: "procedural",
    surface,
  }));
}

async function writeGameplaySystemSource(root: string, module: string, exportName: string): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/systems"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
  await writeFile(join(root, "content/systems/arena.systems.json"), `${JSON.stringify({
    schema: "threenative.systems",
    id: "arena-systems",
    systems: [{
      id: "arena-gameplay",
      reads: ["PlayerInput"],
      resourceReads: ["GameState"],
      resourceWrites: ["GameState"],
      script: {
        export: exportName,
        module,
      },
      writes: ["Transform"],
    }],
  }, null, 2)}\n`);
}

async function writeUiSource(root: string, options: { bindings?: Record<string, unknown>[]; nodes?: Record<string, unknown>[] } = {}): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/ui"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
  await writeFile(join(root, "content/ui/hud.ui.json"), `${JSON.stringify({
    schema: "threenative.ui",
    id: "hud",
    bindings: options.bindings ?? [
      { node: "score", property: "text", resource: "GameState", path: "score" },
      { node: "status", property: "text", resource: "GameState", path: "status" },
      { node: "timer", property: "text", resource: "GameState", path: "timer" },
    ],
    nodes: options.nodes ?? [
      { id: "score", text: "Score 0" },
      { id: "status", text: "Ready" },
      { id: "timer", text: "60" },
      { id: "state.loading", text: "Loading" },
      { id: "state.pause", text: "Paused" },
      { id: "state.settings", text: "Settings" },
      { id: "state.fail-retry", text: "Retry after failure" },
      { id: "state.win-milestone", text: "Win milestone reached" },
      { id: "state.touch-controls", text: "Touch controls mobile-control" },
    ],
  }, null, 2)}\n`);
}

async function writeMaterialSource(root: string, materials: Record<string, unknown>[] = [
  { id: "mat.ground", color: "#243b2d", roughness: 0.92 },
  { id: "mat.hero", color: "#6cc6ff", roughness: 0.46 },
  { id: "mat.reward", color: "#ffd166", roughness: 0.38 },
  { id: "mat.hazard", color: "#e84855", roughness: 0.64 },
  { id: "mat.world", color: "#775a3a", roughness: 0.86 },
]): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/materials"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
  await writeFile(join(root, "content/materials/arena.materials.json"), `${JSON.stringify({
    schema: "threenative.materials",
    id: "arena-materials",
    materials,
  }, null, 2)}\n`);
}

function validGamePlan(): Record<string, unknown> {
  return {
    schema: "threenative.game-plan",
    mutate: false,
    acceptanceCriteria: [
      "A player can understand the objective from the first screen and complete or fail the loop with real input.",
      "Every high-value visual surface has an asset, authored mesh, or documented fallback with provenance.",
      "Gameplay behavior lives in src/scripts/**/*.ts and every exported system is referenced from structured source.",
      "The scene has authored materials, lighting, camera framing, environment context, and set dressing instead of a placeholder floor and loose primitives.",
      "Proof includes authoring validation, build, playtest motion, screenshot, game score, QA, and release checks.",
    ],
    design: {
      controls: ["Keyboard movement with Space interaction."],
      failRetry: "Timer failure resets the arena.",
      feedback: ["movement response", "objective progress cue", "success/fail cue"],
      loop: "Move, collect rewards, avoid hazards, deliver to the goal, then retry.",
      objective: "Collect three rewards before the timer expires.",
      progression: "Rewards get farther from the goal after each collection.",
    },
    assetPlan: [
      {
        fallback: "custom-authored hero mesh from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "player-hero",
      },
      {
        fallback: "custom-authored hazard mesh from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "obstacle-enemy",
      },
      {
        fallback: "custom-authored reward mesh from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "reward-interactable",
      },
      {
        fallback: "custom-authored arena set dressing from structured source primitives",
        searchCommand: "tn asset source search --game-category arcade --format glb --direct-only --json",
        sourcePreference: "direct GLB catalog asset or cohesive authored fallback",
        surface: "world-environment",
      },
      {
        fallback: "structured UI HUD text and status bindings",
        searchCommand: "tn asset source search --file-role ui --format glb --direct-only --json",
        sourcePreference: "source-backed UI",
        surface: "ui-hud",
      },
      {
        fallback: "documented silent fallback with gameplay visual feedback",
        searchCommand: "tn asset source search --file-role audio --format glb --direct-only --json",
        sourcePreference: "compatible open-source audio or generated local cue",
        surface: "audio-feedback",
      },
    ],
    sourcePlan: [
      { document: "scene", path: "content/scenes/arena.scene.json", supportedShape: ["entities, prefabs, resources, systems"] },
      { document: "input", path: "content/input/arena.input.json", supportedShape: ["keyboard.KeyW and action bindings"] },
      { document: "systems", path: "content/systems/arena.systems.json", supportedShape: ["Declare every component/resource read and write"] },
      { document: "ui", path: "content/ui/hud.ui.json", supportedShape: ["HUD text nodes, retained UI states, and GameState bindings"] },
      { document: "materials", path: "content/materials/arena.materials.json", supportedShape: ["Material color, roughness, metalness, and authored style rows"] },
      { document: "assets", path: "content/assets/arena.assets.json", supportedShape: ["asset uri/kind/provenance records"] },
    ],
    scriptPlan: [
      {
        exportName: "arenaGameSystem",
        module: "src/scripts/player.ts",
        responsibility: "Move the hero, update score, and resolve fail/retry state.",
        state: ["player position", "score", "timer", "status"],
      },
    ],
    polishPlan: [
      { acceptance: "Hero and hazards are readable from the gameplay camera.", category: "silhouette", treatment: "Distinct shapes and scale." },
      { acceptance: "Materials communicate surface roles.", category: "materials", treatment: "Contrasting colors and roughness." },
      { acceptance: "Arena is framed without empty horizons.", category: "composition", treatment: "Angled camera with bounds." },
      { acceptance: "World has landmarks and boundary cues.", category: "lighting-environment", treatment: "Set dressing and rails." },
      { acceptance: "Input produces visible movement and feedback.", category: "motion-feedback", treatment: "Eased movement and status changes." },
    ],
    proofCommands: [
      "tn authoring validate --project . --json",
      "tn build --project . --json",
      "tn playtest --project . --entity <player-id> --press KeyboardEvent.code --frames 30 --expect-moved --json",
      "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
      "tn game score --project . --json",
      "tn game qa --project . --run-proof --json",
      "tn game release --project . --json",
    ],
  };
}

function minimalPngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

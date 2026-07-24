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

test("should reject provider credential leakage from release evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-provider-secret-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" })}\n`);
    await writeFile(join(root, "artifacts/game-production/provider-output.json"), '{"xi-api-key":"sentinel-elevenlabs-secret"}\n');
    const result = await runGameProductionGate({ projectPath: ".", reportPath: join(root, "report.json"), root });
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PROVIDER_CREDENTIAL_LEAK"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

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
        buildOnlyProjectCount: number;
        buildOnlyProjectPaths: string[];
        failedProjectCount: number;
        mode: string;
        okProjectCount: number;
        projectCount: number;
        projectPaths: string[];
        representativeProjectCount: number;
        representativeProjectPaths: string[];
        requiredProofCounts: { visualQuality: number };
      };
      steps: Array<{ name: string }>;
    };

    assert.equal(result.ok, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_MISSING"), true);
    assert.equal(report.reports.length, 1);
    assert.deepEqual(report.summary, {
      buildOnlyProjectCount: 0,
      buildOnlyProjectPaths: [],
      failedProjectCount: 1,
      mode: "custom",
      okProjectCount: 0,
      projectCount: 1,
      projectPaths: ["."],
      representativeProjectCount: 0,
      representativeProjectPaths: [],
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

test("accepts generated-game candidates listed as build-only examples", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-build-only-inventory-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "examples/stylized-nature-component/artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeExampleManifest(root, [
      { classification: "build-only", path: "examples/stylized-nature-component", reason: "Build-only generated-game fixture." },
    ]);
    await writeFile(join(root, "examples/stylized-nature-component/artifacts/game-production/plan.json"), `${JSON.stringify({ schema: "threenative.game-plan", mutate: false }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      generatedGames: true,
      projects: [{ projectPath: "." }],
      reportPath,
      root,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GENERATED_GAME_INVENTORY_DRIFT"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should gate only representative generated examples", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-representative-inventory-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "examples/stylized-nature-component/artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeExampleManifest(root, [
      { classification: "build-only", path: "examples/stylized-nature-component", reason: "Build-only generated-game fixture." },
    ]);
    await writeFile(join(root, "examples/stylized-nature-component/artifacts/game-production/plan.json"), `${JSON.stringify({ schema: "threenative.game-plan", mutate: false }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    await runGameProductionGate({
      generatedGames: true,
      projects: [{ projectPath: "." }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      artifacts: { buildOnlyProjectPaths: string[]; representativeProjectPaths: string[] };
      reports: Array<{ projectPath: string }>;
      summary: {
        buildOnlyProjectCount: number;
        buildOnlyProjectPaths: string[];
        representativeProjectCount: number;
        representativeProjectPaths: string[];
      };
    };

    assert.deepEqual(report.summary.representativeProjectPaths, ["."]);
    assert.equal(report.summary.representativeProjectCount, 1);
    assert.deepEqual(report.summary.buildOnlyProjectPaths, ["examples/stylized-nature-component"]);
    assert.equal(report.summary.buildOnlyProjectCount, 1);
    assert.deepEqual(report.artifacts.representativeProjectPaths, ["."]);
    assert.deepEqual(report.artifacts.buildOnlyProjectPaths, ["examples/stylized-nature-component"]);
    assert.deepEqual(report.reports.map((entry) => entry.projectPath), [root]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("discovers generated-game release enrollment from project config", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-config-enrollment-"));
  try {
    await mkdir(join(root, "examples/humanoid-physics-course"), { recursive: true });
    await mkdir(join(root, "examples/metro-surfer-heist"), { recursive: true });
    await mkdir(join(root, "examples/stylized-nature-component"), { recursive: true });
    await writeFile(join(root, "examples/humanoid-physics-course/threenative.config.json"), `${JSON.stringify({
      production: { releaseProof: { enrolled: true } },
    }, null, 2)}\n`);
    await writeFile(join(root, "examples/metro-surfer-heist/threenative.config.json"), `${JSON.stringify({
      production: { releaseProof: { enrolled: true, agentInventory: true } },
    }, null, 2)}\n`);
    await writeFile(join(root, "examples/stylized-nature-component/threenative.config.json"), `${JSON.stringify({
      production: { releaseProof: { buildOnly: true } },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    await runGameProductionGate({ generatedGames: true, reportPath, root });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      summary: {
        buildOnlyProjectPaths: string[];
        projectPaths: string[];
        requiredProofCounts: { agentInventory?: number };
      };
    };

    assert.deepEqual(report.summary.projectPaths, ["examples/humanoid-physics-course", "examples/metro-surfer-heist"]);
    assert.deepEqual(report.summary.buildOnlyProjectPaths, ["examples/stylized-nature-component"]);
    assert.equal(report.summary.requiredProofCounts.agentInventory, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects unknown generated-game release proof requirement keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-release-proof-key-"));
  try {
    await mkdir(join(root, "examples/humanoid-physics-course"), { recursive: true });
    await writeFile(join(root, "examples/humanoid-physics-course/threenative.config.json"), `${JSON.stringify({
      production: { releaseProof: { enrolled: true, madeUpRequirement: true } },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({ generatedGames: true, reportPath, root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GENERATED_GAME_RELEASE_PROOF_KEY_UNKNOWN" && diagnostic.message.includes("madeUpRequirement")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires plan marker artifacts for config-enrolled generated games", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-config-plan-marker-"));
  try {
    await mkdir(join(root, "examples/humanoid-physics-course"), { recursive: true });
    await writeFile(join(root, "examples/humanoid-physics-course/threenative.config.json"), `${JSON.stringify({
      production: { releaseProof: { enrolled: true, planArtifact: true } },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({ generatedGames: true, reportPath, root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_PLAN_MISSING" && diagnostic.message.includes("examples/humanoid-physics-course")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game release proof config drift from examples manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-config-drift-"));
  try {
    await mkdir(join(root, "examples/metro-surfer-heist"), { recursive: true });
    await writeFile(join(root, "examples/manifest.json"), `${JSON.stringify({
      schema: "threenative.examples.manifest",
      version: "0.1.0",
      examples: [
        {
          classification: "release-enrolled",
          path: "examples/metro-surfer-heist",
          reason: "Representative generated-game release evidence.",
        },
      ],
    }, null, 2)}\n`);
    await writeFile(join(root, "examples/metro-surfer-heist/threenative.config.json"), `${JSON.stringify({
      production: { releaseProof: { enrolled: false } },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({ generatedGames: true, reportPath, root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_VERIFY_GENERATED_GAME_EXAMPLE_MANIFEST_DRIFT"
      && diagnostic.message.includes("metro-surfer-heist")
      && diagnostic.path?.includes("production/releaseProof/enrolled")
    ), true);
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

    await writeFile(join(root, "playtests/smoke.playtest.json"), `${JSON.stringify({ schemaVersion: 1, name: "smoke", subject: "player", steps: [{ press: "KeyA" }] }, null, 2)}\n`);
    const stale = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath,
      root,
    });
    assert.equal(stale.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_SCENARIO_PROOF_STALE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires duration, focused-overlay, and deterministic conformance scenario enrollment", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-scenario-enrollment-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "content/overlays"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "content/overlays/hud.overlays.json"), `${JSON.stringify({
      schema: "threenative.overlays",
      overlays: [{ id: "hud", input: "pointer", targetProfiles: ["web"] }],
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      intentContract: {
        acceptanceAssertions: [{
          id: "timed-objective",
          proof: { family: "objective-duration" },
          required: true,
        }],
        objectiveDurationTicks: 1_800,
      },
    }, null, 2)}\n`);

    const deterministic = {
      acceptanceId: "timed-objective",
      inputDelivery: "deterministic",
      name: "timed-objective",
      schemaVersion: 1,
      steps: [{ release: false, waitTicks: 1_800 }],
      target: "web",
    };
    await writeScenarioQaFixture(root, [deterministic]);
    let result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath: join(root, "artifacts/game-production/verification-report.json"),
      root,
    });
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_OBJECTIVE_DURATION_SCENARIO_MISSING"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_FOCUSED_INPUT_SCENARIO_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_DETERMINISTIC_INPUT_SCENARIO_MISSING"), true);

    const focused = {
      acceptanceId: "focused-input",
      inputDelivery: "focused-dom",
      name: "focused-input",
      schemaVersion: 1,
      steps: [{ press: "KeyF", release: true }],
      target: "web",
    };
    const deterministicInput = {
      ...deterministic,
      name: "timed-objective-with-input",
      steps: [{ release: false, waitTicks: 1_800 }, { press: "ArrowUp", release: true }],
    };
    const focusedWithoutInput = {
      ...focused,
      name: "focused-without-input",
      steps: [{ release: false, waitTicks: 1 }],
    };
    await writeScenarioQaFixture(root, [deterministicInput, focusedWithoutInput]);
    result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath: join(root, "artifacts/game-production/verification-report.json"),
      root,
    });
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_OBJECTIVE_DURATION_SCENARIO_MISSING"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_FOCUSED_INPUT_SCENARIO_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_DETERMINISTIC_INPUT_SCENARIO_MISSING"), false);

    const deterministicWebOnly = {
      ...deterministicInput,
      assert: { visual: [{ region: { height: 10, width: 10, x: 0, y: 0 } }] },
      name: "timed-objective-web-only",
    };
    await writeScenarioQaFixture(root, [deterministicWebOnly, focused]);
    result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath: join(root, "artifacts/game-production/verification-report.json"),
      root,
    });
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_DETERMINISTIC_INPUT_SCENARIO_MISSING"), true);

    await writeScenarioQaFixture(root, [deterministicInput, focused]);
    result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath: join(root, "artifacts/game-production/verification-report.json"),
      root,
    });
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_OBJECTIVE_DURATION_SCENARIO_MISSING"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_FOCUSED_INPUT_SCENARIO_MISSING"), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_DETERMINISTIC_INPUT_SCENARIO_MISSING"), false);

    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      intentContract: { acceptanceAssertions: [], objectiveDurationTicks: 1_800 },
    }, null, 2)}\n`);
    await writeScenarioQaFixture(root, [deterministicInput, focused]);
    result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireQaProof: true }],
      reportPath: join(root, "artifacts/game-production/verification-report.json"),
      root,
    });
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_QA_OBJECTIVE_DURATION_DESCRIPTOR_MISSING"), true);
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

async function writeScenarioQaFixture(
  root: string,
  scenarios: Array<Record<string, unknown> & { name: string }>,
): Promise<void> {
  await mkdir(join(root, "playtests"), { recursive: true });
  const artifacts = [];
  for (const scenario of scenarios) {
    const scenarioPath = `playtests/${scenario.name}.playtest.json`;
    const artifactDirectory = `artifacts/playtest/${scenario.name}/latest`;
    await mkdir(join(root, artifactDirectory), { recursive: true });
    await writeFile(join(root, scenarioPath), `${JSON.stringify(scenario, null, 2)}\n`);
    await writeFile(join(root, artifactDirectory, "summary.json"), "{}\n");
    await writeFile(join(root, artifactDirectory, "manifest.json"), `${JSON.stringify({ pass: true, scenario: scenario.name }, null, 2)}\n`);
    artifacts.push({ artifactDirectory, scenario, scenarioPath });
  }
  const sourceHash = await currentTestSourceHash(root);
  const coverage = artifacts.map(({ artifactDirectory, scenario, scenarioPath }) => ({
      artifactDirectory,
      assertions: ["diagnostics"],
      kind: "committed",
      manifest: `${artifactDirectory}/manifest.json`,
      path: scenarioPath,
      proofSourceHash: sourceHash,
      reproduceCommand: `tn playtest --project . --scenario ${scenarioPath} --stable-artifacts --json`,
      scenario: scenario.name,
      status: "passed",
      stepId: `playtest:${scenario.name}`,
      summary: `${artifactDirectory}/summary.json`,
    }));
  await writeFile(join(root, "artifacts/game-production/qa-report.json"), `${JSON.stringify({
    blockers: [],
    diagnostics: [],
    mode: "qa",
    ok: true,
    proofRun: {
      ok: true,
      scenarioCoverage: { kind: "committed", scenarios: coverage },
      steps: [
        { id: "doctor", exitCode: 0 },
        { id: "build", exitCode: 0 },
        ...scenarios.map((scenario) => ({ id: `playtest:${scenario.name}`, exitCode: 0 })),
        { id: "screenshot", exitCode: 0 },
        { id: "mobile-viewport", exitCode: 0 },
        { id: "record", exitCode: 0, code: "TN_GAME_QA_ARTIFACT_OK" },
        { id: "visual-quality", exitCode: 0 },
        { id: "performance", exitCode: 0 },
        { id: "asset-budget", exitCode: 0 },
        { id: "ui-fit", exitCode: 0 },
      ],
    },
    release: { risks: [] },
    schema: "threenative.game-quality-report",
  }, null, 2)}\n`);
}

async function writeExampleManifest(
  root: string,
  examples: Array<{ classification: string; path: string; reason: string }>,
): Promise<void> {
  await writeFile(join(root, "examples/manifest.json"), `${JSON.stringify({
    examples,
    schema: "threenative.examples.manifest",
    version: "0.1.0",
  }, null, 2)}\n`);
}

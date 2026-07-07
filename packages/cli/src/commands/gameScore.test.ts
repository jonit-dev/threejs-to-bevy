import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { gameCommand } from "./game.js";

test("reports missing evidence without mutating source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-score-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const before = await listAll(root);

    const result = await gameCommand(["score", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; path?: string }>;
      mode: string;
      ok: boolean;
      phaseLedgers: Array<{ id: string }>;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.mode, "score");
    assert.equal(payload.ok, false);
    assert.equal(payload.phaseLedgers.some((phase) => phase.id === "gameplay"), true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_PLAYABLE_LOOP_MISSING"), true);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("plans a playable loop without mutating durable source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-"));
  try {
    const before = await listAll(root);
    const result = await gameCommand(["plan", "--project", root, "--goal", "arcade collector", "--json", "--full-json"]);
    const payload = JSON.parse(result.stdout) as {
      acceptanceCriteria: string[];
      assetPlan: Array<{ requiredEvidence: string[]; searchCommand?: string; surface: string }>;
      design: { objective: string; loop: string };
      gameplayBlocks: Array<{ helperImports: string[]; id: string; kind: string; proof: string[]; recipeIds: string[]; source: string }>;
      mutate: boolean;
      polishPlan: Array<{ category: string; treatment: string }>;
      proofCommands: string[];
      recipeIds: string[];
      schema: string;
      scriptPlan: Array<{ exportName: string; module: string; responsibility: string }>;
      sourcePlan: Array<{ avoid: string[]; document: string; operations: string[]; path: string; supportedShape: string[] }>;
      steps: Array<{ phase: string; recipe?: string; recipeGameplayBlocks?: string[]; recipeProofHints?: string[]; recipeScriptResponsibilities?: string[] }>;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.schema, "threenative.game-plan");
    assert.equal(payload.mutate, false);
    assert.equal(payload.design.objective.includes("arcade collector"), true);
    assert.equal(payload.design.loop.includes("real input"), true);
    assert.equal(payload.assetPlan.some((asset) => asset.surface === "player-hero" && asset.searchCommand?.includes("--game-category arcade") === true), true);
    assert.equal(payload.assetPlan.some((asset) => asset.surface === "player-hero" && asset.requiredEvidence.includes("SQLite catalog/source id")), true);
    assert.equal(payload.assetPlan.some((asset) => asset.surface === "world-environment" && asset.requiredEvidence.includes("license evidence")), true);
    assert.equal(payload.scriptPlan.some((script) => script.module === "src/scripts/player.ts" && script.exportName === "updatePlayer"), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "input" && source.supportedShape.some((shape) => shape.includes("keyboard.KeyW"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "input" && source.avoid.some((item) => item.includes("Object-shaped bindings"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "materials" && source.avoid.some((item) => item.includes("baseColor"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "scene" && source.supportedShape.some((shape) => shape.includes("box, capsule, cone, cylinder, plane, sphere, torus"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "scene" && source.avoid.some((item) => item.includes("torus"))), false);
    assert.equal(payload.sourcePlan.some((source) => source.document === "systems" && source.supportedShape.some((shape) => shape.includes("Declare every component/resource read and write"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "assets" && source.avoid.some((item) => item.includes("uri/kind/provenance"))), true);
    assert.equal(payload.polishPlan.some((item) => item.category === "lighting-environment" && item.treatment.includes("ground detail")), true);
    assert.equal(payload.acceptanceCriteria.some((criterion) => criterion.includes("authored materials")), true);
    assert.equal(payload.recipeIds.includes("third-person-controller"), true);
    assert.equal(payload.gameplayBlocks.some((block) => block.id === "basis.y-up-z-forward" && block.helperImports.includes("BasisEx")), true);
    assert.equal(payload.gameplayBlocks.some((block) => block.kind === "controller" && block.proof.some((command) => command.includes("tn playtest"))), true);
    assert.equal(payload.gameplayBlocks.some((block) => block.id === "objective.collectible" && block.source === "threenative"), true);
    assert.equal(payload.steps.some((step) => step.phase === "gameplay" && step.recipe === "third-person-controller"), true);
    assert.equal(payload.steps.some((step) => step.recipe === "top-down-collector" && step.recipeGameplayBlocks?.includes("controller.top-down-cardinal") === true), true);
    assert.equal(payload.steps.some((step) => step.recipe === "top-down-collector" && step.recipeProofHints?.some((hint) => hint.includes("HUD score")) === true), true);
    assert.equal(payload.steps.some((step) => step.recipe === "top-down-collector" && step.recipeScriptResponsibilities?.includes("owns collectible progress") === true), true);
    assert.equal(payload.proofCommands.some((command) => command.startsWith("tn playtest")), true);
    assert.equal(payload.proofCommands.some((command) => command.includes("tn game qa") && command.includes("--run-proof")), true);
    assert.deepEqual(after.filter((entry) => entry !== "artifacts" && !entry.startsWith("artifacts/")), before);
    assert.equal(after.includes("artifacts/game-production/plan.json"), true);
    assert.equal(after.includes("artifacts/game-production/task-graph.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write full game plan artifact and print compact summary by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-compact-"));
  try {
    const result = await gameCommand(["plan", "--project", root, "--goal", "arcade collector", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      assetPlan?: unknown;
      fileMap: { scripts: unknown[]; source: unknown[] };
      mutate: boolean;
      planArtifactPath: string;
      proofCommands: string[];
      schema: string;
      steps?: unknown;
    };
    const fullPlan = JSON.parse(await readFile(join(root, "artifacts/game-production/plan.json"), "utf8")) as {
      mutate: boolean;
      schema: string;
      steps: unknown[];
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.schema, "threenative.game-plan-summary");
    assert.equal(payload.mutate, false);
    assert.equal(payload.planArtifactPath.endsWith("artifacts/game-production/plan.json"), true);
    assert.equal(payload.assetPlan, undefined);
    assert.equal(payload.steps, undefined);
    assert.equal(payload.fileMap.scripts.length > 0, true);
    assert.equal(payload.fileMap.source.length > 0, true);
    assert.equal(payload.proofCommands.some((command) => command.includes("tn game qa")), true);
    assert.equal(fullPlan.schema, "threenative.game-plan");
    assert.equal(fullPlan.mutate, false);
    assert.equal(fullPlan.steps.length > 0, true);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") < 8192);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported scaffold category with diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-scaffold-unsupported-"));
  try {
    const before = await listAll(root);
    const result = await gameCommand(["plan", "--project", root, "--goal", "abstract puzzle room", "--apply", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      message: string;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_GAME_SCAFFOLD_UNSUPPORTED_CATEGORY");
    assert.match(payload.message, /top-down collector and lane-runner/);
    assert.deepEqual(after.filter((entry) => entry !== "artifacts" && !entry.startsWith("artifacts/")), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should apply collector scaffold to a fresh starter", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-scaffold-collector-"));
  try {
    await writePassingGameProject(root);
    await mkdir(join(root, "content/systems"), { recursive: true });
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "content/systems/arena.systems.json"), `${JSON.stringify({
      id: "arena-systems",
      schema: "threenative.systems",
      systems: [{ id: "move-player-to-goal", script: { export: "movePlayerToGoal", module: "src/scripts/player.ts" } }],
      version: "0.1.0",
    }, null, 2)}\n`);
    await writeFile(join(root, "playtests/smoke-movement.playtest.json"), `${JSON.stringify({
      assert: { movement: { entity: "player" } },
      name: "smoke-movement",
      schemaVersion: 1,
      subject: "player",
    }, null, 2)}\n`);

    const result = await gameCommand(["plan", "--project", root, "--goal", "coin collector", "--apply", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      applied: Array<{ filesWritten: string[]; ok: boolean; recipe: string }>;
      code: string;
      ok: boolean;
      plannedWrites: string[];
      proofCommand: string;
      scenarioPaths: string[];
    };
    const script = await readFile(join(root, "src/scripts/player.ts"), "utf8");
    const scenario = JSON.parse(await readFile(join(root, "playtests/top-down-collector.playtest.json"), "utf8")) as {
      assert?: { movement?: { entity?: string } };
      name: string;
      steps: Array<{ press?: string }>;
    };
    const smokeScenario = JSON.parse(await readFile(join(root, "playtests/smoke-movement.playtest.json"), "utf8")) as {
      assert?: { movement?: { entity?: string } };
      subject?: string;
    };
    const systemsDocument = JSON.parse(await readFile(join(root, "content/systems/arena.systems.json"), "utf8")) as {
      systems: Array<{ id: string; resourceWrites?: string[]; script?: { export?: string } }>;
    };
    const uiDocument = JSON.parse(await readFile(join(root, "content/ui/hud.ui.json"), "utf8")) as {
      bindings: Array<{ node?: string; resource?: string }>;
      nodes: Array<{ id: string; text?: string }>;
    };
    const evidence = JSON.parse(await readFile(join(root, "artifacts/game-production/scaffold-first.json"), "utf8")) as {
      recipeId: string;
      scenarioPaths: string[];
      schema: string;
    };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.code, "TN_GAME_SCAFFOLD_APPLIED");
    assert.equal(payload.ok, true);
    assert.equal(payload.applied[0]?.recipe, "top-down-collector");
    assert.equal(payload.applied[0]?.filesWritten.includes("src/scripts/player.ts"), true);
    assert.equal(payload.scenarioPaths.includes("playtests/top-down-collector.playtest.json"), true);
    assert.equal(payload.proofCommand.includes("--scenario playtests/top-down-collector.playtest.json"), true);
    assert.equal(payload.plannedWrites.includes("input.add_axis"), true);
    assert.match(script, /export function topDownCollectorSystem/);
    assert.equal(scenario.name, "top-down-collector");
    assert.equal(scenario.steps[0]?.press, "KeyD");
    assert.equal(scenario.assert?.movement?.entity, "scaffold.player");
    assert.equal(smokeScenario.subject, "scaffold.player");
    assert.equal(smokeScenario.assert?.movement?.entity, "scaffold.player");
    assert.equal(systemsDocument.systems.some((system) => system.id === "move-player-to-goal"), false);
    assert.equal(systemsDocument.systems.some((system) => system.id === "top-down-collector" && system.script?.export === "topDownCollectorSystem" && system.resourceWrites?.includes("GameState") === true), true);
    assert.equal(uiDocument.nodes.some((node) => node.id === "countdown"), false);
    assert.equal(uiDocument.nodes.some((node) => node.id === "hud.progress" && node.text === "Score 0 / 5"), true);
    assert.equal(uiDocument.bindings.some((binding) => binding.node === "hud.progress" && binding.resource === "GameState.scoreText"), true);
    assert.equal(evidence.schema, "threenative.game-scaffold-first");
    assert.equal(evidence.recipeId, "top-down-collector");
    assert.deepEqual(evidence.scenarioPaths, ["playtests/top-down-collector.playtest.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should apply lane-runner scaffold to a fresh starter", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-scaffold-lane-runner-"));
  try {
    await writePassingGameProject(root);

    const result = await gameCommand(["plan", "--project", root, "--goal", "lane runner with coins", "--apply", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      applied: Array<{ filesWritten: string[]; ok: boolean; recipe: string }>;
      iterateArtifactPath: string;
      ok: boolean;
      plannedWrites: string[];
      scenarioPaths: string[];
    };
    const script = await readFile(join(root, "src/scripts/player.ts"), "utf8");
    const scenario = JSON.parse(await readFile(join(root, "playtests/lane-runner.playtest.json"), "utf8")) as {
      name: string;
      steps: Array<{ press?: string }>;
    };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.ok, true);
    assert.equal(payload.applied[0]?.recipe, "lane-runner");
    assert.equal(payload.scenarioPaths.includes("playtests/lane-runner.playtest.json"), true);
    assert.equal(payload.iterateArtifactPath, "artifacts/iterate/latest/report.json");
    assert.equal(payload.plannedWrites.includes("input.add_action"), true);
    assert.match(script, /export function laneRunnerSystem/);
    assert.equal(scenario.name, "lane-runner");
    assert.equal(scenario.steps[0]?.press, "ArrowRight");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should print game inspect inventory as json", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-inspect-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "content/systems"), { recursive: true });
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "inspect-generated-game" }, null, 2)}\n`);
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
      entry: "content/scenes/arena.scene.json",
      production: {
        assetPlan: {
          audioFeedback: "visual feedback",
          obstacleEnemy: "hazards",
          playerHero: "hero",
          rewardInteractable: "reward",
          uiHud: "hud",
          worldEnvironment: "world",
        },
        proofCommands: ["tn game score --project . --json"],
      },
      schema: "threenative.project",
    }, null, 2)}\n`);
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      entities: [{ id: "camera.main", components: { camera: { mode: "perspective" } } }],
      id: "arena",
      schema: "threenative.scene",
    }, null, 2)}\n`);
    await writeFile(join(root, "content/systems/arena.systems.json"), `${JSON.stringify({
      id: "arena-systems",
      schema: "threenative.systems",
      systems: [{ id: "gameplay", script: { export: "updatePlayer", module: "src/scripts/player.ts" } }],
    }, null, 2)}\n`);

    const result = await gameCommand(["inspect", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      primaryScene?: { id: string };
      projectKind: string;
      schema: string;
      scripts: Array<{ exportName: string; module: string }>;
    };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.schema, "threenative.game-agent-inventory");
    assert.equal(payload.projectKind, "generated-game");
    assert.equal(payload.primaryScene?.id, "arena");
    assert.equal(payload.scripts.some((script) => script.module === "src/scripts/player.ts" && script.exportName === "updatePlayer"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should include project inventory in generated game plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-inventory-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "content/input"), { recursive: true });
    await mkdir(join(root, "content/systems"), { recursive: true });
    await mkdir(join(root, "content/ui"), { recursive: true });
    await mkdir(join(root, "content/materials"), { recursive: true });
    await mkdir(join(root, "content/assets"), { recursive: true });
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "inventory-backed-generated-game" }, null, 2)}\n`);
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({ entry: "content/scenes/harbor.scene.json", schema: "threenative.project" }, null, 2)}\n`);
    await writeFile(join(root, "content/scenes/harbor.scene.json"), `${JSON.stringify({
      entities: [
        { id: "camera.hero", components: { camera: { mode: "perspective" } } },
        { id: "player.boat" },
      ],
      id: "harbor",
      schema: "threenative.scene",
    }, null, 2)}\n`);
    await writeFile(join(root, "content/input/harbor.input.json"), `${JSON.stringify({ actions: [{ bindings: ["keyboard.KeyD"], id: "move-right" }], id: "harbor-input", schema: "threenative.input" }, null, 2)}\n`);
    await writeFile(join(root, "content/systems/harbor.systems.json"), `${JSON.stringify({
      id: "harbor-systems",
      schema: "threenative.systems",
      systems: [{ id: "boat", resourceWrites: ["GameState"], script: { export: "updateBoat", module: "src/scripts/boat.ts" }, writes: ["Transform"] }],
    }, null, 2)}\n`);
    await writeFile(join(root, "content/ui/harbor.ui.json"), `${JSON.stringify({ id: "harbor-ui", nodes: [{ id: "status", text: "Ready", type: "text" }], schema: "threenative.ui" }, null, 2)}\n`);
    await writeFile(join(root, "content/materials/harbor.materials.json"), `${JSON.stringify({ id: "harbor-materials", materials: [{ color: "#336699", id: "boat" }], schema: "threenative.materials" }, null, 2)}\n`);
    await writeFile(join(root, "content/assets/harbor.assets.json"), `${JSON.stringify({ assets: [{ id: "boat-model", path: "assets/boat.glb", type: "model" }], id: "harbor-assets", schema: "threenative.assets" }, null, 2)}\n`);

    const result = await gameCommand(["plan", "--project", root, "--goal", "top down rescue game", "--json", "--full-json"]);
    const payload = JSON.parse(result.stdout) as {
      inventory: { primarySceneId?: string; projectKind: string };
      gameplayBlocks: Array<{ id: string; recipeIds: string[] }>;
      kitCandidates: Array<{ blocks: Array<{ id: string; proofCommands: string[]; sourceOwners: Record<string, string[]> }>; kitId: string; mutate: boolean; recipeId: string; toolingOnly: boolean }>;
      scriptPlan: Array<{ exportName: string; module: string; state: string[] }>;
      sourcePlan: Array<{ document: string; path: string }>;
      steps: Array<{ id: string; recipe?: string; recipeArgs?: { cameraId?: string; entityId?: string; sceneId?: string }; recipeGameplayBlocks?: string[]; recipeProofHints?: string[]; recipeSourceOwners?: Record<string, string[]> }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.inventory.projectKind, "generated-game");
    assert.equal(payload.inventory.primarySceneId, "harbor");
    assert.equal(payload.sourcePlan.some((source) => source.document === "scene" && source.path === "content/scenes/harbor.scene.json"), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "systems" && source.path === "content/systems/harbor.systems.json"), true);
    assert.equal(payload.scriptPlan.some((script) => script.module === "src/scripts/boat.ts" && script.exportName === "updateBoat" && script.state.includes("GameState")), true);
    assert.equal(payload.steps.find((step) => step.id === "playable-loop")?.recipeArgs?.sceneId, "harbor");
    assert.equal(payload.steps.find((step) => step.id === "playable-loop")?.recipeArgs?.cameraId, "camera.hero");
    assert.equal(payload.steps.find((step) => step.id === "playable-loop")?.recipeArgs?.entityId, "player.boat");
    assert.equal(payload.kitCandidates[0]?.kitId, "top-down-collector");
    assert.equal(payload.kitCandidates[0]?.mutate, false);
    assert.equal(payload.kitCandidates[0]?.toolingOnly, true);
    assert.equal(payload.kitCandidates[0]?.recipeId, "top-down-collector");
    assert.equal(payload.kitCandidates[0]?.blocks.some((block) => block.id === "controller.top-down" && block.proofCommands.some((command) => command.startsWith("tn playtest"))), true);
    assert.equal(payload.kitCandidates[0]?.blocks.some((block) => block.sourceOwners.scripts?.includes("src/scripts/player.ts")), true);
    assert.equal(payload.gameplayBlocks.some((block) => block.id === "controller.top-down-cardinal" && block.recipeIds.includes("top-down-collector")), true);
    assert.equal(payload.steps.some((step) => step.recipe === "top-down-collector" && step.recipeSourceOwners?.scene?.includes("scene.attach_script")), true);
    assert.equal(payload.steps.some((step) => step.recipe === "top-down-collector" && step.recipeGameplayBlocks?.includes("proof.ui-binding") === true), true);
    assert.equal(payload.steps.some((step) => step.recipe === "top-down-collector" && step.recipeProofHints?.some((hint) => hint.includes("MoveX/MoveZ")) === true), true);
    assert.equal(payload.steps.some((step) => step.recipe === "lane-runner"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should map checkpoint racing goals to vehicle and checkpoint blocks", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-checkpoint-blocks-"));
  try {
    const before = await listAll(root);
    const result = await gameCommand(["plan", "--project", root, "--goal", "checkpoint kart racing game", "--json", "--full-json"]);
    const payload = JSON.parse(result.stdout) as {
      gameplayBlocks: Array<{ id: string; recipeIds: string[] }>;
      mutate: boolean;
      steps: Array<{ recipe?: string; recipeGameplayBlocks?: string[] }>;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.mutate, false);
    assert.equal(payload.gameplayBlocks.some((block) => block.id === "controller.vehicle-cardinal" && block.recipeIds.includes("vehicle-checkpoint")), true);
    assert.equal(payload.gameplayBlocks.some((block) => block.id === "objective.checkpoint-lap" && block.recipeIds.includes("vehicle-checkpoint")), true);
    assert.equal(payload.steps.some((step) => step.recipe === "vehicle-checkpoint" && step.recipeGameplayBlocks?.includes("objective.checkpoint-lap") === true), true);
    assert.deepEqual(after.filter((entry) => entry !== "artifacts" && !entry.startsWith("artifacts/")), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve non-mutating plan contract when inventory has gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-inventory-gaps-"));
  try {
    const result = await gameCommand(["plan", "--project", root, "--goal", "minimal arena", "--json", "--full-json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; severity: string }>;
      inventory: { projectKind: string };
      mutate: boolean;
      steps: Array<{ id: string; recipeArgs?: { cameraId?: string; entityId?: string; sceneId?: string } }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.mutate, false);
    assert.equal(payload.inventory.projectKind, "unknown");
    assert.equal(payload.diagnostics.every((diagnostic) => diagnostic.code === "TN_GAME_PLAN_SOURCE_DEFAULT_FALLBACK" && diagnostic.severity === "warning"), true);
    assert.equal(payload.steps.find((step) => step.id === "playable-loop")?.recipeArgs?.sceneId, "arena");
    assert.equal(payload.steps.find((step) => step.id === "playable-loop")?.recipeArgs?.cameraId, "camera.main");
    assert.equal(payload.steps.find((step) => step.id === "playable-loop")?.recipeArgs?.entityId, "player");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should persist game next task graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-next-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ entities: [], id: "arena", schema: "threenative.scene" }, null, 2)}\n`);

    const result = await gameCommand(["next", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      recommendations: Array<{ command: string; id: string; sourceOwner: string }>;
      reportPath: string;
    };
    const persisted = JSON.parse(await readFile(join(root, "artifacts/game-production/task-graph.json"), "utf8")) as {
      code: string;
      recommendations: Array<{ id: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_GAME_TASK_GRAPH");
    assert.equal(payload.reportPath.endsWith("artifacts/game-production/task-graph.json"), true);
    assert.equal(payload.recommendations[0]?.id, "wire-gameplay-script");
    assert.equal(payload.recommendations[0]?.command.includes("tn recipe apply"), true);
    assert.equal(payload.recommendations[0]?.sourceOwner.includes("src/scripts"), true);
    assert.equal(persisted.code, "TN_GAME_TASK_GRAPH");
    assert.equal(persisted.recommendations[0]?.id, "wire-gameplay-script");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("improve persists the applied game plan as canonical production evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-improve-plan-evidence-"));
  try {
    const planResult = await gameCommand(["plan", "--project", root, "--goal", "clockwork garden heist", "--json", "--full-json"]);
    const plan = JSON.parse(planResult.stdout) as { steps: Array<{ apply?: boolean }> };
    await writeFile(join(root, "plan-input.json"), `${JSON.stringify({
      ...plan,
      steps: plan.steps.map((step) => ({ ...step, apply: false })),
    }, null, 2)}\n`);

    const result = await gameCommand(["improve", "--project", root, "--apply-plan", "plan-input.json", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      planArtifactPath?: string;
    };
    const persisted = JSON.parse(await readFile(join(root, "artifacts/game-production/plan.json"), "utf8")) as {
      code: string;
      goal: string;
      mutate: boolean;
      schema: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.planArtifactPath?.endsWith("artifacts/game-production/plan.json"), true);
    assert.equal(persisted.schema, "threenative.game-plan");
    assert.equal(persisted.code, "TN_GAME_PLAN");
    assert.equal(persisted.goal, "clockwork garden heist");
    assert.equal(persisted.mutate, false);
    assert.equal(Array.isArray((persisted as { acceptanceCriteria?: unknown }).acceptanceCriteria), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should apply a supported vertical slice recipe from a valid plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-improve-vertical-recipe-"));
  try {
    await writePassingGameProject(root);
    const planResult = await gameCommand(["plan", "--project", root, "--goal", "coin collector", "--json", "--full-json"]);
    const plan = JSON.parse(planResult.stdout) as {
      steps: Array<Record<string, unknown>>;
    };
    plan.steps = [
      {
        apply: true,
        id: "top-down-collector-slice",
        phase: "gameplay",
        recipe: "top-down-collector",
        recipeArgs: {
          cameraId: "camera.main",
          inputDocId: "arena-input",
          playerId: "collector.player",
          sceneId: "arena",
        },
        summary: "Apply compact collector source slice.",
      },
    ];
    await writeFile(join(root, "plan-input.json"), `${JSON.stringify(plan, null, 2)}\n`);
    await writeFile(
      join(root, "src/scripts/player.ts"),
      "export function topDownCollectorSystem(ctx: any) { void ctx; }\n",
    );

    const result = await gameCommand(["improve", "--project", root, "--apply-plan", "plan-input.json", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      applied: Array<{ filesWritten: string[]; ok: boolean; recipe: string }>;
      ok: boolean;
      planArtifactPath?: string;
    };
    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as {
      entities?: Array<{ id?: string }>;
      systems?: Array<{ id?: string; script?: { export?: string; module?: string } }>;
    };
    const input = JSON.parse(await readFile(join(root, "content/input/arena.input.json"), "utf8")) as {
      axes?: Array<{ id?: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.applied[0]?.recipe, "top-down-collector");
    assert.equal(payload.planArtifactPath?.endsWith("artifacts/game-production/plan.json"), true);
    assert.equal(input.axes?.some((axis) => axis.id === "MoveX"), true);
    assert.equal(scene.entities?.some((entity) => entity.id === "collector.player"), true);
    assert.equal(scene.entities?.some((entity) => entity.id === "coin.01"), true);
    assert.equal(scene.systems?.some((system) => system.script?.module === "src/scripts/player.ts" && system.script.export === "topDownCollectorSystem"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("improve rejects incomplete game plans before writing production evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-improve-plan-incomplete-"));
  try {
    await writeFile(join(root, "plan-input.json"), `${JSON.stringify({
      code: "TN_GAME_PLAN",
      goal: "clockwork garden heist",
      mutate: false,
      schema: "threenative.game-plan",
      steps: [],
    }, null, 2)}\n`);

    const result = await gameCommand(["improve", "--project", root, "--apply-plan", "plan-input.json", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string }>;
      ok: boolean;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_IMPROVE_PLAN_INCOMPLETE"), true);
    await assert.rejects(readFile(join(root, "artifacts/game-production/plan.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("plans goals with matching asset categories", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-categories-"));
  try {
    const underwater = await gameCommand(["plan", "--project", root, "--goal", "sunken underwater salvage diver", "--json", "--full-json"]);
    const underwaterPayload = JSON.parse(underwater.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };
    const nature = await gameCommand(["plan", "--project", root, "--goal", "garden orchard collector", "--json", "--full-json"]);
    const naturePayload = JSON.parse(nature.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };
    const naval = await gameCommand(["plan", "--project", root, "--goal", "harbor lantern ferry boat dock", "--json", "--full-json"]);
    const navalPayload = JSON.parse(naval.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };
    const space = await gameCommand(["plan", "--project", root, "--goal", "asteroid spaceship courier", "--json", "--full-json"]);
    const spacePayload = JSON.parse(space.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };

    assert.equal(underwater.exitCode, 0);
    assert.equal(nature.exitCode, 0);
    assert.equal(naval.exitCode, 0);
    assert.equal(space.exitCode, 0);
    assert.equal(underwaterPayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category ocean") !== false), true);
    assert.equal(naturePayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category nature") !== false), true);
    assert.equal(navalPayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category naval") !== false), true);
    assert.equal(spacePayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category space") !== false), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("reports provider probes without leaking credential values", async () => {
  const original = process.env.TRIPO_API_KEY;
  try {
    process.env.TRIPO_API_KEY = "secret-tripo-value";
    const result = await gameCommand(["providers", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      providers: Array<{ credentialEnv: string; id: string; status: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(JSON.stringify(payload).includes("secret-tripo-value"), false);
    assert.equal(payload.providers.find((provider) => provider.id === "tripo")?.status, "available");
  } finally {
    if (original === undefined) {
      delete process.env.TRIPO_API_KEY;
    } else {
      process.env.TRIPO_API_KEY = original;
    }
  }
});

test("writes qa and release reports with command and risk ledgers", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-release-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);

    const qa = await gameCommand(["qa", "--project", root, "--json"]);
    const release = await gameCommand(["release", "--project", root, "--json"]);
    const qaPayload = JSON.parse(qa.stdout) as {
      assetAudioLedger?: unknown;
      productionCommands: Array<{ command: string; phase: string; status: string }>;
      reportPath: string;
    };
    const releasePayload = JSON.parse(release.stdout) as {
      release: { risks: Array<{ code: string; severity: string }>; staticHostingNotes: string[] };
      reportPath: string;
    };

    assert.equal(qa.exitCode, 1);
    assert.equal(release.exitCode, 1);
    assert.equal(qaPayload.reportPath.endsWith("artifacts/game-production/qa-report.json"), true);
    assert.equal(qaPayload.assetAudioLedger, undefined);
    assert.equal(qaPayload.productionCommands.some((command) => command.command.startsWith("tn playtest") && command.status === "missing-artifact"), true);
    assert.equal(releasePayload.release.risks.some((risk) => risk.code === "TN_GAME_RELEASE_BUILD_PROOF_MISSING" && risk.severity === "error"), true);
    assert.equal(releasePayload.release.staticHostingNotes.some((note) => note.includes("static files")), true);
    const fullQaReport = JSON.parse(await readFile(qaPayload.reportPath, "utf8")) as { assetAudioLedger?: unknown };
    assert.notEqual(fullQaReport.assetAudioLedger, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("release writes missing asset-budget proof for built projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-release-asset-budget-"));
  try {
    await writePassingGameProject(root);
    const proofPath = join(root, "artifacts/game-production/asset-budget.json");

    const result = await gameCommand(["release", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      release: { assetBudgetStatus: string; risks: Array<{ code: string }> };
    };
    const proof = JSON.parse(await readFile(proofPath, "utf8")) as {
      schema: string;
      source: string;
      status: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.release.assetBudgetStatus, "pass");
    assert.equal(payload.release.risks.some((risk) => risk.code === "TN_GAME_RELEASE_ASSET_BUDGET_UNVERIFIED"), false);
    assert.equal(proof.schema, "threenative.game-asset-budget-proof");
    assert.equal(proof.source, "tn game release");
    assert.equal(proof.status, "pass");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("shows game subcommand help without running qa", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-help-"));
  try {
    const result = await gameCommand(["qa", "--help", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { commands: string[]; subcommand?: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.subcommand, "qa");
    assert.equal(payload.commands.some((command) => command.startsWith("tn game qa")), true);
    await assert.rejects(readFile(join(root, "artifacts/game-production/qa-report.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("aggregates proof tool failures into one report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-run-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "keyboard.KeyD", "--json"],
      {
        proofRunner: async (step) => {
          if (step.id === "playtest") {
            return {
              exitCode: 1,
              stdout: `${JSON.stringify({
                code: "TN_PLAYTEST_FAILED",
                diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
              })}\n`,
            };
          }
          if (step.id === "screenshot") {
            return {
              exitCode: 1,
              stdout: `${JSON.stringify({ code: "TN_SCREENSHOT_FAILED", message: "Preview did not contain a canvas." })}\n`,
            };
          }
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );
    const payload = JSON.parse(result.stdout) as {
      proofRun: {
        diagnostics: Array<{ code: string; message: string; phase: string; severity: string }>;
        ok: boolean;
        steps: Array<{ id: string; exitCode: number }>;
      };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.proofRun.ok, false);
    assert.equal(payload.proofRun.steps.some((step) => step.id === "playtest" && step.exitCode === 1), true);
    assert.equal(payload.proofRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_INPUT_NO_EFFECT" && diagnostic.phase === "gameplay"), true);
    assert.equal(payload.proofRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCREENSHOT_FAILED" && diagnostic.phase === "visuals"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("qa run-proof writes doctor proof sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-doctor-proof-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--json"],
      {
        proofRunner: async (step) => ({
          exitCode: 0,
          stdout: `${JSON.stringify({ code: step.id === "doctor" ? "TN_DOCTOR_OK" : "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
        }),
      },
    );
    const proof = JSON.parse(await readFile(join(root, "artifacts/game-production/doctor.json"), "utf8")) as {
      code: string;
      schema: string;
    };

    assert.notEqual(result.exitCode, 0);
    assert.equal(proof.schema, "threenative.game-doctor-proof");
    assert.equal(proof.code, "TN_DOCTOR_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("fails qa command when run-proof fails even if game report is clean", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-proof-fail-"));
  try {
    await writePassingGameProject(root);

    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--json"],
      {
        proofRunner: async (step) => {
          if (step.id === "playtest") {
            return {
              exitCode: 1,
              stdout: `${JSON.stringify({
                code: "TN_PLAYTEST_FAILED",
                diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
              })}\n`,
            };
          }
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      proofRun: { ok: boolean; diagnostics: Array<{ code: string }> };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(payload.proofRun.ok, false);
    assert.equal(payload.proofRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_INPUT_NO_EFFECT"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("passes axis assertions through QA proof playtest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-axis-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--expect-axis", "x", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 1);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "playtest"),
      ["playtest", "--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "30", "--expect-moved", "--expect-axis", "x", "--json"],
    );
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "screenshot" && args.includes("artifacts/game-production/mobile-viewport.png")),
      ["screenshot", "--project", ".", "--url", "http://127.0.0.1:5173", "--out", "artifacts/game-production/mobile-viewport.png", "--viewport", "mobile", "--wait-ready", "--json"],
    );
    assert.deepEqual(seenArgs.find((args) => args[0] === "artifact-check" && args.includes("artifacts/game-production/motion.webm")), ["artifact-check", "artifacts/game-production/motion.webm"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "visual-quality-proof"), ["visual-quality-proof", "artifacts/game-production/visual-quality.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "scale-proof"), ["scale-proof", "artifacts/game-production/scale-analysis.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "performance-proof"), ["performance-proof", "artifacts/game-production/performance.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "asset-budget-proof"), ["asset-budget-proof", "artifacts/game-production/asset-budget.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "ui-fit-proof"), ["ui-fit-proof", "artifacts/game-production/ui-fit.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("records QA motion proof to canonical game-production motion artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-record-motion-"));
  try {
    await writePassingGameProject(root);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--record", "--duration", "2", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "record"),
      ["record", "--project", ".", "--url", "http://127.0.0.1:5173", "--out", "artifacts/game-production/motion.webm", "--duration", "2", "--json"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("checks existing screenshot proof when QA proof URL is omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-existing-screenshot-"));
  try {
    await writePassingGameProject(root);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "playtest"),
      ["playtest", "--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "30", "--expect-moved", "--expect-axis", "x", "--json"],
    );
    assert.deepEqual(seenArgs.find((args) => args[0] === "artifact-check" && args.includes("artifacts/game-production/screenshot.png")), ["artifact-check", "artifacts/game-production/screenshot.png"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "artifact-check" && args.includes("artifacts/game-production/mobile-viewport.png")), ["artifact-check", "artifacts/game-production/mobile-viewport.png"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("qa run-proof discovers playtest scenarios and records summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-playtest-scenarios-"));
  try {
    await writePassingGameProject(root);
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/smoke-movement.playtest.json"), JSON.stringify({ schemaVersion: 1, name: "smoke-movement", subject: "player", steps: [{ press: "KeyD" }] }), "utf8");
    await writeFile(join(root, "playtests/hud-resource.playtest.json"), JSON.stringify({ schemaVersion: 1, name: "hud-resource", subject: "player", steps: [{ waitFrames: 5 }] }), "utf8");
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({
              assertions: [{ id: "movement", pass: true }],
              artifacts: { directory: `artifacts/playtest/${step.id}/latest`, summary: `artifacts/playtest/${step.id}/latest/summary.json` },
              code: step.command === "playtest" ? "TN_PLAYTEST_OK" : "TN_TEST_STEP_OK",
              proofMetadata: { sourceHash: "source-hash" },
              reproduceCommand: `tn playtest --project . --scenario ${step.args[3]} --stable-artifacts --json`,
              scenario: step.id.replace("playtest:", ""),
            })}\n`,
          };
        },
      },
    );
    const payload = JSON.parse(result.stdout) as {
      proofRun: {
        scenarioCoverage: {
          kind: string;
          scenarios: Array<{ assertions: string[]; kind: string; path?: string; proofSourceHash?: string; reproduceCommand?: string; scenario?: string; status: string; summary?: string }>;
        };
        steps: Array<{ evidence?: { scenario?: string; summary?: string }; id: string }>;
      };
    };
    const playtestArgs = seenArgs.filter((args) => args[0] === "playtest");

    assert.equal(result.exitCode, 0);
    assert.deepEqual(playtestArgs, [
      ["playtest", "--project", ".", "--scenario", "playtests/hud-resource.playtest.json", "--stable-artifacts", "--json"],
      ["playtest", "--project", ".", "--scenario", "playtests/smoke-movement.playtest.json", "--stable-artifacts", "--json"],
    ]);
    assert.equal(payload.proofRun.steps.some((step) => step.id === "playtest:smoke-movement" && step.evidence?.scenario === "smoke-movement" && step.evidence.summary?.includes("summary.json")), true);
    assert.equal(payload.proofRun.scenarioCoverage.kind, "committed");
    assert.equal(payload.proofRun.scenarioCoverage.scenarios.some((scenario) =>
      scenario.kind === "committed"
      && scenario.path === "playtests/smoke-movement.playtest.json"
      && scenario.status === "passed"
      && scenario.assertions.includes("movement")
      && scenario.proofSourceHash === "source-hash"
      && scenario.reproduceCommand?.includes("--scenario playtests/smoke-movement.playtest.json") === true
    ), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("infers QA proof playtest arguments from project production proof commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-proof-defaults-"));
  try {
    await writePassingGameProject(root);
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
      schema: "threenative.project",
      version: "0.1.0",
      entry: "content/scenes/arena.scene.json",
      production: {
        proofCommands: [
          "tn playtest --project . --entity player --press keyboard.KeyD --frames 42 --expect-axis x --json",
          "tn game qa --project . --run-proof --json",
        ],
      },
    }, null, 2)}\n`);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "playtest"),
      ["playtest", "--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "42", "--expect-moved", "--expect-axis", "x", "--json"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function listAll(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => String(entry)).sort();
}

async function writePassingGameProject(root: string): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/input"), { recursive: true });
  await mkdir(join(root, "content/ui"), { recursive: true });
  await mkdir(join(root, "content/assets"), { recursive: true });
  await mkdir(join(root, "content/materials"), { recursive: true });
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "src/scripts"), { recursive: true });
  await mkdir(join(root, "artifacts/game-production"), { recursive: true });
  await mkdir(join(root, "artifacts/playtest"), { recursive: true });
  await mkdir(join(root, "dist/game.bundle"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
    schema: "threenative.scene",
    version: "0.1.0",
    id: "arena",
	    entities: [
	      { id: "camera.main" },
	      { id: "player", components: { VisualProvenance: { notes: "procedural custom player hero obstacle hazard collectible reward world environment ui hud audio feedback" } } },
      { id: "hazard.obstacle", components: { Hazard: { kind: "obstacle-enemy" } } },
      { id: "reward.collectible", components: { Collectible: { kind: "reward-interactable" } } },
    ],
    prefabs: [
      { id: "prefab.player", primitive: "box", color: "#ffffff" },
      { id: "prefab.hazard", primitive: "sphere", color: "#ff0000" },
      { id: "prefab.reward", primitive: "sphere", color: "#ffff00" },
      { id: "prefab.world", primitive: "plane", color: "#00ff00" },
    ],
    systems: [{ id: "gameplay", script: { module: "src/scripts/game.ts", export: "update" } }],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/input/arena.input.json"), `${JSON.stringify({
    schema: "threenative.input",
    version: "0.1.0",
    id: "arena-input",
    actions: [{ id: "move-right", bindings: ["keyboard.KeyD"] }],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/ui/hud.ui.json"), `${JSON.stringify({
    schema: "threenative.ui",
    version: "0.1.0",
    id: "hud",
    nodes: [
      { id: "gameplay-hud", text: "Score" },
      { id: "pause-menu", text: "Pause" },
      { id: "settings-menu", text: "Settings" },
      { id: "loading-screen", text: "Loading" },
      { id: "fail-retry", text: "Retry" },
      { id: "win-milestone", text: "Win complete" },
      { id: "touch-controls", text: "Touch mobile-control" },
    ],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/assets/arena.assets.json"), `${JSON.stringify({
    schema: "threenative.assets",
    version: "0.1.0",
    id: "arena-assets",
    assets: [
      { id: "player-hero", path: "assets/player.glb", type: "model" },
      { id: "obstacle-enemy", path: "assets/enemy.glb", type: "model" },
      { id: "reward-interactable", path: "assets/reward.glb", type: "model" },
      { id: "world-environment", path: "assets/world.glb", type: "model" },
      { id: "ui-hud", path: "assets/hud.png", type: "texture" },
      { id: "audio-feedback", path: "assets/hit.wav", type: "audio" },
    ],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/materials/arena.materials.json"), `${JSON.stringify({
    schema: "threenative.materials",
    version: "0.1.0",
    id: "arena-materials",
    materials: [{ id: "mat.procedural", color: "#ffffff", roughness: 0.5 }],
  }, null, 2)}\n`);
  await writeFile(join(root, "src/scripts/game.ts"), "export function update(ctx: any) { const dt = ctx.time.fixedDelta; const moveProgress = Math.min(1, dt); void moveProgress; }\n");
  await writeTinyWav(join(root, "assets/hit.wav"));
  await writeFile(join(root, "artifacts/playtest/player-KeyD.png"), "not-a-real-png");
  await writeFile(join(root, "artifacts/game-production/screenshot.png"), "not-a-real-png");
  await writeFile(join(root, "artifacts/game-production/mobile-viewport.png"), "not-a-real-png");
  await writeFile(join(root, "artifacts/game-production/motion.webm"), "not-a-real-webm");
  await writeFile(join(root, "artifacts/game-production/performance.json"), "{\"targetFps\":60,\"frameTimeMs\":16.7}\n");
  await writeFile(join(root, "artifacts/game-production/ui-fit.json"), "{\"viewport\":\"mobile\"}\n");
  await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
  await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
}

async function writeTinyWav(path: string): Promise<void> {
  const data = Buffer.alloc(2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(88200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(path, Buffer.concat([header, data]));
}

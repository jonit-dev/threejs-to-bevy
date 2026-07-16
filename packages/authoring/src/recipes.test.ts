import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getAuthoringOperationDescriptor } from "./operationRegistry.js";
import { applyAuthoringRecipe, listAuthoringRecipeIds, planAuthoringRecipe } from "./recipes.js";

test("should produce deterministic operations for third-person-controller", () => {
  const plan = planAuthoringRecipe({
    args: {
      cameraId: "camera.main",
      entityId: "player",
      sceneId: "arena",
    },
    recipeId: "third-person-controller",
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.operations, [
    { name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } },
    { name: "scene.set_rigid_body", args: { sceneId: "arena", entityId: "player", kind: "kinematic" } },
    { name: "scene.set_collider", args: { sceneId: "arena", entityId: "player", kind: "capsule", center: [0, 0.9, 0], height: 1.8, radius: 0.35 } },
    { name: "scene.set_character_controller", args: { sceneId: "arena", entityId: "player", grounding: "raycast", moveXAxis: "MoveX", moveZAxis: "MoveZ", speed: 6 } },
    { name: "scene.set_camera_component", args: { sceneId: "arena", entityId: "camera.main", mode: "third-person-follow", targetId: "player" } },
  ]);
  assert.equal(plan.operations.every((operation) => getAuthoringOperationDescriptor(operation.name) !== undefined), true);
});

test("should stamp capsule center at half height when third-person recipe applies", () => {
  const plan = planAuthoringRecipe({
    args: {
      cameraId: "camera.main",
      entityId: "player",
      height: 2.2,
      radius: 0.4,
      sceneId: "arena",
    },
    recipeId: "third-person-controller",
  });

  const collider = plan.operations.find((operation) => operation.name === "scene.set_collider");

  assert.equal(plan.ok, true);
  assert.deepEqual(collider?.args, {
    sceneId: "arena",
    entityId: "player",
    kind: "capsule",
    center: [0, 1.1, 0],
    height: 2.2,
    radius: 0.4,
  });
});

test("should report stable diagnostics for unsupported recipe ids", () => {
  const plan = planAuthoringRecipe({ args: {}, recipeId: "unknown" });

  assert.equal(plan.ok, false);
  assert.equal(plan.diagnostics[0]?.code, "TN_AUTHORING_RECIPE_UNSUPPORTED");
});

test("should plan top down collector as a vertical game slice", () => {
  const plan = planAuthoringRecipe({
    args: {
      cameraId: "camera.main",
      inputDocId: "arena-input",
      playerId: "player",
      sceneId: "arena",
    },
    recipeId: "top-down-collector",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.operations.every((operation) => getAuthoringOperationDescriptor(operation.name) !== undefined), true);
  assert.equal(plan.operations.some((operation) => operation.name === "input.add_axis" && operation.args.axisId === "MoveX"), true);
  assert.equal(plan.operations.some((operation) => operation.name === "scene.add_entity" && operation.args.entityId === "player"), true);
  assert.equal(plan.operations.some((operation) => operation.name === "scene.add_entity" && operation.args.entityId === "coin.01"), true);
  assert.equal(plan.operations.some((operation) => operation.name === "scene.add_ui_node" && operation.args.uiNodeId === "hud.score"), true);
  assert.equal(plan.operations.some((operation) => operation.name === "scene.attach_script" && operation.args.modulePath === "src/scripts/player.ts"), true);
  assert.deepEqual(plan.generatedIds.entityId?.includes("player"), true);
  assert.deepEqual(plan.generatedIds.entityId?.includes("coin.01"), true);
  assert.equal(plan.sourceOwners.input?.includes("input.add_axis"), true);
  assert.equal(plan.sourceOwners.systems?.includes("scene.attach_script"), true);
  assert.equal(plan.proofCommands.some((command) => command === "tn playtest scaffold --assert pickup --project . --json"), true);
  assert.equal(plan.proofCommands.some((command) => command.includes("--expect-moved")), false);
  assert.equal(plan.gameplayBlocks.includes("controller.top-down-cardinal"), true);
  assert.equal(plan.scriptResponsibilities.includes("owns collectible progress"), true);
  assert.equal(plan.proofHints.some((hint) => hint.includes("HUD score")), true);
});

test("should register common 3d game vertical slice recipes with supported operations", () => {
  const recipeArgs = {
    "dressed-environment-kit": { sceneId: "arena" },
    "lane-runner": { cameraId: "camera.main", playerId: "runner", sceneId: "arena" },
    "obstacle-avoider": { playerId: "player", sceneId: "arena" },
    "physics-target": { sceneId: "arena", targetId: "target.01" },
    "top-down-collector": { cameraId: "camera.main", playerId: "player", sceneId: "arena" },
    "vehicle-checkpoint": { cameraId: "camera.main", sceneId: "arena", vehicleId: "kart" },
  } as const;

  for (const [recipeId, args] of Object.entries(recipeArgs)) {
    assert.equal(listAuthoringRecipeIds().includes(recipeId as never), true);
    const plan = planAuthoringRecipe({ args, recipeId });
    assert.equal(plan.ok, true, `${recipeId} should plan`);
    assert.equal(plan.operations.length > 0, true, `${recipeId} should emit operations`);
    assert.equal(plan.operations.every((operation) => getAuthoringOperationDescriptor(operation.name) !== undefined), true, `${recipeId} should use supported operations`);
    assert.equal(Object.keys(plan.sourceOwners).length > 0, true, `${recipeId} should declare source owners`);
    assert.equal(Object.keys(plan.generatedIds).length > 0, true, `${recipeId} should declare generated IDs`);
    assert.equal(plan.proofCommands.some((command) => command.includes("tn authoring validate")), true, `${recipeId} should declare proof commands`);
    assert.equal(plan.gameplayBlocks.length > 0, true, `${recipeId} should declare gameplay blocks`);
    assert.equal(plan.proofHints.length > 0, true, `${recipeId} should declare proof hints`);
    assert.equal(plan.scriptResponsibilities.length > 0, true, `${recipeId} should declare script responsibilities`);
    if (recipeId === "vehicle-checkpoint") {
      assert.equal(plan.proofCommands.some((command) => command.includes("--press KeyW")), true);
    }
  }
});

test("should expose gameplay block metadata for maintained recipes", () => {
  const recipeArgs = {
    "dressed-environment-kit": { sceneId: "arena" },
    "lane-runner": { cameraId: "camera.main", playerId: "runner", sceneId: "arena" },
    "obstacle-avoider": { playerId: "player", sceneId: "arena" },
    "physics-target": { sceneId: "arena", targetId: "target.01" },
    "third-person-controller": { cameraId: "camera.main", entityId: "player", sceneId: "arena" },
    "top-down-collector": { cameraId: "camera.main", playerId: "player", sceneId: "arena" },
    "vehicle-checkpoint": { cameraId: "camera.main", sceneId: "arena", vehicleId: "kart" },
  } as const;

  for (const [recipeId, args] of Object.entries(recipeArgs)) {
    const plan = planAuthoringRecipe({ args, recipeId });
    assert.equal(plan.ok, true, `${recipeId} should plan`);
    assert.equal(plan.gameplayBlocks.some((block) => block.startsWith("controller.") || block.startsWith("objective.") || block.startsWith("world.") || block.startsWith("proof.")), true, `${recipeId} should expose gameplay block metadata`);
  }
});

test("should compose spatial recipe atomically from descriptor owners", () => {
  const plan = planAuthoringRecipe({
    args: {},
    recipeCompositions: [{
      gameplayBlocks: ["grid-step", "push-interaction", "occupancy-objective"],
      proofCommands: ["tn playtest --scenario playtests/block-occupancy-objective.playtest.json", "tn recipe remove spatial-grid-objective --project . --json"],
      proofHints: ["descriptor-owned proof"],
      recipeId: "spatial-grid-objective",
      scriptResponsibilities: ["move.grid", "interaction.push", "objective.occupancy", "state.retry"],
      sourceOwners: { systems: ["grid-step", "push-interaction", "occupancy-objective"] },
    }],
    recipeId: "spatial-grid-objective",
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.gameplayBlocks, ["grid-step", "push-interaction", "occupancy-objective"]);
  assert.deepEqual(plan.scriptResponsibilities, ["move.grid", "interaction.push", "objective.occupancy", "state.retry"]);
  assert.equal(plan.proofCommands.some((command) => command.includes("block-occupancy-objective")), true);
  assert.equal(plan.proofCommands.includes("tn recipe remove spatial-grid-objective --project . --json"), true);
  assert.deepEqual(plan.sourceOwners.systems, ["grid-step", "push-interaction", "occupancy-objective"]);
});

test("recipe remains atomic and adoption-aware through batch engine", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-recipe-batch-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const original = `${JSON.stringify({
      schema: "threenative.scene",
      version: "0.1.0",
      id: "arena",
      entities: [
        { id: "player", transform: { position: [4, 0.5, 4] } },
        { id: "camera.main" },
      ],
      prefabs: [],
      resources: [],
      systems: [],
      ui: { bindings: [], nodes: [] },
    }, null, 2)}\n`;
    await writeFile(scenePath, original, "utf8");

    const adopted = await applyAuthoringRecipe({
      args: { cameraId: "camera.main", entityId: "player", sceneId: "arena" },
      projectPath: root,
      recipeId: "third-person-controller",
    });
    assert.equal(adopted.ok, true);
    assert.equal(adopted.changed, false);
    assert.deepEqual(adopted.filesWritten, []);
    assert.equal(adopted.diagnostics.every((diagnostic) => diagnostic.severity !== "error"), true);
    assert.equal(await readFile(scenePath, "utf8"), original);

    const failed = await applyAuthoringRecipe({
      args: { entityId: "runner", inputDocId: "arena-input", sceneId: "missing" },
      projectPath: root,
      recipeId: "kinematic-character",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.changed, false);
    assert.deepEqual(failed.filesWritten, []);
    assert.equal(await readFile(scenePath, "utf8"), original);
    await assert.rejects(access(join(root, "content", "input", "arena-input.input.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

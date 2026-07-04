import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { createGameAgentInventory, GAME_AGENT_INVENTORY_SCHEMA } from "./index.js";

test("should classify structured generated games when content families are present", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-inventory-game-"));
  try {
    await writeJson(root, "package.json", {
      name: "agent-inventory-game",
      scripts: {
        "game:qa": "tn game qa --project . --json",
        playtest: "tn playtest --project . --entity player --press KeyD --expect-moved --json",
      },
    });
    await writeJson(root, "threenative.config.json", {
      entry: "content/scenes/arena.scene.json",
      outDir: "dist/agent-inventory-game.bundle",
      production: {
        assetPlan: {
          audioFeedback: "HUD and visual cue baseline.",
          obstacleEnemy: "Moving hazard drones.",
          playerHero: "Imported hero model.",
          rewardInteractable: "Collectible crystal.",
          uiHud: "Score and status HUD.",
          worldEnvironment: "Authored arena kit.",
        },
        proofCommands: ["tn game score --project . --json"],
        scriptModules: [{ export: "updatePlayer", module: "src/scripts/player.ts", ownsState: ["GameState"], referencedBy: ["content/systems/arena.systems.json"] }],
      },
      schema: "threenative.project",
    });
    await writeGameContent(root);

    const inventory = await createGameAgentInventory({ projectPath: root });

    assert.equal(inventory.schema, GAME_AGENT_INVENTORY_SCHEMA);
    assert.equal(inventory.projectKind, "generated-game");
    assert.equal(inventory.primaryScene?.id, "arena");
    assert.equal(inventory.primaryScene?.file, "content/scenes/arena.scene.json");
    assert.equal(inventory.input.actions.some((action) => action.id === "jump" && action.source === "content/input/arena.input.json"), true);
    assert.equal(inventory.ui.nodes.some((node) => node.id === "hud.score" && node.source === "content/ui/hud.ui.json"), true);
    assert.equal(inventory.materials.materials.some((material) => material.id === "hero"), true);
    assert.equal(inventory.scripts.some((script) => script.module === "src/scripts/player.ts" && script.exportName === "updatePlayer"), true);
    assert.equal(inventory.proofCommands.some((command) => command === "tn game score --project . --json"), true);
    assert.equal(inventory.proofCommands.some((command) => command === "pnpm run game:qa"), true);
    assert.equal(inventory.highValueSurfaces.every((surface) => surface.status === "declared"), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_SOURCE_FAMILY_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should classify physics labs without requiring content source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-inventory-physics-"));
  try {
    await writeJson(root, "package.json", { name: "physics-material-lab" });

    const inventory = await createGameAgentInventory({ projectPath: root });

    assert.equal(inventory.projectKind, "physics-lab");
    assert.equal(inventory.primaryScene, undefined);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_PHYSICS_LAB_CONTENT_OPTIONAL" && diagnostic.severity === "warning"), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_SOURCE_FAMILY_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should merge normalized production metadata into inventory", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-inventory-normalized-"));
  try {
    await writeJson(root, "package.json", { name: "normalized-generated-game" });
    await writeJson(root, "threenative.config.json", {
      entry: "content/scenes/arena.scene.json",
      production: {
        agent: {
          assetSourcing: ["catalog search blocked; local authored kit retained"],
          highValueSurfaces: [
            { id: "playerHero", provenanceStatus: "local-file", sourcePath: "content/assets/arena.assets.json", summary: "Agent hero surface" },
            { id: "obstacleEnemy", provenanceStatus: "authored", sourcePath: "content/scenes/arena.scene.json", summary: "Agent obstacle surface" },
            { id: "rewardInteractable", provenanceStatus: "local-file", sourcePath: "content/assets/arena.assets.json", summary: "Agent reward surface" },
            { id: "worldEnvironment", provenanceStatus: "authored", sourcePath: "content/scenes/arena.scene.json", summary: "Agent world surface" },
            { id: "uiHud", provenanceStatus: "source", sourcePath: "content/ui/hud.ui.json", summary: "Agent HUD surface" },
            { id: "audioFeedback", provenanceStatus: "blocked", sourcePath: "content/assets/arena.assets.json", summary: "Agent audio surface" },
          ],
          knownBlockers: ["audio runtime trigger not wired"],
          proofCommands: ["tn game qa --project . --run-proof --json"],
          scriptModules: [{ export: "agentUpdate", module: "src/scripts/agent.ts", ownsState: ["GameState"], referencedBy: ["content/systems/arena.systems.json"] }],
          sourceShape: {
            scene: ["content/scenes/arena.scene.json"],
            systems: ["content/systems/arena.systems.json"],
          },
          uiStates: [{ id: "gameplay", expectation: "HUD updates score", sourcePath: "content/ui/hud.ui.json" }],
        },
      },
      schema: "threenative.project",
    });
    await writeGameContent(root);

    const inventory = await createGameAgentInventory({ projectPath: root });

    assert.equal(inventory.production.agent?.knownBlockers.includes("audio runtime trigger not wired"), true);
    assert.equal(inventory.production.agent?.sourceShape.scene?.includes("content/scenes/arena.scene.json"), true);
    assert.equal(inventory.production.agent?.uiStates.some((state) => state.id === "gameplay" && state.sourcePath === "content/ui/hud.ui.json"), true);
    assert.equal(inventory.proofCommands.includes("tn game qa --project . --run-proof --json"), true);
    assert.equal(inventory.scripts.some((script) => script.module === "src/scripts/agent.ts" && script.exportName === "agentUpdate"), true);
    assert.equal(inventory.highValueSurfaces.find((surface) => surface.id === "playerHero")?.sourcePath, "content/assets/arena.assets.json");
    assert.equal(inventory.highValueSurfaces.find((surface) => surface.id === "playerHero")?.provenanceStatus, "local-file");
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_HIGH_VALUE_SURFACE_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should merge persisted game plan surface inventory into generated-game inventory", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-inventory-plan-"));
  try {
    await writeJson(root, "package.json", { name: "plan-backed-generated-game" });
    await writeJson(root, "threenative.config.json", {
      entry: "content/scenes/arena.scene.json",
      production: {
        proofCommands: ["tn game qa --project . --run-proof --json"],
      },
      schema: "threenative.project",
    });
    await writeGameContent(root);
    await writeJson(root, "artifacts/game-production/plan.json", {
      assetPlan: [
        { fallback: "Authored hero kit.", sourcePreference: "catalog-first", surface: "player-hero" },
        { fallback: "Authored hazards.", sourcePreference: "catalog-first", surface: "obstacle-enemy" },
        { fallback: "Authored rewards.", sourcePreference: "catalog-first", surface: "reward-interactable" },
        { fallback: "Authored world kit.", sourcePreference: "catalog-first", surface: "world-environment" },
        { fallback: "Retained HUD source.", sourcePreference: "source", surface: "ui-hud" },
        { fallback: "Local audio cue.", sourcePreference: "local-file", surface: "audio-feedback" },
      ],
      proofCommands: ["tn authoring validate --project . --json", "tn build --project . --json"],
      schema: "threenative.game-plan",
    });

    const inventory = await createGameAgentInventory({ projectPath: root });

    assert.equal(inventory.highValueSurfaces.every((surface) => surface.status === "declared"), true);
    assert.equal(inventory.highValueSurfaces.find((surface) => surface.id === "playerHero")?.summary, "Authored hero kit.");
    assert.equal(inventory.proofCommands.includes("tn authoring validate --project . --json"), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_HIGH_VALUE_SURFACE_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should classify racing kit projects separately from generated games", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-inventory-racing-kit-"));
  try {
    await writeJson(root, "package.json", { name: "racing-kit-rally" });
    await writeJson(root, "threenative.config.json", { entry: "content/scenes/rally.scene.json", schema: "threenative.project" });
    await writeJson(root, "content/scenes/rally.scene.json", {
      entities: [{ id: "car", components: { camera: { mode: "perspective" } } }],
      id: "rally",
      schema: "threenative.scene",
    });
    await writeJson(root, "content/systems/rally.systems.json", {
      id: "rally-systems",
      schema: "threenative.systems",
      systems: [{ id: "drive", script: { export: "drive", module: "src/scripts/rally.ts" } }],
    });

    const inventory = await createGameAgentInventory({ projectPath: root });

    assert.equal(inventory.projectKind, "asset-kit");
    assert.equal(inventory.primaryScene?.id, "rally");
    assert.equal(inventory.scripts.some((script) => script.module === "src/scripts/rally.ts"), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_SOURCE_FAMILY_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report incomplete generated-game source owners as warnings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-inventory-incomplete-"));
  try {
    await writeJson(root, "package.json", { name: "incomplete-generated-game" });
    await writeJson(root, "content/scenes/arena.scene.json", {
      id: "arena",
      schema: "threenative.scene",
    });
    await writeJson(root, "content/input/arena.input.json", {
      actions: [{ bindings: ["keyboard.Space"], id: "retry" }],
      id: "arena-input",
      schema: "threenative.input",
    });

    const inventory = await createGameAgentInventory({ projectPath: root });

    assert.equal(inventory.projectKind, "generated-game");
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_SOURCE_FAMILY_MISSING" && diagnostic.message.includes("systems")), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_SCRIPT_OWNER_MISSING"), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_AGENT_HIGH_VALUE_SURFACE_MISSING"), true);
    assert.equal(inventory.recommendedOperations.some((operation) => operation.includes("production.agent.highValueSurfaces")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeGameContent(root: string): Promise<void> {
  await writeJson(root, "content/scenes/arena.scene.json", {
    entities: [
      { id: "camera.main", components: { camera: { mode: "perspective" } } },
      { id: "player", prefab: "prefab.player" },
    ],
    id: "arena",
    resources: [{ id: "GameState", value: { score: 0 } }],
    schema: "threenative.scene",
  });
  await writeJson(root, "content/systems/arena.systems.json", {
    id: "arena-systems",
    schema: "threenative.systems",
    systems: [
      {
        id: "player-system",
        reads: ["Transform"],
        resourceReads: ["GameState"],
        resourceWrites: ["GameState"],
        script: { export: "updatePlayer", module: "src/scripts/player.ts" },
        writes: ["Transform"],
      },
    ],
  });
  await writeJson(root, "content/input/arena.input.json", {
    actions: [{ bindings: ["keyboard.Space"], id: "jump" }],
    axes: [{ id: "move-x", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"] }],
    id: "arena-input",
    schema: "threenative.input",
  });
  await writeJson(root, "content/ui/hud.ui.json", {
    bindings: [{ node: "hud.score", resource: "GameState.score" }],
    id: "hud",
    nodes: [{ id: "hud.score", text: "Score 0", type: "text" }],
    schema: "threenative.ui",
  });
  await writeJson(root, "content/assets/arena.assets.json", {
    assets: [{ id: "hero-model", path: "assets/hero.glb", type: "model" }],
    id: "arena-assets",
    schema: "threenative.assets",
  });
  await writeJson(root, "content/materials/arena.materials.json", {
    id: "arena-materials",
    materials: [{ color: "#ffcc00", id: "hero" }],
    schema: "threenative.materials",
  });
  await writeJson(root, "content/meshes/arena.meshes.json", {
    id: "arena-meshes",
    meshes: [{ id: "ground", kind: "primitive", primitive: "box", size: [1, 1, 1] }],
    schema: "threenative.meshes",
  });
  await writeJson(root, "content/prefabs/arena.prefab.json", {
    entities: [{ id: "prefab.player", components: { MeshRenderer: { material: "hero", mesh: "ground" } } }],
    id: "arena-prefabs",
    schema: "threenative.prefab",
  });
}

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  const absolutePath = join(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createGameQualityReport,
  GAME_ASSET_AUDIO_SURFACE_IDS,
  GAME_UI_STATE_IDS,
  GAME_VISUAL_SCORECARD_CATEGORY_IDS,
  GAME_WORKFLOW_PHASE_IDS,
  probeGameAssetProviders,
  validateGameQualityReport,
} from "./index.js";

test("validates game quality reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-valid-"));
  try {
    await writeMinimalProject(root);
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "artifacts/game-production/playtest-report.json"), "{}\n");
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), "not-a-real-png");
    await writeFile(join(root, "artifacts/game-production/mobile-viewport.json"), "{}\n");
    await mkdir(join(root, "dist/game.bundle"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");

    const report = await createGameQualityReport({ generatedAt: "2026-07-01T00:00:00.000Z", projectPath: root });
    const diagnostics = validateGameQualityReport(report);

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(report.phaseLedgers.map((phase) => phase.id), [...GAME_WORKFLOW_PHASE_IDS]);
    assert.deepEqual(report.scorecard.map((category) => category.id), [...GAME_VISUAL_SCORECARD_CATEGORY_IDS]);
    assert.deepEqual(report.uiStates.map((state) => state.id), [...GAME_UI_STATE_IDS]);
    assert.deepEqual(report.assetAudioLedger.map((entry) => entry.surface), [...GAME_ASSET_AUDIO_SURFACE_IDS]);
    assert.equal(report.productionCommands.some((command) => command.phase === "gameplay"), true);
    assert.equal(report.release.risks.some((risk) => risk.code === "TN_GAME_RELEASE_ASSET_BUDGET_UNVERIFIED"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_PLAYABLE_LOOP_MISSING"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("redacts provider credentials from provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-provider-redact-"));
  try {
    await writeMinimalProject(root);
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "artifacts/game-production/playtest-report.json"), "{}\n");
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), "not-a-real-png");
    await writeFile(join(root, "artifacts/game-production/mobile-viewport.json"), "{}\n");
    await mkdir(join(root, "dist/game.bundle"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");

    const report = await createGameQualityReport({
      projectPath: root,
      providerEnvironment: {
        ELEVENLABS_API_KEY: "secret-elevenlabs-key",
        GEMINI_API_KEY: "",
        TRIPO_API_KEY: "secret-tripo-key",
      },
    });
    const serialized = JSON.stringify(report);

    assert.equal(serialized.includes("secret-"), false);
    assert.deepEqual(probeGameAssetProviders({ TRIPO_API_KEY: "secret-tripo-key" })[0], {
      credentialEnv: "TRIPO_API_KEY",
      id: "tripo",
      purpose: "model",
      status: "available",
    });
    assert.equal(report.providerProbes.find((probe) => probe.id === "elevenlabs")?.status, "available");
    assert.equal(report.providerProbes.find((probe) => probe.id === "gemini")?.status, "missing-credential");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects malformed scorecard categories", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-invalid-"));
  try {
    await writeMinimalProject(root);
    const report = await createGameQualityReport({ projectPath: root });
    const malformed = {
      ...report,
      scorecard: report.scorecard.slice(1),
    };

    const diagnostics = validateGameQualityReport(malformed);

    assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_REPORT_SCORECARD_CATEGORY_INVALID" && diagnostic.path === "/scorecard/art-direction"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeMinimalProject(root: string): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/input"), { recursive: true });
  await mkdir(join(root, "content/ui"), { recursive: true });
  await mkdir(join(root, "content/assets"), { recursive: true });
  await mkdir(join(root, "content/materials"), { recursive: true });
  await mkdir(join(root, "src/scripts"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
    schema: "threenative.scene",
    id: "arena",
    entities: [{ id: "player" }],
    systems: [{ id: "gameplay", script: { module: "src/scripts/game.ts", export: "update" } }],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/input/arena.input.json"), `${JSON.stringify({
    schema: "threenative.input",
    id: "arena-input",
    actions: [{ id: "jump", bindings: ["keyboard.Space"] }],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/ui/hud.ui.json"), `${JSON.stringify({
    schema: "threenative.ui",
    id: "hud",
    nodes: [
      { id: "gameplay-hud", text: "Score" },
      { id: "pause-menu", text: "Pause" },
      { id: "settings-menu", text: "Settings" },
      { id: "loading-screen", text: "Loading" },
      { id: "fail-retry", text: "Retry" },
      { id: "win-milestone", text: "Win" },
      { id: "touch-controls", text: "Touch" },
    ],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/assets/arena.assets.json"), `${JSON.stringify({
    schema: "threenative.assets",
    id: "arena-assets",
    assets: [
      { id: "player-hero", path: "assets/player.glb", type: "model" },
      { id: "obstacle-enemy", path: "assets/enemy.glb", type: "model" },
      { id: "reward-interactable", path: "assets/goal.glb", type: "model" },
      { id: "world-environment", path: "assets/arena.glb", type: "model" },
      { id: "ui-hud", path: "assets/hud.png", type: "texture" },
      { id: "audio-feedback", path: "assets/hit.wav", type: "audio" },
    ],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/materials/arena.materials.json"), `${JSON.stringify({
    schema: "threenative.materials",
    id: "arena-materials",
    materials: [{ id: "player-style", color: "#ffffff" }],
  }, null, 2)}\n`);
  await writeFile(join(root, "src/scripts/game.ts"), "export function update() {}\n");
}

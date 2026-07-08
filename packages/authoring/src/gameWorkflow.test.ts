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
    await writeFile(join(root, "artifacts/game-production/motion-report.json"), "{\"frameDiff\":{\"changedPixelRatio\":0.02},\"motion\":\"smooth\"}\n");
    await writeFile(join(root, "artifacts/game-production/performance-target.json"), "{\"targetFps\":60,\"frameTimeMs\":16.7}\n");
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
    assert.equal(report.phaseLedgers.find((phase) => phase.id === "visuals")?.status, "pass");
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_PLAYABLE_LOOP_MISSING"), false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_MOTION_FEEL_UNPROVEN"), false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_VISUAL_BASELINE_PLACEHOLDER"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("recognizes themed obstacle enemy provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-themed-obstacle-"));
  try {
    await writeMinimalProject(root);
    await writeFile(join(root, "content/assets/arena.assets.json"), `${JSON.stringify({
      schema: "threenative.assets",
      id: "arena-assets",
      assets: [
        { id: "asset.custom-kit", path: "content/scenes/arena.scene.json", type: "source" },
        { id: "asset.provenance", path: "assets/ASSET_PROVENANCE.md", type: "document" },
        { id: "player-hero", path: "assets/player.glb", type: "model" },
        { id: "reward-interactable", path: "assets/goal.glb", type: "model" },
        { id: "world-environment", path: "assets/arena.glb", type: "model" },
        { id: "ui-hud", path: "assets/hud.png", type: "texture" },
        { id: "audio-feedback", path: "assets/hit.wav", type: "audio" },
      ],
    }, null, 2)}\n`);
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      schema: "threenative.scene",
      id: "arena",
      entities: [
        {
          id: "visual.provenance",
          components: {
            VisualProvenance: {
              surfaces: "Drifting moth shadows with warning halos act as the main avoidable threat.",
            },
          },
        },
      ],
      systems: [{ id: "gameplay", script: { module: "src/scripts/game.ts", export: "update" } }],
    }, null, 2)}\n`);
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/ASSET_PROVENANCE.md"), "Drifting moth shadows with warning halos act as the main avoidable threat.\n");

    const report = await createGameQualityReport({ projectPath: root });
    const obstacleEntry = report.assetAudioLedger.find((entry) => entry.surface === "obstacle-enemy");

    assert.notEqual(obstacleEntry?.status, "blocked");
    assert.equal(report.blockers.some((diagnostic) => diagnostic.path === "/assetAudioLedger/obstacle-enemy"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("production command build proof uses discovered bundle manifest path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-build-command-"));
  try {
    await writeMinimalProject(root);
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
      entry: "content/scenes/arena.scene.json",
      outDir: "dist/custom-generated.bundle",
      schema: "threenative.project",
      version: "0.1.0",
    }, null, 2)}\n`);
    await mkdir(join(root, "dist/custom-generated.bundle"), { recursive: true });
    await writeFile(join(root, "dist/custom-generated.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/custom-generated.bundle/world.ir.json"), "{}\n");
    await mkdir(join(root, "dist/structured-source-starter.bundle"), { recursive: true });
    await writeFile(join(root, "dist/structured-source-starter.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/structured-source-starter.bundle/world.ir.json"), "{}\n");

    const report = await createGameQualityReport({ projectPath: root });
    const buildCommand = report.productionCommands.find((command) => command.command === "tn build --project . --json");

    assert.equal(buildCommand?.status, "available");
    assert.equal(buildCommand?.artifactPath, "dist/custom-generated.bundle/manifest.json");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ignores transient compiler build lock artifact evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-build-lock-evidence-"));
  try {
    await writeMinimalProject(root);
    await mkdir(join(root, "dist/game.bundle"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
    await mkdir(join(root, "dist/game.bundle.build-lock"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle.build-lock/owner.json"), "{}\n");

    const report = await createGameQualityReport({ projectPath: root });

    assert.equal(JSON.stringify(report).includes(".build-lock"), false);
    assert.equal(report.productionCommands.find((command) => command.command === "tn build --project . --json")?.artifactPath, "dist/game.bundle/manifest.json");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("blocks text files masquerading as audio feedback wav assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-bad-audio-"));
  try {
    await writeMinimalProject(root);
    await writeFile(join(root, "assets/hit.wav"), "placeholder wav fixture\n");

    const report = await createGameQualityReport({ projectPath: root });

    assert.equal(report.blockers.some((diagnostic) => diagnostic.code === "TN_GAME_AUDIO_ASSET_INVALID" && diagnostic.path?.includes("assets/hit.wav") === true), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("blocks placeholder visuals and unproven snap movement", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-placeholder-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "content/input"), { recursive: true });
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      schema: "threenative.scene",
      id: "arena",
      entities: [{ id: "player", prefab: "prefab.player" }],
      prefabs: [{ id: "prefab.player", primitive: "box", color: "#ffffff" }],
      systems: [{ id: "snap", script: { module: "src/scripts/game.ts", export: "update" } }],
    }, null, 2)}\n`);
    await writeFile(join(root, "content/input/arena.input.json"), `${JSON.stringify({
      schema: "threenative.input",
      id: "arena-input",
      actions: [{ id: "move", bindings: ["keyboard.Space"] }],
    }, null, 2)}\n`);
    await writeFile(join(root, "src/scripts/game.ts"), "export function update(ctx: any) { ctx.entity('player')?.transform().setPosition([1, 0, 0]); }\n");

    const report = await createGameQualityReport({ projectPath: root });

    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_MOTION_FEEL_UNPROVEN"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_VISUAL_BASELINE_PLACEHOLDER"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts composed primitive visual source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-composed-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/game.ts"), `
import {
  AmbientLight,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  defineInputMap,
  keyboard,
} from "@threenative/sdk";

const paint = new MeshStandardMaterial({ color: "#f6efe0" });
const chicken = new Mesh({ id: "chicken", geometry: new SphereGeometry({ radius: 0.5 }), material: paint });
chicken.add(new Mesh({ id: "chicken.head", geometry: new SphereGeometry({ radius: 0.25 }), material: paint }));
chicken.add(new Mesh({ id: "chicken.beak", geometry: new ConeGeometry({ radius: 0.1, height: 0.2 }), material: paint }));
chicken.add(new Mesh({ id: "chicken.leg.left", geometry: new CylinderGeometry({ radius: 0.04, height: 0.3 }), material: paint }));
const car = new Mesh({ id: "traffic.car", geometry: new BoxGeometry({ size: [1, 0.3, 0.5] }), material: paint });
car.add(new Mesh({ id: "traffic.car.cabin", geometry: new BoxGeometry({ size: [0.4, 0.3, 0.4] }), material: paint }));
car.add(new Mesh({ id: "traffic.car.wheel", geometry: new CylinderGeometry({ radius: 0.12, height: 0.1 }), material: paint }));
const lane = new Mesh({ id: "lane.dash", geometry: new BoxGeometry({ size: [0.7, 0.02, 0.08] }), material: paint });
const sign = new Mesh({ id: "road.sign", geometry: new BoxGeometry({ size: [0.5, 0.3, 0.05] }), material: paint });
const light = new AmbientLight({ id: "ambient", intensity: 1 });
const input = defineInputMap({ actions: [{ id: "move-up", bindings: [keyboard("KeyW")] }] });
function addChicken() { return chicken; }
function addCar() { return car; }
function addLaneMarks() { return lane; }
function addRoadsideProps() { return sign; }
function addLighting() { return light; }
void input;
void addChicken;
void addCar;
void addLaneMarks;
void addRoadsideProps;
void addLighting;
`);
    await writeFile(join(root, "src/scripts/game.ts"), "export function update(ctx: any) { const moveProgress = ctx.time.fixedDelta; void moveProgress; }\n");

    const report = await createGameQualityReport({ projectPath: root });

    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_VISUAL_BASELINE_PLACEHOLDER"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("penalizes flat world proof even when terrain source exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-flat-world-"));
  try {
    await writeMinimalProject(root);
    await mkdir(join(root, "content/environment"), { recursive: true });
    await mkdir(join(root, "artifacts/world"), { recursive: true });
    await writeFile(join(root, "content/environment/world.environment.json"), `${JSON.stringify({
      schema: "threenative.environment-scene",
      id: "world",
      terrain: { id: "terrain.world", heightMode: "heightmap", heightmap: { asset: "heightmap.world" } },
      scatter: [{ id: "scatter.world", assetIds: ["rock"], density: 0.01 }],
    }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/world/world-proof.json"), `${JSON.stringify({
      schema: "threenative.world-proof",
      code: "TN_WORLD_PROOF_FAILED",
      flatPlaneRisk: true,
      diagnostics: [{ code: "TN_WORLD_PROOF_HEIGHTMAP_FLAT", severity: "error" }],
      scatterLayers: 1,
    }, null, 2)}\n`);

    const report = await createGameQualityReport({ projectPath: root });

    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_WORLD_PROOF_MISSING"), true);
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

test("keeps source evidence descriptions compact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-report-compact-evidence-"));
  try {
    await writeMinimalProject(root);
    const longScript = [
      "export function update(ctx: any) {",
      "  const token = 'secret-local-fixture';",
      ...Array.from({ length: 200 }, (_, index) => `  const value${index} = ${index};`),
      "  void ctx;",
      "  void token;",
      "}",
    ].join("\n");
    await writeFile(join(root, "src/scripts/game.ts"), longScript);

    const report = await createGameQualityReport({ projectPath: root });
    const sourceEvidence = report.evidence.filter((evidence) => evidence.kind === "source");
    const serialized = JSON.stringify(report);

    assert.equal(sourceEvidence.length > 0, true);
    assert.equal(sourceEvidence.every((evidence) => evidence.description.length < 900), true);
    assert.equal(serialized.includes("secret-local-fixture"), false);
    assert.equal(serialized.includes("value199"), false);
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
  await mkdir(join(root, "assets"), { recursive: true });
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
  await writeTinyWav(join(root, "assets/hit.wav"));
  await writeFile(join(root, "src/scripts/game.ts"), "export function update(ctx: any) { const dt = ctx.time.fixedDelta; const moveProgress = Math.min(1, dt); void moveProgress; }\n");
}

async function writeTinyWav(path: string): Promise<void> {
  const dataSize = 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(88200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.writeInt16LE(0, 44);
  await writeFile(path, buffer);
}

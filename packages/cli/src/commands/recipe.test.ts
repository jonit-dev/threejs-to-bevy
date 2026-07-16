import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recipeCommand } from "./recipe.js";

test("should apply collectible recipe to structured source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-"));
  try {
    await writeScene(root, "arena");
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "src", "scripts", "collectible.ts"), "export function collectible() {}\n", "utf8");

    const result = await recipeCommand(["collectible", "--scene", "arena", "--entity", "coin.001", "--project", root, "--json", "--full-json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
      resources: Array<{ id: string; path?: string; value?: unknown }>;
      systems: Array<{ id: string; script?: { export: string; module: string }; source?: string }>;
      ui: { bindings: Array<{ node: string; resource: string }>; nodes: Array<{ id: string }> };
    };
    const payload = JSON.parse(result.stdout) as {
      filesWritten: string[];
      operations: Array<{ name: string }>;
      proofEnrollment: { planFound: boolean; requiredAcceptanceIds: string[] };
    };
    const coin = scene.entities.find((entity) => entity.id === "coin.001");

    assert.equal(result.exitCode, 0);
    assert.equal(coin?.components?.Collider !== undefined, true);
    assert.equal((coin?.components?.Collider as { trigger?: boolean } | undefined)?.trigger, true);
    assert.deepEqual(scene.systems, [{ id: "coin.001.collect", script: { export: "collectible", module: "src/scripts/collectible.ts" } }]);
    assert.deepEqual(scene.resources, [{ id: "coin.001.collected", path: "collectibles.coin.001.collected", value: false }]);
    assert.deepEqual(scene.ui.nodes, [{ id: "coin.001.prompt" }]);
    assert.deepEqual(scene.ui.bindings, [{ node: "coin.001.prompt", resource: "coin.001.collected" }]);
    assert.deepEqual(payload.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(payload.proofEnrollment, { enrolledAcceptanceIds: [], missingAcceptanceIds: [], planFound: false, requiredAcceptanceIds: [] });
    assert.deepEqual(payload.operations.map((operation) => operation.name), [
      "scene.add_prefab",
      "scene.add_entity",
      "scene.set_transform",
      "scene.set_collider",
      "scene.attach_script",
      "scene.add_resource",
      "scene.add_ui_node",
      "scene.bind_ui",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should return a dry-run plan without writing source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-dry-run-"));
  try {
    await writeScene(root, "arena");
    const result = await recipeCommand(["health-bar", "--scene", "arena", "--entity", "player", "--project", root, "--dry-run", "--json"]);
    const payload = JSON.parse(result.stdout) as { operations: Array<{ name: string }> };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as { resources?: unknown[] };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.operations.map((operation) => operation.name), ["scene.add_resource", "scene.add_ui_node", "scene.bind_ui"]);
    assert.deepEqual(scene.resources, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should apply top-down collector through apply alias", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-apply-kit-"));
  try {
    await writeScene(root, "arena", [{ id: "camera.main" }]);
    const result = await recipeCommand([
      "apply",
      "top-down-collector",
      "--scene",
      "arena",
      "--player",
      "player",
      "--camera",
      "camera.main",
      "--input-doc",
      "arena-input",
      "--project",
      root,
      "--json",
      "--full-json",
    ]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string }>;
      resources: Array<{ id: string }>;
      systems: Array<{ id: string; script?: { export: string; module: string }; source?: string }>;
    };
    const payload = JSON.parse(result.stdout) as {
      code: string;
      filesWritten: string[];
      operations: Array<{ name: string }>;
      recipeId: string;
    };
    const script = await readFile(join(root, "src", "scripts", "player.ts"), "utf8");
    const proof = JSON.parse(await readFile(join(root, "content", "proofs", "top-down-collector.proof.json"), "utf8")) as {
      commands: string[];
      recipeId: string;
      schema: string;
    };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.code, "TN_RECIPE_APPLY_OK");
    assert.equal(payload.recipeId, "top-down-collector");
    assert.equal(payload.filesWritten.includes("content/scenes/arena.scene.json"), true);
    assert.equal(payload.filesWritten.includes("content/proofs/top-down-collector.proof.json"), true);
    assert.equal(payload.filesWritten.includes("src/scripts/player.ts"), true);
    assert.equal(payload.operations.some((operation) => operation.name === "input.add_axis"), true);
    assert.equal(payload.operations.some((operation) => operation.name === "scene.attach_script"), true);
    assert.equal(scene.entities.some((entity) => entity.id === "player"), true);
    assert.equal(scene.resources.some((resource) => resource.id === "GameState"), true);
    assert.equal(scene.systems.some((system) => system.script?.module === "src/scripts/player.ts" && system.script.export === "topDownCollectorSystem"), true);
    assert.equal(scene.systems.find((system) => system.id === "top-down-collector")?.source, "behavior-metadata");
    assert.match(script, /export const topDownCollectorSystem = defineBehavior/);
    assert.match(script, /moveX/);
    assert.match(script, /moveZ/);
    assert.equal(proof.schema, "threenative.proof-recipe");
    assert.equal(proof.recipeId, "top-down-collector");
    assert.equal(proof.commands.some((command) => command.startsWith("tn authoring validate")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("vehicle checkpoint adopts starter entities, scaffolds its export, and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-vehicle-adopt-"));
  try {
    await writeScene(root, "arena", [{ id: "player", transform: { position: [4, 0.5, 4], scale: [0.8, 0.8, 0.8] } }, { id: "camera.main" }]);
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const starterScene = JSON.parse(await readFile(scenePath, "utf8")) as { systems: unknown[] };
    starterScene.systems.push({ id: "move-player-to-goal", script: { export: "movePlayerToGoal", module: "src/scripts/player.ts" } });
    await writeFile(scenePath, `${JSON.stringify(starterScene, null, 2)}\n`, "utf8");
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function starterSystem(): void {}\n", "utf8");
    const argv = ["apply", "vehicle-checkpoint", "--scene", "arena", "--vehicle", "player", "--camera", "camera.main", "--project", root, "--json"];

    const first = await recipeCommand(argv);
    const second = await recipeCommand(argv);
    const firstPayload = JSON.parse(first.stdout) as { filesWritten: string[]; ok: boolean };
    const secondPayload = JSON.parse(second.stdout) as { changed: boolean; diagnostics: Array<{ code: string; severity: string }>; filesWritten: string[]; ok: boolean; operations?: unknown };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[]; scale?: number[] } }>;
      systems: Array<{ id: string }>;
    };
    const script = await readFile(join(root, "src", "scripts", "player.ts"), "utf8");

    assert.equal(first.exitCode, 0, first.stdout);
    assert.equal(second.exitCode, 0, second.stdout);
    assert.equal(firstPayload.ok, true);
    assert.equal(secondPayload.ok, true);
    assert.equal(secondPayload.changed, false);
    assert.deepEqual(secondPayload.filesWritten, []);
    assert.equal(secondPayload.operations, undefined);
    assert.equal(Buffer.byteLength(second.stdout, "utf8") < 2_048, true, `Expected compact retry JSON, received ${Buffer.byteLength(second.stdout, "utf8")} bytes.`);
    assert.equal(scene.entities.filter((entity) => entity.id === "player").length, 1);
    assert.equal(scene.entities.filter((entity) => entity.id === "checkpoint.01").length, 1);
    assert.equal(scene.entities.filter((entity) => entity.id.startsWith("checkpoint.")).length, 5);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.transform, { position: [4, 0.5, 4], scale: [0.8, 0.8, 0.8] });
    assert.equal(scene.systems.filter((system) => system.id === "vehicle-checkpoint").length, 1);
    assert.match(script, /export function starterSystem/);
    assert.match(script, /export const vehicleCheckpointSystem = defineBehavior/);
    assert.match(script, /context\.resources\.get\("RaceState"/);
    assert.match(script, /race\.nextCheckpoint/);
    assert.equal(firstPayload.filesWritten.includes("src/scripts/player.ts"), true);
    assert.equal(firstPayload.filesWritten.includes("playtests/vehicle-checkpoint.playtest.json"), true);
    assert.equal(firstPayload.filesWritten.includes("playtests/vehicle-checkpoint-retry.playtest.json"), true);
    assert.equal(secondPayload.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("recipe staging preserves the complete existing script dependency closure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-script-closure-"));
  try {
    await writeScene(root, "arena");
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as { systems: unknown[] };
    scene.systems.push({ id: "existing", script: { export: "existing", module: "src/scripts/existing.ts" } });
    await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "src", "scripts", "existing.ts"), "export function existing(): void {}\n", "utf8");

    const result = await recipeCommand(["collectible", "--scene", "arena", "--entity", "coin.001", "--project", root, "--json"]);

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(await readFile(join(root, "src", "scripts", "existing.ts"), "utf8"), /export function existing/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("vehicle checkpoint resolves a logical scene id independently of its filename", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-logical-scene-"));
  try {
    await writeScene(root, "arena", [{ id: "player" }, { id: "camera.main" }], "main-level");
    const scenePath = join(root, "content", "scenes", "main-level.scene.json");
    const authoredScene = JSON.parse(await readFile(scenePath, "utf8")) as { entities: Array<{ components?: Record<string, unknown>; id: string }> };
    authoredScene.entities.find((entity) => entity.id === "player")!.components = { PlayerCar: {} };
    await writeFile(scenePath, `${JSON.stringify(authoredScene, null, 2)}\n`, "utf8");
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await writeFile(join(root, "content", "systems", "legacy.systems.json"), `${JSON.stringify({ id: "legacy", schema: "threenative.systems", systems: [{ id: "move-player-to-goal", reads: ["PlayerCar"], writes: ["Transform"] }], version: "0.1.0" }, null, 2)}\n`, "utf8");

    const result = await recipeCommand(["vehicle-checkpoint", "--scene", "arena", "--vehicle", "player", "--camera", "camera.main", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "main-level.scene.json"), "utf8")) as { systems: Array<{ id: string; source?: string }> };
    const systems = JSON.parse(await readFile(join(root, "content", "systems", "legacy.systems.json"), "utf8")) as { systems: unknown[] };
    const script = await readFile(join(root, "src", "scripts", "player.ts"), "utf8");

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(scene.systems.some((system) => system.id === "vehicle-checkpoint" && system.source === "behavior-metadata"), true);
    assert.deepEqual(systems.systems, []);
    assert.match(script, /resourceWrites: \["RaceState"\].*writes: \["Transform"\]/);
    await assert.rejects(access(join(root, "content", "scenes", "arena.scene.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("failed recipe apply is transactional and reports every exact required flag", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-transaction-"));
  try {
    await writeScene(root, "arena", [{ id: "player" }]);
    const before = await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8");
    const missing = await recipeCommand(["apply", "vehicle-checkpoint", "--project", root, "--json"]);
    const missingPayload = JSON.parse(missing.stdout) as { diagnostics: Array<{ message: string; suggestion?: string }> };
    const failed = await recipeCommand(["apply", "vehicle-checkpoint", "--scene", "missing", "--vehicle", "player", "--camera", "camera.main", "--project", root, "--json"]);
    const failedPayload = JSON.parse(failed.stdout) as { changed: boolean; filesWritten: string[] };

    assert.equal(missing.exitCode, 1);
    assert.equal(missingPayload.diagnostics.length, 3);
    assert.match(missingPayload.diagnostics.map((diagnostic) => `${diagnostic.message} ${diagnostic.suggestion}`).join("\n"), /--scene <scene-id>/);
    assert.match(missingPayload.diagnostics.map((diagnostic) => `${diagnostic.message} ${diagnostic.suggestion}`).join("\n"), /--vehicle <vehicle-id>/);
    assert.match(missingPayload.diagnostics.map((diagnostic) => `${diagnostic.message} ${diagnostic.suggestion}`).join("\n"), /--camera <camera-id>/);
    assert.equal(failed.exitCode, 1);
    assert.equal(failedPayload.changed, false);
    assert.deepEqual(failedPayload.filesWritten, []);
    assert.equal(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8"), before);
    await assert.rejects(access(join(root, "content", "input", "arena-input.input.json")));
    await assert.rejects(access(join(root, "src", "scripts", "player.ts")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit prompt-relevant proof and removal commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-spatial-recipe-"));
  try {
    await writeSpatialStarter(root);
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({ intentContract: { acceptanceAssertions: [
      { id: "webgl-canvas", required: true },
      { id: "grid-movement", required: true },
      { id: "crate-push", required: true },
      { id: "goal-progress", required: true },
      { id: "retry-path", required: true },
    ] } }, null, 2)}\n`);
    const result = await recipeCommand(["apply", "spatial-grid-objective", "--project", root, "--json", "--full-json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[]; gameplayBlocks: string[]; nextProofCommand: string; proofCommands: string[]; proofEnrollment: { missingAcceptanceIds: string[]; requiredAcceptanceIds: string[] } };
    const systems = JSON.parse(await readFile(join(root, "content/systems/arena.systems.json"), "utf8")) as { systems: Array<{ id: string }> };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(payload.gameplayBlocks, ["grid-step", "push-interaction", "occupancy-objective"]);
    assert.equal(payload.proofCommands.some((command) => command.includes("block-push-interaction")), true);
    assert.equal(payload.proofCommands.includes("tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json"), true);
    assert.equal(payload.proofCommands.includes("tn recipe remove spatial-grid-objective --project . --json"), true);
    assert.equal(payload.nextProofCommand, "tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json");
    assert.deepEqual(payload.proofEnrollment.requiredAcceptanceIds, ["webgl-canvas", "grid-movement", "crate-push", "goal-progress", "retry-path"]);
    assert.deepEqual(payload.proofEnrollment.missingAcceptanceIds, payload.proofEnrollment.requiredAcceptanceIds);
    assert.equal(payload.filesWritten.includes("src/scripts/spatial.ts"), true);
    assert.deepEqual(systems.systems.map((system) => system.id), ["spatial-mechanics"]);
    const removed = await recipeCommand(["remove", "spatial-grid-objective", "--project", root, "--json"]);
    const removedPayload = JSON.parse(removed.stdout) as { code: string; filesRemoved: string[]; ok: boolean };
    const cleanedSystems = JSON.parse(await readFile(join(root, "content/systems/arena.systems.json"), "utf8")) as { systems: unknown[] };
    assert.equal(removed.exitCode, 0, removed.stdout);
    assert.equal(removedPayload.code, "TN_RECIPE_REMOVE_OK");
    assert.equal(removedPayload.filesRemoved.includes("src/scripts/spatial.ts"), true);
    assert.deepEqual(cleanedSystems.systems, []);
    await assert.rejects(access(join(root, "src/scripts/spatial.ts")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeScene(
  root: string,
  sceneId: string,
  entities: Array<{ id: string; transform?: { position?: number[]; scale?: number[] } }> = [],
  fileName = sceneId,
): Promise<void> {
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", `${fileName}.scene.json`),
    `${JSON.stringify(
      {
        schema: "threenative.scene",
        version: "0.1.0",
        id: sceneId,
        entities,
        prefabs: [],
        resources: [],
        systems: [],
        ui: { nodes: [], bindings: [] },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function writeSpatialStarter(root: string): Promise<void> {
  await writeScene(root, "arena", [{ id: "player", transform: { position: [0, 0.35, 0] } }]);
  for (const [directory, file, document] of [
    ["input", "arena.input.json", { actions: [], id: "arena-input", schema: "threenative.input", version: "0.1.0" }],
    ["systems", "arena.systems.json", { id: "arena-systems", schema: "threenative.systems", systems: [], version: "0.1.0" }],
    ["ui", "hud.ui.json", { bindings: [], id: "hud", nodes: [], schema: "threenative.ui", version: "0.1.0" }],
  ] as const) {
    await mkdir(join(root, "content", directory), { recursive: true });
    await writeFile(join(root, "content", directory, file), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
}

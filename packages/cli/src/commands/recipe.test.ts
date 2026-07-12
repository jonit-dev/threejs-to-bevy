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
      systems: Array<{ id: string; script?: { export: string; module: string } }>;
      ui: { bindings: Array<{ node: string; resource: string }>; nodes: Array<{ id: string }> };
    };
    const payload = JSON.parse(result.stdout) as {
      filesWritten: string[];
      operations: Array<{ name: string }>;
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
      systems: Array<{ id: string; script?: { export: string; module: string } }>;
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
    assert.equal(scene.resources.some((resource) => resource.id === "GameState.scoreText"), true);
    assert.equal(scene.systems.some((system) => system.script?.module === "src/scripts/player.ts" && system.script.export === "topDownCollectorSystem"), true);
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
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.transform, { position: [4, 0.5, 4], scale: [0.8, 0.8, 0.8] });
    assert.equal(scene.systems.filter((system) => system.id === "vehicle-checkpoint").length, 1);
    assert.match(script, /export function starterSystem/);
    assert.match(script, /export const vehicleCheckpointSystem = defineBehavior/);
    assert.match(script, /context\.resources\.get\("RecipeState"/);
    assert.equal(firstPayload.filesWritten.includes("src/scripts/player.ts"), true);
    assert.equal(secondPayload.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
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

async function writeScene(root: string, sceneId: string, entities: Array<{ id: string; transform?: { position?: number[]; scale?: number[] } }> = []): Promise<void> {
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", `${sceneId}.scene.json`),
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

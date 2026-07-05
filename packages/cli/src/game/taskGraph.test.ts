import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildGameTaskGraph } from "./taskGraph.js";

test("prioritizes missing script export before screenshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-task-graph-missing-script-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena", entities: [] }, null, 2)}\n`);

    const graph = await buildGameTaskGraph({ projectPath: root });

    assert.equal(graph.schema, "threenative.game-task-graph");
    assert.equal(graph.recommendations[0]?.id, "wire-gameplay-script");
    assert.equal(graph.recommendations[0]?.phase, "gameplay");
    assert.equal(graph.recommendations[0]?.blockingDiagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_TASK_SOURCE_MISSING"), true);
    assert.equal(graph.recommendations.some((recommendation) => recommendation.id === "capture-screenshot-proof"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("marks screenshot proof as next action after source blockers are resolved", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-task-graph-proof-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena", entities: [] }, null, 2)}\n`);
    await writeFile(join(root, "content", "systems", "arena.systems.json"), `${JSON.stringify({ schema: "threenative.systems", id: "arena-systems", systems: [{ id: "gameplay", script: { module: "src/scripts/player.ts", export: "updatePlayer" } }] }, null, 2)}\n`);
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function updatePlayer(): void {}\n");

    const graph = await buildGameTaskGraph({ projectPath: root });

    assert.equal(graph.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_TASK_SOURCE_MISSING"), false);
    assert.equal(graph.recommendations.some((recommendation) => recommendation.id === "capture-screenshot-proof" && recommendation.expectedProof === "artifacts/game-production/screenshot.png"), true);
    assert.equal(graph.recommendations.some((recommendation) => recommendation.id === "prove-relative-scale"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("marks screenshot proof stale when source changed after capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-task-graph-stale-screenshot-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await mkdir(join(root, "content", "systems"), { recursive: true });
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await mkdir(join(root, "artifacts", "game-production"), { recursive: true });
    await writeFile(join(root, "artifacts", "game-production", "screenshot.png"), "png");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena", entities: [] }, null, 2)}\n`);
    await writeFile(join(root, "content", "systems", "arena.systems.json"), `${JSON.stringify({ schema: "threenative.systems", id: "arena-systems", systems: [{ id: "gameplay", script: { module: "src/scripts/player.ts", export: "updatePlayer" } }] }, null, 2)}\n`);
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function updatePlayer(): void {}\n");

    const graph = await buildGameTaskGraph({ projectPath: root });

    assert.equal(graph.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_TASK_PROOF_STALE"), true);
    assert.equal(graph.recommendations.some((recommendation) => recommendation.id === "refresh-stale-screenshot-proof"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

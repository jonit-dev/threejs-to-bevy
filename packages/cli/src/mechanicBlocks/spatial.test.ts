import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { addCommand } from "../commands/add.js";
import { createProject } from "../commands/create.js";
import { resolveSpatialStep } from "./spatial.js";

test("should compose grid push and occupancy without duplicate owners", async () => {
  const root = await fixtureProject("spatial-compose");
  try {
    for (const args of [["grid-step"], ["push-interaction"], ["occupancy-objective"]]) {
      const result = await addCommand([...args, "--project", root, "--json"]);
      assert.equal(result.exitCode, 0, result.stdout);
    }
    const scene = await json(root, "content/scenes/arena.scene.json");
    const systems = await json(root, "content/systems/arena.systems.json");
    const ui = await json(root, "content/ui/hud.ui.json");
    const script = await readFile(join(root, "src/scripts/spatial.ts"), "utf8");
    const occupancyProof = await json(root, "playtests/block-occupancy-objective.playtest.json");
    const boundsProof = await json(root, "playtests/block-grid-step.playtest.json");
    const sceneSystems = records(scene.systems);
    const siblingSystems = records(systems.systems);
    const crates = records(scene.entities).filter((entity) => strings(entity.tags).includes("pushable"));
    const targets = records(scene.entities).filter((entity) => strings(entity.tags).includes("occupancy-target"));
    const floor = records(scene.entities).find((entity) => entity.id === "spatial.floor");
    const eastWall = records(scene.entities).find((entity) => entity.id === "spatial.wall.east");

    assert.equal(sceneSystems.some((system) => system.id === "spatial-mechanics"), false);
    assert.equal(siblingSystems.filter((system) => system.id === "spatial-mechanics").length, 1);
    assert.equal(records(ui.nodes).filter((node) => node.id === "spatial-progress").length, 1);
    assert.equal(records(scene.resources).filter((resource) => resource.id === "SpatialGrid").length, 1);
    assert.equal(records(scene.resources).filter((resource) => resource.id === "SpatialObjective").length, 1);
    assert.equal(crates.length, 2);
    assert.equal(targets.length, 2);
    assert.deepEqual(crates.map(position), [[1, 0.35, 0], [1, 0.35, 1]]);
    assert.deepEqual(targets.map(position), [[2, 0.04, 0], [2, 0.04, 1]]);
    assert.deepEqual(component(crates[0], "RigidBody"), { gravityScale: 0, kind: "kinematic" });
    assert.deepEqual(component(crates[0], "Collider"), { kind: "box", size: [0.72, 0.72, 0.72] });
    assert.deepEqual(component(floor, "RigidBody"), { kind: "static" });
    assert.deepEqual(component(eastWall, "Collider"), { kind: "box", size: [0.18, 0.55, 6] });
    assert.equal(records(scene.entities).filter((entity) => typeof entity.id === "string" && entity.id.startsWith("spatial.grid.")).length, 12);
    assert.deepEqual((boundsProof.setup as { entities: unknown[] }).entities, [{ entity: "player", position: [2, 0.35, 0] }]);
    assert.deepEqual((boundsProof.assert as { movement: unknown }).movement, { entity: "player", maxDistance: 0.01 });
    assert.deepEqual((occupancyProof.assert as { resources: unknown[] }).resources, [{ gte: 2, id: "SpatialObjective", path: "progress" }]);
    assert.deepEqual(records(occupancyProof.steps).map((step) => step.press), ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowRight"]);
    assert.match(script, /input\.pressed\("grid-right"\)/);
    assert.match(script, /pushed\.transform\(\)\.setPosition/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reuse grid and occupancy without push for tactical switches", async () => {
  const root = await fixtureProject("spatial-switches");
  try {
    const result = await addCommand(["occupancy-objective", "--subject-tag", "player", "--target-prefix", "switch", "--target-count", "1", "--project", root, "--json"]);
    assert.equal(result.exitCode, 0, result.stdout);
    const scene = await json(root, "content/scenes/arena.scene.json");
    const grid = records(scene.resources).find((resource) => resource.id === "SpatialGrid")?.value as Record<string, unknown>;
    const objective = records(scene.resources).find((resource) => resource.id === "SpatialObjective")?.value as Record<string, unknown>;

    assert.equal(grid.pushEnabled, false);
    assert.equal(grid.crateIdsJson, "[]");
    assert.equal(objective.subjectTag, "player");
    assert.equal(records(scene.entities).some((entity) => typeof entity.id === "string" && entity.id.startsWith("crate.")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject pushing into wall or occupied object", () => {
  const base = { actor: [0, 0] as const, bounds: { maxX: 4, maxZ: 4, minX: -4, minZ: -4 }, pushEnabled: true, target: [1, 0] as const };
  const wall = resolveSpatialStep({ ...base, blocked: [[2, 0]], crates: [[1, 0]] });
  const occupied = resolveSpatialStep({ ...base, blocked: [], crates: [[1, 0], [2, 0]] });

  assert.equal(wall.accepted, false);
  assert.equal(wall.reason, "blocked");
  assert.deepEqual(wall.crates, [[1, 0]]);
  assert.equal(occupied.accepted, false);
  assert.equal(occupied.reason, "occupied");
  assert.deepEqual(occupied.crates, [[1, 0], [2, 0]]);
});

async function fixtureProject(prefix: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), `tn-${prefix}-`));
  const result = await createProject(["game", "--template", "structured-source-starter", "--archetype", "top-down", "--json"], { cwd });
  const payload = JSON.parse(result.stdout) as { path: string };
  assert.equal(result.exitCode, 0, result.stdout);
  return payload.path;
}

async function json(root: string, path: string): Promise<Record<string, unknown>> { return JSON.parse(await readFile(join(root, path), "utf8")) as Record<string, unknown>; }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function position(entity: Record<string, unknown>): unknown { return (entity.transform as { position?: unknown } | undefined)?.position; }
function component(entity: Record<string, unknown> | undefined, id: string): unknown { return (entity?.components as Record<string, unknown> | undefined)?.[id]; }

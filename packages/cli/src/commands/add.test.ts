import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { addCommand } from "./add.js";
import { authoringCommand } from "./authoring.js";
import { createProject } from "./create.js";

test("should add grid spawner with validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-add-spawner-"));
  try {
    const project = await createStructuredProject(root);
    const result = await addCommand(["spawner", "--pattern", "grid", "--prefab", "spawn.prefab", "--count", "5", "--project", project, "--json"]);
    const payload = JSON.parse(result.stdout) as { block: string; filesWritten: string[]; proofCommand: string; scenarioPath: string };
    const scene = JSON.parse(await readFile(join(project, "content/scenes/arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; prefab?: string }>;
      prefabs: Array<{ id: string }>;
      resources: Array<{ id: string; value?: Record<string, unknown> }>;
    };
    const mechanic = JSON.parse(await readFile(join(project, "content/mechanics/spawner.mechanic.json"), "utf8")) as { block: string; details?: { count?: number; pattern?: string } };

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.block, "spawner");
    assert.equal(payload.filesWritten.includes("content/scenes/arena.scene.json"), true);
    assert.equal(payload.scenarioPath, "playtests/block-spawner.playtest.json");
    assert.match(payload.proofCommand, /block-spawner\.playtest\.json/);
    assert.equal(scene.prefabs.some((prefab) => prefab.id === "spawn.prefab"), true);
    assert.equal(scene.entities.filter((entity) => entity.prefab === "spawn.prefab").length, 5);
    assert.equal(scene.resources.some((resource) => resource.id === "MechanicSpawner" && resource.value?.count === 5), true);
    assert.equal(mechanic.block, "spawner");
    assert.equal(mechanic.details?.pattern, "grid");

    const validate = await authoringCommand(["validate", "--project", project, "--json"], { cwd: root });
    assert.equal(validate.exitCode, 0, validate.stdout);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add all compositional mechanic blocks with proof scenarios", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-add-blocks-"));
  try {
    const project = await createStructuredProject(root);
    const cases = [
      ["timer", "--resource", "RoundTimer", "--direction", "down", "--limit", "30"],
      ["trigger-sequence", "--mode", "ordered", "--count", "3", "--prefix", "checkpoint"],
      ["score", "--resource", "GameScore", "--win-at", "3"],
      ["projectile", "--launcher", "player", "--projectile", "ball"],
      ["physics-target", "--count", "5", "--prefix", "target"],
      ["follow-camera", "--camera", "camera.main", "--target", "player"],
    ];
    for (const args of cases) {
      const result = await addCommand([...args, "--project", project, "--json"]);
      const payload = JSON.parse(result.stdout) as { block: string; filesWritten: string[]; proofCommand: string; scenarioPath: string };
      const scenario = JSON.parse(await readFile(join(project, payload.scenarioPath), "utf8")) as { assert?: { resources?: Array<{ id?: string }> }; name: string };
      const mechanic = JSON.parse(await readFile(join(project, "content/mechanics", `${payload.block}.mechanic.json`), "utf8")) as { block: string; sourceFiles: string[] };

      assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(mechanic.block, payload.block);
      assert.equal(mechanic.sourceFiles.includes("content/scenes/arena.scene.json"), true);
      assert.equal(scenario.name, `block-${payload.block}`);
      assert.equal((scenario.assert?.resources?.length ?? 0) > 0, true);
      assert.match(payload.proofCommand, new RegExp(`block-${payload.block}\\.playtest\\.json`));
      assert.equal(payload.filesWritten.includes(payload.scenarioPath), true);
    }

    const scene = JSON.parse(await readFile(join(project, "content/scenes/arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: { camera?: { target?: string } }; id: string }>;
      prefabs: Array<{ id: string }>;
      resources: Array<{ id: string; value?: Record<string, unknown> }>;
    };
    const runtime = JSON.parse(await readFile(join(project, "content/runtime/default.runtime.json"), "utf8")) as {
      renderer?: { renderLook?: { overrides?: Record<string, unknown>; profile?: string; version?: number } };
    };
    const systems = JSON.parse(await readFile(join(project, "content/systems/arena.systems.json"), "utf8")) as {
      countdowns?: Array<{ autostart?: boolean; direction?: string; event?: string; field?: string; id?: string; limit?: number; resource?: string }>;
    };
    const script = await readFile(join(project, "src/scripts/mechanics.ts"), "utf8");
    assert.equal(scene.resources.some((resource) => resource.id === "RoundTimer" && resource.value?.limit === 30), true);
    assert.deepEqual(systems.countdowns, [{ autostart: true, direction: "down", event: "RoundTimer.limit", field: "remaining", id: "RoundTimer.countdown", limit: 30, resource: "RoundTimer" }]);
    assert.equal(scene.resources.some((resource) => resource.id === "TriggerSequence" && Array.isArray(resource.value?.triggers)), true);
    assert.equal(scene.resources.some((resource) => resource.id === "GameScore" && resource.value?.winAt === 3), true);
    assert.equal(scene.resources.some((resource) => resource.id === "ProjectileLauncher" && resource.value?.launcher === "player"), true);
    assert.equal(scene.resources.some((resource) => resource.id === "PhysicsTargets" && resource.value?.count === 5), true);
    assert.equal(scene.entities.filter((entity) => entity.id.startsWith("target.")).length, 5);
    assert.equal(scene.prefabs.some((prefab) => prefab.id === "ball.prefab"), true);
    assert.equal(scene.resources.some((resource) => resource.id === "ProjectilePhysics" && resource.value?.rigidBody !== undefined), true);
    assert.equal(scene.entities.find((entity) => entity.id === "camera.main")?.components?.camera?.target, "player");
    assert.deepEqual(runtime.renderer?.renderLook, { version: 1, profile: "cinematic" });
    assert.match(script, /export function updateScoreBlock/);
    assert.match(script, /export function updateProjectileBlock/);

    const validate = await authoringCommand(["validate", "--project", project, "--json"], { cwd: root });
    assert.equal(validate.exitCode, 0, validate.stdout);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown mechanic block", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-add-unknown-"));
  try {
    const result = await addCommand(["magnet", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string; message: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_ADD_BLOCK_UNKNOWN");
    assert.match(payload.message, /spawner/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve existing mechanic block outputs after descriptor migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-add-descriptor-"));
  try {
    const project = await createStructuredProject(root);
    const result = await addCommand(["score", "--resource", "RoundScore", "--win-at", "4", "--project", project, "--json"]);
    const payload = JSON.parse(result.stdout) as { block: string; proofCommand: string };
    const mechanic = JSON.parse(await readFile(join(project, "content/mechanics/score.mechanic.json"), "utf8")) as { mutationCommand: string; proofTemplateId: string; recipeIds: string[]; removal: { owner: string }; responsibilities: string[]; sourceOwners: string[] };

    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.block, "score");
    assert.match(payload.proofCommand, /block-score\.playtest\.json/);
    assert.equal(mechanic.mutationCommand, "tn add score --project . --json");
    assert.equal(mechanic.proofTemplateId, "block-score");
    assert.deepEqual(mechanic.recipeIds, []);
    assert.deepEqual(mechanic.removal, { owner: "mechanic-document" });
    assert.deepEqual(mechanic.responsibilities, ["score-win-retry"]);
    assert.deepEqual(mechanic.sourceOwners, ["scene", "scripts"]);

    const invalid = await addCommand(["score", "--pattern", "grid", "--project", project, "--json"]);
    assert.equal(invalid.exitCode, 1);
    assert.match(invalid.stdout, /TN_ADD_BLOCK_ARGUMENT_INVALID/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep spatial block writes atomic when a source owner is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-add-spatial-rollback-"));
  try {
    const project = await createStructuredProject(root);
    const scenePath = join(project, "content/scenes/arena.scene.json");
    const before = await readFile(scenePath, "utf8");
    await rm(join(project, "content/ui"), { force: true, recursive: true });

    await assert.rejects(addCommand(["occupancy-objective", "--project", project, "--json"]), /ENOENT|No \.ui\.json document/);
    assert.equal(await readFile(scenePath, "utf8"), before);
    await assert.rejects(readFile(join(project, "content/mechanics/occupancy-objective.mechanic.json"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createStructuredProject(root: string): Promise<string> {
  const result = await createProject(["game", "--template", "structured-source-starter", "--archetype", "top-down", "--json"], { cwd: root });
  const payload = JSON.parse(result.stdout) as { path: string };
  assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
  return payload.path;
}

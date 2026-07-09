import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { actorCommand } from "./actor.js";

test("should add a character actor from the CLI", async () => {
  const root = await createActorProject();
  try {
    const result = await actorCommand(["add", "character", "--id", "hero", "--asset", "model.hero", "--speed", "5", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; ok: boolean };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ archetype?: { id: string }; id: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ACTOR_OK");
    assert.equal(payload.ok, true);
    assert.equal(scene.entities.find((entity) => entity.id === "hero")?.archetype?.id, "character");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should update a character actor from the CLI", async () => {
  const root = await createActorProject();
  try {
    await actorCommand(["add", "character", "--id", "hero"], { cwd: root });
    const result = await actorCommand(["update", "hero", "--set", "speed=7", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; ok: boolean };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, Record<string, unknown>>; id: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_ACTOR_OK");
    assert.equal(scene.entities.find((entity) => entity.id === "hero")?.components?.CharacterController?.speed, 7);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should list actor archetypes from the CLI", async () => {
  const result = await actorCommand(["list", "--json"]);
  const payload = JSON.parse(result.stdout) as { archetypes: Array<{ id: string }>; code: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_ACTOR_ARCHETYPES");
  assert.deepEqual(payload.archetypes.map((entry) => entry.id), ["camera-boom", "character", "pickup", "prop-static", "vehicle"]);
});

async function createActorProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-actor-cli-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify(
      {
        entities: [],
        id: "arena",
        initial: true,
        prefabs: [],
        schema: "threenative.scene",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return root;
}

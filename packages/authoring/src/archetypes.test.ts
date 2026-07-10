import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyActorArchetype, listActorArchetypes, updateActorArchetype } from "./archetypes.js";

test("should apply the character actor archetype to structured source", async () => {
  const root = await createActorProject();
  try {
    const result = await applyActorArchetype({
      actorId: "hero",
      archetype: "character",
      asset: "model.hero",
      projectPath: root,
      sceneId: "arena",
      speed: 5,
      sprintSpeed: 8,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ archetype?: { id: string; params?: Record<string, unknown>; version?: number }; components?: Record<string, unknown>; id: string; prefab?: string }>;
      prefabs: Array<{ asset?: string; id: string }>;
    };
    const input = JSON.parse(await readFile(join(root, "content", "input", "hero.input.json"), "utf8")) as {
      actions: Array<{ id: string }>;
      axes: Array<{ id: string }>;
    };
    const systems = JSON.parse(await readFile(join(root, "content", "systems", "hero.systems.json"), "utf8")) as {
      systems: Array<{ id: string; reads?: string[]; schedule?: string; script?: { export: string; module: string } }>;
    };
    const script = await readFile(join(root, "src", "scripts", "hero.behavior.ts"), "utf8");
    const hero = scene.entities.find((entity) => entity.id === "hero");

    assert.equal(result.ok, true);
    assert.deepEqual(result.filesWritten, [
      "content/input/hero.input.json",
      "content/scenes/arena.scene.json",
      "content/schemas/hero.character.schema.json",
      "content/systems/hero.systems.json",
      "src/scripts/hero.behavior.ts",
    ]);
    assert.equal(scene.prefabs.find((prefab) => prefab.id === "hero.model")?.asset, "model.hero");
    assert.equal(hero?.prefab, "hero.model");
    assert.equal(hero?.archetype?.id, "character");
    assert.equal(hero?.archetype?.version, 1);
    assert.equal(hero?.archetype?.params?.speed, 5);
    assert.deepEqual(hero?.components?.RigidBody, { kind: "kinematic", mass: 1 });
    assert.equal(input.actions.some((action) => action.id === "sprint"), true);
    assert.deepEqual(input.axes.map((axis) => axis.id), ["move-x", "move-z"]);
    assert.deepEqual(systems.systems[0], {
      id: "hero.character",
      script: {
        export: "updateHeroCharacter",
        module: "src/scripts/hero.behavior.ts",
      },
    });
    assert.match(script, /defineBehavior/);
    assert.match(script, /CharacterRig\.update/);
    assert.match(script, /CameraRig\.thirdPerson/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve an existing active camera when adding a character", async () => {
  const root = await createActorProject();
  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as { entities: Array<Record<string, unknown>> };
    scene.entities.push({ components: { camera: { mode: "perspective" } }, id: "camera.main", transform: { position: [0, 4, -8] } });
    await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");

    await applyActorArchetype({ actorId: "hero", archetype: "character", projectPath: root, sceneId: "arena" });
    const updated = JSON.parse(await readFile(scenePath, "utf8")) as { entities: Array<{ id: string }> };

    assert.equal(updated.entities.some((entity) => entity.id === "camera.main"), true);
    assert.equal(updated.entities.some((entity) => entity.id === "hero.camera"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should update character actor archetype source parameters", async () => {
  const root = await createActorProject();
  try {
    await applyActorArchetype({ actorId: "hero", archetype: "character", projectPath: root, sceneId: "arena" });
    const result = await updateActorArchetype({
      actorId: "hero",
      projectPath: root,
      set: { speed: 6, sprintSpeed: 9 },
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ archetype?: { params?: Record<string, unknown> }; components?: Record<string, Record<string, unknown>>; id: string }>;
    };
    const hero = scene.entities.find((entity) => entity.id === "hero");

    assert.equal(result.ok, true);
    assert.deepEqual(result.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.equal(hero?.components?.CharacterController?.speed, 6);
    assert.equal(hero?.archetype?.params?.speed, 6);
    assert.equal(hero?.archetype?.params?.sprintSpeed, 9);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should list available actor archetypes", () => {
  assert.deepEqual(listActorArchetypes().map((entry) => entry.id), ["camera-boom", "character", "pickup", "prop-static", "vehicle"]);
});

test("should apply non-character actor archetypes to structured source", async () => {
  const root = await createActorProject();
  try {
    const results = [
      await applyActorArchetype({ actorId: "kart", archetype: "vehicle", projectPath: root, sceneId: "arena" }),
      await applyActorArchetype({ actorId: "coin", archetype: "pickup", projectPath: root, sceneId: "arena" }),
      await applyActorArchetype({ actorId: "follow", archetype: "camera-boom", projectPath: root, sceneId: "arena" }),
      await applyActorArchetype({ actorId: "crate", archetype: "prop-static", projectPath: root, sceneId: "arena" }),
    ];
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ archetype?: { id: string }; components?: Record<string, unknown>; id: string }>;
      resources?: Array<{ id: string }>;
      ui?: { bindings?: Array<{ node: string; resource: string }>; nodes?: Array<{ id: string }> };
    };

    assert.equal(results.every((result) => result.ok), true);
    assert.equal(scene.entities.find((entity) => entity.id === "kart")?.archetype?.id, "vehicle");
    assert.equal(scene.entities.find((entity) => entity.id === "coin")?.archetype?.id, "pickup");
    assert.equal(scene.entities.find((entity) => entity.id === "follow")?.archetype?.id, "camera-boom");
    assert.equal(scene.entities.find((entity) => entity.id === "crate")?.archetype?.id, "prop-static");
    assert.equal(scene.resources?.some((resource) => resource.id === "PickupState"), true);
    assert.equal(scene.ui?.nodes?.some((node) => node.id === "hud.pickups"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createActorProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-actor-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
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

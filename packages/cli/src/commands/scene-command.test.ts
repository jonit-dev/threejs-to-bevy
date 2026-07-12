import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildCommand } from "./build.js";
import { sceneCommand } from "./scene.js";
import { resolveNativeCaptureInvocation } from "./sceneProof.js";
import { validateProject } from "./validate.js";

test("scene-command create writes a minimal source scene with next commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-create-"));

  try {
    const result = await sceneCommand(["create", "scene.arena", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { changed: boolean; diagnostics: unknown[]; file: string; nextCommands: string[]; sceneId: string };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.arena.scene.json"), "utf8")) as { id: string; schema: string; entities: unknown[] };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.sceneId, "scene.arena");
    assert.equal(payload.file, "content/scenes/scene.arena.scene.json");
    assert.equal(payload.changed, true);
    assert.deepEqual(payload.diagnostics, []);
    assert.equal(payload.nextCommands.includes("tn scene validate scene.arena --json"), true);
    assert.equal(scene.schema, "threenative.scene");
    assert.equal(scene.id, "scene.arena");
    assert.deepEqual(scene.entities, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command create honors explicit file paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-create-file-"));

  try {
    const result = await sceneCommand(["create", "scene.menu", "--file", "content/scenes/menu.scene.json", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { file: string; sceneId: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.sceneId, "scene.menu");
    assert.equal(payload.file, "content/scenes/menu.scene.json");
    await readFile(join(root, "content", "scenes", "menu.scene.json"), "utf8");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command import-world lifts emitted ECS into editable scene source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-import-world-"));

  try {
    await mkdir(join(root, "dist", "game.bundle"), { recursive: true });
    await writeFile(
      join(root, "dist", "game.bundle", "world.ir.json"),
      `${JSON.stringify({
        schema: "threenative.world",
        entities: [
          {
            id: "track.arrow.-1.1",
            components: {
              MeshRenderer: { mesh: "mesh.track.arrow.-1.1", material: "mat.track.arrow.-1.1" },
              Transform: { position: [1, 0.2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
              TrackItem: { kind: "arrow", lane: -1 },
            },
          },
        ],
        resources: {
          RaceState: { speed: 0, lap: 1, status: "READY" },
          MinimapState: { state: "{\"markers\":[]}" },
        },
      }, null, 2)}\n`,
    );

    const result = await sceneCommand([
      "import-world",
      "scene.imported",
      "--world",
      "dist/game.bundle/world.ir.json",
      "--project",
      root,
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as { entityCount: number; resourceCount: number; file: string };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.imported.scene.json"), "utf8")) as {
      entities: Array<{ components: Record<string, unknown>; id: string }>;
      resources: Array<{ id: string; value: unknown }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.entityCount, 1);
    assert.equal(payload.resourceCount, 2);
    assert.equal(payload.file, "content/scenes/scene.imported.scene.json");
    assert.equal(scene.entities[0]?.id, "track.arrow.-1.1");
    assert.deepEqual(scene.entities[0]?.components.TrackItem, { kind: "arrow", lane: -1 });
    assert.deepEqual(scene.resources.map((resource) => resource.id), ["MinimapState", "RaceState"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command create rejects invalid ids, collisions, generated paths, and duplicate scene ids", async () => {
  const root = await createSceneProject();

  try {
    const invalidId = await sceneCommand(["create", "Scene Arena", "--project", root, "--json"]);
    const fileCollision = await sceneCommand(["create", "scene.menu", "--file", "content/scenes/arena.scene.json", "--project", root, "--json"]);
    const generatedPath = await sceneCommand(["create", "scene.menu", "--file", "dist/game.bundle/menu.scene.json", "--project", root, "--json"]);
    const duplicateId = await sceneCommand(["create", "scene.arena", "--file", "content/scenes/arena-copy.scene.json", "--project", root, "--json"]);

    assert.equal(invalidId.exitCode, 1);
    assert.equal((JSON.parse(invalidId.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics[0]?.code, "TN_AUTHORING_ID_INVALID");
    assert.equal(fileCollision.exitCode, 1);
    assert.equal((JSON.parse(fileCollision.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics[0]?.code, "TN_AUTHORING_SOURCE_FILE_EXISTS");
    assert.equal(generatedPath.exitCode, 1);
    assert.equal((JSON.parse(generatedPath.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics[0]?.code, "TN_AUTHORING_GENERATED_SOURCE_PATH");
    assert.equal(duplicateId.exitCode, 1);
    assert.equal((JSON.parse(duplicateId.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics[0]?.code, "TN_AUTHORING_DUPLICATE_SCENE_ID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command validate returns stable JSON for valid source scenes", async () => {
  const root = await createSceneProject();

  try {
    const result = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: unknown[]; ok: boolean };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_SCENE_OK");
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command validate exits nonzero for repair diagnostics", async () => {
  const root = await createSceneProject({ invalidTarget: true });

  try {
    const result = await sceneCommand(["validate", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string; path: string; suggestion?: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_SCENE_FAILED");
    assert.equal(payload.diagnostics[0]?.code, "TN_AUTHORING_REF_MISSING");
    assert.equal(payload.diagnostics[0]?.path, "/entities/1/components/camera/target");
    assert.equal(payload.diagnostics[0]?.suggestion, "Did you mean 'player-kart'?");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command inspect returns source metadata for agents", async () => {
  const root = await createSceneProject();

  try {
    const result = await sceneCommand(["inspect", "scene.arena", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      scene: { entities: string[]; file: string; id: string; resources: string[]; systems: string[]; uiNodes: string[] };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_SCENE_OK");
    assert.equal(payload.scene.id, "scene.arena");
    assert.equal(payload.scene.file, "content/scenes/arena.scene.json");
    assert.deepEqual(payload.scene.entities, ["chase-camera", "player-kart"]);
    assert.deepEqual(payload.scene.resources, ["hud.score"]);
    assert.deepEqual(payload.scene.systems, ["race-controller"]);
    assert.deepEqual(payload.scene.uiNodes, ["score-label"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command inspect can target one scene node without dumping full scene metadata", async () => {
  const root = await createSceneProject();

  try {
    const result = await sceneCommand(["inspect", "scene.arena", "--node", "player-kart", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      node: { id: string; matches: Array<{ kind: string; path: string; value: { id?: string; prefab?: string } }> };
      scene?: unknown;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_SCENE_OK");
    assert.equal(payload.scene, undefined);
    assert.equal(payload.node.id, "player-kart");
    assert.deepEqual(payload.node.matches, [
      {
        kind: "entity",
        path: "/entities/0",
        value: { id: "player-kart", prefab: "kart", transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      },
    ]);
    assert.equal(result.stdout.includes("chase-camera"), false);
    assert.equal(result.stdout.includes("score-label"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command inspect targets UI bindings by resource id", async () => {
  const root = await createSceneProject();

  try {
    const result = await sceneCommand(["inspect", "scene.arena", "--node", "hud.score", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      node: { matches: Array<{ kind: string; path: string; value: { id?: string; node?: string; resource?: string } }> };
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      payload.node.matches.map((match) => ({ kind: match.kind, path: match.path, value: match.value })),
      [
        { kind: "resource", path: "/resources/0", value: { id: "hud.score" } },
        { kind: "ui-binding", path: "/ui/bindings/0", value: { node: "score-label", resource: "hud.score.value" } },
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command batches prefab instances and removes source references", async () => {
  const root = await createSceneProject();

  try {
    const batch = await sceneCommand([
      "add-prefab-instances",
      "scene.arena",
      "--prefab",
      "kart",
      "--positions",
      "1,0,0;2,0,0;3,0,0",
      "--prefix",
      "orb",
      "--project",
      root,
      "--json",
    ]);
    assert.equal(batch.exitCode, 0, batch.stderr);

    const removeResourceResult = await sceneCommand(["remove-resource", "scene.arena", "hud.score", "--project", root, "--json"]);
    const removeUiResult = await sceneCommand(["remove-ui-node", "scene.arena", "score-label", "--project", root, "--json"]);
    const removeEntityResult = await sceneCommand(["remove-entity", "scene.arena", "player-kart", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; components?: Record<string, { target?: string }> }>;
      instances: Array<{ id: string }>;
      resources: Array<{ id: string }>;
      ui: { bindings: Array<{ resource?: string }>; nodes: Array<{ id: string }> };
    };

    assert.equal(removeResourceResult.exitCode, 0, removeResourceResult.stderr);
    assert.equal(removeUiResult.exitCode, 0, removeUiResult.stderr);
    assert.equal(removeEntityResult.exitCode, 0, removeEntityResult.stderr);
    assert.deepEqual(scene.instances.map((instance) => instance.id), ["orb.01", "orb.02", "orb.03"]);
    assert.deepEqual(scene.resources, []);
    assert.deepEqual(scene.ui, { bindings: [], nodes: [] });
    assert.equal(scene.entities.some((entity) => entity.id === "player-kart"), false);
    assert.equal(scene.entities.find((entity) => entity.id === "chase-camera")?.components?.camera?.target, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command inspect reports a missing targeted node with a fix hint", async () => {
  const root = await createSceneProject();

  try {
    const result = await sceneCommand(["inspect", "scene.arena", "--node", "missing-node", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; suggestion?: string }>; node: { id: string; matches: unknown[] } };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.node.id, "missing-node");
    assert.deepEqual(payload.node.matches, []);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_SCENE_NODE_MISSING" && diagnostic.suggestion?.includes("--node <id>")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command inspect reports compact instance and repeated-block evidence", async () => {
  const root = await createSceneProject();

  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    await writeFile(
      scenePath,
      `${JSON.stringify({
        schema: "threenative.scene",
        version: "0.1.0",
        id: "scene.arena",
        prefabs: [{ id: "pin.visual", primitive: "capsule" }],
        entities: [
          { id: "pin.verbose.01", components: { Collider: { kind: "capsule" }, Pin: { home: [0, 0, 0] }, RigidBody: { kind: "dynamic" } } },
          { id: "pin.verbose.02", components: { Collider: { kind: "capsule" }, Pin: { home: [1, 0, 0] }, RigidBody: { kind: "dynamic" } } },
          { id: "pin.verbose.03", components: { Collider: { kind: "capsule" }, Pin: { home: [2, 0, 0] }, RigidBody: { kind: "dynamic" } } },
        ],
        instances: [
          { id: "pin.01", prefab: "pin.visual", transform: { position: [0, 0, 0] } },
          { id: "pin.02", prefab: "pin.visual", transform: { position: [1, 0, 0] } },
        ],
      }, null, 2)}\n`,
    );

    const result = await sceneCommand(["inspect", "scene.arena", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      scene: {
        expandedEntityCount: number;
        instances: string[];
        repeatedBlocks: Array<{ componentKinds: string[]; count: number; entityIds: string[] }>;
        sourceLineCount: number;
        suggestedRefactors: Array<{ kind: string }>;
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.scene.expandedEntityCount, 5);
    assert.deepEqual(payload.scene.instances, ["pin.01", "pin.02"]);
    assert.equal(payload.scene.repeatedBlocks[0]?.count, 3);
    assert.deepEqual(payload.scene.repeatedBlocks[0]?.componentKinds, ["Collider", "Pin", "RigidBody"]);
    assert.equal(payload.scene.suggestedRefactors[0]?.kind, "compact-prefab-instances");
    assert.ok(payload.scene.sourceLineCount > 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command validate rejects compact instances with duplicate expanded ids", async () => {
  const root = await createSceneProject();

  try {
    await writeFile(
      join(root, "content", "scenes", "arena.scene.json"),
      `${JSON.stringify({
        schema: "threenative.scene",
        version: "0.1.0",
        id: "scene.arena",
        prefabs: [{ id: "pin.visual", primitive: "capsule" }],
        entities: [{ id: "pin.01" }],
        instances: [{ id: "pin.01", prefab: "pin.visual", transform: { position: [0, 0, 0] } }],
      }, null, 2)}\n`,
    );

    const result = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; path: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_AUTHORING_DUPLICATE_ENTITY_ID");
    assert.equal(payload.diagnostics[0]?.path, "/instances/0/id");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command creates compact prefab instances without raw JSON editing", async () => {
  const root = await createSceneProject();

  try {
    const result = await sceneCommand([
      "add-prefab-instance",
      "scene.arena",
      "pin.01",
      "--prefab",
      "kart",
      "--position",
      "0,0.6,0",
      "--components",
      JSON.stringify({ Pin: { home: [0, 0.6, 0] } }),
      "--project",
      root,
      "--json",
    ]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      instances: Array<{ components?: Record<string, unknown>; id: string; prefab: string; transform?: { position?: number[] } }>;
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(scene.instances, [
      { components: { Pin: { home: [0, 0.6, 0] } }, id: "pin.01", prefab: "kart", transform: { position: [0, 0.6, 0] } },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command creates ten stable prefab instances for a bowling rack", async () => {
  const root = await createSceneProject();

  try {
    const create = await sceneCommand(["layout", "ten-pin", "scene.arena", "--prefab", "kart", "--project", root, "--json"]);
    const duplicate = await sceneCommand(["layout", "ten-pin", "scene.arena", "--prefab", "kart", "--project", root, "--json"]);
    const replace = await sceneCommand(["layout", "ten-pin", "scene.arena", "--prefab", "kart", "--origin", "1,0.6,2", "--replace", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      instances: Array<{ components?: Record<string, unknown>; id: string; prefab: string; transform?: { position?: number[] } }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(duplicate.exitCode, 1);
    assert.equal((JSON.parse(duplicate.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics[0]?.code, "TN_AUTHORING_LAYOUT_EXISTS");
    assert.equal(replace.exitCode, 0);
    assert.deepEqual(scene.instances.map((instance) => instance.id), ["pin.01", "pin.02", "pin.03", "pin.04", "pin.05", "pin.06", "pin.07", "pin.08", "pin.09", "pin.10"]);
    assert.equal(scene.instances.every((instance) => instance.prefab === "kart"), true);
    assert.deepEqual(scene.instances[0]?.transform?.position, [1, 0.6, 2]);
    assert.equal(scene.instances.some((instance) => instance.components !== undefined), false);
    assert.deepEqual(scene.instances[9]?.transform?.position, [1.78, 0.6, 0.44]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command inspect requires a scene id", async () => {
  const root = await createSceneProject();
  const result = await sceneCommand(["inspect", "--project", root, "--json"]);
  const payload = JSON.parse(result.stdout) as { availableSceneIds: string[]; code: string; severity: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_SCENE_INSPECT_ID_MISSING");
  assert.equal(payload.severity, "error");
  assert.deepEqual(payload.availableSceneIds, ["scene.arena"]);
  await rm(root, { force: true, recursive: true });
});

test("scene-command mutates structured scene documents deterministically", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    const add = await sceneCommand(["add-entity", "scene.arena", "rival-kart", "--prefab", "kart", "--project", root, "--json"]);
    const transform = await sceneCommand(["set-transform", "scene.arena", "rival-kart", "--position", "1,2,3", "--rotation", "0,0,0", "--scale", "1,1,1", "--project", root, "--json"]);
    const camera = await sceneCommand([
      "set-camera",
      "scene.arena",
      "chase-camera",
      "--mode",
      "third-person-follow",
      "--target",
      "player-kart",
      "--fov-y",
      "58",
      "--near",
      "0.2",
      "--far",
      "240",
      "--project",
      root,
      "--json",
    ]);
    const script = await sceneCommand(["attach-script", "scene.arena", "race-controller", "--module", "src/scripts/race.ts", "--export", "raceController", "--project", root, "--json"]);
    const binding = await sceneCommand(["bind-ui", "scene.arena", "score-label", "--resource", "hud.score.value", "--project", root, "--json"]);
    const validate = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.equal(camera.exitCode, 0);
    assert.equal(script.exitCode, 0);
    assert.equal(binding.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.equal((JSON.parse(binding.stdout) as { filesWritten: string[] }).filesWritten[0], "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    assert.deepEqual(scene.entities.find((entity) => entity.id === "chase-camera")?.components?.camera, {
      far: 240,
      fovY: 58,
      mode: "third-person-follow",
      near: 0.2,
      target: "player-kart",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command converts degree rotations when setting transforms", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    const add = await sceneCommand(["add-entity", "scene.arena", "rival-kart", "--prefab", "kart", "--project", root, "--json"]);
    const transform = await sceneCommand(["set-transform", "scene.arena", "rival-kart", "--rotation-deg", "0,90,180", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { rotation?: number[] } }>;
    };

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "rival-kart")?.transform?.rotation, [0, 1.570796, 3.141593]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command assembles modular track tiles with inspected pivot corrections", async () => {
  const root = await createSceneProject();
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "road.gltf"), `${JSON.stringify({
      asset: { version: "2.0", generator: "scene-modular-track-test" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, translation: [1, 0, -2], scale: [2, 1, 1] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ type: "VEC3", min: [-0.5, 0, -1], max: [0.5, 0.02, 1] }],
      buffers: [],
      images: [],
    }, null, 2)}\n`);

    const result = await sceneCommand([
      "add-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--prefix",
      "road.tile",
      "--layout",
      JSON.stringify([
        { asset: "road.gltf", center: [0, 0], yaw: 0 },
        { asset: "road.gltf", center: [4, 6], yaw: 90 },
      ]),
      "--project",
      root,
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as { changed: boolean; diagnostics: Array<{ code: string }>; filesWritten: string[]; tileCount: number };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; prefab?: string; transform?: { position: number[]; rotation: number[] } }>;
      prefabs: Array<{ asset?: string; id: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.changed, true);
    assert.equal(payload.tileCount, 2);
    assert.deepEqual(payload.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(payload.diagnostics, []);
    assert.equal(scene.prefabs.some((prefab) => prefab.id === "road.tile.prefab.road" && prefab.asset === "assets/road.gltf"), true);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "road.tile.000")?.transform?.position, [-1, -0.01, 2]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "road.tile.001")?.transform?.position, [6, -0.01, 7]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "road.tile.001")?.transform?.rotation, [0, 1.570796, 0]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "road.tile.001")?.components?.ModularTrackTile, {
      asset: "assets/road.gltf",
      center: [4, 6],
      footprint: [2, 2],
      yawDegrees: 90,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command rejects invalid modular track layouts", async () => {
  const root = await createSceneProject();
  try {
    const result = await sceneCommand([
      "add-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--layout",
      "{\"bad\":true}",
      "--project",
      root,
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as { code: string; message: string };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_SCENE_MODULAR_TRACK_LAYOUT_INVALID");
    assert.match(payload.message, /tn scene add-modular-track/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command proves modular track connector continuity", async () => {
  const root = await createSceneProject();
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "corner.glb"), makeRoadGlb("corner"));
    const add = await sceneCommand([
      "add-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--prefix",
      "road.tile",
      "--layout",
      JSON.stringify([
        { asset: "corner.glb", center: [0, 0], yaw: 0 },
        { asset: "corner.glb", center: [2, 0], yaw: 270 },
        { asset: "corner.glb", center: [2, 2], yaw: 180 },
        { asset: "corner.glb", center: [0, 2], yaw: 90 },
      ]),
      "--project",
      root,
      "--json",
    ]);
    const transform = await sceneCommand([
      "set-transform",
      "scene.arena",
      "player-kart",
      "--position",
      "1,0.2,0.5",
      "--project",
      root,
      "--json",
    ]);
    const proof = await sceneCommand(["proof-modular-track", "scene.arena", "--asset-dir", "assets", "--prefix", "road.tile", "--project", root, "--json"]);
    const actorProof = await sceneCommand(["proof-modular-track", "scene.arena", "--asset-dir", "assets", "--prefix", "road.tile", "--actors", "player-kart", "--project", root, "--json"]);
    const payload = JSON.parse(proof.stdout) as { diagnostics: unknown[]; tileCount: number };
    const actorPayload = JSON.parse(actorProof.stdout) as { diagnostics: unknown[]; tileCount: number };

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.equal(proof.exitCode, 0);
    assert.equal(actorProof.exitCode, 0);
    assert.equal(payload.tileCount, 4);
    assert.deepEqual(payload.diagnostics, []);
    assert.equal(actorPayload.tileCount, 4);
    assert.deepEqual(actorPayload.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command generates an oval modular track without hand-authored layout JSON", async () => {
  const root = await createSceneProject();
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "roadCornerLarge.glb"), makeRoadGlb("corner"));
    await writeFile(join(root, "assets", "roadStraightLong.glb"), makeRoadGlb("straight"));

    const generate = await sceneCommand([
      "generate-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--prefix",
      "road.tile",
      "--size",
      "medium",
      "--project",
      root,
      "--json",
    ]);
    const generatedPayload = JSON.parse(generate.stdout) as { diagnostics: unknown[]; shape: string; size: string; straightCount: number; tileCount: number };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: { ModularTrackTile?: { center?: number[] } }; id: string }>;
    };

    assert.equal(generate.exitCode, 0);
    assert.equal(generatedPayload.shape, "oval");
    assert.equal(generatedPayload.size, "medium");
    assert.equal(generatedPayload.straightCount, 9);
    assert.equal(generatedPayload.tileCount, 40);
    assert.deepEqual(generatedPayload.diagnostics, []);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "road.tile.000")?.components?.ModularTrackTile?.center, [-10, -10]);
    assert.equal(scene.entities.filter((entity) => entity.id.startsWith("road.tile.")).length, 40);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command rejects modular track actors staged off the road surface", async () => {
  const root = await createSceneProject();
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "corner.glb"), makeRoadGlb("corner"));
    const add = await sceneCommand([
      "add-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--prefix",
      "road.tile",
      "--layout",
      JSON.stringify([
        { asset: "corner.glb", center: [0, 0], yaw: 0 },
        { asset: "corner.glb", center: [2, 0], yaw: 270 },
        { asset: "corner.glb", center: [2, 2], yaw: 180 },
        { asset: "corner.glb", center: [0, 2], yaw: 90 },
      ]),
      "--project",
      root,
      "--json",
    ]);
    const transform = await sceneCommand(["set-transform", "scene.arena", "player-kart", "--position", "8,0.2,8", "--project", root, "--json"]);
    const proof = await sceneCommand(["proof-modular-track", "scene.arena", "--asset-dir", "assets", "--prefix", "road.tile", "--actors", "player-kart", "--project", root, "--json"]);
    const payload = JSON.parse(proof.stdout) as { diagnostics: Array<{ code: string }>; tileCount: number };

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.equal(proof.exitCode, 1);
    assert.equal(payload.tileCount, 4);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCENE_MODULAR_TRACK_ACTOR_OFF_ROAD"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command warns when vehicle scale is too large for lane width", async () => {
  const root = await createSceneProject();
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "corner.glb"), makeRoadGlb("corner"));
    const add = await sceneCommand([
      "add-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--prefix",
      "road.tile",
      "--layout",
      JSON.stringify([
        { asset: "corner.glb", center: [0, 0], yaw: 0 },
        { asset: "corner.glb", center: [2, 0], yaw: 270 },
        { asset: "corner.glb", center: [2, 2], yaw: 180 },
        { asset: "corner.glb", center: [0, 2], yaw: 90 },
      ]),
      "--project",
      root,
      "--json",
    ]);
    const transform = await sceneCommand(["set-transform", "scene.arena", "player-kart", "--position", "1,0.2,0.5", "--scale", "2,1,2", "--project", root, "--json"]);
    const proof = await sceneCommand(["proof-modular-track", "scene.arena", "--asset-dir", "assets", "--prefix", "road.tile", "--actors", "player-kart", "--project", root, "--json"]);
    const payload = JSON.parse(proof.stdout) as {
      actorReports: Array<{ actorId: string; laneWidth: number; ratio: number; verdict: string }>;
      diagnostics: Array<{ code: string; message: string; severity: string; suggestion?: string }>;
    };

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.equal(proof.exitCode, 0);
    assert.equal(payload.actorReports[0]?.actorId, "player-kart");
    assert.equal(payload.actorReports[0]?.laneWidth, 1.35);
    assert.equal(payload.actorReports[0]?.ratio, 1.481481);
    assert.equal(payload.actorReports[0]?.verdict, "too-large");
    assert.equal(payload.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_SCENE_MODULAR_TRACK_VEHICLE_TOO_LARGE_FOR_LANE"
      && diagnostic.severity === "warning"
      && diagnostic.message.includes("1.481481")
      && diagnostic.suggestion?.includes("Reduce the actor X/Z scale") === true
    ), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command rejects modular tracks with open connectors", async () => {
  const root = await createSceneProject();
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "corner.glb"), makeRoadGlb("corner"));
    const add = await sceneCommand([
      "add-modular-track",
      "scene.arena",
      "--asset-dir",
      "assets",
      "--prefix",
      "road.tile",
      "--layout",
      JSON.stringify([
        { asset: "corner.glb", center: [0, 0], yaw: 0 },
        { asset: "corner.glb", center: [2, 0], yaw: 0 },
        { asset: "corner.glb", center: [2, 2], yaw: 180 },
        { asset: "corner.glb", center: [0, 2], yaw: 90 },
      ]),
      "--project",
      root,
      "--json",
    ]);
    const proof = await sceneCommand(["proof-modular-track", "scene.arena", "--asset-dir", "assets", "--prefix", "road.tile", "--project", root, "--json"]);
    const payload = JSON.parse(proof.stdout) as { diagnostics: Array<{ code: string }>; tileCount: number };

    assert.equal(add.exitCode, 0);
    assert.equal(proof.exitCode, 1);
    assert.equal(payload.tileCount, 4);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCENE_MODULAR_TRACK_OPEN_CONNECTOR" || diagnostic.code === "TN_SCENE_MODULAR_TRACK_CONNECTOR_MISMATCH"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command adds camera components with promoted projection fields", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    const add = await sceneCommand(["add-entity", "scene.arena", "map-camera", "--project", root, "--json"]);
    const camera = await sceneCommand([
      "add-component",
      "scene.arena",
      "map-camera",
      "camera",
      "--mode",
      "orthographic",
      "--size",
      "24",
      "--near",
      "0.05",
      "--far",
      "500",
      "--project",
      root,
      "--json",
    ]);
    const validate = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };

    assert.equal(add.exitCode, 0);
    assert.equal(camera.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "map-camera")?.components?.camera, {
      far: 500,
      mode: "orthographic",
      near: 0.05,
      size: 24,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command frames a camera with look-at rotation and no roll", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    const frame = await sceneCommand([
      "set-camera-look-at",
      "scene.arena",
      "chase-camera",
      "--position",
      "-5,1.6,10",
      "--target",
      "0,0.4,10",
      "--project",
      root,
      "--json",
    ]);
    const validate = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[]; rotation?: number[] } }>;
    };
    const camera = scene.entities.find((entity) => entity.id === "chase-camera");

    assert.equal(frame.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(camera?.transform?.position, [-5, 1.6, 10]);
    assert.deepEqual(camera?.transform?.rotation, [-0.235545, -1.570796, 0]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command proof-camera passes for visible framed target", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await sceneCommand(["set-camera-look-at", "scene.arena", "chase-camera", "--position", "-5,1.6,0", "--target", "0,0.4,0", "--project", root, "--json"]);
    const proof = await sceneCommand([
      "proof-camera",
      "scene.arena",
      "--camera",
      "chase-camera",
      "--target",
      "player-kart",
      "--min-occupancy",
      "0.03",
      "--project",
      root,
      "--json",
    ]);
    const payload = JSON.parse(proof.stdout) as {
      metrics: { approximateRoll: number; screenOccupancy: number; targetVisible: boolean };
    };

    assert.equal(proof.exitCode, 0);
    assert.equal(payload.metrics.targetVisible, true);
    assert.equal(payload.metrics.approximateRoll, 0);
    assert.equal(payload.metrics.screenOccupancy >= 0.03, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command proof-camera fails when player occupancy is below threshold", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await sceneCommand(["set-camera-look-at", "scene.arena", "chase-camera", "--position", "-5,1.6,0", "--target", "0,0.4,0", "--project", root, "--json"]);
    const proof = await sceneCommand([
      "proof-camera",
      "scene.arena",
      "--camera",
      "chase-camera",
      "--target",
      "player-kart",
      "--min-occupancy",
      "0.5",
      "--project",
      root,
      "--json",
    ]);
    const payload = JSON.parse(proof.stdout) as {
      diagnostics: Array<{ code: string; message: string }>;
      metrics: { screenOccupancy: number };
    };

    assert.equal(proof.exitCode, 1);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCENE_CAMERA_PROOF_OCCUPANCY_TOO_LOW" && diagnostic.message.includes(String(payload.metrics.screenOccupancy))), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command proof-camera fails when active camera target is outside viewport", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await sceneCommand(["set-camera-look-at", "scene.arena", "chase-camera", "--position", "-5,1.6,0", "--target", "0,0.4,0", "--project", root, "--json"]);
    await sceneCommand(["set-transform", "scene.arena", "player-kart", "--position", "0,0,20", "--project", root, "--json"]);
    const proof = await sceneCommand([
      "proof-camera",
      "scene.arena",
      "--camera",
      "chase-camera",
      "--target",
      "player-kart",
      "--project",
      root,
      "--json",
    ]);
    const payload = JSON.parse(proof.stdout) as {
      diagnostics: Array<{ code: string; message: string }>;
      metrics: { targetVisible: boolean };
    };

    assert.equal(proof.exitCode, 1);
    assert.equal(payload.metrics.targetVisible, false);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCENE_CAMERA_PROOF_TARGET_OUTSIDE_VIEW" && diagnostic.message.includes("chase-camera") && diagnostic.message.includes("player-kart")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command adds ECS tags and scene groups without raw component JSON", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    const entity = await sceneCommand(["add-entity", "scene.arena", "cube.red.0", "--project", root, "--json"]);
    const tag = await sceneCommand(["add-tag", "scene.arena", "cube.red.0", "LaneRed", "--project", root, "--json"]);
    const group = await sceneCommand(["add-group", "scene.arena", "group.lane.red", "--name", "Red Lane", "--position", "-2.5,0,0", "--project", root, "--json"]);
    const validate = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
    };

    assert.equal(entity.exitCode, 0);
    assert.equal(tag.exitCode, 0);
    assert.equal(group.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(scene.entities.find((item) => item.id === "cube.red.0")?.components?.LaneRed, {});
    assert.deepEqual(scene.entities.find((item) => item.id === "group.lane.red"), {
      components: { SceneContainer: { kind: "group", name: "Red Lane" } },
      id: "group.lane.red",
      transform: { position: [-2.5, 0, 0] },
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command sets lifecycle metadata and clears previous initial scene", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await writeFile(
      join(root, "content", "scenes", "menu.scene.json"),
      `${JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "scene.menu", kind: "menu", activation: "exclusive", initial: true, entities: [], prefabs: [], resources: [], systems: [], ui: { nodes: [] } }, null, 2)}\n`,
    );

    const result = await sceneCommand(["lifecycle", "add", "scene.arena", "--kind", "level", "--activation", "exclusive", "--initial", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { filesWritten: string[] };
    const arena = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as { activation?: string; initial?: boolean; kind?: string };
    const menu = JSON.parse(await readFile(join(root, "content", "scenes", "menu.scene.json"), "utf8")) as { initial?: boolean };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.filesWritten, ["content/scenes/arena.scene.json", "content/scenes/menu.scene.json"]);
    assert.equal(arena.kind, "level");
    assert.equal(arena.activation, "exclusive");
    assert.equal(arena.initial, true);
    assert.equal(menu.initial, false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command can create prefabs resources and ui nodes without hand-editing JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-authoring-gap-"));

  try {
    const create = await sceneCommand(["create", "scene.gap", "--project", root, "--json"]);
    const prefab = await sceneCommand(["add-prefab", "scene.gap", "kart", "--primitive", "box", "--color", "#ff2200", "--project", root, "--json"]);
    const resource = await sceneCommand(["add-resource", "scene.gap", "hud.score", "--path", "hud.score.value", "--project", root, "--json"]);
    const resourceValue = await sceneCommand(["set-resource", "scene.gap", "hud.score", "--value", "{\"value\":10,\"label\":\"READY\"}", "--project", root, "--json"]);
    const uiNode = await sceneCommand(["add-ui-node", "scene.gap", "score-label", "--project", root, "--json"]);
    const recolor = await sceneCommand(["set-prefab-color", "scene.gap", "kart", "--color", "#00aaff", "--project", root, "--json"]);
    const setPrefab = await sceneCommand(["set-prefab", "scene.gap", "kart", "--primitive", "torus", "--color", "#00ffaa", "--asset", "assets/models/kart.glb", "--project", root, "--json"]);
    const entity = await sceneCommand(["add-entity", "scene.gap", "player-kart", "--prefab", "kart", "--project", root, "--json"]);
    const component = await sceneCommand(["set-component", "scene.gap", "player-kart", "VehiclePhysics", "--value", "{\"speed\":42,\"boost\":0.5}", "--project", root, "--json"]);
    const binding = await sceneCommand(["bind-ui", "scene.gap", "score-label", "--resource", "hud.score", "--project", root, "--json"]);
    const validate = await sceneCommand(["validate", "scene.gap", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.gap.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; prefab?: string }>;
      prefabs: Array<{ asset?: string; color?: string; id: string; primitive?: string }>;
      resources: Array<{ id: string; path?: string }>;
      ui: { bindings: Array<{ node: string; resource: string }>; nodes: Array<{ id: string }> };
    };

    assert.equal(create.exitCode, 0);
    assert.equal(prefab.exitCode, 0);
    assert.equal(resource.exitCode, 0);
    assert.equal(resourceValue.exitCode, 0);
    assert.equal(uiNode.exitCode, 0);
    assert.equal(recolor.exitCode, 0);
    assert.equal(setPrefab.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(component.exitCode, 0);
    assert.equal(binding.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(scene.prefabs, [{ asset: "assets/models/kart.glb", color: "#00ffaa", id: "kart", primitive: "torus" }]);
    assert.deepEqual(scene.resources, [{ id: "hud.score", path: "hud.score.value", value: { label: "READY", value: 10 } }]);
    assert.deepEqual(scene.ui.nodes, [{ id: "score-label" }]);
    assert.deepEqual(scene.ui.bindings, [{ node: "score-label", resource: "hud.score" }]);
    assert.deepEqual(scene.entities, [{ components: { VehiclePhysics: { boost: 0.5, speed: 42 } }, id: "player-kart", prefab: "kart" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command adds typed ECS components without raw JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-typed-components-"));

  try {
    const create = await sceneCommand(["create", "scene.components", "--project", root, "--json"]);
    const entity = await sceneCommand(["add-entity", "scene.components", "player", "--project", root, "--json"]);
    await mkdir(join(root, "content", "materials"), { recursive: true });
    const material = await writeFile(join(root, "content", "materials", "mat.player.materials.json"), `${JSON.stringify({ schema: "threenative.materials", version: "0.1.0", id: "mat.player", materials: [{ id: "mat.player" }] }, null, 2)}\n`).then(() => ({ exitCode: 0 }));
    const mesh = await sceneCommand(["add-component", "scene.components", "player", "mesh-renderer", "--mesh", "mesh.player", "--material", "mat.player", "--visible", "true", "--project", root, "--json"]);
    const light = await sceneCommand(["add-component", "scene.components", "player", "light", "--kind", "point", "--intensity", "2", "--color", "#ffeeaa", "--range", "12", "--angle", "0.6", "--shadow-bias", "-0.001", "--shadow-normal-bias", "0.02", "--project", root, "--json"]);
    const renderLayers = await sceneCommand(["add-component", "scene.components", "player", "render-layers", "--layers", "gameplay,minimap", "--project", root, "--json"]);
    const rigidBody = await sceneCommand(["add-component", "scene.components", "player", "rigid-body", "--kind", "dynamic", "--mass", "4", "--project", root, "--json"]);
    const visibility = await sceneCommand(["add-component", "scene.components", "player", "visibility", "--visible", "false", "--project", root, "--json"]);
    const collider = await sceneCommand(["add-component", "scene.components", "player", "collider", "--kind", "box", "--size", "1,2,3", "--trigger", "false", "--project", root, "--json"]);
    const controller = await sceneCommand(["add-component", "scene.components", "player", "character-controller", "--move-x", "move.x", "--move-z", "move.z", "--speed", "6", "--project", root, "--json"]);
    const validate = await sceneCommand(["validate", "scene.components", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.components.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const components = scene.entities.find((item) => item.id === "player")?.components;

    assert.equal(create.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(material.exitCode, 0);
    assert.equal(mesh.exitCode, 0);
    assert.equal(light.exitCode, 0);
    assert.equal(renderLayers.exitCode, 0);
    assert.equal(rigidBody.exitCode, 0);
    assert.equal(visibility.exitCode, 0);
    assert.equal(collider.exitCode, 0);
    assert.equal(controller.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(components?.MeshRenderer, { material: "mat.player", mesh: "mesh.player", visible: true });
    assert.deepEqual(components?.Light, { angle: 0.6, color: "#ffeeaa", intensity: 2, kind: "point", range: 12, shadowBias: -0.001, shadowNormalBias: 0.02 });
    assert.deepEqual(components?.RenderLayers, { layers: ["gameplay", "minimap"] });
    assert.deepEqual(components?.RigidBody, { kind: "dynamic", mass: 4 });
    assert.deepEqual(components?.Visibility, { visible: false });
    assert.deepEqual(components?.Collider, { kind: "box", size: [1, 2, 3], trigger: false });
    assert.deepEqual(components?.CharacterController, { blocking: true, grounding: "raycast", moveXAxis: "move.x", moveZAxis: "move.z", speed: 6 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command persists typed Spawner component", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-spawner-"));

  try {
    const create = await sceneCommand(["create", "scene.spawner", "--project", root, "--json"]);
    const prefab = await sceneCommand(["add-prefab", "scene.spawner", "prefab.drone", "--primitive", "box", "--project", root, "--json"]);
    const entity = await sceneCommand(["add-entity", "scene.spawner", "drone-spawner", "--project", root, "--json"]);
    const spawner = await sceneCommand([
      "set-spawner",
      "scene.spawner",
      "drone-spawner",
      "--prefab",
      "prefab.drone",
      "--mode",
      "wave",
      "--wave-size",
      "3",
      "--max-alive",
      "6",
      "--max-total",
      "12",
      "--jitter-seed",
      "99",
      "--area",
      "{\"shape\":\"box\",\"size\":[4,0,2]}",
      "--despawn-policy",
      "{\"afterSeconds\":8}",
      "--project",
      root,
      "--json",
    ]);
    const validate = await sceneCommand(["validate", "scene.spawner", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.spawner.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(prefab.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(spawner.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(scene.entities.find((item) => item.id === "drone-spawner")?.components?.Spawner, {
      area: { shape: "box", size: [4, 0, 2] },
      despawnPolicy: { afterSeconds: 8 },
      enabled: true,
      jitterSeed: 99,
      maxAlive: 6,
      maxTotal: 12,
      mode: "wave",
      prefab: "prefab.drone",
      waveSize: 3,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command smoke validates authored scene and preserves project build validation", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await writeBuildableProject(root);
    await sceneCommand(["lifecycle", "add", "scene.arena", "--kind", "menu", "--activation", "persistent", "--initial", "--project", root, "--json"]);

    const add = await sceneCommand(["add-entity", "scene.arena", "rival-kart", "--prefab", "kart", "--project", root, "--json"]);
    const transform = await sceneCommand(["set-transform", "scene.arena", "rival-kart", "--position", "1,2,3", "--project", root, "--json"]);
    const sceneValidation = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const build = await buildCommand(["--project", root, "--json"]);
    const bundleValidation = await validateProject(["--project", root, "--json"]);
    const scenes = JSON.parse(await readFile(join(root, "dist", "game.bundle", "scenes.ir.json"), "utf8")) as {
      initialScene: string;
      scenes: Array<{ activation?: string; id: string; kind: string }>;
    };

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.equal(sceneValidation.exitCode, 0);
    assert.equal(build.exitCode, 0);
    assert.equal(bundleValidation.exitCode, 0);
    assert.equal((JSON.parse(build.stdout) as { code: string }).code, "TN_BUILD_OK");
    assert.equal((JSON.parse(bundleValidation.stdout) as { code: string }).code, "TN_VALIDATE_OK");
    assert.equal(scenes.initialScene, "scene.arena");
    assert.deepEqual(scenes.scenes.map((scene) => ({ activation: scene.activation, id: scene.id, kind: scene.kind })), [
      { activation: "persistent", id: "scene.arena", kind: "menu" },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command proof writes deterministic source and bundle report", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await writeBuildableProject(root);

    const result = await sceneCommand(["proof", "scene.arena", "--project", root, "--out", "artifacts/proof", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      artifacts: Array<{ path: string; runtime: string }>;
      caveats: string[];
      commands: Array<{ command: string; status: string }>;
      provenance: { bundleContainsScene: boolean; sceneSourceFile: string; sourceConnectedToBundle: boolean };
      status: string;
    };
    const report = JSON.parse(await readFile(join(root, "artifacts", "proof", "proof-report.json"), "utf8")) as typeof payload;
    const markdown = await readFile(join(root, "artifacts", "proof", "proof.md"), "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(payload.status, "warning");
    assert.equal(payload.provenance.sceneSourceFile, "content/scenes/arena.scene.json");
    assert.equal(payload.provenance.sourceConnectedToBundle, true);
    assert.equal(payload.provenance.bundleContainsScene, true);
    assert.equal(payload.commands.some((command) => command.command.startsWith("tn scene validate scene.arena") && command.status === "pass"), true);
    assert.equal(payload.commands.some((command) => command.command.startsWith("tn build --project") && command.status === "pass"), true);
    assert.equal(payload.commands.some((command) => command.command.startsWith("tn screenshot") && command.status === "skipped"), true);
    assert.equal(payload.caveats.some((caveat) => caveat.includes("does not claim same-tick pixel parity")), true);
    assert.equal(report.provenance.sourceConnectedToBundle, true);
    assert.match(markdown, /not a same-tick pixel parity report/);
    assert.equal(payload.artifacts.some((artifact) => artifact.runtime === "report" && artifact.path.endsWith("proof-report.json")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command proof requires a scene id", async () => {
  const result = await sceneCommand(["proof", "--json"], { cwd: "/" });
  const payload = JSON.parse(result.stdout) as { code: string; severity: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_SCENE_PROOF_USAGE");
  assert.equal(payload.severity, "error");
});

test("scene-command proof native capture uses raw command when a display is available", () => {
  const invocation = resolveNativeCaptureInvocation({
    bundlePath: "/project/dist/game.bundle",
    cameraId: "camera.main",
    captureBinaryPath: "/repo/runtime-bevy/target/debug/threenative_capture",
    cargoCommand: "cargo",
    env: { DISPLAY: ":99", PATH: "/bin" },
    frame: 120,
    outPath: "/project/artifacts/proof/bevy.png",
    repoRoot: "/repo",
  });

  assert.equal(invocation.command, "/repo/runtime-bevy/target/debug/threenative_capture");
  assert.deepEqual(invocation.args, ["/project/dist/game.bundle", "camera.main", "/project/artifacts/proof/bevy.png", "120"]);
  assert.equal(invocation.wrappedWithXvfb, false);
});

test("scene-command proof native capture wraps headless sessions with xvfb-run when available", () => {
  const invocation = resolveNativeCaptureInvocation({
    bundlePath: "/project/dist/game.bundle",
    cameraId: "camera.main",
    cargoCommand: "cargo",
    commandExists: (command) => command === "xvfb-run",
    env: { PATH: "/bin" },
    frame: 120,
    outPath: "/project/artifacts/proof/bevy.png",
    repoRoot: "/repo",
  });

  assert.equal(invocation.command, "xvfb-run");
  assert.deepEqual(invocation.args, [
    "-a",
    "cargo",
    "run",
    "--quiet",
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_capture",
    "--",
    "/project/dist/game.bundle",
    "camera.main",
    "/project/artifacts/proof/bevy.png",
    "120",
  ]);
  assert.equal(invocation.cwd, "/repo/runtime-bevy");
  assert.equal(invocation.wrappedWithXvfb, true);
});

test("scene-command proof native capture gives stable diagnostic when headless without xvfb-run", () => {
  assert.throws(
    () => resolveNativeCaptureInvocation({
      bundlePath: "/project/dist/game.bundle",
      cameraId: "camera.main",
      cargoCommand: "cargo",
      commandExists: () => false,
      env: { PATH: "/bin" },
      frame: 120,
      outPath: "/project/artifacts/proof/bevy.png",
      repoRoot: "/repo",
    }),
    /TN_SCENE_PROOF_NATIVE_HEADLESS_XVFB_MISSING.*Install Xvfb\/xvfb-run/,
  );
});

async function createSceneProject(options: { invalidTarget?: boolean; minimal?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
  await writeFile(join(root, "src", "scripts", "race.ts"), "export function raceController() {}\n");
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify({
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.arena",
      prefabs: [{ id: "kart" }],
      resources: [{ id: "hud.score" }],
      entities: [
        {
          id: "player-kart",
          prefab: "kart",
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: "chase-camera",
          components: { camera: { mode: "third-person-follow", target: options.invalidTarget === true ? "player-kartt" : "player-kart" } },
        },
      ],
      systems: [{ id: "race-controller", script: { module: "src/scripts/race.ts", export: "raceController" } }],
      ui: {
        nodes: [{ id: "score-label" }],
        ...(options.minimal === true ? {} : { bindings: [{ node: "score-label", resource: "hud.score.value" }] }),
      },
    }, null, 2)}\n`,
  );
  return root;
}

async function writeBuildableProject(root: string): Promise<void> {
  await writeFile(
    join(root, "threenative.config.json"),
    `${JSON.stringify({
      entry: "content/scenes/arena.scene.json",
      outDir: "dist/game.bundle",
      schema: "threenative.project",
      version: "0.1.0",
    }, null, 2)}\n`,
  );
  await writeFile(join(root, "src", "game.ts"), 'import { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene.arena" });\n');
}

function makeRoadGlb(kind: "corner" | "straight"): Buffer {
  const grass = [[0, 0, -2], [2, 0, -2], [2, 0, 0], [0, 0, 0]];
  const road = kind === "straight"
    ? [[0.65, 0.01, -2], [1.35, 0.01, -2], [1.35, 0.01, 0], [0.65, 0.01, 0]]
    : [[0.65, 0.01, -1.35], [2, 0.01, -1.35], [2, 0.01, 0], [0.65, 0.01, 0]];
  const roadMin = kind === "straight" ? [0.65, 0.01, -2] : [0.65, 0.01, -1.35];
  const roadMax = kind === "straight" ? [1.35, 0.01, 0] : [2, 0.01, 0];
  const grassBytes = positionsBuffer(grass);
  const roadBytes = positionsBuffer(road);
  const indexBytes = indicesBuffer([0, 1, 2, 0, 2, 3]);
  const roadOffset = grassBytes.length;
  const grassIndexOffset = roadOffset + roadBytes.length;
  const roadIndexOffset = grassIndexOffset + indexBytes.length;
  const binary = Buffer.concat([grassBytes, roadBytes, indexBytes, indexBytes]);
  return makeGlb({
    asset: { version: "2.0", generator: "scene-modular-proof-test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [-0.35, -0.01, -0.65] }],
    meshes: [{
      primitives: [
        { attributes: { POSITION: 0 }, indices: 2, material: 0, mode: 4 },
        { attributes: { POSITION: 1 }, indices: 3, material: 1, mode: 4 },
      ],
    }],
    materials: [{ name: "grass" }, { name: "road" }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: grassBytes.length },
      { buffer: 0, byteOffset: roadOffset, byteLength: roadBytes.length },
      { buffer: 0, byteOffset: grassIndexOffset, byteLength: indexBytes.length },
      { buffer: 0, byteOffset: roadIndexOffset, byteLength: indexBytes.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, -2], max: [2, 0, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3", min: roadMin, max: roadMax },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  }, binary);
}

function makeGlb(json: unknown, binaryChunk: Buffer): Buffer {
  const jsonText = JSON.stringify(json);
  const jsonBuffer = Buffer.from(jsonText.padEnd(jsonText.length + ((4 - (jsonText.length % 4)) % 4), " "), "utf8");
  const binPadding = (4 - (binaryChunk.length % 4)) % 4;
  const paddedBinary = Buffer.concat([binaryChunk, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonBuffer.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBuffer, binHeader, paddedBinary]);
}

function positionsBuffer(positions: number[][]): Buffer {
  const buffer = Buffer.alloc(positions.length * 12);
  positions.forEach((position, index) => {
    buffer.writeFloatLE(position[0] ?? 0, index * 12);
    buffer.writeFloatLE(position[1] ?? 0, index * 12 + 4);
    buffer.writeFloatLE(position[2] ?? 0, index * 12 + 8);
  });
  return buffer;
}

function indicesBuffer(indices: number[]): Buffer {
  const buffer = Buffer.alloc(indices.length * 2);
  indices.forEach((index, offset) => buffer.writeUInt16LE(index, offset * 2));
  return buffer;
}

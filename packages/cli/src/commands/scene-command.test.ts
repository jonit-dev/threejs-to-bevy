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

test("scene-command inspect requires a scene id", async () => {
  const result = await sceneCommand(["inspect", "--json"], { cwd: "/" });
  const payload = JSON.parse(result.stdout) as { code: string; severity: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_SCENE_INSPECT_ID_MISSING");
  assert.equal(payload.severity, "error");
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
    const entity = await sceneCommand(["add-entity", "scene.gap", "player-kart", "--prefab", "kart", "--project", root, "--json"]);
    const component = await sceneCommand(["set-component", "scene.gap", "player-kart", "VehiclePhysics", "--value", "{\"speed\":42,\"boost\":0.5}", "--project", root, "--json"]);
    const binding = await sceneCommand(["bind-ui", "scene.gap", "score-label", "--resource", "hud.score", "--project", root, "--json"]);
    const validate = await sceneCommand(["validate", "scene.gap", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.gap.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; prefab?: string }>;
      prefabs: Array<{ color?: string; id: string; primitive?: string }>;
      resources: Array<{ id: string; path?: string }>;
      ui: { bindings: Array<{ node: string; resource: string }>; nodes: Array<{ id: string }> };
    };

    assert.equal(create.exitCode, 0);
    assert.equal(prefab.exitCode, 0);
    assert.equal(resource.exitCode, 0);
    assert.equal(resourceValue.exitCode, 0);
    assert.equal(uiNode.exitCode, 0);
    assert.equal(recolor.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(component.exitCode, 0);
    assert.equal(binding.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(scene.prefabs, [{ color: "#00aaff", id: "kart", primitive: "box" }]);
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
    const light = await sceneCommand(["add-component", "scene.components", "player", "light", "--kind", "point", "--intensity", "2", "--color", "#ffeeaa", "--range", "12", "--project", root, "--json"]);
    const rigidBody = await sceneCommand(["add-component", "scene.components", "player", "rigid-body", "--kind", "dynamic", "--mass", "4", "--project", root, "--json"]);
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
    assert.equal(rigidBody.exitCode, 0);
    assert.equal(collider.exitCode, 0);
    assert.equal(controller.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(components?.MeshRenderer, { material: "mat.player", mesh: "mesh.player", visible: true });
    assert.deepEqual(components?.Light, { color: "#ffeeaa", intensity: 2, kind: "point", range: 12 });
    assert.deepEqual(components?.RigidBody, { kind: "dynamic", mass: 4 });
    assert.deepEqual(components?.Collider, { kind: "box", size: [1, 2, 3], trigger: false });
    assert.deepEqual(components?.CharacterController, { blocking: true, grounding: "raycast", moveXAxis: "move.x", moveZAxis: "move.z", speed: 6 });
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

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildCommand } from "./build.js";
import { sceneCommand } from "./scene.js";
import { validateProject } from "./validate.js";

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
    const camera = await sceneCommand(["set-camera", "scene.arena", "chase-camera", "--mode", "third-person-follow", "--target", "player-kart", "--project", root, "--json"]);
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
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene-command smoke validates authored scene and preserves project build validation", async () => {
  const root = await createSceneProject({ minimal: true });

  try {
    await writeBuildableProject(root);

    const add = await sceneCommand(["add-entity", "scene.arena", "rival-kart", "--prefab", "kart", "--project", root, "--json"]);
    const transform = await sceneCommand(["set-transform", "scene.arena", "rival-kart", "--position", "1,2,3", "--project", root, "--json"]);
    const sceneValidation = await sceneCommand(["validate", "scene.arena", "--project", root, "--json"]);
    const build = await buildCommand(["--project", root, "--json"]);
    const bundleValidation = await validateProject(["--project", root, "--json"]);

    assert.equal(add.exitCode, 0);
    assert.equal(transform.exitCode, 0);
    assert.equal(sceneValidation.exitCode, 0);
    assert.equal(build.exitCode, 0);
    assert.equal(bundleValidation.exitCode, 0);
    assert.equal((JSON.parse(build.stdout) as { code: string }).code, "TN_BUILD_OK");
    assert.equal((JSON.parse(bundleValidation.stdout) as { code: string }).code, "TN_VALIDATE_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
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
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      schema: "threenative.project",
      version: "0.1.0",
    }, null, 2)}\n`,
  );
  await writeFile(join(root, "src", "game.ts"), 'import { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene.arena" });\n');
}

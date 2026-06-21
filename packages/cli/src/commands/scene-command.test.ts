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

test("scene-command can create prefabs resources and ui nodes without hand-editing JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-scene-authoring-gap-"));

  try {
    const create = await sceneCommand(["create", "scene.gap", "--project", root, "--json"]);
    const prefab = await sceneCommand(["add-prefab", "scene.gap", "kart", "--primitive", "box", "--color", "#ff2200", "--project", root, "--json"]);
    const resource = await sceneCommand(["add-resource", "scene.gap", "hud.score", "--path", "hud.score.value", "--project", root, "--json"]);
    const uiNode = await sceneCommand(["add-ui-node", "scene.gap", "score-label", "--project", root, "--json"]);
    const recolor = await sceneCommand(["set-prefab-color", "scene.gap", "kart", "--color", "#00aaff", "--project", root, "--json"]);
    const entity = await sceneCommand(["add-entity", "scene.gap", "player-kart", "--prefab", "kart", "--project", root, "--json"]);
    const binding = await sceneCommand(["bind-ui", "scene.gap", "score-label", "--resource", "hud.score", "--project", root, "--json"]);
    const validate = await sceneCommand(["validate", "scene.gap", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.gap.scene.json"), "utf8")) as {
      entities: Array<{ id: string; prefab?: string }>;
      prefabs: Array<{ color?: string; id: string; primitive?: string }>;
      resources: Array<{ id: string; path?: string }>;
      ui: { bindings: Array<{ node: string; resource: string }>; nodes: Array<{ id: string }> };
    };

    assert.equal(create.exitCode, 0);
    assert.equal(prefab.exitCode, 0);
    assert.equal(resource.exitCode, 0);
    assert.equal(uiNode.exitCode, 0);
    assert.equal(recolor.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(binding.exitCode, 0);
    assert.equal(validate.exitCode, 0);
    assert.deepEqual(scene.prefabs, [{ color: "#00aaff", id: "kart", primitive: "box" }]);
    assert.deepEqual(scene.resources, [{ id: "hud.score", path: "hud.score.value" }]);
    assert.deepEqual(scene.ui.nodes, [{ id: "score-label" }]);
    assert.deepEqual(scene.ui.bindings, [{ node: "score-label", resource: "hud.score" }]);
    assert.deepEqual(scene.entities, [{ id: "player-kart", prefab: "kart" }]);
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

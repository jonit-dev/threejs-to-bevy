import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { captureEntry } from "./capture.js";
import { CompilerError } from "./errors.js";
import { buildProject } from "./index.js";
import { AUTHORING_PROVENANCE_FILE } from "./authoring/provenance.js";

test("should capture starter scene root", async () => {
  const root = await makeProject(`import { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  try {
    const captured = await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    assert.equal(captured.summary.rootType, "Scene");
    assert.equal(captured.graph.schema, "threenative.authoring-graph");
    assert.equal(captured.graph.entryPath, "src/game.ts");
    assert.equal(captured.graph.declarations.some((declaration) => declaration.kind === "scene" && declaration.id === "scene"), true);
    assert.deepEqual(captured.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should capture defineGame root through existing bundle path", async () => {
  const root = await makeProject(
    `import { Scene, World, defineGame } from "@threenative/sdk";\nconst scene = new Scene({ id: "scene" });\nconst world = new World();\nexport default defineGame({ scene, world });\n`,
  );
  try {
    const captured = await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    assert.equal(captured.summary.rootType, "World");
    assert.equal(typeof captured.root, "object");
    assert.notEqual(captured.root, null);
    const rootObject = captured.root as Record<string, unknown>;
    assert.equal("scene" in rootObject, true);
    assert.equal("world" in rootObject, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should capture scene from valid relative module", async () => {
  const root = await makeProject(`import { scene } from "./scene.js";\nexport default scene;\n`);
  await writeFile(join(root, "src/scene.ts"), `import { Scene } from "@threenative/sdk";\nexport const scene = new Scene({ id: "scene.module" });\n`);
  try {
    const captured = await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    assert.equal(captured.summary.rootType, "Scene");
    assert.deepEqual(captured.graph.modules.map((module) => module.path), ["src/game.ts", "src/scene.ts"]);
    assert.equal(
      captured.graph.declarations.some(
        (declaration) => declaration.kind === "scene" && declaration.id === "scene.module" && declaration.provenance.source.modulePath === "src/scene.ts",
      ),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should clean capture temp output outside compiler source space", async () => {
  const root = await makeProject(`import { scene } from "./scene.js";\nexport default scene;\n`);
  await writeFile(join(root, "src/scene.ts"), `import { Scene } from "@threenative/sdk";\nexport const scene = new Scene({ id: "scene.clean" });\n`);
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const legacySourceTemp = join(packageRoot, ".tn");
  try {
    await rm(legacySourceTemp, { force: true, recursive: true });
    await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    await assert.rejects(access(legacySourceTemp), { code: "ENOENT" });
    const packageRootEntries = await readdir(packageRoot);
    assert.equal(packageRootEntries.some((entry) => entry.startsWith(`.tn-capture-${basename(root)}-`)), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should capture modular defineGame lifecycle scenes", async () => {
  const root = await makeProject(`import { defineGame } from "@threenative/sdk";\nimport { menuScene } from "./scenes/menu.js";\nexport default defineGame({ initialScene: "menu", scenes: [menuScene] });\n`);
  await mkdir(join(root, "src/scenes"), { recursive: true });
  await writeFile(
    join(root, "src/scenes/menu.ts"),
    `import { Scene, defineScene } from "@threenative/sdk";\nconst visual = new Scene({ id: "menu.visual" });\nexport const menuScene = defineScene({ id: "menu", kind: "menu", visual });\n`,
  );
  try {
    const captured = await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    assert.equal(captured.summary.rootType, "World");
    assert.equal(captured.graph.declarations.some((declaration) => declaration.kind === "scene" && declaration.id === "menu"), true);
    assert.equal(captured.graph.declarations.some((declaration) => declaration.kind === "scene" && declaration.id === "menu.visual"), true);
    assert.equal(typeof captured.root, "object");
    assert.notEqual(captured.root, null);
    const rootObject = captured.root as Record<string, unknown>;
    assert.equal(rootObject.initialScene, "menu");
    assert.equal(Array.isArray(rootObject.scenes), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject duplicate authoring graph declarations before emit", async () => {
  const root = await makeProject(`import { sceneA } from "./scenes/a.js";\nimport { sceneB } from "./scenes/b.js";\nvoid sceneB;\nexport default sceneA;\n`);
  await writeConfig(root);
  await mkdir(join(root, "src/scenes"), { recursive: true });
  await writeFile(
    join(root, "src/scenes/a.ts"),
    `import { Scene } from "@threenative/sdk";\nexport const sceneA = new Scene({ id: "arena" });\n`,
  );
  await writeFile(
    join(root, "src/scenes/b.ts"),
    `import { Scene } from "@threenative/sdk";\nexport const sceneB = new Scene({ id: "arena" });\n`,
  );
  try {
    await assert.rejects(
      () => buildProject(root),
      (error) =>
        error instanceof CompilerError &&
        error.code === "TN_AUTHORING_DUPLICATE_SCENE_ID" &&
        error.diagnostic?.path === "authoring/scene/arena",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("capture should return duplicate graph diagnostics for repair tools", async () => {
  const root = await makeProject(`import { sceneA } from "./scenes/a.js";\nimport { sceneB } from "./scenes/b.js";\nvoid sceneB;\nexport default sceneA;\n`);
  await mkdir(join(root, "src/scenes"), { recursive: true });
  await writeFile(join(root, "src/scenes/a.ts"), `import { Scene } from "@threenative/sdk";\nexport const sceneA = new Scene({ id: "arena" });\n`);
  await writeFile(join(root, "src/scenes/b.ts"), `import { Scene } from "@threenative/sdk";\nexport const sceneB = new Scene({ id: "arena" });\n`);
  try {
    const captured = await captureEntry({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project",
      version: "0.1.0",
    });

    assert.equal(captured.diagnostics[0]?.code, "TN_AUTHORING_DUPLICATE_SCENE_ID");
    assert.deepEqual(captured.diagnostics[0]?.limit, ["src/scenes/a.ts", "src/scenes/b.ts"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("build should emit authoring provenance sidecar from capture graph", async () => {
  const root = await makeProject(`import { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  await writeConfig(root);
  try {
    const { bundlePath } = await buildProject(root);
    const provenance = JSON.parse(await readFile(join(bundlePath, AUTHORING_PROVENANCE_FILE), "utf8"));

    assert.equal(provenance.schema, "threenative.authoring-provenance");
    assert.equal(provenance.entryPath, "src/game.ts");
    assert.equal(provenance.projectRoot, undefined);
    assert.ok(provenance.declarations.some((declaration: { id?: string; kind?: string }) => declaration.kind === "scene" && declaration.id === "scene"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("build should lower structured scene entry into runtime bundle with attached script", async () => {
  const root = await makeProject("export default {};\n");
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
  await writeConfig(root, "content/scenes/cli-proof.scene.json");
  await writeFile(
    join(root, "src", "scripts", "player.ts"),
    `export function movePlayerToGoal(ctx: any): void {\n  for (const entity of ctx.query()) {\n    const transform = entity.get("Transform");\n    const position = transform.position ?? [0, 0, 0];\n    entity.patch("Transform", { position: [position[0] + ctx.time.dt, position[1], position[2]] });\n  }\n}\n`,
  );
  await writeFile(
    join(root, "content", "scenes", "cli-proof.scene.json"),
    `${JSON.stringify({
      schema: "threenative.scene",
      version: "0.1.0",
      id: "cli-proof",
      prefabs: [{ id: "cube-prefab", primitive: "box", color: "#2f80ed" }],
      resources: [{ id: "race-state", value: { lap: 1, speed: 0, status: "READY" } }],
      entities: [
        { id: "player", prefab: "cube-prefab", components: { VehiclePhysics: { speed: 42, boost: 0.65, heading: 1.57 }, Team: { id: "orange" } }, transform: { position: [0, 0.35, 0], rotation: [0, 1.57, 0], scale: [0.6, 0.6, 0.6] } },
        { id: "chase-camera", components: { camera: { far: 250, fovY: 58, mode: "perspective", near: 0.2, target: "player" } }, transform: { position: [0, 3.2, 5.8], rotation: [-0.48, 0, 0] } },
      ],
      systems: [{ id: "move-player-to-goal", script: { module: "src/scripts/player.ts", export: "movePlayerToGoal" } }],
    }, null, 2)}\n`,
  );

  try {
    const { bundlePath } = await buildProject(root);
    const world = JSON.parse(await readFile(join(bundlePath, "world.ir.json"), "utf8")) as { entities: Array<{ id: string; components: Record<string, unknown> }>; resources: Record<string, Record<string, unknown>> };
    const systems = JSON.parse(await readFile(join(bundlePath, "systems.ir.json"), "utf8")) as { systems: Array<{ name: string; script?: { exportName: string } }> };
    const scripts = await readFile(join(bundlePath, "scripts.bundle.js"), "utf8");
    const provenance = JSON.parse(await readFile(join(bundlePath, AUTHORING_PROVENANCE_FILE), "utf8")) as {
      declarations: Array<{ id: string; kind: string }>;
      entryPath: string;
      ownership: Array<{
        emitted: { artifactKind: string; id?: string; path: string };
        ownership: string;
        source?: { exportName?: string; modulePath?: string; path: string; pointer: string };
      }>;
    };

    assert.equal(world.entities.some((entity) => entity.id === "player" && entity.components.Transform !== undefined && entity.components.MeshRenderer !== undefined), true);
    const player = world.entities.find((entity) => entity.id === "player");
    assert.deepEqual(player?.components.VehiclePhysics, { speed: 42, boost: 0.65, heading: 1.57 });
    assert.deepEqual(player?.components.Team, { id: "orange" });
    assert.deepEqual(world.entities.find((entity) => entity.id === "chase-camera")?.components.Camera, {
      far: 250,
      fovY: 58,
      kind: "perspective",
      near: 0.2,
      priority: 0,
    });
    assert.deepEqual(world.resources["race-state"], { lap: 1, speed: 0, status: "READY" });
    const playerTransform = world.entities.find((entity) => entity.id === "player")?.components.Transform as { rotation?: unknown[] } | undefined;
    assert.equal(playerTransform?.rotation?.length, 4);
    assert.equal(playerTransform.rotation.every((value) => typeof value === "number" && Number.isFinite(value)), true);
    assert.deepEqual(systems.systems.map((system) => [system.name, system.script?.exportName]), [["move-player-to-goal", "system_move_player_to_goal"]]);
    assert.match(scripts, /movePlayerToGoal/);
    assert.equal(provenance.entryPath, "content/scenes/cli-proof.scene.json");
    assert.equal(provenance.declarations.some((declaration) => declaration.kind === "system" && declaration.id === "move-player-to-goal"), true);
    assert.equal(provenance.ownership.some((entry) => entry.emitted.artifactKind === "entity" && entry.emitted.id === "player" && entry.source?.pointer === "/entities/0"), true);
    const systemOwner = provenance.ownership.find((entry) => entry.emitted.artifactKind === "system" && entry.emitted.id === "move-player-to-goal");
    assert.equal(systemOwner?.source?.path, "content/scenes/cli-proof.scene.json");
    assert.equal(systemOwner?.source?.modulePath, "src/scripts/player.ts");
    assert.equal(systemOwner?.source?.exportName, "movePlayerToGoal");
    assert.equal(provenance.ownership.find((entry) => entry.emitted.path === "scripts.bundle.js")?.ownership, "rejected/not-source");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported root", async () => {
  const root = await makeProject("export default {};\n");
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) => error instanceof CompilerError && error.code === "TN_COMPILER_UNSUPPORTED_ROOT",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve diagnostics for invalid transitive imports", async () => {
  const root = await makeProject(`import "./platform";\nimport { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  await writeFile(join(root, "src/platform.ts"), `import "three";\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/platform.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported import behind nodenext js specifier", async () => {
  const root = await makeProject(`import "./platform.js";\nimport { Scene } from "@threenative/sdk";\nexport default new Scene({ id: "scene" });\n`);
  await writeFile(join(root, "src/platform.ts"), `import "three";\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/platform.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported node subpath import", async () => {
  const root = await makeProject(`import { readFile } from "fs/promises";\nimport { Scene } from "@threenative/sdk";\nvoid readFile;\nexport default new Scene({ id: "scene" });\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported require imports", async () => {
  const root = await makeProject(`const fs = require("fs");\nimport { Scene } from "@threenative/sdk";\nvoid fs;\nexport default new Scene({ id: "scene" });\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported dynamic require imports", async () => {
  const root = await makeProject(`const specifier = "fs";\nconst fs = require(specifier);\nimport { Scene } from "@threenative/sdk";\nvoid fs;\nexport default new Scene({ id: "scene" });\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported commented dynamic import", async () => {
  const root = await makeProject(`import { Scene } from "@threenative/sdk";\nvoid import(/* @vite-ignore */ "three");\nvoid import( /* comment */ "fs/promises" );\nexport default new Scene({ id: "scene" });\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported renderer subpath import", async () => {
  const root = await makeProject(`import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";\nimport { Scene } from "@threenative/sdk";\nvoid GLTFLoader;\nexport default new Scene({ id: "scene" });\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported react renderer subpath import", async () => {
  const root = await makeProject(`import { Canvas } from "@react-three/fiber/native";\nimport { Scene } from "@threenative/sdk";\nvoid Canvas;\nexport default new Scene({ id: "scene" });\n`);
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported template literal dynamic import", async () => {
  const root = await makeProject("import { Scene } from \"@threenative/sdk\";\nvoid import(`fs/promises`);\nexport default new Scene({ id: \"scene\" });\n");
  try {
    await assert.rejects(
      () =>
        captureEntry({
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        }),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_UNSUPPORTED_IMPORT" &&
        error.diagnostic?.path === "src/game.ts",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeProject(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-compiler-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/game.ts"), source);
  return root;
}

async function writeConfig(root: string, entry = "src/game.ts"): Promise<void> {
  await writeFile(
    join(root, "threenative.config.json"),
    `${JSON.stringify({
      entry,
      outDir: "dist/game.bundle",
      schema: "threenative.project",
      version: "0.1.0",
    }, null, 2)}\n`,
  );
}

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildProject, validateBundle } from "./index.js";

test("should build legacy game ts compatibility fixture", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-modular-starter-"));
  try {
    await mkdir(join(projectPath, "src/scenes"), { recursive: true });
    await writeFile(
      join(projectPath, "threenative.config.json"),
      JSON.stringify({
        schema: "threenative.project",
        version: "0.1.0",
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
      }),
    );
    await writeFile(join(projectPath, "src/game.ts"), `import { scene } from "./scenes/main.js";\nexport default scene;\n`);
    await writeFile(
      join(projectPath, "src/scenes/main.ts"),
      `import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "@threenative/sdk";

const scene = new Scene({ id: "scene.modular" });
scene.add(new Mesh({
  id: "modular.cube",
  geometry: new BoxGeometry({ size: [1, 1, 1] }),
  material: new MeshStandardMaterial({ color: "#44aa88" }),
}));
const camera = new PerspectiveCamera({ id: "camera.main", fovY: 60, near: 0.1, far: 100 });
scene.add(camera);
scene.setActiveCamera(camera);

export { scene };
`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const world = JSON.parse(await readFile(resolve(bundlePath, "world.ir.json"), "utf8"));

    assert.equal(report.ok, true);
    assert.ok(world.entities.some((entity: { id: string }) => entity.id === "modular.cube"));
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should build structured source starter template with source document provenance", async () => {
  const projectPath = resolve(process.cwd(), "../../templates/structured-source-starter");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const provenance = JSON.parse(await readFile(resolve(bundlePath, "authoring.provenance.json"), "utf8")) as {
    ownership: Array<{ emitted: { id?: string; path: string }; source?: { path: string; pointer: string } }>;
  };

  assert.equal(bundlePath, resolve(projectPath, "dist/structured-source-starter.bundle"));
  assert.equal(report.ok, true);
  assert.ok(
    provenance.ownership.some(
      (entry) =>
        entry.emitted.path === "materials.ir.json" &&
        entry.emitted.id === "mat.player" &&
        entry.source?.path === "content/materials/arena.materials.json",
    ),
  );
  assert.ok(
    provenance.ownership.some(
      (entry) =>
        entry.emitted.path === "ui.ir.json" &&
        entry.emitted.id === "countdown" &&
        entry.source?.path === "content/ui/hud.ui.json" &&
        entry.source.pointer === "/nodes/0",
    ),
  );
  assert.ok(
    provenance.ownership.some(
      (entry) =>
        entry.emitted.path === "assets.manifest.json" &&
        entry.emitted.id === "asset.goal-ping" &&
        entry.source?.path === "content/assets/arena.assets.json",
    ),
  );
});

test("should emit structured source environment documents", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-environment-"));
  try {
    await cp(resolve(process.cwd(), "../../templates/structured-source-starter"), projectPath, { recursive: true });
    await mkdir(join(projectPath, "assets"), { recursive: true });
    await mkdir(join(projectPath, "content/assets"), { recursive: true });
    await mkdir(join(projectPath, "content/environment"), { recursive: true });
    await mkdir(join(projectPath, "content/prefabs"), { recursive: true });
    await mkdir(join(projectPath, "content/runtime"), { recursive: true });
    await writeFile(join(projectPath, "assets/bonus.png"), "texture");
    await writeFile(
      join(projectPath, "content/assets/bonus.assets.json"),
      `${JSON.stringify({
        schema: "threenative.assets",
        version: "0.1.0",
        id: "bonus-assets",
        assets: [{ id: "tex.bonus", path: "assets/bonus.png", type: "texture" }],
      }, null, 2)}\n`,
    );
    await writeFile(
      join(projectPath, "content/environment/arena.environment.json"),
      `${JSON.stringify({
        schema: "threenative.environment-scene",
        version: "0.1.0",
        id: "arena-environment",
        environmentMap: { asset: "tex.sky" },
        instances: [],
        path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
        skybox: { asset: "tex.sky", mode: "equirect" },
        terrain: { bounds: { min: [-4, 0, -4], max: [4, 0, 4] }, heightMode: "flat", id: "terrain.editor" },
        walkability: {
          blockers: [],
          movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
          regions: [],
          terrain: { height: 0, surface: "terrain.editor" },
        },
      }, null, 2)}\n`,
    );
    await writeFile(
      join(projectPath, "content/runtime/desktop.runtime.json"),
      `${JSON.stringify({
        schema: "threenative.runtime-config",
        version: "0.1.0",
        id: "desktop",
        renderer: { antialias: "msaa8", renderPath: "forward" },
        time: { fixedDelta: 1 / 30, paused: false },
        window: { height: 900, title: "Structured Runtime", width: 1600 },
      }, null, 2)}\n`,
    );
    await writeFile(
      join(projectPath, "content/prefabs/crate.prefab.json"),
      `${JSON.stringify({
        schema: "threenative.prefab",
        version: "0.1.0",
        id: "prefab.crate",
        entities: [
          {
            id: "crate.root",
            components: {
              MeshRenderer: { material: "mat.player", mesh: "mesh.cube" },
            },
          },
        ],
      }, null, 2)}\n`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8"));
    const assets = JSON.parse(await readFile(resolve(bundlePath, "assets.manifest.json"), "utf8"));
    const environment = JSON.parse(await readFile(resolve(bundlePath, "environment.scene.json"), "utf8"));
    const prefabs = JSON.parse(await readFile(resolve(bundlePath, "prefabs.ir.json"), "utf8"));
    const runtimeConfig = JSON.parse(await readFile(resolve(bundlePath, "runtime.config.json"), "utf8"));

    assert.equal(report.ok, true);
    assert.equal(manifest.entry.prefabs, "prefabs.ir.json");
    assert.equal(manifest.files.prefabs, "prefabs.ir.json");
    assert.equal(manifest.files.runtimeConfig, "runtime.config.json");
    assert.deepEqual(
      assets.assets.find((asset: { id: string }) => asset.id === "tex.bonus"),
      { format: "png", id: "tex.bonus", kind: "texture", path: "assets/bonus.png", sourceMode: "bundle" },
    );
    assert.equal(environment.terrain.id, "terrain.editor");
    assert.equal(environment.path.id, "path.main");
    assert.equal(prefabs.prefabs[0].id, "prefab.crate");
    assert.equal(prefabs.prefabs[0].root, "crate.root");
    assert.deepEqual(prefabs.prefabs[0].entities[0].components.MeshRenderer, { material: "mat.player", mesh: "mesh.cube" });
    assert.equal(runtimeConfig.renderer.antialias, "msaa8");
    assert.equal(runtimeConfig.window.title, "Structured Runtime");
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should emit structured source system metadata", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-systems-"));
  try {
    await cp(resolve(process.cwd(), "../../templates/structured-source-starter"), projectPath, { recursive: true });
    await writeFile(
      join(projectPath, "content/systems/arena.systems.json"),
      `${JSON.stringify({
        schema: "threenative.systems",
        version: "0.1.0",
        id: "arena-systems",
        systems: [
          {
            id: "move-player-to-goal",
            schedule: "update",
            script: {
              module: "src/scripts/player.ts",
              export: "movePlayerToGoal",
            },
            commands: [{ kind: "setComponent", entity: "player", component: "Transform" }],
            queries: [{ with: ["Transform"], changed: ["Transform"], orderBy: "id", limit: 4 }],
            reads: ["Transform"],
            resourceReads: ["GameState"],
            services: ["scene.change"],
            writes: ["Transform"],
          },
        ],
      }, null, 2)}\n`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8"));

    assert.equal(report.ok, true);
    assert.deepEqual(systems.systems[0].commands, [{ component: "Transform", entity: "player", kind: "setComponent" }]);
    assert.deepEqual(systems.systems[0].queries, [{ changed: ["Transform"], limit: 4, orderBy: "id", with: ["Transform"], without: [] }]);
    assert.equal(systems.systems[0].schedule, "fixedUpdate");
    assert.deepEqual(systems.systems[0].resourceReads, ["GameState"]);
    assert.deepEqual(systems.systems[0].services, ["scene.change"]);
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should lower structured lifecycle script refs", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-lifecycle-"));
  try {
    await cp(resolve(process.cwd(), "../../templates/structured-source-starter"), projectPath, { recursive: true });
    const playerScriptPath = join(projectPath, "src/scripts/player.ts");
    const originalPlayerScript = await readFile(playerScriptPath, "utf8");
    await writeFile(
      playerScriptPath,
      `${originalPlayerScript}

export function awakeRally(ctx: any): void {
  ctx.resources.set("GameState", { countdown: "Ready" });
}

export function fixedUpdateRally(ctx: any): void {
  for (const entity of ctx.query()) {
    const transform = entity.get("Transform");
    entity.patch("Transform", { position: transform.position ?? [0, 0.35, 0] });
  }
}

export function updateRally(_ctx: any): void {}

export function lateUpdateRally(_ctx: any): void {}
`,
    );
    await writeFile(
      join(projectPath, "content/systems/arena.systems.json"),
      `${JSON.stringify({
        schema: "threenative.systems",
        version: "0.1.0",
        id: "arena-systems",
        scriptLifecycles: [
          {
            id: "rally",
            scene: "arena",
            module: "src/scripts/player.ts",
            awake: "awakeRally",
            fixedUpdate: "fixedUpdateRally",
            update: "updateRally",
            lateUpdate: "lateUpdateRally",
            commands: [{ kind: "setComponent", entity: "player", component: "Transform" }],
            queries: [{ with: ["Transform"], orderBy: "id" }],
            reads: ["Transform"],
            resourceWrites: ["GameState"],
            writes: ["Transform"],
          },
        ],
        systems: [],
      }, null, 2)}\n`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8")) as {
      systems: Array<{ commands?: Array<{ kind: string }>; name: string; resourceWrites?: string[]; schedule: string; script?: { exportName: string }; writes?: string[] }>;
    };
    const scriptsManifest = JSON.parse(await readFile(resolve(bundlePath, "scripts.manifest.json"), "utf8")) as {
      systems: Array<{ source?: { export: string; module: string }; systemId: string }>;
    };
    const lifecycleSystems = systems.systems
      .filter((system) => system.name.startsWith("rally."))
      .map((system) => ({
        commands: system.commands,
        name: system.name,
        resourceWrites: system.resourceWrites,
        schedule: system.schedule,
        writes: system.writes,
      }));

    assert.equal(report.ok, true);
    assert.deepEqual(lifecycleSystems, [
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.awake", resourceWrites: ["GameState"], schedule: "startup", writes: ["Transform"] },
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.fixedUpdate", resourceWrites: ["GameState"], schedule: "fixedUpdate", writes: ["Transform"] },
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.lateUpdate", resourceWrites: ["GameState"], schedule: "postUpdate", writes: ["Transform"] },
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.update", resourceWrites: ["GameState"], schedule: "update", writes: ["Transform"] },
    ]);
    assert.deepEqual(
      scriptsManifest.systems
        .filter((system) => system.systemId.startsWith("rally."))
        .map((system) => ({ exportName: system.source?.export, module: system.source?.module, systemId: system.systemId })),
      [
        { exportName: "awakeRally", module: "src/scripts/player.ts", systemId: "rally.awake" },
        { exportName: "fixedUpdateRally", module: "src/scripts/player.ts", systemId: "rally.fixedUpdate" },
        { exportName: "lateUpdateRally", module: "src/scripts/player.ts", systemId: "rally.lateUpdate" },
        { exportName: "updateRally", module: "src/scripts/player.ts", systemId: "rally.update" },
      ],
    );
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should emit structured source tags and groups", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-tags-groups-"));
  try {
    await cp(resolve(process.cwd(), "../../templates/structured-source-starter"), projectPath, { recursive: true });
    const scenePath = join(projectPath, "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
    };
    scene.entities.push({
      id: "group.lane.red",
      transform: { position: [-2.5, 0, 0] },
      components: { SceneContainer: { kind: "group", name: "Red Lane" } },
    });
    const player = scene.entities.find((entity) => entity.id === "player");
    if (player === undefined) {
      throw new Error("structured-source-starter fixture must include player entity");
    }
    player.components = { ...(player.components ?? {}), LaneRed: {} };
    await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const world = JSON.parse(await readFile(resolve(bundlePath, "world.ir.json"), "utf8")) as {
      entities: Array<{ components: Record<string, unknown>; id: string }>;
    };
    const schemas = JSON.parse(await readFile(resolve(bundlePath, "schemas/components.schema.json"), "utf8")) as {
      schemas: Record<string, { fields: Record<string, unknown> }>;
    };

    assert.equal(report.ok, true);
    assert.deepEqual(world.entities.find((entity) => entity.id === "player")?.components.LaneRed, {});
    assert.deepEqual(world.entities.find((entity) => entity.id === "group.lane.red")?.components.SceneContainer, { kind: "group", name: "Red Lane" });
    assert.deepEqual(schemas.schemas.LaneRed?.fields, {});
    assert.deepEqual(Object.keys(schemas.schemas.SceneContainer?.fields ?? {}).sort(), ["kind", "name"]);
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

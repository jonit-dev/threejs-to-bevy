import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildProject, validateBundle } from "./index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const structuredSourceStarterPath = resolve(repoRoot, "templates/structured-source-starter");

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
  const projectPath = structuredSourceStarterPath;
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as { entry: { ui?: string } };
  const ui = JSON.parse(await readFile(resolve(bundlePath, "ui.ir.json"), "utf8")) as {
    root: { children?: Array<{ id: string }>; id: string };
  };
  const provenance = JSON.parse(await readFile(resolve(bundlePath, "authoring.provenance.json"), "utf8")) as {
    ownership: Array<{ emitted: { id?: string; path: string }; source?: { path: string; pointer: string } }>;
  };

  assert.equal(bundlePath, resolve(projectPath, "dist/structured-source-starter.bundle"));
  assert.equal(report.ok, true);
  assert.equal(manifest.entry.ui, "ui.ir.json");
  assert.equal(ui.root.id, "countdown");
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

test("should wait for active bundle build lock before building structured source", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-build-lock-"));
  const lockDir = join(projectPath, "dist/structured-source-starter.bundle.build-lock");
  try {
    await cp(structuredSourceStarterPath, projectPath, { recursive: true });
    await mkdir(lockDir, { recursive: true });

    const release = setTimeout(() => {
      void rm(lockDir, { force: true, recursive: true });
    }, 1_000);
    const startedAt = Date.now();

    try {
      const { bundlePath } = await buildProject(projectPath);
      const elapsedMs = Date.now() - startedAt;
      const report = await validateBundle(bundlePath);

      assert.equal(bundlePath, join(projectPath, "dist/structured-source-starter.bundle"));
      assert.equal(elapsedMs >= 900, true);
      assert.equal(report.ok, true);
      await assert.rejects(access(lockDir));
    } finally {
      clearTimeout(release);
    }
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should lower structured source torus prefabs into generated mesh assets", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-torus-prefab-"));
  try {
    await mkdir(join(projectPath, "content", "scenes"), { recursive: true });
    await writeFile(
      join(projectPath, "threenative.config.json"),
      `${JSON.stringify({
        schema: "threenative.project",
        version: "0.1.0",
        entry: "content/scenes/arena.scene.json",
        outDir: "dist/game.bundle",
      }, null, 2)}\n`,
    );
    await writeFile(
      join(projectPath, "content", "scenes", "arena.scene.json"),
      `${JSON.stringify({
        schema: "threenative.scene",
        version: "0.1.0",
        id: "arena",
        entities: [{ id: "ring", prefab: "prefab.ring" }],
        prefabs: [{ id: "prefab.ring", primitive: "torus", color: "#9fe8ff" }],
      }, null, 2)}\n`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const assets = JSON.parse(await readFile(resolve(bundlePath, "assets.manifest.json"), "utf8")) as {
      assets: Array<{ id: string; primitive?: string; size?: number[] }>;
    };

    assert.equal(report.ok, true);
    assert.deepEqual(assets.assets.find((asset) => asset.id === "mesh.ring"), {
      format: "generated",
      id: "mesh.ring",
      kind: "mesh",
      primitive: "torus",
      size: [0.25, 0.5],
    });
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should emit structured source environment documents", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-environment-"));
  try {
    await cp(structuredSourceStarterPath, projectPath, { recursive: true });
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
        environmentMap: { asset: "tex.bonus" },
        instances: [],
        path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
        skybox: { asset: "tex.bonus", mode: "equirect" },
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
      join(projectPath, "content/runtime/default.runtime.json"),
      `${JSON.stringify({
        schema: "threenative.runtime-config",
        version: "0.1.0",
        id: "default",
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
    assert.deepEqual(environment.environmentMap, { asset: "tex.bonus", intent: "reflection-and-irradiance", mode: "equirect" });
    assert.deepEqual(environment.skybox, { asset: "tex.bonus", mode: "equirect" });
    assert.equal(prefabs.prefabs[0].id, "prefab.crate");
    assert.equal(prefabs.prefabs[0].root, "crate.root");
    assert.deepEqual(prefabs.prefabs[0].entities[0].components.MeshRenderer, { material: "mat.player", mesh: "mesh.cube" });
    assert.equal(runtimeConfig.renderer.antialias, "msaa8");
    assert.equal(runtimeConfig.window.title, "Structured Runtime");
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should expand compact prefab instances into deterministic world entities", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-compact-prefab-instances-"));
  try {
    await mkdir(join(projectPath, "content", "prefabs"), { recursive: true });
    await mkdir(join(projectPath, "content", "scenes"), { recursive: true });
    await writeFile(
      join(projectPath, "threenative.config.json"),
      `${JSON.stringify({
        schema: "threenative.project",
        version: "0.1.0",
        entry: "content/scenes/lane.scene.json",
        outDir: "dist/game.bundle",
      }, null, 2)}\n`,
    );
    await writeFile(
      join(projectPath, "content", "prefabs", "pin.prefab.json"),
      `${JSON.stringify({
        schema: "threenative.prefab",
        version: "0.1.0",
        id: "prefab.pin",
        entities: [
          {
            id: "pin.default",
            transform: { scale: [0.42, 1.2, 0.42] },
            components: {
              Collider: { kind: "capsule", radius: 0.18, height: 1.1, friction: 0.55, restitution: 0.32 },
              Pin: { home: [0, 0, 0], standing: true },
              RigidBody: { kind: "dynamic", mass: 1.45 },
            },
          },
        ],
      }, null, 2)}\n`,
    );
    await writeFile(
      join(projectPath, "content", "scenes", "lane.scene.json"),
      `${JSON.stringify({
        schema: "threenative.scene",
        version: "0.1.0",
        id: "lane",
        instances: [
          { id: "pin.01", prefab: "prefab.pin", transform: { position: [0, 0.6, 0] }, components: { Pin: { home: [0, 0.6, 0] } } },
          { id: "pin.02", prefab: "prefab.pin", transform: { position: [-0.3, 0.6, -0.52] }, components: { Pin: { home: [-0.3, 0.6, -0.52] } } },
          { id: "pin.03", prefab: "prefab.pin", transform: { position: [0.3, 0.6, -0.52] }, components: { Pin: { home: [0.3, 0.6, -0.52] } } },
        ],
      }, null, 2)}\n`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const world = JSON.parse(await readFile(resolve(bundlePath, "world.ir.json"), "utf8")) as {
      entities: Array<{ id: string; components: Record<string, Record<string, unknown>> }>;
    };
    const provenance = JSON.parse(await readFile(resolve(bundlePath, "authoring.provenance.json"), "utf8")) as {
      ownership: Array<{ emitted: { id?: string; path: string }; source?: { pointer: string } }>;
    };

    assert.equal(report.ok, true);
    assert.deepEqual(world.entities.map((entity) => entity.id).filter((id) => id.startsWith("pin.")), ["pin.01", "pin.02", "pin.03"]);
    const pin01 = world.entities.find((entity) => entity.id === "pin.01");
    const pin02 = world.entities.find((entity) => entity.id === "pin.02");
    const pin03 = world.entities.find((entity) => entity.id === "pin.03");
    assert.ok(pin01);
    assert.ok(pin02);
    assert.ok(pin03);
    const pin01Transform = pin01.components.Transform;
    assert.ok(pin01Transform);
    assert.deepEqual(pin01Transform.position, [0, 0.6, 0]);
    assert.deepEqual(pin01Transform.scale, [0.42, 1.2, 0.42]);
    assert.deepEqual(pin02.components.Pin, { home: [-0.3, 0.6, -0.52], standing: true });
    assert.deepEqual(pin03.components.RigidBody, { kind: "dynamic", mass: 1.45 });
    assert.deepEqual(pin03.components.Collider, { friction: 0.55, height: 1.1, kind: "capsule", radius: 0.18, restitution: 0.32 });
    assert.equal(
      provenance.ownership.some((entry) => entry.emitted.path === "world.ir.json" && entry.emitted.id === "pin.01" && entry.source?.pointer === "/instances/0"),
      true,
    );
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should emit structured source system metadata", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-systems-"));
  try {
    await cp(structuredSourceStarterPath, projectPath, { recursive: true });
    const playerScriptPath = join(projectPath, "src/scripts/player.ts");
    const originalPlayerScript = await readFile(playerScriptPath, "utf8");
    await writeFile(
      playerScriptPath,
      `${originalPlayerScript}

export function movePlayerWithState(context: any): void {
  const state = context.resources.get("GameState", { speed: 1 });
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = [state.speed, 0, 0];
  }
}
`,
    );
    await writeFile(
      join(projectPath, "content/systems/arena.systems.json"),
      `${JSON.stringify({
        schema: "threenative.systems",
        version: "0.1.0",
        id: "arena-systems",
        systems: [
          {
            id: "state-metadata-regression",
            schedule: "update",
            script: {
              module: "src/scripts/player.ts",
              export: "movePlayerWithState",
            },
            commands: [{ kind: "setComponent", entity: "player", component: "Transform" }],
            queries: [{ with: ["Transform"], changed: ["Transform"], orderBy: "id", limit: 4 }],
            reads: ["Transform"],
            services: ["scene.change"],
            writes: ["Transform"],
          },
        ],
      }, null, 2)}\n`,
    );

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8")) as {
      systems: Array<{ commands?: Array<{ kind: string }>; name: string; queries?: unknown[]; resourceReads?: string[]; schedule: string; services?: string[] }>;
    };
    const system = systems.systems.find((item) => item.name === "state-metadata-regression");

    assert.equal(report.ok, true);
    assert.deepEqual(system?.commands, [{ component: "Transform", entity: "player", kind: "setComponent" }]);
    assert.deepEqual(system?.queries, [{ changed: ["Transform"], limit: 4, orderBy: "id", with: ["Transform"], without: [] }]);
    assert.equal(system?.schedule, "update");
    assert.deepEqual(system?.resourceReads, ["GameState"]);
    assert.deepEqual(system?.services, ["scene.change"]);
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("should lower structured lifecycle script refs", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-lifecycle-"));
  try {
    await cp(structuredSourceStarterPath, projectPath, { recursive: true });
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
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.fixedUpdate", resourceWrites: [], schedule: "fixedUpdate", writes: ["Transform"] },
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.lateUpdate", resourceWrites: [], schedule: "postUpdate", writes: ["Transform"] },
      { commands: [{ component: "Transform", entity: "player", kind: "setComponent" }], name: "rally.update", resourceWrites: [], schedule: "update", writes: ["Transform"] },
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
    await cp(structuredSourceStarterPath, projectPath, { recursive: true });
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

test("should emit repeated structured source physics components with one schema per kind", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-structured-physics-components-"));
  try {
    await cp(structuredSourceStarterPath, projectPath, { recursive: true });
    const scenePath = join(projectPath, "content/scenes/arena.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const floor = scene.entities.find((entity) => entity.id === "arena.floor");
    const player = scene.entities.find((entity) => entity.id === "player");
    const goal = scene.entities.find((entity) => entity.id === "goal");
    if (floor === undefined || player === undefined || goal === undefined) {
      throw new Error("structured-source-starter fixture must include floor, player, and goal entities");
    }
    floor.components = {
      ...(floor.components ?? {}),
      Collider: { friction: 0.8, kind: "box", layer: "world", size: [8, 0.1, 8] },
      RigidBody: { kind: "static" },
    };
    player.components = {
      ...(player.components ?? {}),
      Collider: { friction: 0.4, kind: "sphere", mask: ["world"], radius: 0.3 },
      RigidBody: { damping: 0.1, kind: "dynamic", mass: 1 },
    };
    goal.components = {
      ...(goal.components ?? {}),
      Collider: { friction: 0.5, kind: "sphere", mask: ["world"], radius: 0.25 },
      RigidBody: { damping: 0.2, kind: "dynamic", mass: 2 },
    };
    await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);

    const { bundlePath } = await buildProject(projectPath);
    const report = await validateBundle(bundlePath);
    const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as {
      requiredCapabilities?: { physics?: string[] };
    };
    const schemas = JSON.parse(await readFile(resolve(bundlePath, "schemas/components.schema.json"), "utf8")) as {
      schemas: Record<string, { fields: Record<string, unknown> }>;
    };

    assert.equal(report.ok, true);
    assert.deepEqual(Object.keys(schemas.schemas).filter((key) => key === "RigidBody"), ["RigidBody"]);
    assert.deepEqual(Object.keys(schemas.schemas).filter((key) => key === "Collider"), ["Collider"]);
    assert.equal(manifest.requiredCapabilities?.physics?.includes("rigid-body.dynamic"), true);
    assert.equal(manifest.requiredCapabilities?.physics?.includes("rigid-body.static"), true);
    assert.equal(manifest.requiredCapabilities?.physics?.includes("collider.sphere"), true);
    assert.equal(manifest.requiredCapabilities?.physics?.includes("collider.box"), true);
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

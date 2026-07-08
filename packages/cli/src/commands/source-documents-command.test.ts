import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { assetCommand } from "./asset.js";
import { animationCommand, audioCommand, environmentCommand, flowCommand, generatorCommand, inputCommand, materialCommand, meshCommand, particleCommand, prefabCommand, projectCommand, resourcesCommand, runtimeCommand, schemaCommand, sequenceCommand, systemCommand, targetCommand, uiCommand } from "./sourceDocuments.js";

test("countdown UI can be created centered and bound without manual JSON editing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-ui-doc-"));
  try {
    const create = await uiCommand(["create", "hud", "--project", root, "--json"]);
    const text = await uiCommand(["add-text", "hud", "countdown", "--text", "READY", "--project", root, "--json"]);
    const button = await uiCommand(["add-node", "hud", "pause", "--type", "button", "--label", "Pause", "--action", "pause.toggle", "--project", root, "--json"]);
    const textInput = await uiCommand(["add-node", "hud", "player-name", "--type", "textInput", "--label", "Player name", "--text", "Hero", "--action", "profile.name", "--project", root, "--json"]);
    const style = await uiCommand(["set-style", "hud", "pause", "--color", "#ffffff", "--background-color", "#101820", "--font-size", "18", "--text-align", "center", "--wrap", "true", "--project", root, "--json"]);
    const layout = await uiCommand(["set-layout", "hud", "countdown", "--justify", "center", "--align", "center", "--top", "280", "--height", "160", "--width", "1280", "--project", root, "--json"]);
    const bind = await uiCommand(["bind", "hud", "countdown", "--resource", "RaceState.status", "--project", root, "--json"]);
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as {
      bindings: Array<{ node: string; resource: string }>;
      nodes: Array<{ action?: string; id: string; label?: string; layout?: Record<string, unknown>; style?: Record<string, unknown>; text?: string; type: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(text.exitCode, 0);
    assert.equal(button.exitCode, 0);
    assert.equal(textInput.exitCode, 0);
    assert.equal(style.exitCode, 0);
    assert.equal(layout.exitCode, 0);
    assert.equal(bind.exitCode, 0);
    assert.deepEqual(ui.nodes, [
      { id: "countdown", layout: { align: "center", height: 160, justify: "center", top: 280, width: 1280 }, text: "READY", type: "text" },
      { action: "pause.toggle", id: "pause", label: "Pause", style: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, textAlign: "center", wrap: true }, type: "button" },
      { action: "profile.name", id: "player-name", label: "Player name", text: "Hero", type: "textInput" },
    ]);
    assert.deepEqual(ui.bindings, [{ node: "countdown", resource: "RaceState.status" }]);
    assert.deepEqual((JSON.parse(bind.stdout) as { filesWritten: string[] }).filesWritten, ["content/ui/hud.ui.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui command adds component instance source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-ui-component-"));
  try {
    const create = await uiCommand(["create", "inventory", "--project", root, "--json"]);
    const add = await uiCommand([
      "add-component",
      "inventory",
      "slot.potion",
      "--component",
      "inventorySlot",
      "--props",
      "{\"label\":\"Potion\",\"count\":\"3\"}",
      "--project",
      root,
      "--json",
    ]);
    const update = await uiCommand([
      "add-component",
      "inventory",
      "slot.potion",
      "--component",
      "inventorySlot",
      "--props",
      "{\"label\":\"Potion\",\"count\":\"4\"}",
      "--project",
      root,
      "--json",
    ]);
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "inventory.ui.json"), "utf8")) as {
      nodes: Array<{ component?: { props?: Record<string, unknown>; ref: string }; id: string; type: string }>;
    };
    const remove = await uiCommand(["remove-component", "inventory", "slot.potion", "--project", root, "--json"]);
    const removed = JSON.parse(await readFile(join(root, "content", "ui", "inventory.ui.json"), "utf8")) as {
      nodes: Array<{ component?: { props?: Record<string, unknown>; ref: string }; id: string; type: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(add.exitCode, 0);
    assert.equal(update.exitCode, 0);
    assert.deepEqual(ui.nodes, [
      { id: "slot.potion", type: "component", component: { ref: "inventorySlot", props: { count: "4", label: "Potion" } } },
    ]);
    assert.deepEqual((JSON.parse(add.stdout) as { filesWritten: string[] }).filesWritten, ["content/ui/inventory.ui.json"]);
    assert.equal(remove.exitCode, 0);
    assert.deepEqual(removed.nodes, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add settings recipe through tn ui recipe", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-ui-recipe-"));
  try {
    const create = await uiCommand(["create", "menus", "--project", root, "--json"]);
    const recipe = await uiCommand([
      "recipe",
      "menus",
      "settings-list",
      "--id",
      "settings",
      "--actions",
      "{\"audio\":\"settings.audio.open\",\"back\":\"settings.close\"}",
      "--bindings",
      "{\"audio\":\"Settings.audio\"}",
      "--project",
      root,
      "--json",
    ]);
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "menus.ui.json"), "utf8")) as {
      bindings: Array<{ node: string; resource: string }>;
      focusOrder: string[];
      nodes: Array<{ action?: string; id: string; label?: string; type: string }>;
      recipes: Array<{ id: string; kind: string }>;
      screens: Array<{ focusScope?: { backAction?: string; inputCapture?: string; restore?: string; entry?: string }; id: string; role: string; root: string; stackPolicy?: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(recipe.exitCode, 0);
    assert.equal(ui.nodes.find((node) => node.id === "settings")?.label, "Settings");
    assert.equal(ui.nodes.find((node) => node.id === "settings.audio")?.action, "settings.audio.open");
    assert.deepEqual(ui.bindings, [{ node: "settings.audio", resource: "Settings.audio" }]);
    assert.deepEqual(ui.focusOrder, ["settings.audio", "settings.video", "settings.controls"]);
    assert.deepEqual(ui.screens[0], {
      id: "settings",
      role: "menu",
      root: "settings",
      stackPolicy: "push",
      focusScope: { entry: "settings.audio", backAction: "settings.close", inputCapture: "keyboard", restore: "previous" },
    });
    assert.deepEqual(ui.recipes, [{ id: "settings", kind: "settings-list", props: {} }]);
    assert.deepEqual((JSON.parse(recipe.stdout) as { filesWritten: string[] }).filesWritten, ["content/ui/menus.ui.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should add attached nameplate recipe through tn ui recipe", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-ui-attached-recipe-"));
  try {
    const create = await uiCommand(["create", "hud", "--project", root, "--json"]);
    const recipe = await uiCommand([
      "recipe",
      "hud",
      "nameplate",
      "--id",
      "enemy.name",
      "--props",
      "{\"targetId\":\"enemy.1\",\"label\":\"Scout\"}",
      "--project",
      root,
      "--json",
    ]);
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as {
      nodes: Array<{ attachTo?: unknown; id: string; label?: string; text?: string; type: string }>;
      recipes: Array<{ id: string; kind: string; props?: Record<string, unknown> }>;
      screens: Array<{ focusScope?: { inputCapture?: string }; id: string; role: string; root: string; stackPolicy?: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(recipe.exitCode, 0);
    assert.deepEqual(ui.nodes.find((node) => node.id === "enemy.name")?.attachTo, {
      target: { kind: "entity", id: "enemy.1" },
      anchor: "top-center",
      localOffset: [0, 1.4, 0],
    });
    assert.equal(ui.nodes.find((node) => node.id === "enemy.name.label")?.text, "Scout");
    assert.deepEqual(ui.screens[0], {
      id: "enemy.name",
      role: "hud",
      root: "enemy.name",
      stackPolicy: "overlay",
      focusScope: { entry: "enemy.name", backAction: "ui.back", inputCapture: "none", restore: "previous" },
    });
    assert.deepEqual(ui.recipes, [{ id: "enemy.name", kind: "nameplate", props: { targetId: "enemy.1", label: "Scout" } }]);
    assert.deepEqual((JSON.parse(recipe.stdout) as { filesWritten: string[] }).filesWritten, ["content/ui/hud.ui.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("material command creates and updates source doc", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-material-doc-"));
  try {
    const create = await materialCommand(["create", "mat.kart", "--project", root, "--json"]);
    const set = await materialCommand([
      "set",
      "mat.kart",
      "--color",
      "#fff",
      "--roughness",
      "0.5",
      "--metalness",
      "0.2",
      "--base-color-texture",
      "tex.kart.albedo",
      "--normal-texture",
      "tex.kart.normal",
      "--metallic-roughness-texture",
      "tex.kart.mr",
      "--emissive",
      "#33ccff",
      "--emissive-intensity",
      "1.25",
      "--emissive-texture",
      "tex.kart.emissive",
      "--alpha-mode",
      "blend",
      "--alpha-cutoff",
      "0.4",
      "--opacity",
      "0.8",
      "--clearcoat",
      "0.7",
      "--clearcoat-roughness",
      "0.15",
      "--clearcoat-texture",
      "tex.kart.clearcoat",
      "--clearcoat-roughness-texture",
      "tex.kart.clearcoatRoughness",
      "--transmission",
      "0.1",
      "--transmission-texture",
      "tex.kart.transmission",
      "--occlusion-texture",
      "tex.kart.occlusion",
      "--project",
      root,
      "--json",
    ]);
    const doc = JSON.parse(await readFile(join(root, "content", "materials", "mat.kart.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(set.exitCode, 0);
    assert.deepEqual(doc.materials, [
      {
        alphaCutoff: 0.4,
        alphaMode: "blend",
        baseColorTexture: "tex.kart.albedo",
        clearcoat: 0.7,
        clearcoatRoughness: 0.15,
        clearcoatRoughnessTexture: "tex.kart.clearcoatRoughness",
        clearcoatTexture: "tex.kart.clearcoat",
        color: "#fff",
        emissive: "#33ccff",
        emissiveIntensity: 1.25,
        emissiveTexture: "tex.kart.emissive",
        id: "mat.kart",
        metallicRoughnessTexture: "tex.kart.mr",
        metalness: 0.2,
        normalTexture: "tex.kart.normal",
        occlusionTexture: "tex.kart.occlusion",
        opacity: 0.8,
        roughness: 0.5,
        transmission: 0.1,
        transmissionTexture: "tex.kart.transmission",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("material command sets a material inside a grouped material document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-material-grouped-"));
  try {
    await mkdir(join(root, "content", "materials"), { recursive: true });
    await writeFile(
      join(root, "content", "materials", "arena.materials.json"),
      `${JSON.stringify({
        schema: "threenative.materials",
        version: "0.1.0",
        id: "arena-materials",
        materials: [
          { id: "mat.floor", color: "#ffffff" },
          { id: "mat.wall", color: "#cccccc" },
        ],
      }, null, 2)}\n`,
    );

    const set = await materialCommand(["set", "mat.wall", "--color", "#112233", "--roughness", "0.75", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "materials", "arena.materials.json"), "utf8")) as {
      materials: Array<Record<string, unknown>>;
    };

    assert.equal(set.exitCode, 0);
    assert.deepEqual(doc.materials, [
      { id: "mat.floor", color: "#ffffff" },
      { id: "mat.wall", color: "#112233", roughness: 0.75 },
    ]);
    assert.deepEqual((JSON.parse(set.stdout) as { filesWritten: string[] }).filesWritten, ["content/materials/arena.materials.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("material command rejects invalid numeric PBR flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-material-invalid-"));
  try {
    const result = await materialCommand(["set", "mat.kart", "--metalness", "not-a-number", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_AUTHORING_NUMBER_INVALID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("animation and particle commands mutate model asset source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-animation-particle-doc-"));
  try {
    const asset = await assetCommand(["add", "model.hero", "--type", "model", "--path", "assets/hero.glb", "--project", root, "--json"]);
    const clip = await animationCommand(["add-clip", "model.hero", "run", "--source-clip", "Armature|Run", "--loop", "true", "--speed", "1.25", "--project", root, "--json"]);
    const state = await animationCommand(["graph", "add-state", "model.hero", "running", "--clip", "run", "--initial", "--project", root, "--json"]);
    const emitter = await particleCommand(["add-emitter", "model.hero", "dust", "--rate", "12", "--max", "64", "--lifetime", "0.5", "--shape", "sphere", "--radius", "0.75", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "assets", "model.hero.assets.json"), "utf8")) as {
      assets: Array<Record<string, unknown>>;
    };

    assert.equal(asset.exitCode, 0);
    assert.equal(clip.exitCode, 0);
    assert.equal(state.exitCode, 0);
    assert.equal(emitter.exitCode, 0);
    assert.deepEqual(doc.assets, [{
      animationGraph: { initialState: "running", states: [{ clip: "run", id: "running" }] },
      animations: [{ id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 }],
      id: "model.hero",
      particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 64, radius: 0.75, ratePerSecond: 12, shape: "sphere" }],
      path: "assets/hero.glb",
      type: "model",
    }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("audio command creates document and adds sounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-audio-doc-"));
  try {
    const create = await audioCommand(["create", "arena", "--project", root, "--json"]);
    const addSound = await audioCommand(["add-sound", "arena", "hit", "--asset", "sound.hit", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "audio", "arena.audio.json"), "utf8")) as {
      sounds: Array<{ asset: string; id: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(addSound.exitCode, 0);
    assert.deepEqual(doc.sounds, [{ asset: "sound.hit", id: "hit" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("resources command creates and updates reusable resource source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-resources-doc-"));
  try {
    const create = await resourcesCommand(["create", "gameplay", "--project", root, "--json"]);
    const add = await resourcesCommand(["add", "gameplay", "RaceState", "--path", "race.state", "--value", "{\"lap\":1,\"status\":\"READY\"}", "--project", root, "--json"]);
    const set = await resourcesCommand(["set", "gameplay", "RaceState", "--value", "{\"lap\":2,\"status\":\"GREEN\"}", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "resources", "gameplay.resources.json"), "utf8")) as {
      resources: Array<{ id: string; path?: string; value?: unknown }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(add.exitCode, 0);
    assert.equal(set.exitCode, 0);
    assert.deepEqual(doc.resources, [{ id: "RaceState", path: "race.state", value: { lap: 2, status: "GREEN" } }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("schema command creates and updates reusable schema source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-schema-doc-"));
  try {
    const create = await schemaCommand(["create", "gameplay", "--kind", "component", "--project", root, "--json"]);
    const set = await schemaCommand(["set", "gameplay", "RaceTelemetry", "--kind", "component", "--fields", "{\"lap\":{\"kind\":\"number\",\"required\":true},\"status\":{\"kind\":\"string\"}}", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "schemas", "gameplay.schema.json"), "utf8")) as {
      kind: string;
      schemas: Array<{ fields: Record<string, unknown>; id: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(set.exitCode, 0);
    assert.equal(doc.kind, "component");
    assert.deepEqual(doc.schemas, [
      { id: "RaceTelemetry", fields: { lap: { kind: "number", required: true }, status: { kind: "string" } } },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("environment command creates and updates promoted source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-environment-doc-"));
  try {
    const create = await environmentCommand(["create", "arena", "--project", root, "--json"]);
    const skybox = await environmentCommand(["set-skybox", "arena", "--asset", "tex.sky", "--mode", "equirect", "--project", root, "--json"]);
    const map = await environmentCommand(["set-map", "arena", "--asset", "tex.env", "--project", root, "--json"]);
    const terrain = await environmentCommand(["set-terrain", "arena", "--id", "terrain.arena", "--height-mode", "heightmap", "--heightmap", "tex.height", "--project", root, "--json"]);
    await writeFile(
      join(root, "content", "environment", "arena.environment.json"),
      `${JSON.stringify({
        schema: "threenative.environment-scene",
        version: "0.1.0",
        id: "arena",
        environmentMap: { asset: "tex.env" },
        instances: [],
        skybox: { asset: "tex.sky", mode: "equirect" },
        sourceAssets: [{ id: "env.Tree" }],
        terrain: { heightMode: "heightmap", heightmap: "tex.height", id: "terrain.arena" },
      }, null, 2)}\n`,
    );
    const path = await environmentCommand(["set-path", "arena", "--path", "{\"id\":\"path.main\",\"points\":[[0,0,0],[1,0,1]]}", "--project", root, "--json"]);
    const walkability = await environmentCommand(["set-walkability", "arena", "--walkability", "{\"terrain\":{\"surface\":\"terrain.arena\",\"height\":0}}", "--project", root, "--json"]);
    const lightProbe = await environmentCommand(["set-light-probe", "arena", "probe.center", "--probe", "{\"bounds\":{\"min\":[-3,0,-3],\"max\":[3,4,3]},\"influenceRadius\":5,\"source\":{\"asset\":\"tex.env\",\"mode\":\"equirect\"}}", "--project", root, "--json"]);
    const scatter = await environmentCommand(["add-scatter-layer", "arena", "--scatter", "{\"id\":\"scatter.grass\",\"assetIds\":[\"env.Tree\"],\"bounds\":{\"min\":[-2,0,-2],\"max\":[2,0,2]},\"count\":8,\"minScale\":0.8,\"maxScale\":1.2,\"seed\":42,\"maxSlope\":30}", "--project", root, "--json"]);
    const lod = await environmentCommand(["set-source-asset-lod", "arena", "env.Tree", "--lod", "[{\"asset\":\"env.Tree.low\",\"maxDistance\":60}]", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "environment", "arena.environment.json"), "utf8")) as {
      environmentMap?: Record<string, unknown>;
      lightProbes?: Array<Record<string, unknown>>;
      path?: unknown;
      scatter?: Array<Record<string, unknown>>;
      skybox?: Record<string, unknown>;
      sourceAssets?: Array<{ id: string; lod?: unknown }>;
      terrain?: Record<string, unknown>;
      walkability?: unknown;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(skybox.exitCode, 0);
    assert.equal(map.exitCode, 0);
    assert.equal(terrain.exitCode, 0);
    assert.equal(path.exitCode, 0);
    assert.equal(walkability.exitCode, 0);
    assert.equal(lightProbe.exitCode, 0);
    assert.equal(scatter.exitCode, 0);
    assert.equal(lod.exitCode, 0);
    assert.deepEqual(doc.skybox, { asset: "tex.sky", mode: "equirect" });
    assert.deepEqual(doc.environmentMap, { asset: "tex.env" });
    assert.deepEqual(doc.terrain, { heightMode: "heightmap", heightmap: "tex.height", id: "terrain.arena" });
    assert.deepEqual(doc.path, { id: "path.main", points: [[0, 0, 0], [1, 0, 1]] });
    assert.deepEqual(doc.walkability, { terrain: { height: 0, surface: "terrain.arena" } });
    assert.deepEqual(doc.lightProbes, [{ bounds: { max: [3, 4, 3], min: [-3, 0, -3] }, id: "probe.center", influenceRadius: 5, source: { asset: "tex.env", mode: "equirect" } }]);
    assert.deepEqual(doc.scatter, [{ assetIds: ["env.Tree"], bounds: { max: [2, 0, 2], min: [-2, 0, -2] }, count: 8, id: "scatter.grass", maxScale: 1.2, maxSlope: 30, minScale: 0.8, seed: 42 }]);
    assert.deepEqual(doc.sourceAssets?.find((asset) => asset.id === "env.Tree")?.lod, [{ asset: "env.Tree.low", maxDistance: 60 }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("runtime command creates and updates promoted source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-runtime-doc-"));
  try {
    const create = await runtimeCommand(["create", "desktop", "--project", root, "--json"]);
    const window = await runtimeCommand(["set-window", "desktop", "--width", "1920", "--height", "1080", "--title", "Arena", "--project", root, "--json"]);
    const rendering = await runtimeCommand([
      "set-rendering",
      "desktop",
      "--antialias",
      "msaa8",
      "--render-profile",
      "balanced",
      "--render-look-exposure",
      "1.1",
      "--render-look-contrast",
      "0.1",
      "--render-look-saturation",
      "1.15",
      "--render-look-bloom-intensity",
      "0.4",
      "--render-look-shadow-quality",
      "high",
      "--render-look-environment-intensity",
      "1.2",
      "--bloom",
      "true",
      "--bloom-intensity",
      "0.4",
      "--bloom-threshold",
      "0.85",
      "--render-path",
      "forward",
      "--project",
      root,
      "--json",
    ]);
    const doc = JSON.parse(await readFile(join(root, "content", "runtime", "desktop.runtime.json"), "utf8")) as {
      renderer?: { antialias?: string; bloom?: Record<string, unknown>; renderLook?: Record<string, unknown>; renderPath?: string };
      time?: Record<string, unknown>;
      window?: Record<string, unknown>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(window.exitCode, 0);
    assert.equal(rendering.exitCode, 0);
    assert.deepEqual(doc.window, { height: 1080, title: "Arena", width: 1920 });
    assert.deepEqual(doc.time, { fixedDelta: 1 / 60, paused: false });
    assert.deepEqual(doc.renderer, {
      antialias: "msaa8",
      bloom: { enabled: true, intensity: 0.4, threshold: 0.85 },
      renderLook: {
        version: 1,
        profile: "balanced",
        overrides: { bloomIntensity: 0.4, contrast: 0.1, environmentIntensity: 1.2, exposure: 1.1, saturation: 1.15, shadowQuality: "high" },
      },
      renderPath: "forward",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("target command creates and updates target profile source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-target-doc-"));
  try {
    const result = await targetCommand([
      "set",
      "desktop",
      "--targets",
      "desktop",
      "--budgets",
      "{\"maxBundleBytes\":1048576,\"supportedTextureFormats\":[\"png\"]}",
      "--project",
      root,
      "--json",
    ]);
    const doc = JSON.parse(await readFile(join(root, "content", "targets", "desktop.target.json"), "utf8")) as {
      budgets?: Record<string, unknown>;
      targets: string[];
    };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(doc.targets, ["desktop"]);
    assert.deepEqual(doc.budgets, { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] });
    assert.deepEqual((JSON.parse(result.stdout) as { filesWritten: string[] }).filesWritten, ["content/targets/desktop.target.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator command records one-way provenance source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-generator-doc-"));
  try {
    const result = await generatorCommand([
      "record",
      "arena.layout",
      "--module",
      "src/generators/arena.ts",
      "--export",
      "generateArena",
      "--outputs",
      "content/scenes/arena.scene.json,content/assets/arena.assets.json",
      "--overwrite-policy",
      "manual",
      "--input-hash",
      "sha256:inputs",
      "--output-hash",
      "sha256:outputs",
      "--project",
      root,
      "--json",
    ]);
    const doc = JSON.parse(await readFile(join(root, "content", "generators", "arena.layout.generator.json"), "utf8")) as Record<string, unknown>;

    assert.equal(result.exitCode, 0);
    assert.deepEqual(doc, {
      export: "generateArena",
      id: "arena.layout",
      inputHash: "sha256:inputs",
      module: "src/generators/arena.ts",
      outputHash: "sha256:outputs",
      outputs: ["content/scenes/arena.scene.json", "content/assets/arena.assets.json"],
      overwritePolicy: "manual",
      schema: "threenative.generator-provenance",
      version: "0.1.0",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("project command initializes source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-project-doc-"));
  try {
    const create = await projectCommand(["init-source", "kart", "--source-roots", "content,src", "--build-targets", "web,desktop", "--authoring-version", "0.1.0", "--project", root, "--json"]);
    const project = JSON.parse(await readFile(join(root, "content", "project.authoring.json"), "utf8")) as {
      authoringVersion: string;
      buildTargets: string[];
      id: string;
      sourceRoots: string[];
    };

    assert.equal(create.exitCode, 0);
    assert.deepEqual(project, {
      schema: "threenative.authoring",
      version: "0.1.0",
      id: "kart",
      authoringVersion: "0.1.0",
      buildTargets: ["web", "desktop"],
      sourceRoots: ["content", "src"],
    });
    assert.deepEqual((JSON.parse(create.stdout) as { filesWritten: string[] }).filesWritten, ["content/project.authoring.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("project command prints compact authoring project map", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-project-map-"));
  try {
    await writeProjectFile(root, "threenative.config.json", `${JSON.stringify({ entry: "content/scenes/arena.scene.json", schema: "threenative.project" }, null, 2)}\n`);
    await writeProjectFile(root, "src/scripts/player.ts", "export function movePlayer() {}\n");
    await writeProjectFile(root, "content/scenes/arena.scene.json", `${JSON.stringify({
      entities: [{ id: "player" }, { components: { camera: { mode: "perspective" } }, id: "camera.main" }],
      id: "arena",
      resources: [{ id: "GameState", value: { score: 0 } }],
      schema: "threenative.scene",
      systems: ["move-player"],
    }, null, 2)}\n`);
    await writeProjectFile(root, "content/systems/arena.systems.json", `${JSON.stringify({
      id: "arena-systems",
      schema: "threenative.systems",
      systems: [{ id: "move-player", script: { export: "movePlayer", module: "src/scripts/player.ts" }, writes: ["Transform"] }],
    }, null, 2)}\n`);

    const result = await projectCommand(["map", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      files: Array<{ documentType: string; path: string; responsibility: string }>;
      next: string;
      primaryScene: { cameraIds: string[]; entityIds: string[]; id: string; resourceIds: string[] };
      scripts: Array<{ exportName: string; module: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_PROJECT_MAP_OK");
    assert.equal(payload.primaryScene.id, "arena");
    assert.equal(payload.primaryScene.entityIds.includes("player"), true);
    assert.equal(payload.files.some((file) => file.path === "content/scenes/arena.scene.json" && file.documentType === "scene"), true);
    assert.equal(payload.scripts.some((script) => script.module === "src/scripts/player.ts" && script.exportName === "movePlayer"), true);
    assert.match(payload.next, /tn scene inspect/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("system command attaches script ref without generating script source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-system-doc-"));
  try {
    await writeProjectFile(root, "src/scripts/kart.ts", "export function kartArcadePhysics() {}\n");
    const create = await systemCommand(["create", "kart-physics", "--schedule", "fixedUpdate", "--project", root, "--json"]);
    const attach = await systemCommand(["attach-script", "kart-physics", "--module", "src/scripts/kart.ts", "--export", "kartArcadePhysics", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "systems", "kart-physics.systems.json"), "utf8")) as {
      systems: Array<{ id: string; schedule: string; script: { export: string; module: string } }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(attach.exitCode, 0);
    assert.deepEqual(doc.systems, [{ id: "kart-physics", schedule: "fixedUpdate", script: { export: "kartArcadePhysics", module: "src/scripts/kart.ts" } }]);
    assert.equal(await readFile(join(root, "src", "scripts", "kart.ts"), "utf8"), "export function kartArcadePhysics() {}\n");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("system command sets access query command and service metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-system-metadata-"));
  try {
    await writeProjectFile(root, "src/scripts/kart.ts", "export function kartArcadePhysics() {}\n");
    const create = await systemCommand(["create", "kart-physics", "--schedule", "update", "--project", root, "--json"]);
    const attach = await systemCommand(["attach-script", "kart-physics", "--module", "src/scripts/kart.ts", "--export", "kartArcadePhysics", "--project", root, "--json"]);
    const metadata = await systemCommand([
      "set-metadata",
      "kart-physics",
      "--schedule",
      "fixedUpdate",
      "--reads",
      "Transform,Velocity",
      "--writes",
      "Transform",
      "--resource-reads",
      "RaceState",
      "--event-writes",
      "LapCompleted",
      "--services",
      "physics.raycast,scene.change",
      "--queries",
      "[{\"with\":[\"Transform\"],\"without\":[\"Sleeping\"],\"changed\":[\"Velocity\"],\"orderBy\":\"id\",\"limit\":4}]",
      "--commands",
      "[{\"kind\":\"emitEvent\",\"event\":\"LapCompleted\"}]",
      "--project",
      root,
      "--json",
    ]);
    const doc = JSON.parse(await readFile(join(root, "content", "systems", "kart-physics.systems.json"), "utf8")) as {
      systems: Array<Record<string, unknown>>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(attach.exitCode, 0);
    assert.equal(metadata.exitCode, 0);
    assert.deepEqual(doc.systems[0], {
      id: "kart-physics",
      schedule: "fixedUpdate",
      script: { export: "kartArcadePhysics", module: "src/scripts/kart.ts" },
      commands: [{ kind: "emitEvent", event: "LapCompleted" }],
      eventWrites: ["LapCompleted"],
      queries: [{ with: ["Transform"], without: ["Sleeping"], changed: ["Velocity"], orderBy: "id", limit: 4 }],
      reads: ["Transform", "Velocity"],
      resourceReads: ["RaceState"],
      services: ["physics.raycast", "scene.change"],
      writes: ["Transform"],
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("prefab input and mesh operations write deterministic structured docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-source-docs-"));
  try {
    const prefabCreate = await prefabCommand(["create", "kart", "--project", root, "--json"]);
    const prefabComponent = await prefabCommand(["add-component", "kart", "VehiclePhysics", "--value", "{\"maxSpeed\":42}", "--project", root, "--json"]);
    const prefabDefaults = await prefabCommand(["set-defaults", "kart", "RigidBody", "--value", "{\"kind\":\"dynamic\",\"mass\":2}", "--project", root, "--json"]);
    const materialCreate = await materialCommand(["create", "mat.kart", "--project", root, "--json"]);
    const prefabMaterial = await prefabCommand(["set-material", "kart", "--material", "mat.kart", "--project", root, "--json"]);
    const input = await inputCommand(["add-action", "kart", "accelerate", "--keys", "W,ArrowUp", "--project", root, "--json"]);
    const inputAxis = await inputCommand(["add-axis", "kart", "MoveX", "--negative-keys", "A,ArrowLeft", "--positive-keys", "D,ArrowRight", "--value", "gamepad.leftStickX", "--project", root, "--json"]);
    const inputControls = await inputCommand(["set-controls", "kart", "--profile", "default", "--rows", "[{\"kind\":\"action\",\"actionOrAxisId\":\"accelerate\",\"defaultBindings\":[\"keyboard.KeyW\"],\"uiNodeId\":\"settings.accelerate\"},{\"kind\":\"axis\",\"actionOrAxisId\":\"MoveX\",\"axisSlot\":\"positive\",\"defaultBindings\":[\"keyboard.KeyD\"]}]", "--project", root, "--json"]);
    const inputOverride = await inputCommand(["set-override", "kart", "accelerate", "--profile", "default", "--device", "keyboard", "--control", "ArrowUp", "--updated-at", "2026-06-23T00:00:00.000Z", "--project", root, "--json"]);
    const mesh = await meshCommand(["primitive", "mesh.kart.body", "--kind", "box", "--size", "1.2,0.6,2.4", "--project", root, "--json"]);
    const torusMesh = await meshCommand(["primitive", "mesh.kart.tire", "--kind", "torus", "--size", "0.18,0.42", "--project", root, "--json"]);
    const customMesh = await meshCommand([
      "custom",
      "mesh.kart.triangle",
      "--attributes",
      "[{\"name\":\"position\",\"itemSize\":3,\"values\":[0,0,0,1,0,0,0,1,0]}]",
      "--indices",
      "[0,1,2]",
      "--storage",
      "binary",
      "--project",
      root,
      "--json",
    ]);

    const prefabDoc = JSON.parse(await readFile(join(root, "content", "prefabs", "kart.prefab.json"), "utf8"));
    const inputDoc = JSON.parse(await readFile(join(root, "content", "input", "kart.input.json"), "utf8"));
    const meshDoc = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.kart.body.meshes.json"), "utf8"));
    const torusMeshDoc = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.kart.tire.meshes.json"), "utf8"));
    const customMeshDoc = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.kart.triangle.meshes.json"), "utf8"));

    assert.equal(prefabCreate.exitCode, 0);
    assert.equal(prefabComponent.exitCode, 0);
    assert.equal(prefabDefaults.exitCode, 0);
    assert.equal(materialCreate.exitCode, 0);
    assert.equal(prefabMaterial.exitCode, 0);
    assert.equal(input.exitCode, 0);
    assert.equal(inputAxis.exitCode, 0);
    assert.equal(inputControls.exitCode, 0);
    assert.equal(inputOverride.exitCode, 0);
    assert.equal(mesh.exitCode, 0);
    assert.equal(torusMesh.exitCode, 0);
    assert.equal(customMesh.exitCode, 0);
    assert.deepEqual(prefabDoc.entities, [{ components: { MeshRenderer: { material: "mat.kart" }, RigidBody: { kind: "dynamic", mass: 2 }, VehiclePhysics: { maxSpeed: 42 } }, id: "kart" }]);
    assert.deepEqual(inputDoc.actions, [{ bindings: ["keyboard.KeyW", "keyboard.ArrowUp"], id: "accelerate" }]);
    assert.deepEqual(inputDoc.axes, [{ id: "MoveX", negative: ["keyboard.KeyA", "keyboard.ArrowLeft"], positive: ["keyboard.KeyD", "keyboard.ArrowRight"], value: "gamepad.leftStickX" }]);
    assert.deepEqual(inputDoc.controlsSettings, {
      profileId: "default",
      rows: [
        { actionOrAxisId: "accelerate", defaultBindings: ["keyboard.KeyW"], kind: "action", uiNodeId: "settings.accelerate" },
        { actionOrAxisId: "MoveX", axisSlot: "positive", defaultBindings: ["keyboard.KeyD"], kind: "axis" },
      ],
    });
    assert.deepEqual(inputDoc.persistedBindingOverrides, [{ actionOrAxisId: "accelerate", control: "ArrowUp", device: "keyboard", profileId: "default", updatedAt: "2026-06-23T00:00:00.000Z" }]);
    assert.deepEqual(meshDoc.meshes, [{ id: "mesh.kart.body", kind: "primitive", primitive: "box", size: [1.2, 0.6, 2.4] }]);
    assert.deepEqual(torusMeshDoc.meshes, [{ id: "mesh.kart.tire", kind: "primitive", primitive: "torus", size: [0.18, 0.42] }]);
    assert.deepEqual(customMeshDoc.meshes, [{
      attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
      id: "mesh.kart.triangle",
      indices: [0, 1, 2],
      kind: "custom",
      primitive: "custom",
      storage: "binary",
    }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("prefab set-material rejects unknown material with exact fix", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-prefab-material-"));
  try {
    await prefabCommand(["create", "kart", "--project", root, "--json"]);
    await materialCommand(["create", "mat.kart", "--project", root, "--json"]);
    const result = await prefabCommand(["set-material", "kart", "--material", "mat.missing", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string; message: string };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_PREFAB_MATERIAL_UNKNOWN");
    assert.match(payload.message, /mat\.kart/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("prefab set-material targets prefab document root entity", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-prefab-document-material-"));
  try {
    await writeProjectFile(root, "content/materials/arena.materials.json", `${JSON.stringify({
      schema: "threenative.materials",
      version: "0.1.0",
      id: "arena-materials",
      materials: [{ id: "mat.alt" }],
    }, null, 2)}\n`);
    await writeProjectFile(root, "content/prefabs/player.prefab.json", `${JSON.stringify({
      schema: "threenative.prefab",
      version: "0.1.0",
      id: "prefab.player",
      entities: [{ id: "player", components: { MeshRenderer: { material: "mat.player" } } }],
    }, null, 2)}\n`);

    const result = await prefabCommand(["set-material", "prefab.player", "--material", "mat.alt", "--project", root, "--json"]);
    const prefabDoc = JSON.parse(await readFile(join(root, "content", "prefabs", "player.prefab.json"), "utf8"));

    assert.equal(result.exitCode, 0);
    assert.deepEqual(prefabDoc.entities, [{ id: "player", components: { MeshRenderer: { material: "mat.alt" } } }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("invalid prefab component JSON emits diagnostic and does not partially write", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-prefab-invalid-"));
  try {
    const result = await prefabCommand(["add-component", "kart", "VehiclePhysics", "--value", "{", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_AUTHORING_JSON_VALUE_INVALID");
    await assert.rejects(readFile(join(root, "content", "prefabs", "kart.prefab.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("flow command creates states and transitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-flow-doc-"));
  try {
    const create = await flowCommand(["create", "match", "--initial", "ready", "--scene", "arena", "--project", root, "--json"]);
    const state = await flowCommand(["add-state", "match", "playing", "--project", root, "--json"]);
    const transition = await flowCommand([
      "add-transition",
      "match",
      "start",
      "--from",
      "ready",
      "--to",
      "playing",
      "--trigger",
      "{\"kind\":\"event\",\"event\":\"start\"}",
      "--actions",
      "[{\"kind\":\"emitEvent\",\"event\":\"match.started\"}]",
      "--project",
      root,
      "--json",
    ]);
    const flow = JSON.parse(await readFile(join(root, "content", "flow", "match.flow.json"), "utf8"));

    assert.equal(create.exitCode, 0);
    assert.equal(state.exitCode, 0);
    assert.equal(transition.exitCode, 0);
    assert.deepEqual(flow.states, [{ id: "ready" }, { id: "playing" }]);
    assert.deepEqual(flow.transitions, [{ id: "start", from: "ready", to: "playing", trigger: { kind: "event", event: "start" }, actions: [{ kind: "emitEvent", event: "match.started" }] }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("sequence command creates tracks and keyframes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-sequence-doc-"));
  try {
    const create = await sequenceCommand(["create", "intro", "--duration", "2", "--skippable", "true", "--project", root, "--json"]);
    const track = await sequenceCommand(["add-track", "intro", "camera", "--kind", "cameraPose", "--entity", "camera.main", "--project", root, "--json"]);
    const key = await sequenceCommand(["add-key", "intro", "camera", "--time", "0.5", "--value", "{\"position\":[0,2,4]}", "--easing", "linear", "--project", root, "--json"]);
    const sequence = JSON.parse(await readFile(join(root, "content", "sequences", "intro.sequence.json"), "utf8"));

    assert.equal(create.exitCode, 0);
    assert.equal(track.exitCode, 0);
    assert.equal(key.exitCode, 0);
    assert.deepEqual(sequence.tracks, [{ id: "camera", kind: "cameraPose", entity: "camera.main", keyframes: [{ time: 0.5, value: { position: [0, 2, 4] }, easing: "linear" }] }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeProjectFile(root: string, file: string, data: string): Promise<void> {
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { audioCommand, environmentCommand, inputCommand, materialCommand, meshCommand, prefabCommand, projectCommand, resourcesCommand, runtimeCommand, systemCommand, uiCommand } from "./sourceDocuments.js";

test("countdown UI can be created centered and bound without manual JSON editing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-ui-doc-"));
  try {
    const create = await uiCommand(["create", "hud", "--project", root, "--json"]);
    const text = await uiCommand(["add-text", "hud", "countdown", "--text", "READY", "--project", root, "--json"]);
    const button = await uiCommand(["add-node", "hud", "pause", "--type", "button", "--label", "Pause", "--action", "pause.toggle", "--project", root, "--json"]);
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
    assert.equal(style.exitCode, 0);
    assert.equal(layout.exitCode, 0);
    assert.equal(bind.exitCode, 0);
    assert.deepEqual(ui.nodes, [
      { id: "countdown", layout: { align: "center", height: 160, justify: "center", top: 280, width: 1280 }, text: "READY", type: "text" },
      { action: "pause.toggle", id: "pause", label: "Pause", style: { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, textAlign: "center", wrap: true }, type: "button" },
    ]);
    assert.deepEqual(ui.bindings, [{ node: "countdown", resource: "RaceState.status" }]);
    assert.deepEqual((JSON.parse(bind.stdout) as { filesWritten: string[] }).filesWritten, ["content/ui/hud.ui.json"]);
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

test("environment command creates and updates promoted source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-environment-doc-"));
  try {
    const create = await environmentCommand(["create", "arena", "--project", root, "--json"]);
    const skybox = await environmentCommand(["set-skybox", "arena", "--asset", "tex.sky", "--mode", "equirect", "--project", root, "--json"]);
    const map = await environmentCommand(["set-map", "arena", "--asset", "tex.env", "--project", root, "--json"]);
    const terrain = await environmentCommand(["set-terrain", "arena", "--id", "terrain.arena", "--height-mode", "heightmap", "--heightmap", "tex.height", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "environment", "arena.environment.json"), "utf8")) as {
      environmentMap?: Record<string, unknown>;
      skybox?: Record<string, unknown>;
      terrain?: Record<string, unknown>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(skybox.exitCode, 0);
    assert.equal(map.exitCode, 0);
    assert.equal(terrain.exitCode, 0);
    assert.deepEqual(doc.skybox, { asset: "tex.sky", mode: "equirect" });
    assert.deepEqual(doc.environmentMap, { asset: "tex.env" });
    assert.deepEqual(doc.terrain, { heightMode: "heightmap", heightmap: "tex.height", id: "terrain.arena" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("runtime command creates and updates promoted source fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-runtime-doc-"));
  try {
    const create = await runtimeCommand(["create", "desktop", "--project", root, "--json"]);
    const window = await runtimeCommand(["set-window", "desktop", "--width", "1920", "--height", "1080", "--title", "Arena", "--project", root, "--json"]);
    const rendering = await runtimeCommand(["set-rendering", "desktop", "--antialias", "msaa8", "--bloom", "true", "--bloom-intensity", "0.4", "--bloom-threshold", "0.85", "--render-path", "forward", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "runtime", "desktop.runtime.json"), "utf8")) as {
      renderer?: { antialias?: string; bloom?: Record<string, unknown>; renderPath?: string };
      time?: Record<string, unknown>;
      window?: Record<string, unknown>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(window.exitCode, 0);
    assert.equal(rendering.exitCode, 0);
    assert.deepEqual(doc.window, { height: 1080, title: "Arena", width: 1920 });
    assert.deepEqual(doc.time, { fixedDelta: 1 / 60, paused: false });
    assert.deepEqual(doc.renderer, { antialias: "msaa8", bloom: { enabled: true, intensity: 0.4, threshold: 0.85 }, renderPath: "forward" });
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
      schedule: "update",
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
    const input = await inputCommand(["add-action", "kart", "accelerate", "--keys", "W,ArrowUp", "--project", root, "--json"]);
    const inputAxis = await inputCommand(["add-axis", "kart", "MoveX", "--negative-keys", "A,ArrowLeft", "--positive-keys", "D,ArrowRight", "--value", "gamepad.leftStickX", "--project", root, "--json"]);
    const mesh = await meshCommand(["primitive", "mesh.kart.body", "--kind", "box", "--project", root, "--json"]);

    const prefabDoc = JSON.parse(await readFile(join(root, "content", "prefabs", "kart.prefab.json"), "utf8"));
    const inputDoc = JSON.parse(await readFile(join(root, "content", "input", "kart.input.json"), "utf8"));
    const meshDoc = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.kart.body.meshes.json"), "utf8"));

    assert.equal(prefabCreate.exitCode, 0);
    assert.equal(prefabComponent.exitCode, 0);
    assert.equal(input.exitCode, 0);
    assert.equal(inputAxis.exitCode, 0);
    assert.equal(mesh.exitCode, 0);
    assert.deepEqual(prefabDoc.entities, [{ components: { VehiclePhysics: { maxSpeed: 42 } }, id: "kart" }]);
    assert.deepEqual(inputDoc.actions, [{ bindings: ["keyboard.w", "keyboard.ArrowUp"], id: "accelerate" }]);
    assert.deepEqual(inputDoc.axes, [{ id: "MoveX", negative: ["keyboard.a", "keyboard.ArrowLeft"], positive: ["keyboard.d", "keyboard.ArrowRight"], value: "gamepad.leftStickX" }]);
    assert.deepEqual(meshDoc.meshes, [{ id: "mesh.kart.body", kind: "primitive", primitive: "box" }]);
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

async function writeProjectFile(root: string, file: string, data: string): Promise<void> {
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

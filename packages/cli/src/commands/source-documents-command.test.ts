import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { inputCommand, materialCommand, meshCommand, prefabCommand, systemCommand, uiCommand } from "./sourceDocuments.js";

test("countdown UI can be created centered and bound without manual JSON editing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-ui-doc-"));
  try {
    const create = await uiCommand(["create", "hud", "--project", root, "--json"]);
    const text = await uiCommand(["add-text", "hud", "countdown", "--text", "READY", "--project", root, "--json"]);
    const layout = await uiCommand(["set-layout", "hud", "countdown", "--justify", "center", "--align", "center", "--top", "280", "--height", "160", "--width", "1280", "--project", root, "--json"]);
    const bind = await uiCommand(["bind", "hud", "countdown", "--resource", "RaceState.status", "--project", root, "--json"]);
    const ui = JSON.parse(await readFile(join(root, "content", "ui", "hud.ui.json"), "utf8")) as {
      bindings: Array<{ node: string; resource: string }>;
      nodes: Array<{ id: string; layout: Record<string, unknown>; text: string; type: string }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(text.exitCode, 0);
    assert.equal(layout.exitCode, 0);
    assert.equal(bind.exitCode, 0);
    assert.deepEqual(ui.nodes, [{ id: "countdown", layout: { align: "center", height: 160, justify: "center", top: 280, width: 1280 }, text: "READY", type: "text" }]);
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
    const set = await materialCommand(["set", "mat.kart", "--color", "#fff", "--roughness", "0.5", "--project", root, "--json"]);
    const doc = JSON.parse(await readFile(join(root, "content", "materials", "mat.kart.materials.json"), "utf8")) as {
      materials: Array<{ color: string; id: string; roughness: number }>;
    };

    assert.equal(create.exitCode, 0);
    assert.equal(set.exitCode, 0);
    assert.deepEqual(doc.materials, [{ color: "#fff", id: "mat.kart", roughness: 0.5 }]);
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

test("prefab input and mesh operations write deterministic structured docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-source-docs-"));
  try {
    const prefabCreate = await prefabCommand(["create", "kart", "--project", root, "--json"]);
    const prefabComponent = await prefabCommand(["add-component", "kart", "VehiclePhysics", "--value", "{\"maxSpeed\":42}", "--project", root, "--json"]);
    const input = await inputCommand(["add-action", "kart", "accelerate", "--keys", "W,ArrowUp", "--project", root, "--json"]);
    const mesh = await meshCommand(["primitive", "mesh.kart.body", "--kind", "box", "--project", root, "--json"]);

    const prefabDoc = JSON.parse(await readFile(join(root, "content", "prefabs", "kart.prefab.json"), "utf8"));
    const inputDoc = JSON.parse(await readFile(join(root, "content", "input", "kart.input.json"), "utf8"));
    const meshDoc = JSON.parse(await readFile(join(root, "content", "meshes", "mesh.kart.body.meshes.json"), "utf8"));

    assert.equal(prefabCreate.exitCode, 0);
    assert.equal(prefabComponent.exitCode, 0);
    assert.equal(input.exitCode, 0);
    assert.equal(mesh.exitCode, 0);
    assert.deepEqual(prefabDoc.entities, [{ components: { VehiclePhysics: { maxSpeed: 42 } }, id: "kart" }]);
    assert.deepEqual(inputDoc.actions, [{ bindings: ["keyboard.w", "keyboard.ArrowUp"], id: "accelerate" }]);
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

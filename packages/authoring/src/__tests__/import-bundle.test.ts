import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { importBundle } from "../index.js";

test("import-bundle imports rich bundle catalogs into structured source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-import-bundle-"));
  try {
    await writeRichBundle(root);

    const result = await importBundle({
      bundleDir: "dist/game.bundle",
      mode: "source",
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, false);
    assert.deepEqual(result.filesWritten, [
      "content/assets/imported.assets.json",
      "content/input/imported.input.json",
      "content/materials/imported.materials.json",
      "content/scenes/imported.scene.json",
      "content/systems/imported.systems.json",
      "content/ui/imported.ui.json",
    ]);
    assert.deepEqual(result.imported.map((artifact) => artifact.artifact), [
      "world.ir.json",
      "materials.ir.json",
      "assets.manifest.json",
      "ui.ir.json",
      "input.ir.json",
      "systems.ir.json",
    ]);

    const scene = JSON.parse(await readFile(join(root, "content/scenes/imported.scene.json"), "utf8")) as {
      entities: Array<{ components: Record<string, unknown>; id: string }>;
      provenance: { importedFromBundleArtifact: string };
      resources: Array<{ id: string; value: unknown }>;
    };
    const materials = JSON.parse(await readFile(join(root, "content/materials/imported.materials.json"), "utf8")) as { materials: Array<Record<string, unknown>> };
    const assets = JSON.parse(await readFile(join(root, "content/assets/imported.assets.json"), "utf8")) as { assets: Array<{ id: string; path: string; type: string }> };
    const ui = JSON.parse(await readFile(join(root, "content/ui/imported.ui.json"), "utf8")) as { nodes: Array<{ id: string }> };
    const input = JSON.parse(await readFile(join(root, "content/input/imported.input.json"), "utf8")) as {
      actions: Array<{ bindings: string[]; id: string }>;
      axes: Array<{ id: string; negative: string[]; positive: string[]; value?: string }>;
    };
    const systems = JSON.parse(await readFile(join(root, "content/systems/imported.systems.json"), "utf8")) as { systems: Array<{ id: string; schedule: string; script?: unknown }> };

    assert.equal(scene.provenance.importedFromBundleArtifact, "world.ir.json");
    assert.equal(scene.entities[0]?.id, "player");
    assert.deepEqual(scene.entities[0]?.components.MeshRenderer, { material: "mat.kart", mesh: "mesh.kart" });
    assert.deepEqual(scene.resources.map((resource) => resource.id), ["RaceState"]);
    assert.deepEqual(materials.materials, [
      {
        alphaCutoff: 0.4,
        alphaMode: "mask",
        baseColorTexture: "tex.kart.albedo",
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        clearcoatRoughnessTexture: "tex.kart.clearcoatRoughness",
        clearcoatTexture: "tex.kart.clearcoat",
        color: "#ff0000",
        emissive: "#33ccff",
        emissiveIntensity: 1.4,
        emissiveTexture: "tex.kart.emissive",
        id: "mat.kart",
        metallicRoughnessTexture: "tex.kart.mr",
        metalness: 0.2,
        normalTexture: "tex.kart.normal",
        occlusionTexture: "tex.kart.occlusion",
        opacity: 0.85,
        roughness: 0.5,
        transmission: 0.1,
        transmissionTexture: "tex.kart.transmission",
      },
    ]);
    assert.deepEqual(assets.assets, [{ id: "asset.kart", path: "assets/kart.glb", type: "model" }]);
    assert.deepEqual(ui.nodes.map((node) => node.id), ["ui.hud", "ui.score"]);
    assert.deepEqual(input.actions, [{ id: "Accelerate", bindings: ["keyboard.KeyW"] }]);
    assert.deepEqual(input.axes, [{ id: "MoveX", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"], value: "gamepad.leftStickX" }]);
    assert.deepEqual(systems.systems, [{ id: "raceController", schedule: "update" }]);

    await assert.rejects(readFile(join(root, "content/systems/scripts.bundle.js"), "utf8"));
    await assert.rejects(readFile(join(root, "content/scenes/world.ir.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("import-bundle dry-run reports planned writes without writing source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-import-bundle-dry-run-"));
  try {
    await writeRichBundle(root);

    const result = await importBundle({
      bundleDir: "dist/game.bundle",
      dryRun: true,
      mode: "source",
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.filesWritten, []);
    assert.equal(result.plannedWrites.includes("content/scenes/imported.scene.json"), true);
    await assert.rejects(readFile(join(root, "content/scenes/imported.scene.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("import-bundle unrecoverable generated script body is diagnostic not source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-import-bundle-script-"));
  try {
    await writeRichBundle(root);

    const result = await importBundle({
      bundleDir: "dist/game.bundle",
      mode: "source",
      projectPath: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_IMPORT_UNRECOVERABLE_SCRIPT_BODY"), true);
    assert.equal(result.skipped.some((artifact) => artifact.artifact === "scripts.bundle.js" && artifact.reason === "unrecoverable"), true);
    await assert.rejects(readFile(join(root, "src/scripts/imported.ts"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeRichBundle(root: string): Promise<void> {
  await writeBundleJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "player",
        components: {
          MeshRenderer: { mesh: "mesh.kart", material: "mat.kart" },
          KartController: { maxSpeed: 42 },
        },
      },
    ],
    resources: {
      RaceState: { lap: 1, status: "READY" },
    },
  });
  await writeBundleJson(root, "materials.ir.json", {
    schema: "threenative.materials",
    version: "0.1.0",
    materials: [
      {
        alphaCutoff: 0.4,
        alphaMode: "mask",
        baseColorTexture: "tex.kart.albedo",
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        clearcoatRoughnessTexture: "tex.kart.clearcoatRoughness",
        clearcoatTexture: "tex.kart.clearcoat",
        color: "#ff0000",
        emissive: "#33ccff",
        emissiveIntensity: 1.4,
        emissiveTexture: "tex.kart.emissive",
        id: "mat.kart",
        kind: "standard",
        metallicRoughnessTexture: "tex.kart.mr",
        metalness: 0.2,
        normalTexture: "tex.kart.normal",
        occlusionTexture: "tex.kart.occlusion",
        opacity: 0.85,
        roughness: 0.5,
        transmission: 0.1,
        transmissionTexture: "tex.kart.transmission",
      },
    ],
  });
  await writeBundleJson(root, "assets.manifest.json", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [{ id: "asset.kart", kind: "model", path: "assets/kart.glb" }],
  });
  await writeBundleJson(root, "ui.ir.json", {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "ui.hud",
      children: [{ id: "ui.score", kind: "text", text: "000" }],
    },
  });
  await writeBundleJson(root, "input.ir.json", {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Accelerate", bindings: [{ device: "keyboard", code: "KeyW" }] }],
    axes: [{ id: "MoveX", negative: [{ device: "keyboard", code: "KeyA" }], positive: [{ device: "keyboard", code: "KeyD" }], value: { device: "gamepad", control: "leftStickX" } }],
  });
  await writeBundleJson(root, "systems.ir.json", {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        name: "raceController",
        schedule: "update",
        script: { bundle: "scripts.bundle.js", exportName: "system_raceController" },
      },
    ],
  });
  await writeBundleText(root, "scripts.bundle.js", "export function system_raceController() {}\n");
}

async function writeBundleJson(root: string, file: string, data: unknown): Promise<void> {
  await writeBundleText(root, file, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeBundleText(root: string, file: string, text: string): Promise<void> {
  const absoluteFile = join(root, "dist/game.bundle", file);
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeFile(absoluteFile, text);
}

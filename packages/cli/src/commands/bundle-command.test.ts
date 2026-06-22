import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { dispatch } from "../index.js";
import { bundleCommand } from "./bundle.js";

test("bundle-command imports rich bundle catalogs into structured source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-bundle-import-"));
  try {
    await writeRichBundle(root);

    const result = await bundleCommand(["import", "dist/game.bundle", "--project", root, "--mode", "source", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      diagnostics: Array<{ code: string }>;
      filesWritten: string[];
      imported: Array<{ artifact: string }>;
      ok: boolean;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_BUNDLE_IMPORT_OK");
    assert.equal(payload.ok, true);
    assert.equal(payload.imported.some((artifact) => artifact.artifact === "world.ir.json"), true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_IMPORT_UNRECOVERABLE_SCRIPT_BODY"), true);
    assert.equal(payload.filesWritten.includes("content/ui/imported.ui.json"), true);

    const scene = JSON.parse(await readFile(join(root, "content/scenes/imported.scene.json"), "utf8")) as { entities: Array<{ id: string }> };
    const systems = JSON.parse(await readFile(join(root, "content/systems/imported.systems.json"), "utf8")) as { systems: Array<{ script?: unknown }> };
    assert.equal(scene.entities[0]?.id, "player");
    assert.deepEqual(systems.systems, [{ id: "raceController", queries: [{ with: ["Transform"], without: [] }], reads: ["Transform"], schedule: "update", services: ["scene.change"], writes: ["Transform"] }]);
    await assert.rejects(readFile(join(root, "content/scenes/world.ir.json"), "utf8"));
    await assert.rejects(readFile(join(root, "src/scripts/imported.ts"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("bundle-command dry-run reports planned writes without writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-bundle-import-dry-run-"));
  try {
    await writeRichBundle(root);

    const result = await bundleCommand(["import", "dist/game.bundle", "--project", root, "--mode", "source", "--dry-run", "--json"]);
    const payload = JSON.parse(result.stdout) as { dryRun: boolean; filesWritten: string[]; plannedWrites: string[] };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.dryRun, true);
    assert.deepEqual(payload.filesWritten, []);
    assert.equal(payload.plannedWrites.includes("content/scenes/imported.scene.json"), true);
    await assert.rejects(readFile(join(root, "content/scenes/imported.scene.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("dispatch registers bundle command", async () => {
  const result = await dispatch(["bundle", "import", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_BUNDLE_IMPORT_ARGS_INVALID");
});

async function writeRichBundle(root: string): Promise<void> {
  await writeBundleJson(root, "world.ir.json", {
    schema: "threenative.world",
    entities: [
      {
        id: "player",
        components: {
          MeshRenderer: { mesh: "mesh.kart", material: "mat.kart" },
        },
      },
    ],
    resources: {
      RaceState: { status: "READY" },
    },
  });
  await writeBundleJson(root, "materials.ir.json", {
    schema: "threenative.materials",
    materials: [{ id: "mat.kart", color: "#ffffff" }],
  });
  await writeBundleJson(root, "assets.manifest.json", {
    schema: "threenative.assets",
    assets: [{ id: "asset.kart", kind: "model", path: "assets/kart.glb" }],
  });
  await writeBundleJson(root, "ui.ir.json", {
    schema: "threenative.ui",
    root: { id: "ui.hud", children: [{ id: "ui.score" }] },
  });
  await writeBundleJson(root, "input.ir.json", {
    schema: "threenative.input",
    actions: [{ id: "Accelerate", bindings: [{ device: "keyboard", code: "KeyW" }] }],
  });
  await writeBundleJson(root, "systems.ir.json", {
    schema: "threenative.systems",
    systems: [
      {
        name: "raceController",
        queries: [{ with: ["Transform"], without: [] }],
        reads: ["Transform"],
        schedule: "update",
        script: { bundle: "scripts.bundle.js", exportName: "system_raceController" },
        services: ["scene.change"],
        writes: ["Transform"],
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

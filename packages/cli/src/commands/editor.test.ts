import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { editorCommand } from "./editor.js";

test("should report editor dev launch config in json mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-dev-"));
  try {
    const projectPath = join(root, "project");
    const launches: Array<{ args: string[]; command: string; cwd: string; env: NodeJS.ProcessEnv }> = [];
    await mkdir(projectPath, { recursive: true });

    const result = await editorCommand(["dev", "--project", "project", "--port", "5188", "--json"], {
      cwd: root,
      launchProcess: (command, args, options) => {
        launches.push({ args, command, cwd: options.cwd, env: options.env });
        return { pid: 12345, unref: () => undefined };
      },
    });
    const payload = JSON.parse(result.stdout) as {
      bootConfigPath: string;
      code: string;
      pid: number;
      projectPath: string;
      url: string;
    };
    const boot = JSON.parse(await readFile(payload.bootConfigPath, "utf8")) as { projectPath: string; schema: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_LAUNCH_OK");
    assert.equal(payload.projectPath, projectPath);
    assert.equal(payload.url, "http://127.0.0.1:5188/");
    assert.equal(payload.pid, 12345);
    assert.equal(launches[0]?.command, "pnpm");
    assert.equal(launches[0]?.args.includes("vite"), true);
    assert.equal(launches[0]?.env.THREENATIVE_EDITOR_BOOT, payload.bootConfigPath);
    assert.equal(boot.schema, "threenative.editor-boot");
    assert.equal(boot.projectPath, projectPath);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsafe editor project paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-dev-unsafe-"));
  try {
    const result = await editorCommand(["dev", "--project", "dist/game.bundle", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_EDITOR_BOOT_PROJECT_UNSAFE");
    assert.equal(payload.diagnostics[0]?.code, "TN_EDITOR_BOOT_PROJECT_UNSAFE");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor inspect should write structured scene inspection json", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-inspect-"));
  try {
    const bundlePath = join(root, "game.bundle");
    const outPath = join(root, "inspection.json");
    await writeBundleFixture(bundlePath, true);

    const result = await editorCommand(["inspect", "--bundle", bundlePath, "--out", outPath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; documents: string[]; path: string; schema: string; version: string };
    const report = JSON.parse(await readFile(outPath, "utf8")) as { bundle: { documents: string[] }; gltfAssets: Array<{ assetId: string }>; schema: string; version: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_INSPECT_OK");
    assert.equal(payload.path, outPath);
    assert.equal(payload.schema, "threenative.scene-inspection");
    assert.equal(payload.version, "0.1.0");
    assert.equal(report.schema, "threenative.scene-inspection");
    assert.equal(report.version, "0.1.0");
    assert.deepEqual(report.bundle.documents, [
      "assets.manifest.json",
      "gltf.scene.json",
      "input.ir.json",
      "manifest.json",
      "materials.ir.json",
      "target.profile.json",
      "world.ir.json",
    ]);
    assert.deepEqual(report.gltfAssets.map((asset) => asset.assetId), ["model.level"]);
    assert.deepEqual(payload.documents, report.bundle.documents);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor inspect should return visual editor panel metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-inspect-panels-"));
  try {
    const bundlePath = join(root, "game.bundle");
    await writeBundleFixture(bundlePath, true);

    const result = await editorCommand(["inspect", "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as {
      code: string;
      visualPanels: {
        panels: Array<{ id: string; rows: Array<{ label: string; path?: string }> }>;
        schema: string;
        summary: { assets: number; editableProperties: number; rootNodes: number };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_INSPECT_OK");
    assert.equal(payload.visualPanels.schema, "threenative.editor-visual-panels");
    assert.equal(payload.visualPanels.summary.assets, 1);
    assert.equal(payload.visualPanels.summary.rootNodes, 2);
    assert.equal(payload.visualPanels.summary.editableProperties > 0, true);
    assert.deepEqual(payload.visualPanels.panels.map((panel) => panel.id), [
      "scene-hierarchy",
      "properties",
      "assets",
      "diagnostics",
      "hot-reload",
    ]);
    assert.equal(payload.visualPanels.panels[0]?.rows[0]?.label, "entity.camera");
    assert.equal(payload.visualPanels.panels[1]?.rows.some((row) => row.path?.includes("Transform")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor inspect should return scene viewer asset preview and gamepad tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-inspect-tools-"));
  try {
    const bundlePath = join(root, "game.bundle");
    await writeBundleFixture(bundlePath, true);

    const result = await editorCommand(["inspect", "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as {
      code: string;
      editorTools: {
        assetPreview: { assets: Array<{ id: string }>; selectedAsset?: string };
        gamepadViewer: { controls: Array<{ control: string; owner: string }>; devices: Array<{ id: string }> };
        sceneViewer: { cameras: string[]; entities: number; renderables: string[] };
        schema: string;
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_INSPECT_OK");
    assert.equal(payload.editorTools.schema, "threenative.editor-tools");
    assert.deepEqual(payload.editorTools.sceneViewer.cameras, ["entity.camera"]);
    assert.deepEqual(payload.editorTools.sceneViewer.renderables, ["entity.player"]);
    assert.equal(payload.editorTools.sceneViewer.entities, 2);
    assert.equal(payload.editorTools.assetPreview.selectedAsset, "model.level");
    assert.deepEqual(payload.editorTools.assetPreview.assets.map((asset) => asset.id), ["model.level"]);
    assert.deepEqual(
      payload.editorTools.gamepadViewer.controls.map((control) => `${control.owner}:${control.control}`),
      ["Interact:buttonSouth", "MoveX:leftStickX"],
    );
    assert.deepEqual(payload.editorTools.gamepadViewer.devices, [{ id: "declared-gamepad", status: "declared" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor inspect should return diagnostics for invalid bundles", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-inspect-invalid-"));
  try {
    const bundlePath = join(root, "game.bundle");
    await writeBundleFixture(bundlePath);
    await writeFixtureJson(bundlePath, "assets.manifest.json", {
      assets: [{ format: "png", id: "tex.missing", kind: "texture", path: "assets/missing.png" }],
      schema: "threenative.assets",
      version: "0.1.0",
    });

    const result = await editorCommand(["inspect", "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_EDITOR_INSPECT_BUNDLE_INVALID");
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_ASSET_PATH_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor snapshot should write structured bundle documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-snapshot-"));
  try {
    const bundlePath = join(root, "game.bundle");
    const outPath = join(root, "editor.project.json");
    await writeBundleFixture(bundlePath);

    const result = await editorCommand(["snapshot", "--bundle", bundlePath, "--out", outPath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; documents: string[]; path: string };
    const snapshot = JSON.parse(await readFile(outPath, "utf8")) as {
      documents: Record<string, unknown>;
      schema: string;
      version: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_SNAPSHOT_OK");
    assert.equal(payload.path, outPath);
    assert.deepEqual(payload.documents, [
      "assets.manifest.json",
      "input.ir.json",
      "manifest.json",
      "materials.ir.json",
      "target.profile.json",
      "world.ir.json",
    ]);
    assert.equal(snapshot.schema, "threenative.editor-project");
    assert.equal(snapshot.version, "0.1.0");
    assert.deepEqual(Object.keys(snapshot.documents).sort(), payload.documents);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor snapshot should reject unsafe manifest-controlled document paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-unsafe-path-"));
  try {
    const bundlePath = join(root, "game.bundle");
    await writeBundleFixture(bundlePath);
    await writeFixtureJson(bundlePath, "manifest.json", {
      entry: { world: "../outside.json" },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
      name: "unsafe-bundle",
      requiredCapabilities: {},
      schema: "threenative.bundle",
      version: "0.1.0",
    });

    const result = await editorCommand(["snapshot", "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; path: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_EDITOR_BUNDLE_PATH_INVALID");
    assert.equal(payload.path, "../outside.json");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor diff should report deterministic structured operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-diff-"));
  try {
    const beforePath = join(root, "before.editor.project.json");
    const afterPath = join(root, "after.editor.project.json");
    await writeFile(beforePath, `${JSON.stringify(editorSnapshot("before"), null, 2)}\n`);
    await writeFile(afterPath, `${JSON.stringify(editorSnapshot("after"), null, 2)}\n`);

    const result = await editorCommand(["diff", "--before", beforePath, "--after", afterPath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as {
      changed: boolean;
      code: string;
      operations: Array<{ after: unknown; before: unknown; op: string; path: string }>;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_EDITOR_DIFF_OK");
    assert.equal(payload.changed, true);
    assert.deepEqual(payload.operations, [
      {
        after: "after",
        before: "before",
        op: "replace",
        path: "/documents/world.ir.json/entities/0/name",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor set should update a validated scene hierarchy property", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-set-property-"));
  try {
    const bundlePath = join(root, "game.bundle");
    await writeBundleFixture(bundlePath);

    const result = await editorCommand(
      [
        "set",
        "--bundle",
        bundlePath,
        "--path",
        "/documents/world.ir.json/entities/0/components/Transform/position/0",
        "--value",
        "4",
        "--json",
      ],
      { cwd: root },
    );
    const payload = JSON.parse(result.stdout) as { code: string; document: string; path: string };
    const world = JSON.parse(await readFile(join(bundlePath, "world.ir.json"), "utf8")) as {
      entities: Array<{ components: { Transform: { position: number[] } }; id: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_SET_OK");
    assert.equal(payload.document, "world.ir.json");
    assert.equal(payload.path, "/documents/world.ir.json/entities/0/components/Transform/position/0");
    assert.deepEqual(world.entities[0], {
      components: { Camera: {}, Transform: { position: [4, 1, 2] } },
      id: "entity.camera",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor apply should write validated structured documents back to a bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-apply-"));
  try {
    const bundlePath = join(root, "game.bundle");
    const snapshotPath = join(root, "editor.project.json");
    await writeBundleFixture(bundlePath);
    await writeFile(
      snapshotPath,
      `${JSON.stringify(
        {
          documents: {
            "world.ir.json": {
              entities: [{ components: { Transform: { position: [1, 2, 3] } }, id: "player" }],
              schema: "threenative.world",
              version: "0.1.0",
            },
          },
          name: "edited",
          schema: "threenative.editor-project",
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );

    const result = await editorCommand(["apply", "--snapshot", snapshotPath, "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; documents: string[]; path: string };
    const world = JSON.parse(await readFile(join(bundlePath, "world.ir.json"), "utf8")) as {
      entities: Array<{ components: { Transform: { position: number[] } }; id: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_EDITOR_APPLY_OK");
    assert.equal(payload.path, bundlePath);
    assert.deepEqual(payload.documents, ["world.ir.json"]);
    assert.deepEqual(world.entities[0], { components: { Transform: { position: [1, 2, 3] } }, id: "player" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor apply should reject snapshots with non-bundle-relative document paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-apply-invalid-"));
  try {
    const bundlePath = join(root, "game.bundle");
    const snapshotPath = join(root, "editor.project.json");
    await writeBundleFixture(bundlePath);
    await writeFile(
      snapshotPath,
      `${JSON.stringify(
        {
          documents: {
            "../world.ir.json": { entities: [], schema: "threenative.world", version: "0.1.0" },
          },
          name: "edited",
          schema: "threenative.editor-project",
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );

    const result = await editorCommand(["apply", "--snapshot", snapshotPath, "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_EDITOR_APPLY_INVALID");
    assert.equal(payload.diagnostics[0]?.code, "TN_IR_EDITOR_PROJECT_DOCUMENT_PATH_INVALID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor apply should reject compiler-level bundle validation failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-apply-ref-invalid-"));
  try {
    const bundlePath = join(root, "game.bundle");
    const snapshotPath = join(root, "editor.project.json");
    await writeBundleFixture(bundlePath);
    await writeFile(
      snapshotPath,
      `${JSON.stringify(
        {
          documents: {
            "world.ir.json": {
              entities: [
                {
                  components: { MeshRenderer: { material: "missing.material", mesh: "missing.mesh" } },
                  id: "player",
                },
              ],
              schema: "threenative.world",
              version: "0.1.0",
            },
          },
          name: "edited",
          schema: "threenative.editor-project",
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );

    const result = await editorCommand(["apply", "--snapshot", snapshotPath, "--bundle", bundlePath, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_EDITOR_APPLY_BUNDLE_INVALID");
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN-IR-2104"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor apply should wrap missing bundle failures in structured json", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-apply-missing-bundle-"));
  try {
    const snapshotPath = join(root, "editor.project.json");
    await writeFile(
      snapshotPath,
      `${JSON.stringify(
        {
          documents: {
            "world.ir.json": { entities: [], schema: "threenative.world", version: "0.1.0" },
          },
          name: "edited",
          schema: "threenative.editor-project",
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );

    const result = await editorCommand(["apply", "--snapshot", snapshotPath, "--bundle", "missing.bundle", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; message: string; path: string };

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, undefined);
    assert.equal(payload.code, "TN_EDITOR_APPLY_FAILED");
    assert.equal(payload.path, join(root, "missing.bundle"));
    assert.match(payload.message, /no such file|ENOENT/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function editorSnapshot(entityName: string): unknown {
  return {
    documents: {
      "world.ir.json": {
        entities: [{ components: {}, id: "entity", name: entityName }],
        schema: "threenative.world",
        version: "0.1.0",
      },
    },
    name: "test",
    schema: "threenative.editor-project",
    version: "0.1.0",
  };
}

async function writeBundleFixture(bundlePath: string, includeGltfScene = false): Promise<void> {
  await mkdir(bundlePath, { recursive: true });
  await writeFixtureJson(bundlePath, "manifest.json", {
    entry: { input: "input.ir.json", world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      ...(includeGltfScene ? { gltfScene: "gltf.scene.json" } : {}),
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
    name: "test-bundle",
    requiredCapabilities: {},
    schema: "threenative.bundle",
    version: "0.1.0",
  });
  await writeFixtureJson(bundlePath, "world.ir.json", {
    entities: [
      { components: { Camera: {}, Transform: { position: [0, 1, 2] } }, id: "entity.camera" },
      ...(includeGltfScene
        ? [{ components: { MeshRenderer: { mesh: "model.level" }, Transform: { position: [3, 0, -1] } }, id: "entity.player" }]
        : []),
    ],
    schema: "threenative.world",
    version: "0.1.0",
  });
  await writeFixtureJson(bundlePath, "input.ir.json", {
    actions: [{ bindings: [{ control: "buttonSouth", device: "gamepad", required: false }], id: "Interact" }],
    axes: [{ id: "MoveX", value: { control: "leftStickX", device: "gamepad", required: false } }],
    schema: "threenative.input",
    version: "0.1.0",
  });
  await writeFixtureJson(bundlePath, "assets.manifest.json", {
    assets: includeGltfScene
      ? [{ format: "gltf", id: "model.level", kind: "model", path: "assets/level.gltf", sourceMode: "bundle" }]
      : [],
    schema: "threenative.assets",
    version: "0.1.0",
  });
  if (includeGltfScene) {
    await mkdir(join(bundlePath, "assets"), { recursive: true });
    await writeFile(join(bundlePath, "assets/level.gltf"), "{}\n");
    await writeFixtureJson(bundlePath, "gltf.scene.json", {
      assets: [
        {
          assetId: "model.level",
          customAttributes: [{ componentType: "f32", itemSize: 3, name: "_WIND", shaderConsumption: "inspectionOnly", targetMesh: "mesh:Door" }],
          nodes: [{ extras: { gameplayTag: "door" }, name: "Door", path: "/Root/Door", spawnedHandleEligible: true }],
        },
      ],
      schema: "threenative.gltf-scene",
      version: "0.1.0",
    });
  }
  await writeFixtureJson(bundlePath, "materials.ir.json", { materials: [], schema: "threenative.materials", version: "0.1.0" });
  await writeFixtureJson(bundlePath, "target.profile.json", {
    schema: "threenative.target-profile",
    targets: ["web"],
    version: "0.1.0",
  });
}

async function writeFixtureJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

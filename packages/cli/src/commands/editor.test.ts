import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { editorCommand } from "./editor.js";

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

async function writeBundleFixture(bundlePath: string): Promise<void> {
  await mkdir(bundlePath, { recursive: true });
  await writeFixtureJson(bundlePath, "manifest.json", {
    entry: { world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
    name: "test-bundle",
    requiredCapabilities: {},
    schema: "threenative.bundle",
    version: "0.1.0",
  });
  await writeFixtureJson(bundlePath, "world.ir.json", { entities: [], schema: "threenative.world", version: "0.1.0" });
  await writeFixtureJson(bundlePath, "assets.manifest.json", { assets: [], schema: "threenative.assets", version: "0.1.0" });
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

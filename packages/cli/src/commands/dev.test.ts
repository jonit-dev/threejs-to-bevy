import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { BevyRuntimeProcess } from "../native/bevy.js";

import { classifyDevAssetReload, devCommand } from "./dev.js";

test("dev watch should report reloadable texture edits", () => {
  const report = classifyDevAssetReload({ assetId: "tex.crate", path: "assets/crate.png" });

  assert.equal(report.schema, "threenative.asset-reload");
  assert.equal(report.classification, "reloadable");
  assert.equal(report.statePolicy, "preserve");
  assert.deepEqual(report.changedAssets, [{ assetId: "tex.crate", change: "changed", path: "assets/crate.png" }]);
  assert.deepEqual(report.diagnostics, []);
});

test("dev watch should require rebuild when gltf node topology changes", () => {
  const report = classifyDevAssetReload({
    afterGltfScene: {
      assets: [{ assetId: "model.level", customAttributes: [], nodes: [{ name: "Window", path: "/Root/Window", spawnedHandleEligible: true }] }],
      schema: "threenative.gltf-scene",
      version: "0.1.0",
    },
    assetId: "model.level",
    beforeGltfScene: {
      assets: [{ assetId: "model.level", customAttributes: [], nodes: [{ name: "Door", path: "/Root/Door", spawnedHandleEligible: true }] }],
      schema: "threenative.gltf-scene",
      version: "0.1.0",
    },
    path: "assets/level.gltf",
  });

  assert.equal(report.classification, "rebuildRequired");
  assert.equal(report.statePolicy, "rebuild");
  assert.deepEqual(report.impactedHandles, ["/Root/Door"]);
  assert.equal(report.diagnostics[0]?.code, "TN_DEV_ASSET_RELOAD_GLTF_TOPOLOGY_CHANGED");
  assert.match(report.diagnostics[0]?.suggestion ?? "", /Rebuild/);
});

test("should start web dev server for valid bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-"));
  try {
    await cp("../../templates/structured-source-starter", root, { recursive: true });
    const result = await devCommand(["--target", "web", "--json"], root);
    try {
      const payload = JSON.parse(result.stdout) as { bundleHash: string; buildTime: string; code: string; diagnostics: Array<{ code: string }>; sourceBuildStatus: string; url: string };
      assert.equal(result.exitCode, 0);
      assert.equal(payload.code, "TN_DEV_WEB_READY");
      assert.match(payload.bundleHash, /^[a-f0-9]{64}$/);
      assert.equal(Number.isNaN(Date.parse(payload.buildTime)), false);
      assert.equal(payload.sourceBuildStatus, "current");
      assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_DEV_NOT_WATCHING"), true);
      assert.match(payload.url, /^http:\/\/127\.0\.0\.1:/);
      const response = await fetch(payload.url);
      assert.equal(response.ok, true);
      const metadata = await fetch(new URL("/__threenative/dev-state.json", payload.url)).then((state) => state.json()) as { bundleHash: string; sourceBuildStatus: string };
      assert.equal(metadata.bundleHash, payload.bundleHash);
      assert.equal(metadata.sourceBuildStatus, "current");
    } finally {
      await result.server?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should invoke bevy runtime for desktop target", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-desktop-"));
  const invocations: string[] = [];
  try {
    await cp("../../templates/structured-source-starter", root, { recursive: true });
    const result = await devCommand(["--target", "desktop", "--json"], root, {
      bevyRunner: ({ bundlePath }) => {
        invocations.push(bundlePath);
        return {} as BevyRuntimeProcess;
      },
    });

    const payload = JSON.parse(result.stdout) as { bundlePath: string; code: string };
    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_DEV_DESKTOP_READY");
    assert.equal(payload.bundlePath, resolve(root, "dist/structured-source-starter.bundle"));
    assert.deepEqual(invocations, [resolve(root, "dist/structured-source-starter.bundle")]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should rebuild when structured source changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-watch-v2-"));
  try {
    await cp("../../templates/structured-source-starter", root, { recursive: true });
    const result = await devCommand(["--target", "desktop", "--watch", "--json"], root);
    try {
      const payload = JSON.parse(result.stdout) as { code: string; initialReport: { status: string } };
      assert.equal(result.exitCode, 0);
      assert.equal(payload.code, "TN_DEV_WATCH_READY");
      assert.equal(payload.initialReport.status, "pass");

      const sourcePath = join(root, "content", "scenes", "arena.scene.json");
      const source = await readFile(sourcePath, "utf8");
      await writeFile(sourcePath, `${source}\n`);
      const report = await result.watcher?.rebuild();

      assert.equal(report?.status, "pass");
      assert.equal(report?.code, "TN_DEV_WATCH_REBUILD_OK");
      assert.match(report?.bundlePath ?? "", /dist\/structured-source-starter\.bundle$/);
    } finally {
      result.watcher?.close();
      await result.server?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should surface validation diagnostics during watch", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-watch-diagnostic-"));
  try {
    await cp("../../templates/structured-source-starter", root, { recursive: true });
    const sourcePath = join(root, "content", "scenes", "arena.scene.json");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, source.replace('"id": "arena"', '"id": ""'));

    const result = await devCommand(["--target", "desktop", "--watch", "--json"], root);
    try {
      const payload = JSON.parse(result.stdout) as {
        initialReport: { diagnostics: Array<{ code: string; file: string; severity: string; suggestedFix?: string }>; status: string };
      };
      const diagnostic = payload.initialReport.diagnostics[0];

      assert.equal(result.exitCode, 0);
      assert.equal(payload.initialReport.status, "fail");
      assert.equal(diagnostic?.code, "TN_AUTHORING_ID_INVALID");
      assert.equal(diagnostic?.severity, "error");
      assert.equal(diagnostic?.file, "content/scenes/arena.scene.json");
      assert.match(diagnostic?.suggestedFix ?? "", /scene/i);
    } finally {
      result.watcher?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report stale last-good bundle when rebuild fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-dev-watch-stale-"));
  try {
    await cp("../../templates/structured-source-starter", root, { recursive: true });
    const result = await devCommand(["--target", "desktop", "--watch", "--json"], root);
    try {
      const initial = JSON.parse(result.stdout) as { initialReport: { bundlePath: string; status: string } };
      const sourcePath = join(root, "content", "scenes", "arena.scene.json");
      const source = await readFile(sourcePath, "utf8");
      await writeFile(sourcePath, source.replace('"id": "arena"', '"id": ""'));
      const report = await result.watcher?.rebuild();

      assert.equal(initial.initialReport.status, "pass");
      assert.equal(report?.status, "fail");
      assert.equal(report?.stale, true);
      assert.equal(report?.lastGoodBundlePath, initial.initialReport.bundlePath);
      assert.equal(report?.diagnostics.some((diagnostic) => diagnostic.code === "TN_DEV_WATCH_LAST_GOOD_STALE"), true);
    } finally {
      result.watcher?.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

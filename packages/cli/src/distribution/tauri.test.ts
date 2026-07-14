import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { IDistributionSource } from "@threenative/ir";
import { PNG } from "pngjs";

import { assertTauriCapabilityPolicyComplete, generateTauriShell, readGeneratedTauriConfig } from "./tauri.js";

test("should generate the same tauri shell for identical distribution IR", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tauri-stable-"));
  try {
    const web = await writeWeb(root);
    const first = await generateTauriShell({ distribution: source(), platform: "linux", projectPath: root, webArtifactPath: web });
    const firstConfig = await readFile(join(first.shellPath, "tauri.conf.json"), "utf8");
    await writeFile(join(first.shellPath, "stale.txt"), "remove me");
    const second = await generateTauriShell({ distribution: source(), platform: "linux", projectPath: root, webArtifactPath: web });
    const secondConfig = await readFile(join(second.shellPath, "tauri.conf.json"), "utf8");

    assert.equal(first.cacheKey, second.cacheKey);
    assert.equal(first.shellPath, second.shellPath);
    assert.equal(firstConfig, secondConfig);
    assert.deepEqual(first.files, second.files);
    await assert.rejects(readFile(join(second.shellPath, "stale.txt"), "utf8"));
    assert.equal(await readFile(join(web, "index.html"), "utf8"), "<!doctype html><canvas></canvas>");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should package local web assets without a localhost launcher", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tauri-local-"));
  try {
    const report = await generateTauriShell({ distribution: source(), platform: "linux", projectPath: root, webArtifactPath: await writeWeb(root) });
    const config = await readGeneratedTauriConfig(report.shellPath) as { build: { frontendDist: string } };
    const combined = await Promise.all(report.files.map((path) => readFile(join(report.shellPath, path), "utf8").catch(() => "")));

    assert.equal(config.build.frontendDist, "web");
    assert.equal(await readFile(join(report.shellPath, "web/index.html"), "utf8"), "<!doctype html><canvas></canvas>");
    const icon = PNG.sync.read(await readFile(join(report.shellPath, "icons/icon.png")));
    assert.equal(icon.width, icon.height);
    assert.doesNotMatch(combined.join("\n"), /localhost|127\.0\.0\.1|file:\/\//);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should deny undeclared tauri capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tauri-capabilities-"));
  try {
    const report = await generateTauriShell({ distribution: source(), platform: "linux", projectPath: root, webArtifactPath: await writeWeb(root) });
    const permissions = report.capabilities.flatMap((capability) => capability.permissions);

    assert.deepEqual(permissions, ["core:default"]);
    assert.deepEqual(report.declaredCapabilities, ["storage"]);
    assert.deepEqual(report.capabilityPolicy, [{ capability: "storage", permissions: [], surface: "browser-storage" }]);
    assert.equal(permissions.some((permission) => /fs|http|opener|process|shell|upload/.test(permission)), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should cover every owning IR capability with a fail-closed tauri policy", () => {
  assert.doesNotThrow(assertTauriCapabilityPolicyComplete);
});

async function writeWeb(root: string): Promise<string> {
  const web = join(root, "web-artifact");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(web, { recursive: true });
  await writeFile(join(root, "assets/chess.png"), PNG.sync.write(new PNG({ height: 2, width: 2 })));
  await writeFile(join(web, "index.html"), "<!doctype html><canvas></canvas>");
  return web;
}

function source(): IDistributionSource {
  return {
    app: { buildNumber: 1, displayName: "Chess", icons: "assets/chess.png", id: "com.threenative.chess", version: "1.0.0" },
    schema: "threenative.distribution",
    targets: [{ capabilities: ["storage"], formats: ["tar"], platform: "linux", runtime: "webview" }],
    version: "0.1.0",
  };
}

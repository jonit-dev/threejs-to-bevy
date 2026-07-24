import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { contentTypeForBundleFile, resolveBundleFilePath, startWebPreview } from "./devServer.js";

test("should start web dev server for valid bundle", async () => {
  const server = await startWebPreview({
    bundlePath: resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"),
    port: 0,
  });
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:/);
    const response = await fetch(server.url);
    assert.equal(response.ok, true);
    assert.match(await response.text(), /ThreeNative Web Preview/);
    const manifestResponse = await fetch(new URL("/bundle/manifest.json", server.url));
    assert.equal(manifestResponse.ok, true);
    assert.equal((await manifestResponse.json()).schema, "threenative.bundle");
    const metadataResponse = await fetch(new URL("/__threenative/dev-state.json", server.url));
    const metadata = await metadataResponse.json() as {
      bundleHash: string;
      bundlePath: string;
      executedRuntimeBuildHash: string | null;
      runtimeBuildHash: string;
      runtimeEntry: string;
      schema: string;
      sourceBuildStatus: string;
    };
    assert.equal(metadataResponse.ok, true);
    assert.equal(metadata.schema, "threenative.dev-preview-state");
    assert.match(metadata.bundleHash, /^[a-f0-9]{64}$/);
    assert.equal(metadata.bundlePath, resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"));
    assert.match(metadata.runtimeBuildHash, /^[a-f0-9]{64}$/);
    assert.equal(metadata.runtimeEntry, "source");
    assert.equal(metadata.executedRuntimeBuildHash, null);
    assert.equal(metadata.sourceBuildStatus, "current");
  } finally {
    await server.close();
  }
});

test("should expose stale then executed runtime identity after a source rebuild without restart", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "tn-runtime-preview-"));
  await mkdir(resolve(runtimeRoot, "src/browser"), { recursive: true });
  await writeFile(resolve(runtimeRoot, "index.html"), '<script id="threenative-runtime-entry"></script>\n');
  await writeFile(resolve(runtimeRoot, "src/browser/main.ts"), "globalThis.__runtimeVersion = 1;\n");
  const server = await startWebPreview({
    bundlePath: resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"),
    port: 0,
    runtimeRoot,
    silent: true,
  });
  try {
    const first = await readDevState(server.url);
    await reportExecutedRuntime(server.url, first.runtimeBuildHash);
    const executed = await readDevState(server.url);
    assert.equal(executed.executedRuntimeBuildHash, first.runtimeBuildHash);

    await writeFile(resolve(runtimeRoot, "src/browser/main.ts"), "globalThis.__runtimeVersion = 2;\n");
    const stale = await readDevState(server.url);
    assert.notEqual(stale.runtimeBuildHash, first.runtimeBuildHash);
    assert.equal(stale.executedRuntimeBuildHash, first.runtimeBuildHash);

    const wrapper = await (await fetch(server.url)).text();
    assert.match(wrapper, new RegExp(stale.runtimeBuildHash));
    await reportExecutedRuntime(server.url, stale.runtimeBuildHash);
    const refreshed = await readDevState(server.url);
    assert.equal(refreshed.executedRuntimeBuildHash, refreshed.runtimeBuildHash);
  } finally {
    await server.close();
    await rm(runtimeRoot, { force: true, recursive: true });
  }
});

test("should use the dist runtime entry when source is absent from a published package", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "tn-runtime-dist-preview-"));
  await mkdir(resolve(runtimeRoot, "dist/browser"), { recursive: true });
  await writeFile(resolve(runtimeRoot, "index.html"), '<script id="threenative-runtime-entry"></script>\n');
  await writeFile(resolve(runtimeRoot, "dist/browser/main.js"), "globalThis.__runtimeDistribution = true;\n");
  const server = await startWebPreview({
    bundlePath: resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"),
    port: 0,
    runtimeRoot,
    silent: true,
  });
  try {
    const state = await (await fetch(new URL("/__threenative/dev-state.json", server.url))).json() as { runtimeEntry: string };
    const html = await (await fetch(server.url)).text();
    assert.equal(state.runtimeEntry, "dist");
    assert.match(html, /dist\/browser\/main\.js/);
  } finally {
    await server.close();
    await rm(runtimeRoot, { force: true, recursive: true });
  }
});

test("should refuse to start when the explicitly requested port is occupied", async () => {
  const occupied = createServer();
  await new Promise<void>((resolveListen) => occupied.listen(0, "127.0.0.1", resolveListen));
  const address = occupied.address();
  assert.equal(typeof address, "object");
  const requestedPort = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await assert.rejects(
      startWebPreview({ bundlePath: resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"), port: requestedPort, silent: true }),
      (error: unknown) => error instanceof Error && /port/i.test(error.message),
    );
  } finally {
    await new Promise<void>((resolveClose) => occupied.close(() => resolveClose()));
  }
});

test("should serve bundle module scripts with JavaScript content type", () => {
  assert.equal(contentTypeForBundleFile("scripts.bundle.js"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeForBundleFile("overlay/index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeForBundleFile("overlay/assets/inventory.css"), "text/css; charset=utf-8");
  assert.equal(contentTypeForBundleFile("overlay/assets/potion.svg"), "image/svg+xml");
  assert.equal(contentTypeForBundleFile("manifest.json"), "application/json; charset=utf-8");
  assert.equal(contentTypeForBundleFile("assets/hit.wav"), "audio/wav");
});

test("should reject bundle paths outside the bundle root", () => {
  const bundlePath = resolve("/tmp/project/dist/game.bundle");

  assert.equal(resolveBundleFilePath(bundlePath, "/manifest.json?cache=1"), resolve(bundlePath, "manifest.json"));
  assert.equal(resolveBundleFilePath(bundlePath, "//etc/passwd"), null);
  assert.equal(resolveBundleFilePath(bundlePath, "/%2e%2e/secrets.txt"), null);
  assert.equal(resolveBundleFilePath(bundlePath, "/nested/%2e%2e/manifest.json"), resolve(bundlePath, "manifest.json"));
});

async function readDevState(url: string): Promise<{ executedRuntimeBuildHash: string | null; runtimeBuildHash: string }> {
  const response = await fetch(new URL("/__threenative/dev-state.json", url));
  assert.equal(response.ok, true);
  return await response.json() as { executedRuntimeBuildHash: string | null; runtimeBuildHash: string };
}

async function reportExecutedRuntime(url: string, runtimeBuildHash: string): Promise<void> {
  const response = await fetch(new URL("/__threenative/runtime-executed", url), {
    body: JSON.stringify({ runtimeBuildHash }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 204);
}

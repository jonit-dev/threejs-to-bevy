import assert from "node:assert/strict";
import { createServer } from "node:net";
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
    const metadata = await metadataResponse.json() as { bundleHash: string; bundlePath: string; schema: string; sourceBuildStatus: string };
    assert.equal(metadataResponse.ok, true);
    assert.equal(metadata.schema, "threenative.dev-preview-state");
    assert.match(metadata.bundleHash, /^[a-f0-9]{64}$/);
    assert.equal(metadata.bundlePath, resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"));
    assert.equal(metadata.sourceBuildStatus, "current");
  } finally {
    await server.close();
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

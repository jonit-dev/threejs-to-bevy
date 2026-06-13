import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { contentTypeForBundleFile, startWebPreview } from "./devServer.js";

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
  } finally {
    await server.close();
  }
});

test("should serve bundle module scripts with JavaScript content type", () => {
  assert.equal(contentTypeForBundleFile("scripts.bundle.js"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeForBundleFile("manifest.json"), "application/json; charset=utf-8");
  assert.equal(contentTypeForBundleFile("assets/hit.wav"), "audio/wav");
});

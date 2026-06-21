import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogPreviewModel } from "./catalogPreviewModel.js";

test("should build preview cards from bundle catalogs", () => {
  assert.deepEqual(buildCatalogPreviewModel({
    assets: [{ id: "model.kart", kind: "model", path: "assets/kart.glb" }],
    input: [{ id: "Move" }],
    materials: [{ id: "kart" }],
  }).map((row) => [row.kind, row.id]), [
    ["asset", "model.kart"],
    ["input", "Move"],
    ["material", "kart"],
  ]);
});

test("should mark unsupported media preview explicitly", () => {
  const rows = buildCatalogPreviewModel({ assets: [{ id: "stream.radio", path: "https://example.invalid/radio.mp3" }] });

  assert.equal(rows[0]?.diagnostic, "Streaming or remote media preview is unsupported.");
});

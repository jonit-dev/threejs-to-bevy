import assert from "node:assert/strict";
import test from "node:test";

import { emitCatalogGeneratedAssetManifestEntry } from "./emit/catalog-assets.js";

test("should emit generated asset manifest entry when payload is bounded", () => {
  const entry = emitCatalogGeneratedAssetManifestEntry({
    id: "generated.navmesh",
    payload: { vertices: 12, source: "scene.nav" },
    schema: "threenative.generated.navmesh",
  });

  assert.deepEqual(entry, {
    embedded: {
      byteLength: 89,
      data: "eyJwYXlsb2FkIjp7InNvdXJjZSI6InNjZW5lLm5hdiIsInZlcnRpY2VzIjoxMn0sInNjaGVtYSI6InRocmVlbmF0aXZlLmdlbmVyYXRlZC5uYXZtZXNoIn0=",
      encoding: "base64",
      mediaType: "application/json",
    },
    format: "bin",
    id: "generated.navmesh",
    kind: "buffer",
    path: "artifacts/generated/generated.navmesh.json",
    sourceMode: "bundle",
  });
});

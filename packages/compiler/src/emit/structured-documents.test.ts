import assert from "node:assert/strict";
import test from "node:test";
import type { IAuthoringDocument } from "@threenative/authoring";

import {
  readStructuredAssets,
  readStructuredMaterials,
  readStructuredRuntimeConfig,
  readStructuredTargetProfile,
} from "./structured-documents.js";

test("should parse valid structured documents", () => {
  const documents: IAuthoringDocument[] = [
    sourceDocument("material", {
      materials: [
        { id: "mat.panel", color: [0.1, 0.2, 0.3], kind: "extended", opacity: 0.75 },
        { id: "mat.default" },
      ],
    }),
    sourceDocument("asset", {
      assets: [{ id: "tex.logo", path: "assets/logo.png", type: "texture" }],
    }),
    sourceDocument("runtime", {
      time: { fixedDeltaSeconds: 0.02 },
      window: { height: 720, width: 1280 },
    }),
    sourceDocument("target", {
      targets: ["desktop", "web"],
      budgets: { drawCalls: 120 },
    }),
  ];

  assert.deepEqual(readStructuredMaterials(documents), [
    { id: "mat.default", kind: "standard", color: "#ffffff" },
    { id: "mat.panel", kind: "extended", color: [0.1, 0.2, 0.3], opacity: 0.75 },
  ]);
  assert.deepEqual(readStructuredAssets(documents), [
    { format: "png", id: "tex.logo", kind: "texture", path: "assets/logo.png", sourceMode: "bundle" },
  ]);
  assert.deepEqual(readStructuredRuntimeConfig(documents), {
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDeltaSeconds: 0.02 },
    window: { height: 720, width: 1280 },
  });
  assert.deepEqual(readStructuredTargetProfile(documents), {
    schema: "threenative.target-profile",
    version: "0.1.0",
    targets: ["desktop", "web"],
    budgets: { drawCalls: 120 },
  });
});

test("should ignore malformed structured document shapes", () => {
  const documents: IAuthoringDocument[] = [
    sourceDocument("material", { materials: [{ color: "#fff" }, { id: "mat.bad", color: "" }] }),
    sourceDocument("asset", { assets: [{ id: "asset.missing-path", type: "texture" }, { id: "asset.bad-kind", path: "asset.bin", type: "unknown" }] }),
    sourceDocument("runtime", { time: { fixedDeltaSeconds: 0.02 } }),
    sourceDocument("target", { targets: ["console"] }),
  ];

  assert.deepEqual(readStructuredMaterials(documents), [
    { id: "mat.bad", kind: "standard", color: "#ffffff" },
  ]);
  assert.deepEqual(readStructuredAssets(documents), []);
  assert.equal(readStructuredRuntimeConfig(documents), undefined);
  assert.equal(readStructuredTargetProfile(documents), undefined);
});

function sourceDocument(kind: IAuthoringDocument["kind"], data: Record<string, unknown>): IAuthoringDocument {
  return {
    data,
    file: `/project/content/${kind}.json`,
    kind,
    projectRelativePath: `content/${kind}.json`,
  };
}

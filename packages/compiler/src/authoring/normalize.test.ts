import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAuthoringGraph } from "./normalize.js";

test("authoring graph should preserve source paths for modular scene declarations", () => {
  const graph = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      { path: "/project/src/game.ts", source: 'import { arena } from "./scenes/arena.js";\nexport default arena;\n' },
      {
        path: "/project/src/scenes/arena.ts",
        source: 'import { defineScene } from "@threenative/sdk";\nexport const arena = defineScene({ id: "arena", kind: "level" });\n',
      },
    ],
  });

  assert.deepEqual(graph.modules.map((module) => module.path), ["src/game.ts", "src/scenes/arena.ts"]);
  assert.equal(
    graph.declarations.some(
      (declaration) => declaration.kind === "scene" && declaration.id === "arena" && declaration.provenance.source.modulePath === "src/scenes/arena.ts",
    ),
    true,
  );
});

test("authoring graph should diagnose duplicate declaration IDs before IR flattening", () => {
  const graph = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      { path: "/project/src/scenes/a.ts", source: 'import { defineScene } from "@threenative/sdk";\nexport const a = defineScene({ id: "arena", kind: "level" });\n' },
      { path: "/project/src/scenes/b.ts", source: 'import { defineScene } from "@threenative/sdk";\nexport const b = defineScene({ id: "arena", kind: "level" });\n' },
    ],
  });

  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0]?.code, "TN_AUTHORING_DUPLICATE_SCENE_ID");
  assert.equal(graph.diagnostics[0]?.path, "authoring/scene/arena");
  assert.deepEqual(graph.diagnostics[0]?.limit, ["src/scenes/a.ts", "src/scenes/b.ts"]);
});

test("authoring graph should normalize deterministically", () => {
  const first = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      { path: "/project/src/z.ts", source: 'import { Scene } from "@threenative/sdk";\nexport const z = new Scene({ id: "z" });\n' },
      { path: "/project/src/a.ts", source: 'import { Scene } from "@threenative/sdk";\nexport const a = new Scene({ id: "a" });\n' },
    ],
  });
  const second = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      { path: "/project/src/a.ts", source: 'import { Scene } from "@threenative/sdk";\nexport const a = new Scene({ id: "a" });\n' },
      { path: "/project/src/z.ts", source: 'import { Scene } from "@threenative/sdk";\nexport const z = new Scene({ id: "z" });\n' },
    ],
  });

  assert.deepEqual(first, second);
});

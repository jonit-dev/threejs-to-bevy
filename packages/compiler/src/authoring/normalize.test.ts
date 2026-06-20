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

test("authoring graph should capture scene module declarations", () => {
  const graph = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      { path: "/project/src/game.ts", source: 'import { arenaScene } from "./scenes/arena.js";\nexport default arenaScene;\n' },
      {
        path: "/project/src/scenes/arena.ts",
        source: 'import { defineSceneModule } from "@threenative/sdk";\nexport const arenaScene = defineSceneModule({ id: "arena", kind: "level" });\n',
      },
    ],
  });

  assert.equal(
    graph.declarations.some(
      (declaration) => declaration.kind === "scene" && declaration.id === "arena" && declaration.provenance.source.modulePath === "src/scenes/arena.ts",
    ),
    true,
  );
});

test("authoring graph should capture modular entity prefab and resource declarations", () => {
  const graph = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      {
        path: "/project/src/entities/player.ts",
        source: 'import { defineEntity } from "@threenative/sdk";\nexport const player = defineEntity({ id: "player" });\n',
      },
      {
        path: "/project/src/prefabs/kart.ts",
        source: 'import { definePrefabModule } from "@threenative/sdk";\nexport const kart = definePrefabModule({ id: "prefab.kart", prefab: baseKart });\n',
      },
      {
        path: "/project/src/resources/progress.ts",
        source: 'import { defineResourceModule } from "@threenative/sdk";\nexport const progress = defineResourceModule({ id: "Progress", resource: Progress({}) });\n',
      },
    ],
  });

  assert.deepEqual(
    graph.declarations
      .filter((declaration) => declaration.kind === "entity" || declaration.kind === "prefab" || declaration.kind === "resource")
      .map((declaration) => [declaration.kind, declaration.id, declaration.provenance.source.modulePath]),
    [
      ["entity", "player", "src/entities/player.ts"],
      ["prefab", "prefab.kart", "src/prefabs/kart.ts"],
      ["resource", "Progress", "src/resources/progress.ts"],
    ],
  );
});

test("authoring graph should capture modular input ui audio and asset declarations", () => {
  const graph = normalizeAuthoringGraph({
    entryPath: "/project/src/game.ts",
    projectRoot: "/project",
    root: {},
    sources: [
      { path: "/project/src/assets.ts", source: 'export const hud = defineAssetModule({ id: "tex.hud", asset: textureAsset("tex.hud", "assets/hud.png") });\n' },
      { path: "/project/src/audio.ts", source: 'export const audio = defineAudioModule({ id: "audio.arena", audio: defineAudio({}) });\n' },
      { path: "/project/src/input.ts", source: 'export const input = defineInputModule({ id: "input.arena", input: defineInputMap({ actions: [] }) });\n' },
      { path: "/project/src/ui.ts", source: 'export const hud = defineUiModule({ id: "ui.hud", ui: null });\n' },
    ],
  });

  assert.deepEqual(
    graph.declarations
      .filter((declaration) => declaration.kind === "asset" || declaration.kind === "audio" || declaration.kind === "input" || declaration.kind === "ui")
      .map((declaration) => [declaration.kind, declaration.id, declaration.provenance.source.modulePath]),
    [
      ["asset", "tex.hud", "src/assets.ts"],
      ["audio", "audio.arena", "src/audio.ts"],
      ["input", "input.arena", "src/input.ts"],
      ["ui", "ui.hud", "src/ui.ts"],
    ],
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

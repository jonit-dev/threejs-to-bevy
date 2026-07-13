import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildProject } from "./index.js";

test("lowers placement sets to ordinary world entities without mutating source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-placement-set-"));
  try {
    await mkdir(join(root, "content", "prefabs"), { recursive: true });
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await writeFile(join(root, "threenative.config.json"), JSON.stringify({ schema: "threenative.project", version: "0.1.0", entry: "content/scenes/arena.scene.json", outDir: "dist/game.bundle" }));
    await writeFile(join(root, "content", "prefabs", "token.prefab.json"), JSON.stringify({ schema: "threenative.prefab", version: "0.1.0", id: "prefab.token", entities: [{ id: "token.default", components: { Token: { active: true, slot: -1 } } }] }));
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const source = JSON.stringify({
      schema: "threenative.scene", version: "0.1.0", id: "arena",
      placementSets: [{
        id: "tokens", kind: "placement-set", prefab: "prefab.token", idFormat: "token.{column}",
        pattern: { kind: "line", origin: [0, 1, 0], step: [2, 0, 0], count: 2 },
        defaults: { components: { Token: { active: false } } },
        indexBindings: { "components.Token.slot": "column" },
        overrides: { "1": { "components.Token.active": true } },
      }],
    }, null, 2) + "\n";
    await writeFile(scenePath, source);

    const first = await buildProject(root);
    const firstWorld = await readFile(resolve(first.bundlePath, "world.ir.json"), "utf8");
    const second = await buildProject(root);
    const secondWorld = await readFile(resolve(second.bundlePath, "world.ir.json"), "utf8");
    const world = JSON.parse(firstWorld) as { entities: Array<{ components: Record<string, unknown>; id: string }> };

    assert.equal(firstWorld, secondWorld);
    assert.equal(await readFile(scenePath, "utf8"), source);
    const tokens = world.entities.filter((entity) => entity.id.startsWith("token."));
    assert.deepEqual(tokens.map((entity) => entity.id), ["token.0", "token.1"]);
    assert.deepEqual(tokens[0]?.components.Token, { active: false, slot: 0 });
    assert.deepEqual(tokens[1]?.components.Token, { active: true, slot: 1 });
    assert.equal(firstWorld.includes("placementSets"), false);
    assert.equal(firstWorld.includes("placement-set"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

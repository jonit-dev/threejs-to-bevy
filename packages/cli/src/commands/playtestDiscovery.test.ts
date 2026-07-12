import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectWorldGrounding, discoverPlaytestTargets, suggestPlaytestScenario } from "./playtestDiscovery.js";

test("bundle grounding should read authoritative world entity camera and resource surfaces", () => {
  const entities = new Set<string>();
  const cameras = new Set<string>();
  const resources = new Set<string>();
  collectWorldGrounding({ entities: [{ id: "hero", components: {} }, { id: "camera.main", components: { Camera: {} } }], resources: { ChessGame: {} } }, entities, cameras, resources);
  assert.deepEqual([...entities], ["hero", "camera.main"]);
  assert.deepEqual([...cameras], ["camera.main"]);
  assert.deepEqual([...resources], ["ChessGame"]);
});

test("playtest discovery should drop candidates missing from compiled bundle while preserving survivor ranking", async () => {
  const root = await discoveryProject();
  try {
    const report = await discoverPlaytestTargets(root, {
      loadBundleGrounding: async () => ({ ids: new Set(["hero.live", "camera.main"]), text: "keyboard.KeyW" }),
    });
    assert.deepEqual(report.controllableEntities.map(({ id }) => id), ["hero.live", "camera.main"]);
    assert.equal(report.controllableEntities.some(({ id }) => id === "player.deleted"), false);
    assert.deepEqual(report.inputs.map(({ id }) => id), ["KeyW"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("playtest discovery should not verify an entity through a cross-surface id collision", async () => {
  const root = await discoveryProject();
  try {
    const report = await discoverPlaytestTargets(root, {
      loadBundleGrounding: async () => ({
        entityIds: new Set(["hero.live", "camera.main"]),
        resourceIds: new Set(["player.deleted"]),
        text: "keyboard.KeyW",
      }),
    });
    assert.equal(report.controllableEntities.some(({ id }) => id === "player.deleted"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("playtest discovery should mark source candidates unverified when the bundle is unavailable", async () => {
  const root = await discoveryProject();
  try {
    const report = await discoverPlaytestTargets(root, { loadBundleGrounding: async () => { throw new Error("build failed"); } });
    assert.equal(report.controllableEntities.length, 3);
    assert.equal(report.controllableEntities.every(({ unverified }) => unverified === true), true);
    assert.equal([...report.inputs, ...report.cameras, ...report.resources, ...report.hud].every(({ unverified }) => unverified === true), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("playtest suggestions should reject camera preset without a compiled camera", async () => {
  const root = await discoveryProject();
  try {
    const result = await suggestPlaytestScenario(root, "camera-follow", {
      loadBundleGrounding: async () => ({ ids: new Set(["hero.live"]), text: "keyboard.KeyW" }),
    });
    assert.equal("code" in result ? result.code : undefined, "TN_PLAYTEST_SUGGEST_INSUFFICIENT");
    assert.equal("missing" in result && result.missing.includes("camera"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("playtest suggestions should reuse a committed movement threshold for the same subject", async () => {
  const root = await discoveryProject();
  try {
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/existing.playtest.json"), `${JSON.stringify({
      assert: { movement: { axis: "z", entity: "hero.live", minDistance: 0.75, pathLength: 1.25 } },
      name: "existing",
      schemaVersion: 1,
      steps: [{ holdFrames: 10, press: "KeyW", release: true }],
      subject: "hero.live",
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    })}\n`);
    const result = await suggestPlaytestScenario(root, "smoke-movement", {
      loadBundleGrounding: async () => ({ ids: new Set(["hero.live"]), text: "keyboard.KeyW" }),
    });
    assert.equal("assert" in result ? result.assert?.movement?.minDistance : undefined, 0.75);
    assert.equal("assert" in result ? result.assert?.movement?.pathLength : undefined, 1.25);
    assert.equal("steps" in result ? result.steps[0]?.holdFrames : undefined, 10);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("playtest suggestions should return an insufficient diagnostic instead of a player fallback", async () => {
  const root = await discoveryProject();
  try {
    const result = await suggestPlaytestScenario(root, "smoke-movement", {
      loadBundleGrounding: async () => ({ ids: new Set(), text: "" }),
    });
    assert.equal("code" in result ? result.code : undefined, "TN_PLAYTEST_SUGGEST_INSUFFICIENT");
    assert.equal(JSON.stringify(result).includes("player"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function discoveryProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-discovery-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "content/game.json"), `${JSON.stringify({
    bindings: ["keyboard.KeyW", "keyboard.KeyD"],
    entities: [
      { components: { CharacterController: {} }, id: "hero.live", transform: {} },
      { components: {}, id: "player.deleted", transform: {} },
      { components: { Camera: {} }, id: "camera.main", transform: {} },
    ],
  })}\n`);
  return root;
}

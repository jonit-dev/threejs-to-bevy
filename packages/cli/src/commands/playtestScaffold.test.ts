import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { playtestScaffoldCommand } from "./playtestScaffold.js";
import { loadPlaytestScenario } from "./playtestScenario.js";

test("should emit a loader-valid scenario when scaffolding pickup mechanic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-scaffold-"));
  try {
    const result = await playtestScaffoldCommand(
      ["--assert", "pickup", "--project", ".", "--subject", "player", "--resource", "GameState", "--hud", "score-label", "--json"],
      root,
    );
    const payload = JSON.parse(result.stdout) as { scenarioPath: string; scenario: { assert: { hud: Array<{ id: string }>; resources: Array<{ id: string }> }; subject: string } };
    const loaded = await loadPlaytestScenario(root, payload.scenarioPath);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.scenarioPath, "playtests/proof-pickup.playtest.json");
    assert.equal(loaded.name, "proof-pickup");
    assert.equal(loaded.subject, "player");
    assert.equal(loaded.assert?.resources?.[0]?.id, "GameState");
    assert.equal(loaded.assert?.hud?.[0]?.id, "score-label");
    assert.equal(loaded.assert?.movement?.entity, "player");
    assert.equal(loaded.assert?.contacts, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown mechanic with fix guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-scaffold-"));
  try {
    const result = await playtestScaffoldCommand(["--assert", "boss-fight", "--project", ".", "--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; fix: { instruction: string }; supportedMechanics: string[] };

    assert.equal(result.exitCode, 2);
    assert.equal(payload.code, "TN_PLAYTEST_SCAFFOLD_ASSERTION_UNKNOWN");
    assert.match(payload.fix.instruction, /movement, pickup, win-state, retry/);
    assert.deepEqual(payload.supportedMechanics, ["movement", "pickup", "win-state", "retry"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should discover real subject, pickup, HUD, and resource ids from a project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-scaffold-discovery-"));
  try {
    await mkdir(join(root, "content", "scenes"), { recursive: true });
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), `${JSON.stringify({
      schema: "threenative.scene",
      version: "0.1.0",
      id: "arena",
      entities: [{ id: "arena.floor" }, { id: "plan.hero", components: { CharacterController: { speed: 4 } } }, { id: "player", components: { CharacterController: { speed: 4 } } }],
      instances: [{ id: "orb.01", tags: ["orb"], components: { Collider: { kind: "sphere", trigger: true } }, transform: { position: [2, 0.5, 0] } }],
      resources: [{ id: "FollowCamera" }, { id: "Orbs", value: { collected: 0 } }],
      systems: [],
      ui: { nodes: [{ id: "countdown", text: "Ready" }, { id: "hud.orbs", text: "Orbs 0/8" }], bindings: [] },
    }, null, 2)}\n`);

    const result = await playtestScaffoldCommand(["--assert", "pickup", "--project", ".", "--json"], root);
    const payload = JSON.parse(result.stdout) as { scenario: { assert: { contacts?: Array<{ with?: string }>; hud: Array<{ id: string }>; resources: Array<{ id: string }> }; setup?: { entities: Array<{ position: number[] }> }; subject?: string } };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.scenario.subject, "player");
    assert.equal(payload.scenario.assert.resources[0]?.id, "Orbs");
    assert.equal(payload.scenario.assert.hud[0]?.id, "hud.orbs");
    assert.equal(payload.scenario.assert.contacts, undefined);
    assert.deepEqual(payload.scenario.setup?.entities[0]?.position, [0, 0.5, 0]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should generate one scenario per plan acceptance assertion", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-plan-"));
  try {
    await writeSpatialPlanFixture(root);
    const result = await playtestScaffoldCommand(["--from-plan", "artifacts/game-production/plan.json", "--project", ".", "--json"], root);
    const payload = JSON.parse(result.stdout) as { acceptanceIds: string[]; filesWritten: string[]; scenarios: Array<{ acceptanceId: string }> };

    assert.equal(result.exitCode, 0, result.stdout);
    assert.deepEqual(payload.acceptanceIds, ["webgl-canvas", "grid-movement", "crate-push", "goal-progress", "retry-path"]);
    assert.equal(payload.filesWritten.length, 5);
    assert.deepEqual(payload.scenarios.map((scenario) => scenario.acceptanceId), payload.acceptanceIds);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should use real project ids and transition assertions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-plan-ids-"));
  try {
    await writeSpatialPlanFixture(root);
    const result = await playtestScaffoldCommand(["--from-plan", "artifacts/game-production/plan.json", "--project", ".", "--json"], root);
    const canvas = await loadPlaytestScenario(root, "playtests/acceptance-webgl-canvas.playtest.json");
    const blocked = await loadPlaytestScenario(root, "playtests/acceptance-grid-movement.playtest.json");
    const push = await loadPlaytestScenario(root, "playtests/acceptance-crate-push.playtest.json");
    const progress = await loadPlaytestScenario(root, "playtests/acceptance-goal-progress.playtest.json");
    const retry = await loadPlaytestScenario(root, "playtests/acceptance-retry-path.playtest.json");

    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(canvas.assert?.visual?.[0]?.region?.minNonblankPixelRatio, 0.01);
    assert.equal(blocked.subject, "hero.live");
    assert.equal(blocked.assert?.movement?.minDistance, 0.9);
    assert.equal(blocked.assert?.movement?.maxDistance, 1.1);
    assert.deepEqual(blocked.setup?.entities?.[0]?.position, [3, 0.35, 0]);
    assert.equal(blocked.steps[0]?.press, "ArrowRight");
    assert.equal(blocked.steps.length, 2);
    assert.equal(push.subject, "crate.live");
    assert.equal(push.assert?.movement?.minDistance, 0.5);
    assert.deepEqual(push.assert?.tags, [{ gte: 2, tag: "pushable" }]);
    assert.equal(progress.assert?.resources?.[0]?.id, "ObjectiveLive");
    assert.equal(progress.assert?.resources?.[0]?.changed, true);
    assert.equal(progress.assert?.resources?.[0]?.gte, 2);
    assert.equal(progress.assert?.resources?.[1]?.equals, true);
    assert.equal(progress.assert?.hud?.[0]?.id, "hud.live-progress");
    assert.equal(retry.steps.at(-1)?.press, "KeyR");
    assert.equal(retry.assert?.resources?.some((assertion) => assertion.path === "won" && assertion.equals === false), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should scaffold interaction state changes from a plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-plan-unsupported-"));
  try {
    await writeSpatialPlanFixture(root, true);
    const result = await playtestScaffoldCommand(["--from-plan", "artifacts/game-production/plan.json", "--project", ".", "--json"], root);
    const payload = JSON.parse(result.stdout) as { code: string; filesWritten: string[] };
    const playtests = await readdir(join(root, "playtests")).catch(() => []);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_PLAYTEST_PLAN_SCAFFOLD_WRITTEN");
    assert.equal(payload.filesWritten.some((path) => path.endsWith("acceptance-enemy-turn.playtest.json")), true);
    assert.equal(playtests.some((path) => path === "acceptance-enemy-turn.playtest.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeSpatialPlanFixture(root: string, unsupported = false): Promise<void> {
  const write = async (path: string, value: unknown) => {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  await write("content/scenes/arena.scene.json", {
    entities: [
      { id: "hero.live", transform: { position: [0, 0.35, 0] } },
      { id: "crate.live", prefab: "prefab.spatial-crate", tags: ["pushable"], transform: { position: [1, 0.35, 0] } },
      { id: "crate.second", prefab: "prefab.spatial-crate", tags: ["pushable"], transform: { position: [1, 0.35, 1] } },
      { id: "target.live", tags: ["occupancy-target"], transform: { position: [2, 0.04, 0] } },
      { id: "target.second", tags: ["occupancy-target"], transform: { position: [2, 0.04, 1] } },
    ],
    id: "arena",
    resources: [
      { id: "SpatialGrid", value: { actor: "hero.live", actorStart: [0, 0.35, 0], boundsMaxX: 4, step: 1 } },
      { id: "ObjectiveLive", value: { progress: 0, targetCount: 2, won: false } },
    ],
    schema: "threenative.scene",
    version: "0.1.0",
  });
  await write("content/input/arena.input.json", { actions: [{ bindings: ["keyboard.ArrowRight"], id: "grid-right" }, { bindings: ["keyboard.KeyR"], id: "retry" }], id: "arena-input", schema: "threenative.input", version: "0.1.0" });
  await write("content/ui/hud.ui.json", { bindings: [{ node: "hud.live-progress", resource: "ObjectiveLive.progress" }], id: "hud", nodes: [{ id: "hud.live-progress", text: "Targets 0", type: "text" }], schema: "threenative.ui", version: "0.1.0" });
  const acceptanceAssertions = [
    ["webgl-canvas", "progress", "canvas-render"],
    ["grid-movement", "movement", "blocked-movement"],
    ["crate-push", "interaction", "push-only"],
    ["goal-progress", "progress", "objective-progress"],
    ["retry-path", "retry", "retry"],
  ].map(([id, kind, family]) => ({ description: id, id, kind, proof: { family, templateId: `acceptance-${id}` }, required: true }));
  if (unsupported) acceptanceAssertions.push({ description: "enemy turn", id: "enemy-turn", kind: "interaction", proof: { family: "state-change", templateId: "acceptance-enemy-turn" }, required: true });
  await write("artifacts/game-production/plan.json", { intentContract: { acceptanceAssertions } });
  await mkdir(join(root, "playtests"), { recursive: true });
  assert.equal((await readFile(join(root, "artifacts/game-production/plan.json"), "utf8")).length > 0, true);
}

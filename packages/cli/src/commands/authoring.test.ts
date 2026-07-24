import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { AUTHORING_BATCH_INPUT_MAX_BYTES, AUTHORING_BATCH_STDOUT_MAX_BYTES, AUTHORING_INSPECT_STDOUT_MAX_BYTES, authoringCommand } from "./authoring.js";

test("authoring command inspects and validates structured source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-command-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(
      join(root, "content/scenes/arena.scene.json"),
      `${JSON.stringify(
        {
          schema: "threenative.scene",
          version: "0.1.0",
          id: "arena",
          entities: [],
          prefabs: [],
          resources: [],
          systems: [],
          ui: { nodes: [], bindings: [] },
        },
        null,
        2,
      )}\n`,
    );

    const inspect = await authoringCommand(["inspect", "--project", root, "--json"]);
    const inspectPayload = JSON.parse(inspect.stdout) as {
      code: string;
      documents: Array<{ kind: string; path: string }>;
      projectMap: { documents: Array<{ id?: string; ids: Record<string, string[]>; responsibility: string }> };
    };
    assert.equal(inspect.exitCode, 0);
    assert.equal(inspectPayload.code, "TN_AUTHORING_INSPECT_OK");
    assert.deepEqual(inspectPayload.documents, [{ kind: "scene", path: "content/scenes/arena.scene.json" }]);
    assert.equal(inspectPayload.projectMap.documents[0]?.id, "arena");
    assert.deepEqual(inspectPayload.projectMap.documents[0]?.ids.entities, []);
    assert.match(inspectPayload.projectMap.documents[0]?.responsibility ?? "", /scene entities/);

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const validatePayload = JSON.parse(validate.stdout) as { code: string; next: string; notice: string; ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validatePayload.code, "TN_AUTHORING_VALIDATE_OK");
    assert.equal(validatePayload.next, "tn iterate --project . --json");
    assert.match(validatePayload.notice, /Standalone authoring validation is subsumed/);
    assert.equal(validatePayload.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect only source relevant to the supplied plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-plan-inspect-"));
  try {
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "content/input"), { recursive: true });
    await mkdir(join(root, "content/systems"), { recursive: true });
    await mkdir(join(root, "content/ui"), { recursive: true });
    await mkdir(join(root, "content/audio"), { recursive: true });
    await mkdir(join(root, "content/runtime"), { recursive: true });
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      entities: [{ id: "player" }, { id: "crate.01" }],
      id: "arena",
      resources: [{ id: "GridState" }],
      schema: "threenative.scene",
    })}\n`);
    await writeFile(join(root, "content/input/game.input.json"), `${JSON.stringify({
      actions: [{ bindings: ["keyboard.ArrowUp"], id: "move-up" }, { bindings: ["keyboard.KeyR"], id: "retry" }],
      id: "game-input",
      schema: "threenative.input",
    })}\n`);
    await writeFile(join(root, "content/systems/game.systems.json"), `${JSON.stringify({
      id: "game-systems",
      schema: "threenative.systems",
      systems: [{ id: "grid-loop", script: { export: "updateGrid", module: "src/scripts/grid.ts" } }],
    })}\n`);
    await writeFile(join(root, "content/ui/game.ui.json"), `${JSON.stringify({ id: "game-ui", nodes: [{ id: "progress" }], schema: "threenative.ui" })}\n`);
    await writeFile(join(root, "content/audio/unrelated.audio.json"), `${JSON.stringify({ id: "audio", schema: "threenative.audio" })}\n`);
    await writeFile(join(root, "content/runtime/physics.runtime.json"), `${JSON.stringify({ id: "physics", schema: "threenative.runtime-config" })}\n`);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      coveredResponsibilityIds: [],
      intentContract: {
        acceptanceAssertions: [
          { description: "Render the game.", id: "webgl-canvas", kind: "progress", proof: { family: "canvas-render", templateId: "acceptance-webgl-canvas" }, required: true },
          { description: "Move once.", id: "grid-movement", kind: "movement", proof: { family: "blocked-movement", templateId: "acceptance-grid-movement" }, required: true },
          { description: "Push only.", id: "crate-push", kind: "interaction", proof: { family: "push-only", templateId: "acceptance-crate-push" }, required: true },
          { description: "Reach a goal.", id: "goal-progress", kind: "progress", proof: { family: "objective-progress", templateId: "acceptance-goal-progress" }, required: true },
          { description: "Retry.", id: "retry-path", kind: "retry", proof: { family: "retry", templateId: "acceptance-retry-path" }, required: true },
        ],
        id: "intent.grid-push",
        requiredCapabilities: ["move.grid", "interaction.push", "objective.occupancy", "state.retry"],
      },
      schema: "threenative.game-plan",
      uncoveredResponsibilityIds: ["move.grid", "interaction.push", "objective.occupancy", "state.retry"],
    })}\n`);
    await writeFile(join(root, "playtests/existing-grid.playtest.json"), `${JSON.stringify({ acceptanceId: "grid-movement", name: "existing-grid", schemaVersion: 1, steps: [], target: "web", viewport: { height: 720, width: 1280 }, warmupFrames: 1 })}\n`);
    await writeFile(join(root, "playtests/unrelated.playtest.json"), `${JSON.stringify({ acceptanceId: "unrelated-smoke", name: "unrelated", schemaVersion: 1, steps: [], target: "web", viewport: { height: 720, width: 1280 }, warmupFrames: 1 })}\n`);

    const result = await authoringCommand([
      "inspect", "--project", root, "--plan", "artifacts/game-production/plan.json", "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      documents: Array<{ kind: string; path: string }>;
      intent: { acceptanceIds: string[]; id: string; uncoveredResponsibilityIds: string[] };
      mechanicCandidates: string[];
      portableBehavior: { conventionalApis: { discreteInput: string[] }; rules: Array<{ id: string; instruction: string }> };
      projectMap: { documents: Array<{ ids: Record<string, string[]>; kind: string }> };
      proofGaps: Array<{ id: string }>;
      proofEnrollment: { enrolledAcceptanceIds: string[]; missingAcceptanceIds: string[]; unrelatedAcceptanceIds: string[] };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.intent.id, "intent.grid-push");
    assert.deepEqual(payload.intent.acceptanceIds, ["webgl-canvas", "grid-movement", "crate-push", "goal-progress", "retry-path"]);
    assert.equal(payload.documents.some((item) => item.kind === "audio" || item.kind === "runtime"), false);
    assert.equal(payload.documents.some((item) => item.path.endsWith("arena.scene.json")), true);
    assert.deepEqual(payload.projectMap.documents.find((item) => item.kind === "input")?.ids.input, ["move-up", "retry"]);
    assert.deepEqual(payload.portableBehavior.conventionalApis.discreteInput, ["pressed", "released"]);
    assert.equal(payload.portableBehavior.rules.some((item) => item.id === "self-contained-export" && item.instruction.includes("self-contained")), true);
    assert.deepEqual(payload.mechanicCandidates, []);
    assert.deepEqual(payload.proofEnrollment, {
      enrolledAcceptanceIds: ["grid-movement"],
      missingAcceptanceIds: ["webgl-canvas", "crate-push", "goal-progress", "retry-path"],
      unrelatedAcceptanceIds: ["unrelated-smoke"],
    });
    assert.deepEqual(payload.proofGaps.map((item) => item.id), ["webgl-canvas", "crate-push", "goal-progress", "retry-path"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose and apply a plan-derived holdout prototype with exact proof enrollment", async () => {
  for (const fixture of [
    {
      acceptanceIds: ["webgl-canvas", "defender-input", "wave-progression", "base-failure", "retry-path"],
      intentId: "intent.wave-defense",
      prototypeId: "continuous-arena-pooled-pressure",
    },
    {
      acceptanceIds: ["webgl-canvas", "unit-selection-movement", "enemy-turn", "objective-outcomes", "retry-path"],
      intentId: "intent.turn-based-tactics",
      prototypeId: "alternating-grid-single-pursuit",
    },
  ]) {
    const root = await mkdtemp(join(tmpdir(), `tn-authoring-prototype-${fixture.prototypeId}-`));
    try {
      await mkdir(join(root, "artifacts/game-production"), { recursive: true });
      await mkdir(join(root, "playtests"), { recursive: true });
      const starterSmoke = await readFile(new URL("../template-files/structured-source-starter/playtests/smoke-movement.playtest.json", import.meta.url));
      await writeFile(
        join(root, "playtests/smoke-movement.playtest.json"),
        starterSmoke,
      );
      await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
        authoringMode: "custom-on-starter",
        coveredResponsibilityIds: [],
        intentContract: {
          acceptanceAssertions: fixture.acceptanceIds.map((id) => ({ description: id, id, kind: id === "retry-path" ? "retry" : "progress", required: true })),
          id: fixture.intentId,
          prototype: {
            id: fixture.prototypeId,
            proofRoles: Object.fromEntries(fixture.acceptanceIds.map((id, index) => [id, id === "webgl-canvas" ? "canvas" : id === "retry-path" ? "retry" : index === 1 ? "primary-input" : index === 2 ? (fixture.prototypeId.startsWith("alternating") ? "opponent-turn" : "progression") : (fixture.prototypeId.startsWith("alternating") ? "objective-outcomes" : "failure")])),
          },
          requiredCapabilities: [],
        },
        schema: "threenative.game-plan",
        uncoveredResponsibilityIds: [],
      }, null, 2)}\n`);

      const inspect = await authoringCommand(["inspect", "--project", root, "--plan", "artifacts/game-production/plan.json", "--json"]);
      const inspectPayload = JSON.parse(inspect.stdout) as { nextAuthoringCommand?: string };
      assert.equal(inspectPayload.nextAuthoringCommand, "tn authoring prototype --from-plan artifacts/game-production/plan.json --project . --run-proof --json");

      const result = await authoringCommand(["prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--json"]);
      const payload = JSON.parse(result.stdout) as {
        code: string;
        filesWritten: string[];
        nextProofCommand: string;
        proofEnrollment: { enrolledAcceptanceIds: string[]; missingAcceptanceIds: string[]; requiredAcceptanceIds: string[] };
      };
      assert.equal(result.exitCode, 0, result.stdout);
      assert.equal(payload.code, "TN_AUTHORING_PROTOTYPE_WRITTEN");
      assert.deepEqual(payload.proofEnrollment, {
        enrolledAcceptanceIds: fixture.acceptanceIds,
        missingAcceptanceIds: [],
        requiredAcceptanceIds: fixture.acceptanceIds,
      });
      assert.equal(payload.filesWritten.includes("src/scripts/prototype.ts"), true);
      assert.equal(payload.filesWritten.filter((path) => path.startsWith("playtests/acceptance-")).length, fixture.acceptanceIds.length);
      assert.equal(payload.nextProofCommand, "tn iterate --project . --json");
      await assert.rejects(readFile(join(root, "playtests/smoke-movement.playtest.json")), /ENOENT/u);

      if (fixture.prototypeId === "continuous-arena-pooled-pressure") {
        const input = JSON.parse(await readFile(join(root, "content/input/prototype.input.json"), "utf8")) as { actions: Array<{ bindings: string[]; id: string }> };
        const primary = JSON.parse(await readFile(join(root, "playtests/acceptance-defender-input.playtest.json"), "utf8")) as { assert: { resources: Array<{ path?: string }> }; steps: Array<{ press?: string }> };
        const progression = JSON.parse(await readFile(join(root, "playtests/acceptance-wave-progression.playtest.json"), "utf8")) as { assert: { resources: Array<{ path?: string }> }; steps: Array<{ press?: string }> };
        const script = await readFile(join(root, "src/scripts/prototype.ts"), "utf8");
        assert.deepEqual(input.actions.filter((action) => action.id.startsWith("attack-")).map((action) => action.bindings[0]), ["keyboard.Space", "pointer.0"]);
        assert.deepEqual(input.actions.find((action) => action.id === "retry")?.bindings, ["keyboard.KeyR"]);
        assert.equal(primary.steps.some((step) => step.press === "pointer.0"), true);
        assert.deepEqual(progression.assert.resources.map((assertion) => assertion.path), ["wave", "difficulty", "targetsRequired"]);
        assert.equal(progression.steps[0]?.press, "KeyR");
        assert.match(script, /pointerAttackCount/u);
        assert.match(script, /baseHealth - 100/u);
        assert.match(script, /difficulty - 1/u);
      } else {
        const input = JSON.parse(await readFile(join(root, "content/input/prototype.input.json"), "utf8")) as { actions: Array<{ bindings: string[]; id: string }> };
        const primary = JSON.parse(await readFile(join(root, "playtests/acceptance-unit-selection-movement.playtest.json"), "utf8")) as { steps: Array<{ press?: string }> };
        assert.deepEqual(input.actions.find((action) => action.id === "retry")?.bindings, ["keyboard.KeyR"]);
        assert.equal(primary.steps.some((step) => step.press === "pointer.0"), true);
        for (const acceptanceId of fixture.acceptanceIds.filter((id) => id !== "webgl-canvas")) {
          const scenario = JSON.parse(await readFile(join(root, `playtests/acceptance-${acceptanceId}.playtest.json`), "utf8")) as { steps: Array<{ press?: string }> };
          assert.equal(scenario.steps[0]?.press, "KeyR", `${acceptanceId} must reset shared preview state before acting`);
        }
      }

      const validate = await authoringCommand(["validate", "--project", root, "--json"]);
      assert.equal(validate.exitCode, 0, validate.stdout);
      const check = await authoringCommand(["script", "check", "--module", "src/scripts/prototype.ts", "--project", root, "--json"]);
      assert.equal(check.exitCode, 0, check.stdout);
      await access(join(root, ".threenative/authoring/prototypes", `${fixture.prototypeId}.provenance.json`));
      const remove = await authoringCommand(["prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--remove", "--json"]);
      assert.equal(remove.exitCode, 0, remove.stdout);
      await assert.rejects(readFile(join(root, "src/scripts/prototype.ts")), /ENOENT/u);
      await assert.rejects(readFile(join(root, ".threenative/authoring/prototypes", `${fixture.prototypeId}.provenance.json`)), /ENOENT/u);
      assert.deepEqual(await readFile(join(root, "playtests/smoke-movement.playtest.json")), starterSmoke);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("authoring prototype recognizes every maintained untouched starter", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-racing-starter-"));
  try {
    await cp(new URL("../template-files/racing-kit-rally-starter/", import.meta.url), root, { recursive: true });
    const configPath = join(root, "threenative.config.json");
    const normalizedConfig = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    await writeFile(configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`);
    const originalConfig = await readFile(join(root, "threenative.config.json"));
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      authoringMode: "custom-on-starter",
      intentContract: {
        acceptanceAssertions: [
          { description: "render", id: "webgl-canvas", kind: "progress", required: true },
          { description: "input", id: "defender-input", kind: "interaction", required: true },
        ],
        id: "intent.wave-defense",
        prototype: {
          id: "continuous-arena-pooled-pressure",
          proofRoles: { "defender-input": "primary-input", "webgl-canvas": "canvas" },
        },
        requiredCapabilities: [],
      },
      schema: "threenative.game-plan",
    }, null, 2)}\n`);

    const result = await authoringCommand([
      "prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--json",
    ]);
    const payload = JSON.parse(result.stdout) as { code: string; replacementPlan?: unknown };
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.code, "TN_AUTHORING_PROTOTYPE_WRITTEN");
    assert.equal(payload.replacementPlan, undefined);
    assert.equal(
      (JSON.parse(await readFile(join(root, "threenative.config.json"), "utf8")) as { entry: string }).entry,
      "content/scenes/arena.scene.json",
    );
    await assert.rejects(readFile(join(root, "content/systems/rally.systems.json")), /ENOENT/u);
    await assert.rejects(readFile(join(root, "src/scripts/racing.ts")), /ENOENT/u);

    const remove = await authoringCommand([
      "prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--remove", "--json",
    ]);
    assert.equal(remove.exitCode, 0, remove.stdout);
    assert.deepEqual(await readFile(join(root, "threenative.config.json")), originalConfig);
    await access(join(root, "content/systems/rally.systems.json"));
    await access(join(root, "src/scripts/racing.ts"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring prototype rejects unsupported or non-custom plans without mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-prototype-reject-"));
  try {
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      authoringMode: "bounded-match",
      coveredResponsibilityIds: [],
      intentContract: { acceptanceAssertions: [], id: "intent.grid-push", requiredCapabilities: [] },
      schema: "threenative.game-plan",
      uncoveredResponsibilityIds: [],
    })}\n`);

    const before = await readdir(root);
    const result = await authoringCommand(["prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_AUTHORING_PROTOTYPE_UNSUPPORTED");
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring prototype stages authored collisions and requires the exact reviewed plan and targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-prototype-collision-"));
  try {
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "content/scenes"), { recursive: true });
    const authoredScene = `${JSON.stringify({ entities: [{ id: "authored.hero" }], id: "arena", schema: "threenative.scene" }, null, 2)}\n`;
    await writeFile(join(root, "content/scenes/arena.scene.json"), authoredScene);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      authoringMode: "custom-on-starter",
      intentContract: {
        acceptanceAssertions: [{ description: "render", id: "webgl-canvas", kind: "progress", required: true }],
        id: "intent.wave-defense",
        prototype: { id: "continuous-arena-pooled-pressure", proofRoles: { "webgl-canvas": "canvas" } },
        requiredCapabilities: [],
      },
      schema: "threenative.game-plan",
    }, null, 2)}\n`);

    const staged = await authoringCommand(["prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--json"]);
    const stagedPayload = JSON.parse(staged.stdout) as {
      code: string;
      replacementPlan: { nextCommand: string; planHash: string; requiredReplaceTargets: string[] };
    };
    assert.equal(staged.exitCode, 1);
    assert.equal(stagedPayload.code, "TN_AUTHORING_PROTOTYPE_COLLISION");
    assert.deepEqual(stagedPayload.replacementPlan.requiredReplaceTargets, ["content/scenes/arena.scene.json"]);
    assert.match(stagedPayload.replacementPlan.nextCommand, /--reviewed-plan-hash [a-f0-9]{64}/u);
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), authoredScene);
    await assert.rejects(access(join(root, "content/input/prototype.input.json")), /ENOENT/u);

    const wrongTarget = await authoringCommand([
      "prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root,
      "--reviewed-plan-hash", stagedPayload.replacementPlan.planHash,
      "--replace-target", "content/scenes/not-arena.scene.json", "--json",
    ]);
    assert.equal(wrongTarget.exitCode, 1);
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), authoredScene);

    const applied = await authoringCommand([
      "prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root,
      "--reviewed-plan-hash", stagedPayload.replacementPlan.planHash,
      "--replace-target", "content/scenes/arena.scene.json", "--json",
    ]);
    assert.equal(applied.exitCode, 0, applied.stdout);
    assert.notEqual(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), authoredScene);

    const removed = await authoringCommand([
      "prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--remove", "--json",
    ]);
    assert.equal(removed.exitCode, 0, removed.stdout);
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), authoredScene);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring prototype blocks authored projects whose owners are outside its transaction", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-prototype-project-collision-"));
  try {
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "content/scenes"), { recursive: true });
    const authoredPath = join(root, "content/scenes/battle.scene.json");
    const authoredScene = `${JSON.stringify({ entities: [{ id: "battle.hero" }], id: "battle", schema: "threenative.scene" }, null, 2)}\n`;
    await writeFile(authoredPath, authoredScene);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      authoringMode: "custom-on-starter",
      intentContract: {
        acceptanceAssertions: [{ description: "render", id: "webgl-canvas", kind: "progress", required: true }],
        id: "intent.wave-defense",
        prototype: { id: "continuous-arena-pooled-pressure", proofRoles: { "webgl-canvas": "canvas" } },
        requiredCapabilities: [],
      },
      schema: "threenative.game-plan",
    }, null, 2)}\n`);

    const result = await authoringCommand([
      "prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      filesWritten: string[];
      replacementPlan: { blockingAuthoredPaths: string[]; nextCommand?: string };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_AUTHORING_PROTOTYPE_COLLISION");
    assert.deepEqual(payload.filesWritten, []);
    assert.deepEqual(payload.replacementPlan.blockingAuthoredPaths, ["content/scenes/battle.scene.json"]);
    assert.equal(payload.replacementPlan.nextCommand, undefined);
    assert.equal(await readFile(authoredPath, "utf8"), authoredScene);
    await assert.rejects(access(join(root, "content/scenes/arena.scene.json")), /ENOENT/u);
    await assert.rejects(access(join(root, "src/scripts/prototype.ts")), /ENOENT/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring prototype restores every preimage when its owned proof fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-prototype-proof-rollback-"));
  try {
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "playtests"), { recursive: true });
    const starterScene = await readFile(new URL("../template-files/structured-source-starter/content/scenes/arena.scene.json", import.meta.url));
    const starterScenario = await readFile(new URL("../template-files/structured-source-starter/playtests/smoke-movement.playtest.json", import.meta.url));
    await writeFile(join(root, "content/scenes/arena.scene.json"), starterScene);
    await writeFile(join(root, "playtests/smoke-movement.playtest.json"), starterScenario);
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      authoringMode: "custom-on-starter",
      intentContract: {
        acceptanceAssertions: [{ description: "render", id: "webgl-canvas", kind: "progress", required: true }],
        id: "intent.wave-defense",
        prototype: { id: "continuous-arena-pooled-pressure", proofRoles: { "webgl-canvas": "canvas" } },
        requiredCapabilities: [],
      },
      schema: "threenative.game-plan",
    }, null, 2)}\n`);

    const result = await authoringCommand(
      ["prototype", "--from-plan", "artifacts/game-production/plan.json", "--project", root, "--run-proof", "--json"],
      { runPrototypeProof: async () => ({ exitCode: 1, stdout: `${JSON.stringify({ code: "TN_ITERATE_FAILED" })}\n` }) },
    );
    const payload = JSON.parse(result.stdout) as { code: string; rolledBack: boolean };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_AUTHORING_PROTOTYPE_PROOF_FAILED");
    assert.equal(payload.rolledBack, true);
    assert.deepEqual(await readFile(join(root, "content/scenes/arena.scene.json")), starterScene);
    assert.deepEqual(await readFile(join(root, "playtests/smoke-movement.playtest.json")), starterScenario);
    await assert.rejects(access(join(root, "src/scripts/prototype.ts")), /ENOENT/u);
    await assert.rejects(access(join(root, ".threenative/authoring/prototypes/continuous-arena-pooled-pressure.provenance.json")), /ENOENT/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep default inspection output under 16 KiB", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-inspect-budget-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      entities: Array.from({ length: 2_000 }, (_, index) => ({ id: `entity.${index}` })),
      id: "arena",
      schema: "threenative.scene",
    })}\n`);

    const result = await authoringCommand(["inspect", "--project", root, "--json"]);

    const payload = JSON.parse(result.stdout) as { detailsArtifactPath?: string; outputTruncated?: boolean };
    assert.equal(result.exitCode, 0);
    assert.equal(Buffer.byteLength(result.stdout, "utf8") <= AUTHORING_INSPECT_STDOUT_MAX_BYTES, true);
    assert.equal(payload.outputTruncated, true);
    assert.equal(payload.detailsArtifactPath, "artifacts/authoring/inspection-details.json");
    await access(join(root, "artifacts/authoring/inspection-details.json"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring inspect rejects plans outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-inspect-path-"));
  try {
    const result = await authoringCommand(["inspect", "--project", root, "--plan", "../plan.json", "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_AUTHORING_INSPECT_PLAN_PATH_INVALID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should scaffold a bundler-legal self-contained behavior from project IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-script-scaffold-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "content/input"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      entities: [{ id: "player.actual" }],
      id: "arena",
      resources: [{ id: "GameState" }],
      schema: "threenative.scene",
    })}\n`);
    await writeFile(join(root, "content/input/game.input.json"), `${JSON.stringify({
      actions: [{ bindings: ["keyboard.KeyR"], id: "retry.actual" }],
      axes: [{ id: "MoveX" }],
      id: "game-input",
      schema: "threenative.input",
    })}\n`);

    const scaffold = await authoringCommand([
      "script", "scaffold", "--module", "src/scripts/grid.ts", "--export", "updateGrid", "--project", root, "--json",
    ]);
    const scaffoldPayload = JSON.parse(scaffold.stdout) as { code: string; ids: { entityId: string; inputId: string; resourceId: string } };
    const source = await readFile(join(root, "src/scripts/grid.ts"), "utf8");
    const check = await authoringCommand([
      "script", "check", "--module", "src/scripts/grid.ts", "--export", "updateGrid", "--project", root, "--json",
    ]);
    const checkPayload = JSON.parse(check.stdout) as { code: string; diagnostics: unknown[]; ok: boolean };

    assert.equal(scaffold.exitCode, 0);
    assert.equal(scaffoldPayload.code, "TN_AUTHORING_SCRIPT_SCAFFOLDED");
    assert.deepEqual(scaffoldPayload.ids, { entityId: "player.actual", inputId: "retry.actual", resourceId: "GameState" });
    assert.match(source, /input\.pressed\("retry\.actual"\)/);
    assert.match(source, /entity\("player\.actual"\)/);
    assert.match(source, /resourceReads: \["GameState"\]/);
    assert.equal(check.exitCode, 0, check.stdout);
    assert.equal(checkPayload.code, "TN_AUTHORING_SCRIPT_CHECK_OK");
    assert.equal(checkPayload.ok, true);
    assert.deepEqual(checkPayload.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("script scaffold never implicitly applies a plan-derived prototype", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-script-no-prototype-"));
  try {
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await mkdir(join(root, "content/input"), { recursive: true });
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "artifacts/game-production/plan.json"), `${JSON.stringify({
      authoringMode: "custom-on-starter",
      intentContract: {
        acceptanceAssertions: [{ description: "Render.", id: "webgl-canvas", kind: "progress", required: true }],
        id: "intent.wave-defense",
        prototype: { id: "continuous-arena-pooled-pressure", proofRoles: { "webgl-canvas": "canvas" } },
      },
      schema: "threenative.game-plan",
    })}\n`);
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      entities: [{ id: "player.actual" }],
      id: "arena",
      resources: [{ id: "GameState" }],
      schema: "threenative.scene",
    })}\n`);
    await writeFile(join(root, "content/input/game.input.json"), `${JSON.stringify({
      actions: [{ bindings: ["keyboard.KeyR"], id: "retry.actual" }],
      id: "game-input",
      schema: "threenative.input",
    })}\n`);

    const result = await authoringCommand(["script", "scaffold", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_AUTHORING_SCRIPT_SCAFFOLDED");
    await access(join(root, "src/scripts/customBehavior.ts"));
    await assert.rejects(access(join(root, "src/scripts/prototype.ts")), /ENOENT/u);
    await assert.rejects(access(join(root, ".threenative/authoring/prototypes/continuous-arena-pooled-pressure.provenance.json")), /ENOENT/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring script check reports every static failure in one response", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-script-check-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/broken.ts"), `let moves = 0;
const helper = () => moves + 1;
export function updateBroken(context: import("@threenative/script-stdlib").ScriptContext): void {
  document.title = "broken";
  moves = helper();
  const state = context.resources.get("GameState", { moves: 0 });
  context.resources.patch("GameState", { moves: state.moves + 1 });
}
`);

    const result = await authoringCommand([
      "script", "check", "--module", "src/scripts/broken.ts", "--export", "updateBroken", "--project", root, "--json",
    ]);
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; fix?: { snippet?: string } }>; ok: boolean };
    const codes = payload.diagnostics.map((item) => item.code);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(codes.includes("TN_SCRIPT_MODULE_STATE_UNSUPPORTED"), true);
    assert.equal(codes.includes("TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED"), true);
    assert.equal(codes.includes("TN_SCRIPT_DOM_API_UNSUPPORTED"), true);
    assert.equal(codes.includes("TN_SCRIPT_RESOURCE_READ_UNDECLARED"), true);
    assert.equal(codes.includes("TN_SCRIPT_RESOURCE_WRITE_UNDECLARED"), true);
    assert.equal(payload.diagnostics.find((item) => item.code === "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED")?.fix?.snippet, 'resourceWrites: ["GameState"]');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject generated and traversal script targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-script-path-"));
  try {
    const traversal = await authoringCommand([
      "script", "check", "--module", "../outside.ts", "--project", root, "--json",
    ]);
    const generated = await authoringCommand([
      "script", "scaffold", "--module", "src/scripts/scripts.bundle.ts", "--project", root, "--json",
    ]);

    assert.equal(traversal.exitCode, 1);
    assert.equal(JSON.parse(traversal.stdout).code, "TN_AUTHORING_SCRIPT_TARGET_INVALID");
    assert.equal(generated.exitCode, 1);
    assert.equal(JSON.parse(generated.stdout).code, "TN_AUTHORING_SCRIPT_TARGET_INVALID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring validate reports structured input binding diagnostics with source path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-input-diagnostics-"));
  try {
    await mkdir(join(root, "content/input"), { recursive: true });
    await writeFile(
      join(root, "content/input/kart.input.json"),
      `${JSON.stringify(
        {
          schema: "threenative.input",
          version: "0.1.0",
          id: "kart-input",
          actions: [
            { id: "accelerate", bindings: ["keyboard.w"] },
            { id: "debug", bindings: ["keyboard.not-a-code"] },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const payload = JSON.parse(validate.stdout) as {
      diagnostics: Array<{ code: string; file?: string; path?: string; severity: string; suggestion?: string }>;
      ok: boolean;
    };

    assert.equal(validate.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_INPUT_KEYBOARD_CODE_NORMALIZED"
      && diagnostic.file === "content/input/kart.input.json"
      && diagnostic.path === "/actions/0/bindings/0"
      && diagnostic.severity === "warning"
      && diagnostic.suggestion === "Update this binding to 'keyboard.KeyW' so source and emitted IR match."
    ), true);
    assert.equal(payload.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_INPUT_KEYBOARD_CODE_INVALID"
      && diagnostic.file === "content/input/kart.input.json"
      && diagnostic.path === "/actions/1/bindings/0"
      && diagnostic.severity === "error"
    ), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("authoring command compiles typed game spec into structured source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-typed-spec-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "content/systems"), { recursive: true });
    await writeFile(join(root, "src/specParts.ts"), `export const playerMaterial = { color: "#44aa88", id: "player-material" } as const;
`);
    await writeFile(join(root, "content/systems/arena.systems.json"), `${JSON.stringify({
      schema: "threenative.systems",
      version: "0.1.0",
      id: "arena-systems",
      systems: [{
        id: "stale-system",
        script: { module: "src/scripts/player.ts", export: "removedExport" },
      }],
    }, null, 2)}\n`);
    await writeFile(join(root, "src/game.spec.ts"), `import { defineTypedGameSpec } from "@threenative/sdk";
import { playerMaterial } from "./specParts";

export default defineTypedGameSpec({
  input: {
    axes: [
      { id: "move-x", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"] },
      { id: "move-z", negative: ["keyboard.KeyS"], positive: ["keyboard.KeyW"] },
    ],
    id: "arena",
  },
  materials: [playerMaterial],
  scenes: [{
    entities: [{
      components: {
        CharacterController: { blocking: false, grounding: "none", moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
        Collider: { height: 1, kind: "capsule", radius: 0.25 },
        MeshRenderer: { material: "player-material" },
        RigidBody: { kind: "kinematic" },
      },
      id: "player",
    }],
    id: "arena",
    resources: [{ id: "score", value: 0 }],
    ui: { nodes: [{ id: "score-label", text: "Score", type: "text" }] },
  }],
});
`);

    const compile = await authoringCommand(["compile-typed-spec", "--project", root, "--json"]);
    const payload = JSON.parse(compile.stdout) as { code: string; documents: Array<{ kind: string; path: string }> };
    assert.equal(compile.exitCode, 0);
    assert.equal(payload.code, "TN_AUTHORING_TYPED_SPEC_COMPILED");
    assert.deepEqual(payload.documents.map((document) => document.path).sort(), [
      "content/input/arena.input.json",
      "content/materials/game-materials.materials.json",
      "content/scenes/arena.scene.json",
    ]);
    await assert.rejects(access(join(root, "content/systems/arena.systems.json")), { code: "ENOENT" });

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const validatePayload = JSON.parse(validate.stdout) as { ok: boolean };
    assert.equal(validate.exitCode, 0);
    assert.equal(validatePayload.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("batch applies operations across scene input and systems files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-batch-command-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
      schema: "threenative.scene",
      version: "0.1.0",
      id: "arena",
      entities: [],
      prefabs: [],
      resources: [],
      systems: [],
      ui: { nodes: [], bindings: [] },
    }, null, 2)}\n`);
    const batchPath = join(root, "three-documents.authoring-batch.json");
    await writeFile(batchPath, `${JSON.stringify({
      schema: "threenative.authoring-batch",
      version: "0.1.0",
      id: "add-player-loop",
      operations: [
        { name: "input.add_action", args: { inputDocId: "gameplay", actionId: "jump", keys: ["keyboard.Space"] } },
        { name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } },
        { name: "system.create", args: { systemId: "player-controller", schedule: "update" } },
      ],
    }, null, 2)}\n`);

    const apply = await authoringCommand(["batch", "apply", "--file", batchPath, "--project", root, "--json"]);
    const payload = JSON.parse(apply.stdout) as {
      committed: boolean;
      filesCreated: string[];
      filesModified: string[];
      ok: boolean;
      transactionId: string;
    };
    assert.equal(apply.exitCode, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.committed, true);
    assert.match(payload.transactionId, /^authoring-/);
    assert.deepEqual(payload.filesCreated, [
      "content/input/gameplay.input.json",
      "content/systems/player-controller.systems.json",
    ]);
    assert.deepEqual(payload.filesModified, ["content/scenes/arena.scene.json"]);

    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as { entities: Array<{ id: string }> };
    const input = JSON.parse(await readFile(join(root, "content/input/gameplay.input.json"), "utf8")) as { actions: Array<{ id: string }> };
    const systems = JSON.parse(await readFile(join(root, "content/systems/player-controller.systems.json"), "utf8")) as { systems: Array<{ id: string }> };
    assert.deepEqual(scene.entities.map(({ id }) => id), ["player"]);
    assert.deepEqual(input.actions.map(({ id }) => id), ["jump"]);
    assert.deepEqual(systems.systems.map(({ id }) => id), ["player-controller"]);

    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    assert.equal(validate.exitCode, 0);
    assert.equal((JSON.parse(validate.stdout) as { ok: boolean }).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("batch reads one bounded JSON document from stdin", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-batch-stdin-"));
  try {
    const batch = JSON.stringify({
      schema: "threenative.authoring-batch",
      version: "0.1.0",
      id: "stdin-system",
      operations: [{ name: "system.create", args: { systemId: "stdin-system", schedule: "update" } }],
    });
    const plan = await authoringCommand(
      ["batch", "plan", "--file", "-", "--project", root, "--json"],
      { stdin: Readable.from([batch]) },
    );
    const payload = JSON.parse(plan.stdout) as { changed: boolean; ok: boolean; touchedPaths: string[] };
    assert.equal(plan.exitCode, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.changed, true);
    assert.deepEqual(payload.touchedPaths, ["content/systems/stdin-system.systems.json"]);
    assert.equal(Buffer.byteLength(plan.stdout, "utf8") <= AUTHORING_BATCH_STDOUT_MAX_BYTES, true);
    await assert.rejects(readFile(join(root, "content/systems/stdin-system.systems.json"), "utf8"), { code: "ENOENT" });

    const oversized = await authoringCommand(
      ["batch", "plan", "--file", "-", "--project", root, "--json"],
      { stdin: Readable.from([Buffer.alloc(AUTHORING_BATCH_INPUT_MAX_BYTES + 1, 0x20)]) },
    );
    const oversizedPayload = JSON.parse(oversized.stdout) as { diagnostics: Array<{ code: string }>; ok: boolean };
    assert.equal(oversized.exitCode, 1);
    assert.equal(oversizedPayload.ok, false);
    assert.equal(oversizedPayload.diagnostics[0]?.code, "TN_AUTHORING_BATCH_INPUT_TOO_LARGE");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

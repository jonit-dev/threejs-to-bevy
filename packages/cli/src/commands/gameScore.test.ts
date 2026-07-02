import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { gameCommand } from "./game.js";

test("reports missing evidence without mutating source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-score-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const before = await listAll(root);

    const result = await gameCommand(["score", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; path?: string }>;
      mode: string;
      ok: boolean;
      phaseLedgers: Array<{ id: string }>;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 1);
    assert.equal(payload.mode, "score");
    assert.equal(payload.ok, false);
    assert.equal(payload.phaseLedgers.some((phase) => phase.id === "gameplay"), true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_PLAYABLE_LOOP_MISSING"), true);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("plans a playable loop without writing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-"));
  try {
    const before = await listAll(root);
    const result = await gameCommand(["plan", "--project", root, "--goal", "arcade collector", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      acceptanceCriteria: string[];
      assetPlan: Array<{ requiredEvidence: string[]; searchCommand?: string; surface: string }>;
      design: { objective: string; loop: string };
      mutate: boolean;
      polishPlan: Array<{ category: string; treatment: string }>;
      proofCommands: string[];
      recipeIds: string[];
      schema: string;
      scriptPlan: Array<{ exportName: string; module: string; responsibility: string }>;
      sourcePlan: Array<{ avoid: string[]; document: string; operations: string[]; path: string; supportedShape: string[] }>;
      steps: Array<{ phase: string; recipe?: string }>;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.schema, "threenative.game-plan");
    assert.equal(payload.mutate, false);
    assert.equal(payload.design.objective.includes("arcade collector"), true);
    assert.equal(payload.design.loop.includes("real input"), true);
    assert.equal(payload.assetPlan.some((asset) => asset.surface === "player-hero" && asset.searchCommand?.includes("--game-category arcade") === true), true);
    assert.equal(payload.assetPlan.some((asset) => asset.surface === "player-hero" && asset.requiredEvidence.includes("SQLite catalog/source id")), true);
    assert.equal(payload.assetPlan.some((asset) => asset.surface === "world-environment" && asset.requiredEvidence.includes("license evidence")), true);
    assert.equal(payload.scriptPlan.some((script) => script.module === "src/scripts/player.ts" && script.exportName === "updatePlayer"), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "input" && source.supportedShape.some((shape) => shape.includes("keyboard.KeyW"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "input" && source.avoid.some((item) => item.includes("Object-shaped bindings"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "materials" && source.avoid.some((item) => item.includes("baseColor"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "scene" && source.supportedShape.some((shape) => shape.includes("box, capsule, cone, cylinder, plane, sphere, torus"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "scene" && source.avoid.some((item) => item.includes("torus"))), false);
    assert.equal(payload.sourcePlan.some((source) => source.document === "systems" && source.supportedShape.some((shape) => shape.includes("Declare every component/resource read and write"))), true);
    assert.equal(payload.sourcePlan.some((source) => source.document === "assets" && source.avoid.some((item) => item.includes("uri/kind/provenance"))), true);
    assert.equal(payload.polishPlan.some((item) => item.category === "lighting-environment" && item.treatment.includes("ground detail")), true);
    assert.equal(payload.acceptanceCriteria.some((criterion) => criterion.includes("authored materials")), true);
    assert.equal(payload.recipeIds.includes("third-person-controller"), true);
    assert.equal(payload.steps.some((step) => step.phase === "gameplay" && step.recipe === "third-person-controller"), true);
    assert.equal(payload.proofCommands.some((command) => command.startsWith("tn playtest")), true);
    assert.equal(payload.proofCommands.some((command) => command.includes("tn game qa") && command.includes("--run-proof")), true);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("improve persists the applied game plan as canonical production evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-improve-plan-evidence-"));
  try {
    const planResult = await gameCommand(["plan", "--project", root, "--goal", "clockwork garden heist", "--json"]);
    const plan = JSON.parse(planResult.stdout) as { steps: Array<{ apply?: boolean }> };
    await writeFile(join(root, "plan-input.json"), `${JSON.stringify({
      ...plan,
      steps: plan.steps.map((step) => ({ ...step, apply: false })),
    }, null, 2)}\n`);

    const result = await gameCommand(["improve", "--project", root, "--apply-plan", "plan-input.json", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      planArtifactPath?: string;
    };
    const persisted = JSON.parse(await readFile(join(root, "artifacts/game-production/plan.json"), "utf8")) as {
      code: string;
      goal: string;
      mutate: boolean;
      schema: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.planArtifactPath?.endsWith("artifacts/game-production/plan.json"), true);
    assert.equal(persisted.schema, "threenative.game-plan");
    assert.equal(persisted.code, "TN_GAME_PLAN");
    assert.equal(persisted.goal, "clockwork garden heist");
    assert.equal(persisted.mutate, false);
    assert.equal(Array.isArray((persisted as { acceptanceCriteria?: unknown }).acceptanceCriteria), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("improve rejects incomplete game plans before writing production evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-improve-plan-incomplete-"));
  try {
    await writeFile(join(root, "plan-input.json"), `${JSON.stringify({
      code: "TN_GAME_PLAN",
      goal: "clockwork garden heist",
      mutate: false,
      schema: "threenative.game-plan",
      steps: [],
    }, null, 2)}\n`);

    const result = await gameCommand(["improve", "--project", root, "--apply-plan", "plan-input.json", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string }>;
      ok: boolean;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_IMPROVE_PLAN_INCOMPLETE"), true);
    await assert.rejects(readFile(join(root, "artifacts/game-production/plan.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("plans goals with matching asset categories", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-plan-categories-"));
  try {
    const underwater = await gameCommand(["plan", "--project", root, "--goal", "sunken underwater salvage diver", "--json"]);
    const underwaterPayload = JSON.parse(underwater.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };
    const nature = await gameCommand(["plan", "--project", root, "--goal", "garden orchard collector", "--json"]);
    const naturePayload = JSON.parse(nature.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };
    const naval = await gameCommand(["plan", "--project", root, "--goal", "harbor lantern ferry boat dock", "--json"]);
    const navalPayload = JSON.parse(naval.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };
    const space = await gameCommand(["plan", "--project", root, "--goal", "asteroid spaceship courier", "--json"]);
    const spacePayload = JSON.parse(space.stdout) as {
      assetPlan: Array<{ searchCommand?: string; surface: string }>;
    };

    assert.equal(underwater.exitCode, 0);
    assert.equal(nature.exitCode, 0);
    assert.equal(naval.exitCode, 0);
    assert.equal(space.exitCode, 0);
    assert.equal(underwaterPayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category ocean") !== false), true);
    assert.equal(naturePayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category nature") !== false), true);
    assert.equal(navalPayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category naval") !== false), true);
    assert.equal(spacePayload.assetPlan.every((asset) => asset.searchCommand?.includes("--game-category space") !== false), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("reports provider probes without leaking credential values", async () => {
  const original = process.env.TRIPO_API_KEY;
  try {
    process.env.TRIPO_API_KEY = "secret-tripo-value";
    const result = await gameCommand(["providers", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      providers: Array<{ credentialEnv: string; id: string; status: string }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(JSON.stringify(payload).includes("secret-tripo-value"), false);
    assert.equal(payload.providers.find((provider) => provider.id === "tripo")?.status, "available");
  } finally {
    if (original === undefined) {
      delete process.env.TRIPO_API_KEY;
    } else {
      process.env.TRIPO_API_KEY = original;
    }
  }
});

test("writes qa and release reports with command and risk ledgers", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-release-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);

    const qa = await gameCommand(["qa", "--project", root, "--json"]);
    const release = await gameCommand(["release", "--project", root, "--json"]);
    const qaPayload = JSON.parse(qa.stdout) as {
      assetAudioLedger?: unknown;
      productionCommands: Array<{ command: string; phase: string; status: string }>;
      reportPath: string;
    };
    const releasePayload = JSON.parse(release.stdout) as {
      release: { risks: Array<{ code: string; severity: string }>; staticHostingNotes: string[] };
      reportPath: string;
    };

    assert.equal(qa.exitCode, 1);
    assert.equal(release.exitCode, 1);
    assert.equal(qaPayload.reportPath.endsWith("artifacts/game-production/qa-report.json"), true);
    assert.equal(qaPayload.assetAudioLedger, undefined);
    assert.equal(qaPayload.productionCommands.some((command) => command.command.startsWith("tn playtest") && command.status === "missing-artifact"), true);
    assert.equal(releasePayload.release.risks.some((risk) => risk.code === "TN_GAME_RELEASE_BUILD_PROOF_MISSING" && risk.severity === "error"), true);
    assert.equal(releasePayload.release.staticHostingNotes.some((note) => note.includes("static files")), true);
    const fullQaReport = JSON.parse(await readFile(qaPayload.reportPath, "utf8")) as { assetAudioLedger?: unknown };
    assert.notEqual(fullQaReport.assetAudioLedger, undefined);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("release writes missing asset-budget proof for built projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-release-asset-budget-"));
  try {
    await writePassingGameProject(root);
    const proofPath = join(root, "artifacts/game-production/asset-budget.json");

    const result = await gameCommand(["release", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      release: { assetBudgetStatus: string; risks: Array<{ code: string }> };
    };
    const proof = JSON.parse(await readFile(proofPath, "utf8")) as {
      schema: string;
      source: string;
      status: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.release.assetBudgetStatus, "pass");
    assert.equal(payload.release.risks.some((risk) => risk.code === "TN_GAME_RELEASE_ASSET_BUDGET_UNVERIFIED"), false);
    assert.equal(proof.schema, "threenative.game-asset-budget-proof");
    assert.equal(proof.source, "tn game release");
    assert.equal(proof.status, "pass");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("shows game subcommand help without running qa", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-help-"));
  try {
    const result = await gameCommand(["qa", "--help", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { commands: string[]; subcommand?: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.subcommand, "qa");
    assert.equal(payload.commands.some((command) => command.startsWith("tn game qa")), true);
    await assert.rejects(readFile(join(root, "artifacts/game-production/qa-report.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("aggregates proof tool failures into one report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-run-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "keyboard.KeyD", "--json"],
      {
        proofRunner: async (step) => {
          if (step.id === "playtest") {
            return {
              exitCode: 1,
              stdout: `${JSON.stringify({
                code: "TN_PLAYTEST_FAILED",
                diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
              })}\n`,
            };
          }
          if (step.id === "screenshot") {
            return {
              exitCode: 1,
              stdout: `${JSON.stringify({ code: "TN_SCREENSHOT_FAILED", message: "Preview did not contain a canvas." })}\n`,
            };
          }
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );
    const payload = JSON.parse(result.stdout) as {
      proofRun: {
        diagnostics: Array<{ code: string; message: string; phase: string; severity: string }>;
        ok: boolean;
        steps: Array<{ id: string; exitCode: number }>;
      };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.proofRun.ok, false);
    assert.equal(payload.proofRun.steps.some((step) => step.id === "playtest" && step.exitCode === 1), true);
    assert.equal(payload.proofRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_INPUT_NO_EFFECT" && diagnostic.phase === "gameplay"), true);
    assert.equal(payload.proofRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCREENSHOT_FAILED" && diagnostic.phase === "visuals"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("qa run-proof writes doctor proof sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-doctor-proof-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--json"],
      {
        proofRunner: async (step) => ({
          exitCode: 0,
          stdout: `${JSON.stringify({ code: step.id === "doctor" ? "TN_DOCTOR_OK" : "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
        }),
      },
    );
    const proof = JSON.parse(await readFile(join(root, "artifacts/game-production/doctor.json"), "utf8")) as {
      code: string;
      schema: string;
    };

    assert.notEqual(result.exitCode, 0);
    assert.equal(proof.schema, "threenative.game-doctor-proof");
    assert.equal(proof.code, "TN_DOCTOR_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("fails qa command when run-proof fails even if game report is clean", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-proof-fail-"));
  try {
    await writePassingGameProject(root);

    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--json"],
      {
        proofRunner: async (step) => {
          if (step.id === "playtest") {
            return {
              exitCode: 1,
              stdout: `${JSON.stringify({
                code: "TN_PLAYTEST_FAILED",
                diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
              })}\n`,
            };
          }
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      proofRun: { ok: boolean; diagnostics: Array<{ code: string }> };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.equal(payload.proofRun.ok, false);
    assert.equal(payload.proofRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_INPUT_NO_EFFECT"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("passes axis assertions through QA proof playtest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-axis-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--expect-axis", "x", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 1);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "playtest"),
      ["playtest", "--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "30", "--expect-moved", "--expect-axis", "x", "--json"],
    );
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "screenshot" && args.includes("artifacts/game-production/mobile-viewport.png")),
      ["screenshot", "--project", ".", "--url", "http://127.0.0.1:5173", "--out", "artifacts/game-production/mobile-viewport.png", "--viewport", "mobile", "--wait-ready", "--json"],
    );
    assert.deepEqual(seenArgs.find((args) => args[0] === "artifact-check" && args.includes("artifacts/game-production/motion.webm")), ["artifact-check", "artifacts/game-production/motion.webm"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "visual-quality-proof"), ["visual-quality-proof", "artifacts/game-production/visual-quality.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "performance-proof"), ["performance-proof", "artifacts/game-production/performance.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "asset-budget-proof"), ["asset-budget-proof", "artifacts/game-production/asset-budget.json"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "ui-fit-proof"), ["ui-fit-proof", "artifacts/game-production/ui-fit.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("records QA motion proof to canonical game-production motion artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-record-motion-"));
  try {
    await writePassingGameProject(root);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--entity", "player", "--press", "KeyD", "--record", "--duration", "2", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "record"),
      ["record", "--project", ".", "--url", "http://127.0.0.1:5173", "--out", "artifacts/game-production/motion.webm", "--duration", "2", "--json"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("checks existing screenshot proof when QA proof URL is omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-existing-screenshot-"));
  try {
    await writePassingGameProject(root);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "playtest"),
      ["playtest", "--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "30", "--expect-moved", "--expect-axis", "x", "--json"],
    );
    assert.deepEqual(seenArgs.find((args) => args[0] === "artifact-check" && args.includes("artifacts/game-production/screenshot.png")), ["artifact-check", "artifacts/game-production/screenshot.png"]);
    assert.deepEqual(seenArgs.find((args) => args[0] === "artifact-check" && args.includes("artifacts/game-production/mobile-viewport.png")), ["artifact-check", "artifacts/game-production/mobile-viewport.png"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("infers QA proof playtest arguments from project production proof commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-qa-proof-defaults-"));
  try {
    await writePassingGameProject(root);
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
      schema: "threenative.project",
      version: "0.1.0",
      entry: "content/scenes/arena.scene.json",
      production: {
        proofCommands: [
          "tn playtest --project . --entity player --press KeyD --frames 42 --expect-axis x --json",
          "tn game qa --project . --run-proof --json",
        ],
      },
    }, null, 2)}\n`);
    const seenArgs: string[][] = [];
    const result = await gameCommand(
      ["qa", "--project", root, "--run-proof", "--url", "http://127.0.0.1:5173", "--json"],
      {
        proofRunner: async (step) => {
          seenArgs.push([step.command, ...step.args]);
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ code: "TN_TEST_STEP_OK", message: `${step.id} ok` })}\n`,
          };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      seenArgs.find((args) => args[0] === "playtest"),
      ["playtest", "--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "42", "--expect-moved", "--expect-axis", "x", "--json"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function listAll(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => String(entry)).sort();
}

async function writePassingGameProject(root: string): Promise<void> {
  await mkdir(join(root, "content/scenes"), { recursive: true });
  await mkdir(join(root, "content/input"), { recursive: true });
  await mkdir(join(root, "content/ui"), { recursive: true });
  await mkdir(join(root, "content/assets"), { recursive: true });
  await mkdir(join(root, "content/materials"), { recursive: true });
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "src/scripts"), { recursive: true });
  await mkdir(join(root, "artifacts/game-production"), { recursive: true });
  await mkdir(join(root, "artifacts/playtest"), { recursive: true });
  await mkdir(join(root, "dist/game.bundle"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({
    schema: "threenative.scene",
    version: "0.1.0",
    id: "arena",
    entities: [
      { id: "player", components: { VisualProvenance: { notes: "procedural custom player hero obstacle hazard collectible reward world environment ui hud audio feedback" } } },
      { id: "hazard.obstacle", components: { Hazard: { kind: "obstacle-enemy" } } },
      { id: "reward.collectible", components: { Collectible: { kind: "reward-interactable" } } },
    ],
    prefabs: [
      { id: "prefab.player", primitive: "box", color: "#ffffff" },
      { id: "prefab.hazard", primitive: "sphere", color: "#ff0000" },
      { id: "prefab.reward", primitive: "sphere", color: "#ffff00" },
      { id: "prefab.world", primitive: "plane", color: "#00ff00" },
    ],
    systems: [{ id: "gameplay", script: { module: "src/scripts/game.ts", export: "update" } }],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/input/arena.input.json"), `${JSON.stringify({
    schema: "threenative.input",
    version: "0.1.0",
    id: "arena-input",
    actions: [{ id: "move-right", bindings: ["keyboard.KeyD"] }],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/ui/hud.ui.json"), `${JSON.stringify({
    schema: "threenative.ui",
    version: "0.1.0",
    id: "hud",
    nodes: [
      { id: "gameplay-hud", text: "Score" },
      { id: "pause-menu", text: "Pause" },
      { id: "settings-menu", text: "Settings" },
      { id: "loading-screen", text: "Loading" },
      { id: "fail-retry", text: "Retry" },
      { id: "win-milestone", text: "Win complete" },
      { id: "touch-controls", text: "Touch mobile-control" },
    ],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/assets/arena.assets.json"), `${JSON.stringify({
    schema: "threenative.assets",
    version: "0.1.0",
    id: "arena-assets",
    assets: [
      { id: "player-hero", path: "assets/player.glb", type: "model" },
      { id: "obstacle-enemy", path: "assets/enemy.glb", type: "model" },
      { id: "reward-interactable", path: "assets/reward.glb", type: "model" },
      { id: "world-environment", path: "assets/world.glb", type: "model" },
      { id: "ui-hud", path: "assets/hud.png", type: "texture" },
      { id: "audio-feedback", path: "assets/hit.wav", type: "audio" },
    ],
  }, null, 2)}\n`);
  await writeFile(join(root, "content/materials/arena.materials.json"), `${JSON.stringify({
    schema: "threenative.materials",
    version: "0.1.0",
    id: "arena-materials",
    materials: [{ id: "mat.procedural", color: "#ffffff", roughness: 0.5 }],
  }, null, 2)}\n`);
  await writeFile(join(root, "src/scripts/game.ts"), "export function update(ctx: any) { const dt = ctx.time.fixedDelta({ fallback: 1 / 60 }); const moveProgress = Math.min(1, dt); void moveProgress; }\n");
  await writeTinyWav(join(root, "assets/hit.wav"));
  await writeFile(join(root, "artifacts/playtest/player-KeyD.png"), "not-a-real-png");
  await writeFile(join(root, "artifacts/game-production/screenshot.png"), "not-a-real-png");
  await writeFile(join(root, "artifacts/game-production/mobile-viewport.png"), "not-a-real-png");
  await writeFile(join(root, "artifacts/game-production/motion.webm"), "not-a-real-webm");
  await writeFile(join(root, "artifacts/game-production/performance.json"), "{\"targetFps\":60,\"frameTimeMs\":16.7}\n");
  await writeFile(join(root, "artifacts/game-production/ui-fit.json"), "{\"viewport\":\"mobile\"}\n");
  await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
  await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
}

async function writeTinyWav(path: string): Promise<void> {
  const data = Buffer.alloc(2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(88200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(path, Buffer.concat([header, data]));
}

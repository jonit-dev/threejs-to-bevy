import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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
      mutate: boolean;
      proofCommands: string[];
      recipeIds: string[];
      steps: Array<{ phase: string; recipe?: string }>;
    };
    const after = await listAll(root);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.mutate, false);
    assert.equal(payload.recipeIds.includes("third-person-controller"), true);
    assert.equal(payload.steps.some((step) => step.phase === "gameplay" && step.recipe === "third-person-controller"), true);
    assert.equal(payload.proofCommands.some((command) => command.startsWith("tn playtest")), true);
    assert.deepEqual(after, before);
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
    assert.equal(qaPayload.productionCommands.some((command) => command.command.startsWith("tn playtest") && command.status === "missing-artifact"), true);
    assert.equal(releasePayload.release.risks.some((risk) => risk.code === "TN_GAME_RELEASE_BUILD_PROOF_MISSING" && risk.severity === "error"), true);
    assert.equal(releasePayload.release.staticHostingNotes.some((note) => note.includes("static files")), true);
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

async function listAll(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => String(entry)).sort();
}

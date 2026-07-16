import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { prepareRound } from "./prepare.js";

const execFileAsync = promisify(execFile);

test("next command should return the first prepared-round action", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-next-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });

  const { stdout } = await execFileAsync(process.execPath, [
    join(process.cwd(), "dist/index.js"),
    "next",
    "--manifest",
    result.manifestPath,
    "--json",
  ]);
  const parsed = JSON.parse(stdout) as {
    action?: { action?: string; runId?: string };
    code?: string;
    ok?: boolean;
  };

  assert.equal(parsed.code, "TN_BENCH_ROUND_NEXT_ACTION");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.action?.action, "run-fresh-session");
  assert.equal(parsed.action?.runId, "collector-typed-spec-r1");
});

test("next command should filter actions by condition", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-next-"));
  const result = await prepareRound({
    conditions: ["typed-spec", "vanilla"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });

  const { stdout } = await execFileAsync(process.execPath, [
    join(process.cwd(), "dist/index.js"),
    "next",
    "--manifest",
    result.manifestPath,
    "--condition",
    "vanilla",
    "--json",
  ]);
  const parsed = JSON.parse(stdout) as {
    action?: { action?: string; condition?: string; runId?: string };
    code?: string;
    condition?: string;
    ok?: boolean;
  };

  assert.equal(parsed.code, "TN_BENCH_ROUND_NEXT_ACTION");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.condition, "vanilla");
  assert.equal(parsed.action?.action, "run-fresh-session");
  assert.equal(parsed.action?.condition, "vanilla");
  assert.equal(parsed.action?.runId, "collector-vanilla-r1");
});

test("status command should reject invalid condition filters", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });

  await assert.rejects(
    execFileAsync(process.execPath, [
      join(process.cwd(), "dist/index.js"),
      "status",
      "--manifest",
      result.manifestPath,
      "--condition",
      "direct",
      "--json",
    ]),
    /--condition must be vanilla, threenative, or typed-spec/,
  );
});

test("next command should report complete when no action remains", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-next-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 0,
    root: process.cwd(),
  });
  await writeFile(result.manifestPath, `${JSON.stringify({
    candidates: [],
    conditions: ["typed-spec"],
    promptId: "collector",
    repeats: 0,
    schema: "threenative.agent-benchmark-round-prepare",
    version: 1,
  }, null, 2)}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    join(process.cwd(), "dist/index.js"),
    "next",
    "--manifest",
    result.manifestPath,
    "--json",
  ]);
  const parsed = JSON.parse(stdout) as {
    action?: unknown;
    code?: string;
    ok?: boolean;
  };

  assert.equal(parsed.code, "TN_BENCH_ROUND_NEXT_COMPLETE");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.action, undefined);
});

test("score command should diagnose copied session template metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-score-"));
  const outPath = join(root, "artifacts", "agent-benchmark", "run-report.json");
  await writeFile(join(root, "index.html"), "<!doctype html><p>No canvas</p>", "utf8");
  await writeFile(join(root, "session.json"), `${JSON.stringify({
    condition: "typed-spec",
    humanRubric: { notes: "Fill after the fresh session.", playability: 0, visual: 0 },
    iterationCount: 0,
    promptId: "collector",
    runId: "collector-typed-spec-r1",
    schema: "threenative.agent-benchmark-session",
    stopReason: "operator-stopped",
    tokenCount: 0,
    version: 2,
  }, null, 2)}\n`, "utf8");

  let stdout = "";
  try {
    await execFileAsync(process.execPath, [
      join(process.cwd(), "dist/index.js"),
      "score",
      "--candidate",
      root,
      "--condition",
      "typed-spec",
      "--out",
      outPath,
      "--json",
    ]);
    assert.fail("Expected failed score command to exit nonzero.");
  } catch (error) {
    stdout = (error as { stderr?: string }).stderr ?? "";
  }
  const parsed = JSON.parse(stdout) as {
    code?: string;
    report?: { diagnostics?: Array<{ code?: string }>; ok?: boolean };
  };
  const written = JSON.parse(await readFile(outPath, "utf8")) as {
    diagnostics?: Array<{ code?: string }>;
    ok?: boolean;
  };

  assert.equal(parsed.code, "TN_BENCH_SCORE_FAILED");
  assert.equal(parsed.report?.ok, false);
  assert.equal(written.ok, false);
  assert.equal(written.diagnostics?.some((diagnostic) => diagnostic.code === "TN_BENCH_SCORE_SESSION_TOKEN_COUNT_PLACEHOLDER"), true);
  assert.equal(written.diagnostics?.some((diagnostic) => diagnostic.code === "TN_BENCH_SCORE_SESSION_FAILED_COMMANDS_MISSING"), true);
  assert.equal(written.diagnostics?.some((diagnostic) => diagnostic.code === "TN_BENCH_SCORE_SESSION_TOOL_STEPS_MISSING"), true);
});

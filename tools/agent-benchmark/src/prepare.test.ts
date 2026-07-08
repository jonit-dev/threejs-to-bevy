import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareRound, prepareRound5b } from "./prepare.js";

test("should prepare round-5 candidate slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-prepare-"));
  const outDir = join(root, "round-5");
  const result = await prepareRound({
    conditions: ["typed-spec", "threenative", "vanilla"],
    outDir,
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 2,
    root: process.cwd(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 6);
  assert.equal(result.candidates.some((candidate) => candidate.runId === "collector-typed-spec-r1"), true);
  assert.equal(result.candidates.some((candidate) => candidate.runId === "collector-threenative-r2"), true);
  assert.equal(result.candidates.some((candidate) => candidate.runId === "collector-vanilla-r2"), true);

  const operator = await readFile(join(outDir, "candidates", "collector-typed-spec-r1", "OPERATOR.md"), "utf8");
  const prompt = await readFile(join(outDir, "candidates", "collector-vanilla-r2", "benchmark-prompt.txt"), "utf8");
  const session = JSON.parse(await readFile(join(outDir, "candidates", "collector-threenative-r1", "session.template.json"), "utf8")) as {
    condition?: string;
    failedCommandCount?: number;
    promptId?: string;
    runId?: string;
    toolStepCount?: number;
  };

  assert.match(operator, /Fresh Session Rule/);
  assert.match(operator, /--authoring typed-spec/);
  assert.match(operator, new RegExp(`node ${escapeRegExp(join(process.cwd(), "packages/cli/dist/index.js"))} create ../collector-typed-spec-r1-starter-tmp`));
  assert.match(operator, /cp -R \.\.\/collector-typed-spec-r1-starter-tmp\/\. \./);
  assert.match(operator, /xvfb-run -a .* iterate --project \. --json/);
  assert.match(operator, /Do not run standalone build, validate, playtest, artifact inspection, or engine-source searches/);
  assert.match(operator, new RegExp(`--candidate ${escapeRegExp(join(outDir, "candidates", "collector-typed-spec-r1"))}`));
  assert.match(operator, new RegExp(`--out ${escapeRegExp(join(outDir, "collector-typed-spec-r1", "run-report.json"))}`));
  assert.match(operator, new RegExp(`status --manifest ${escapeRegExp(join(outDir, "round-5-prepare-manifest.json"))} --require-complete`));
  assert.match(operator, /tn-agent-benchmark\/dist\/index\.js audit|tools\/agent-benchmark\/dist\/index\.js audit/);
  assert.match(operator, /GameState\.scoreText/);
  assert.match(operator, /GameState\.statusText/);
  assert.match(prompt, /collects at least five visible pickups/);
  assert.equal(session.condition, "threenative");
  assert.equal(session.failedCommandCount, 0);
  assert.equal(session.promptId, "collector");
  assert.equal(session.runId, "collector-threenative-r1");
  assert.equal(session.toolStepCount, 0);
});

test("should generate three-prompt matrix manifest when audit is green", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-prepare-5b-"));
  const outDir = join(root, "round-5b");
  const auditReportPath = join(root, "audit.json");
  await writeFile(auditReportPath, `${JSON.stringify({
    ok: true,
    requirements: [
      { id: "deterministic-frictions", status: "complete" },
      { id: "churn-budgets", status: "complete" },
    ],
  })}\n`, "utf8");

  const result = await prepareRound5b({
    auditReportPath,
    outDir,
    promptsDir: "prompts",
    root: process.cwd(),
  });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as {
    candidates: Array<{ condition: string; runId: string }>;
    promptId: string;
    prompts: string[];
  };

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 27);
  assert.equal(manifest.promptId, "round-5b");
  assert.deepEqual(manifest.prompts, ["lane-runner", "checkpoint-race", "physics-knockdown"]);
  for (const promptId of manifest.prompts) {
    assert.equal(manifest.candidates.filter((candidate) => candidate.runId.startsWith(`${promptId}-`)).length, 9);
  }
});

test("should refuse manifest generation when audit is incomplete", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-prepare-5b-"));
  const auditReportPath = join(root, "audit.json");
  await writeFile(auditReportPath, `${JSON.stringify({
    ok: false,
    requirements: [{ id: "churn-budgets", status: "incomplete" }],
  })}\n`, "utf8");

  await assert.rejects(
    prepareRound5b({
      auditReportPath,
      outDir: join(root, "round-5b"),
      promptsDir: "prompts",
      root: process.cwd(),
    }),
    /requires a green next-steps audit/,
  );
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

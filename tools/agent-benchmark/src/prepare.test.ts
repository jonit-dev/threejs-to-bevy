import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateObservationRoute } from "./browser-observation.js";
import { prepareRound, prepareRound5b } from "./prepare.js";
import { BENCHMARK_OBSERVATION_PROTOCOL_VERSION } from "./proof-contract.js";

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
  assert.match(operator, /node bin\/tn create \.\.\/collector-typed-spec-r1-starter-tmp/);
  assert.match(operator, /node bin\/tn game plan --goal "\$\(cat benchmark-prompt\.txt\)"/);
  assert.match(operator, /cp -R \.\.\/collector-typed-spec-r1-starter-tmp\/\. \./);
  assert.match(operator, /xvfb-run -a .* iterate --project \. --json/);
  assert.match(operator, /Do not run standalone build, validate, playtest, artifact inspection, or engine-source searches/);
  assert.match(operator, new RegExp(`--candidate ${escapeRegExp(join(outDir, "candidates", "collector-typed-spec-r1"))}`));
  assert.match(operator, new RegExp(`--out ${escapeRegExp(join(outDir, "collector-typed-spec-r1", "run-report.json"))}`));
  assert.match(operator, new RegExp(`status --manifest ${escapeRegExp(join(outDir, "round-5-prepare-manifest.json"))} --require-complete`));
  assert.match(operator, /tn-agent-benchmark\/dist\/index\.js audit|tools\/agent-benchmark\/dist\/index\.js audit/);
  assert.match(operator, /pickup-objective/);
  assert.match(operator, /win-state/);
  assert.match(operator, /runner-result\.json/);
  assert.doesNotMatch(operator, /--stop-reason claimed-playable/);
  assert.match(operator, /run-session --candidate .* --condition typed-spec --max-tool-steps 25 --json/u);
  assert.match(prompt, /collects at least five visible pickups/);
  assert.equal(session.condition, "threenative");
  assert.equal(session.failedCommandCount, 0);
  assert.equal(session.promptId, "collector");
  assert.equal(session.runId, "collector-threenative-r1");
  assert.equal(session.toolStepCount, 0);
});

test("should require off-recipe agents to inspect scaffold fit and prove the prompt contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-grid-push-"));
  const outDir = join(root, "round-grid-push");
  await prepareRound({
    conditions: ["threenative"],
    outDir,
    promptId: "grid-push-puzzle",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });

  const operator = await readFile(join(outDir, "candidates", "grid-push-puzzle-threenative-r1", "OPERATOR.md"), "utf8");
  assert.match(operator, /Inspect the planner diagnostics/i);
  assert.match(operator, /TN_GAME_PLAN_OFF_RECIPE/);
  assert.match(operator, /custom-author.*starter/i);
  assert.match(operator, /nextInspectionCommand/);
  assert.match(operator, /core verbs.*acceptance criteria/i);
  assert.match(operator, /grid-movement/);
  assert.match(operator, /benchmark-observation-route\.json/);
  assert.doesNotMatch(operator, /When the bounded command emits a scenario, do not inspect/);
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
  const checkpointOperator = await readFile(join(outDir, "candidates", "checkpoint-race-threenative-r1", "OPERATOR.md"), "utf8");
  assert.match(checkpointOperator, /ordered-checkpoints/);
  assert.match(checkpointOperator, /timer-or-counter/);
  assert.match(checkpointOperator, /game plan --goal "\$\(cat benchmark-prompt\.txt\)"/);
  assert.doesNotMatch(checkpointOperator, /game plan --goal "\$\(cat benchmark-prompt\.txt\)" --project \. --apply/);
  assert.match(checkpointOperator, /TN_ITERATE_OK.*proves only the scenarios that were run/);
  assert.match(checkpointOperator, /benchmark-observation-route\.json/);
  assert.match(checkpointOperator, /round-5b-prepare-manifest\.json/);
  assert.doesNotMatch(checkpointOperator, /pickup-objective|collector-proof\.json|--goal "collector"/);
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

test("should refuse round-5b preparation when green audit lacks churn-budget proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-prepare-5b-"));
  const auditReportPath = join(root, "audit.json");
  await writeFile(auditReportPath, `${JSON.stringify({
    ok: true,
    requirements: [{ id: "deterministic-frictions", status: "complete" }],
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

test("should include zeroed churn counters in prepared session template", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-prepare-"));
  const outDir = join(root, "round-5");
  await prepareRound({
    conditions: ["threenative"],
    outDir,
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });

  const session = JSON.parse(await readFile(join(outDir, "candidates", "collector-threenative-r1", "session.template.json"), "utf8")) as {
    churnCounters?: Record<string, number>;
  };

  assert.deepEqual(session.churnCounters, {
    artifactForensics: 0,
    engineSourceSearch: 0,
    failedCommand: 0,
    missingDiscovery: 0,
    missingIterate: 0,
    repeatedAssertion: 0,
    repeatedDiagnostic: 0,
    repeatedFileRead: 0,
    standaloneVerify: 0,
  });
});

test("should prepare frozen multi-prompt matrix with matching hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-multi-prompt-"));
  const outDir = join(root, "matrix");
  const prompts = ["grid-push-puzzle", "wave-defense", "turn-based-tactics"];
  const result = await prepareRound({ conditions: ["threenative", "vanilla"], outDir, promptIds: prompts, promptsDir: "prompts", repeats: 3, root: process.cwd() });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as {
    candidates: Array<{ observationProtocolSha256: string; observationProtocolVersion: string; observationRouteSha256: string; promptSha256: string; runId: string }>;
    observationProtocol: { protocolVersion: string; sha256: string; version: number };
    promptHashes: Record<string, string>;
    prompts: string[];
  };

  assert.equal(result.candidates.length, 18);
  assert.deepEqual(manifest.prompts, prompts);
  for (const candidate of manifest.candidates) {
    const promptId = prompts.find((prompt) => candidate.runId.startsWith(`${prompt}-`))!;
    assert.equal(candidate.promptSha256, manifest.promptHashes[promptId]);
    assert.equal(candidate.observationProtocolSha256, manifest.observationProtocol.sha256);
    assert.equal(candidate.observationProtocolVersion, manifest.observationProtocol.protocolVersion);
    assert.equal(candidate.observationProtocolVersion, BENCHMARK_OBSERVATION_PROTOCOL_VERSION);
    assert.equal((await readFile(join(outDir, "candidates", candidate.runId, "benchmark-prompt.txt"), "utf8")).length > 0, true);
    const observationProtocolText = await readFile(join(outDir, "candidates", candidate.runId, "benchmark-observation-protocol.json"), "utf8");
    const observationProtocol = JSON.parse(observationProtocolText) as { protocolVersion?: string };
    assert.equal(observationProtocol.protocolVersion, BENCHMARK_OBSERVATION_PROTOCOL_VERSION);
    assert.equal(createHash("sha256").update(observationProtocolText).digest("hex"), manifest.observationProtocol.sha256);
    const observationRouteText = await readFile(join(outDir, "candidates", candidate.runId, "benchmark-observation-route.json"), "utf8");
    assert.equal(createHash("sha256").update(observationRouteText).digest("hex"), candidate.observationRouteSha256);
  }
});

test("should keep holdout operator instructions implementation neutral", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-neutral-"));
  const outDir = join(root, "matrix");
  await prepareRound({ conditions: ["threenative", "vanilla"], outDir, promptIds: ["grid-push-puzzle", "wave-defense", "turn-based-tactics"], promptsDir: "prompts", repeats: 1, root: process.cwd() });
  const operator = await readFile(join(outDir, "candidates/grid-push-puzzle-threenative-r1/OPERATOR.md"), "utf8");
  const vanilla = await readFile(join(outDir, "candidates/grid-push-puzzle-vanilla-r1/OPERATOR.md"), "utf8");

  assert.doesNotMatch(operator, /spatial-grid-objective|grid-step|push-interaction|occupancy-objective|TN_GAME_PLAN_OFF_RECIPE/u);
  assert.doesNotMatch(operator, /custom-author|bounded command/u);
  assert.match(operator, /game plan --goal "\$\(cat benchmark-prompt\.txt\)"/u);
  assert.match(operator, /nextAuthoringCommand/u);
  assert.match(operator, /replacing only that prefix with `node bin\/tn`/u);
  assert.match(operator, /grid-movement/);
  assert.match(vanilla, /THREE\.WebGLRenderer/);
  assert.match(vanilla, /inadmissible evaluation forensics/);
  assert.doesNotMatch(vanilla, /packages\/cli\/dist/);
});

test("should prepare prompt-specific condition-neutral raw observation routes without the old pass template", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-observation-route-"));
  const outDir = join(root, "matrix");
  const expected = {
    "grid-push-puzzle": {
      "grid-canvas": ["rendered"],
      "grid-goal-and-retry": ["start", "progress", "complete", "reset"],
      "grid-movement": ["start", "moved", "blocked"],
      "grid-push-and-pull": ["start", "pushed", "pull-attempt"],
    },
    "turn-based-tactics": {
      "tactics-canvas": ["rendered"],
      "tactics-enemy-turn": ["player-turn", "opponent-moved"],
      "tactics-failure-retry": ["start", "failure", "reset"],
      "tactics-success": ["start", "success"],
      "tactics-unit-control": ["unselected", "selected", "moved"],
    },
    "wave-defense": {
      "wave-base-failure-retry": ["healthy", "failed", "reset"],
      "wave-canvas": ["rendered"],
      "wave-defender-control": ["start", "moved", "aimed", "attacked"],
      "wave-progression": ["wave-one", "wave-two"],
    },
  } as const;
  const promptIds = Object.keys(expected);
  await prepareRound({ conditions: ["threenative", "vanilla"], outDir, promptIds, promptsDir: "prompts", repeats: 1, root: process.cwd() });

  for (const promptId of promptIds) {
    const threenativeDir = join(outDir, `candidates/${promptId}-threenative-r1`);
    const vanillaDir = join(outDir, `candidates/${promptId}-vanilla-r1`);
    const threenative = await readFile(join(threenativeDir, "OPERATOR.md"), "utf8");
    const vanilla = await readFile(join(vanillaDir, "OPERATOR.md"), "utf8");
    const threenativeText = await readFile(join(threenativeDir, "benchmark-observation-route.json"), "utf8");
    const vanillaText = await readFile(join(vanillaDir, "benchmark-observation-route.json"), "utf8");
    const routeManifest = JSON.parse(threenativeText) as {
      promptId?: string;
      routes?: Array<{ actions?: Array<{ checkpoint?: string; key?: string }>; bindings?: Array<{ selector?: string; source?: string }>; id?: string }>;
      schema?: string;
    };

    assert.equal(threenativeText, vanillaText, `${promptId} route must be byte-identical across conditions`);
    assert.equal(routeManifest.promptId, promptId);
    assert.equal(routeManifest.schema, "threenative.agent-benchmark-observation-route");
    assert.equal((routeManifest.routes ?? []).every((route) => route.actions?.[0]?.key === "KeyR" && route.actions[0]?.checkpoint === undefined), true);
    assert.deepEqual(Object.fromEntries((routeManifest.routes ?? []).map((route) => [route.id, (route.actions ?? []).flatMap((action) => action.checkpoint === undefined ? [] : [action.checkpoint])])), expected[promptId as keyof typeof expected]);
    if (promptId === "grid-push-puzzle") {
      assert.deepEqual(routeManifest.routes?.find((route) => route.id === "grid-movement")?.actions?.map((action) => action.key), ["KeyR", undefined, "ArrowUp", "ArrowUp"]);
      assert.match(threenative, /\[column, row\]/u);
    }
    assert.equal((routeManifest.routes ?? []).every((route) => (route.bindings ?? []).every((binding) => binding.selector === "canvas" && binding.source === "raw-snapshot")), true);
    assert.equal((routeManifest.routes ?? []).every((route) => validateObservationRoute(route, promptId).ok), true);
    assert.doesNotMatch(threenativeText, /assertion|expected|pass|javascript|eval/iu);
    assert.doesNotMatch(threenative, /"pass"\s*:\s*true|threenative\.agent-benchmark-proof|artifacts\/proof\//u);
    assert.doesNotMatch(vanilla, /"pass"\s*:\s*true|threenative\.agent-benchmark-proof|artifacts\/proof\//u);
    assert.match(threenative, /before visual polish/iu);
    assert.match(threenative, /scorer-owned route/iu);
    assert.doesNotMatch(threenative, /```json/iu);
    assert.match(threenative, /Do\s+not read broad skill or reference documents/iu);
    assert.match(threenative, /globalThis\.__TN_BENCHMARK_OBSERVE__/u);
    assert.match(threenative, /immediately run `node bin\/tn iterate --project \. --json`/u);
    assert.match(threenative, /browser fallback is unnecessary/u);
    assert.match(vanilla, /0\.181\.2/u);
    assert.match(threenative, /\{ actors, metrics, phase \}/u);
    assert.match(threenative, /Every emitted value visibly correlates with the game/iu);
    assert.match(threenative, /Do not return pass flags or conclusions/iu);
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

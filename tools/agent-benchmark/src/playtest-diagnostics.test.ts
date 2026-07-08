import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectCandidatePlaytestDiagnostics } from "./playtest-diagnostics.js";

test("should collect playtest diagnostics from candidate artifact summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-playtest-diagnostics-"));
  const summaryDir = join(root, "artifacts", "collect-all-proof");
  await mkdir(summaryDir, { recursive: true });
  await writeFile(join(summaryDir, "summary.json"), `${JSON.stringify({
    diagnostics: [
      {
        code: "TN_PLAYTEST_RESOURCE_STATE_STAGNATED",
        message: "Resource 'GameState' path 'scoreText' did not change after movement.",
        severity: "error",
        suggestion: "Inspect effect-log.json.",
      },
      {
        code: "TN_BENCH_PROOF_FAILED",
        message: "Benchmark diagnostic should not be imported from playtest summary.",
        severity: "error",
      },
    ],
  }, null, 2)}\n`, "utf8");

  const diagnostics = await collectCandidatePlaytestDiagnostics(root);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_PLAYTEST_RESOURCE_STATE_STAGNATED");
  assert.equal(diagnostics[0]?.severity, "error");
  assert.match(diagnostics[0]?.message ?? "", /artifacts\/collect-all-proof\/summary\.json/);
  assert.match(diagnostics[0]?.message ?? "", /scoreText/);
  assert.equal(diagnostics[0]?.suggestedFix, "Inspect effect-log.json.");
});

test("should collect playtest diagnostics from nested artifact directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-playtest-diagnostics-"));
  const summaryDir = join(root, "tools", "verify", "artifacts", "agent-benchmark", "candidate", "artifacts", "collect-all-proof");
  await mkdir(summaryDir, { recursive: true });
  await writeFile(join(summaryDir, "summary.json"), `${JSON.stringify({
    diagnostics: [
      {
        code: "TN_PLAYTEST_RESOURCE_STATE_STAGNATED",
        message: "Resource did not change.",
        severity: "error",
      },
    ],
  }, null, 2)}\n`, "utf8");

  const diagnostics = await collectCandidatePlaytestDiagnostics(root);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_PLAYTEST_RESOURCE_STATE_STAGNATED");
  assert.match(diagnostics[0]?.message ?? "", /tools\/verify\/artifacts/);
});

test("should ignore candidates without playtest artifact summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-playtest-diagnostics-"));

  const diagnostics = await collectCandidatePlaytestDiagnostics(root);

  assert.deepEqual(diagnostics, []);
});

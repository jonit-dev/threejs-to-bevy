import assert from "node:assert/strict";
import test from "node:test";

import type { IGameWorkflowReport } from "@threenative/authoring";

import { createProductionPanelModel } from "./productionPanel.js";

test("renders blocked phase rows from report data", () => {
  const report = {
    phaseLedgers: [
      {
        diagnostics: [
          {
            code: "TN_GAME_SCREENSHOT_EVIDENCE_MISSING",
            message: "Screenshot evidence is missing.",
            path: "/phaseLedgers/visuals",
            severity: "error",
          },
        ],
        evidence: [{ description: "visual artifact", kind: "artifact", path: "artifacts/game-production/screenshot.png" }],
        id: "visuals",
        score: 0,
        status: "blocked",
        summary: "Visual scorecard and screenshot evidence.",
      },
    ],
    summary: {
      blockers: 1,
      phasesPassed: 0,
      totalPhases: 1,
      uiStatesCovered: 0,
    },
  } as IGameWorkflowReport;

  const model = createProductionPanelModel(report);

  assert.equal(model.status, "blocked");
  assert.equal(model.rows[0]?.code, "TN_GAME_SCREENSHOT_EVIDENCE_MISSING");
  assert.equal(model.rows[0]?.artifactPath, "artifacts/game-production/screenshot.png");
});

test("renders task graph and proof freshness recommendations", () => {
  const report = {
    phaseLedgers: [],
    summary: {
      blockers: 0,
      phasesPassed: 0,
      totalPhases: 0,
      uiStatesCovered: 0,
    },
  } as unknown as IGameWorkflowReport;

  const model = createProductionPanelModel(report, {
    proofFreshness: {
      fresh: false,
      recommendations: [{ command: "tn build --project . --json", id: "build-bundle", reason: "Bundle is stale." }],
    },
    taskGraph: {
      diagnostics: [],
      recommendations: [{ command: "tn game qa --project . --json", expectedProof: "artifacts/game-production/qa-report.json", id: "run-qa-proof", summary: "Refresh QA." }],
    },
  });

  assert.equal(model.status, "warning");
  assert.equal(model.proofFresh, false);
  assert.equal(model.rows.some((row) => row.id === "run-qa-proof" && row.command === "tn game qa --project . --json"), true);
  assert.equal(model.rows.some((row) => row.id === "build-bundle" && row.command === "tn build --project . --json"), true);
  assert.equal(model.rows.every((row) => row.action === undefined || (row.action.kind === "cli-json" && row.action.safe)), true);
});

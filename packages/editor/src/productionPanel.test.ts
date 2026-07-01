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

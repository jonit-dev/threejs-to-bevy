import assert from "node:assert/strict";
import test from "node:test";

import { ITERATE_REPORT_SCHEMA, ITERATE_REPORT_VERSION, validateIterateReport } from "./iterateReport.js";

test("validates iterate report schema", () => {
  const report = {
    artifacts: { directory: "artifacts/iterate/latest", report: "artifacts/iterate/latest/report.json" },
    code: "TN_ITERATE_OK",
    diagnostics: [],
    durationMs: 12,
    ok: true,
    projectPath: ".",
    schema: ITERATE_REPORT_SCHEMA,
    steps: [{ diagnostics: [], durationMs: 1, id: "validate", status: "pass" }],
    version: ITERATE_REPORT_VERSION,
  };

  assert.deepEqual(validateIterateReport(report), { diagnostics: [], ok: true });
});

test("rejects iterate report with wrong schema", () => {
  const result = validateIterateReport({ schema: "wrong", version: ITERATE_REPORT_VERSION, steps: [] });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_ITERATE_REPORT_SCHEMA_INVALID"), true);
});

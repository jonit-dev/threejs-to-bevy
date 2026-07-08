import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimeTraceBundleFromConformanceReport,
  compareRuntimeTraceBundles,
  validateRuntimeTraceBundle,
  type IRuntimeTraceBundle,
} from "./runtimeTraces.js";
import type { IConformanceReport } from "./conformanceReport.js";

test("should accept a focused runtime trace bundle", () => {
  const trace = traceBundle();
  const result = validateRuntimeTraceBundle(trace);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.ok, true);
});

test("should reject trace with unstable entity id", () => {
  const trace = traceBundle();
  trace.slices.transformSnapshot.entities[0]!.entityId = "scene player";
  const result = validateRuntimeTraceBundle(trace);

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["TN_RUNTIME_TRACE_ID_UNSTABLE"]);
  assert.equal(result.diagnostics[0]?.path, "$.slices.transformSnapshot.entities/0/entityId");
});

test("should compare runtime trace transform slice with tolerance", () => {
  const left = traceBundle();
  const right = traceBundle();
  right.slices.transformSnapshot.entities[0]!.position = [1.0005, 2, 3];

  assert.deepEqual(compareRuntimeTraceBundles(left, right, 0.001), []);

  right.slices.transformSnapshot.entities[0]!.position = [1.01, 2, 3];
  assert.deepEqual(compareRuntimeTraceBundles(left, right, 0.001).map((diagnostic) => diagnostic.code), ["TN_RUNTIME_TRACE_VALUE_MISMATCH"]);
});

test("should derive runtime trace slices from conformance reports", () => {
  const report: IConformanceReport = {
    activeCamera: "camera.main",
    assets: [],
    cameraViews: [{ cameraId: "camera.main", layers: [], order: 0, targetKind: "backbuffer" }],
    diagnostics: [],
    entities: [
      { components: ["Transform"], id: "player", transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
    ],
    events: [],
    fixture: "trace-fixture",
    materials: [],
    resources: [],
    runtime: "web-three",
  };
  const trace = buildRuntimeTraceBundleFromConformanceReport(report);

  assert.equal(validateRuntimeTraceBundle(trace).ok, true);
  assert.deepEqual(trace.slices.renderObservation.cameraViews, [{ cameraId: "camera.main", targetKind: "backbuffer" }]);
  assert.deepEqual(trace.slices.transformSnapshot.entities[0]?.entityId, "player");
});

function traceBundle(): IRuntimeTraceBundle {
  return {
    schema: "threenative.runtime-traces",
    version: "0.1.0",
    slices: {
      animationState: { clips: [], frame: 0 },
      physicsContacts: { contacts: [], frame: 0 },
      renderObservation: {
        activeCamera: "camera.main",
        cameraViews: [{ cameraId: "camera.main", targetKind: "backbuffer" }],
        frame: 0,
        visibleEntities: ["player"],
      },
      transformSnapshot: {
        entities: [
          {
            components: ["Transform"],
            entityId: "player",
            position: [1, 2, 3],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        ],
        frame: 0,
      },
      uiTree: { frame: 0 },
    },
  };
}

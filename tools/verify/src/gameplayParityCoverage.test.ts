import assert from "node:assert/strict";
import test from "node:test";

import { auditGameplayParityCoverage } from "./gameplayParityCoverage.js";

test("should pass when every required scene surface has an assertion", () => {
  const result = auditGameplayParityCoverage({
    assertions: [
      { kind: "entityVisible", surface: { id: "player", type: "entities" } },
      { kind: "assetLoaded", surface: { id: "model.soldier", type: "assets" } },
    ],
    id: "coverage",
    kind: "sceneCoverage",
    requiredSurfaces: {
      assets: ["model.soldier"],
      entities: ["player"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  });

  assert.equal(result.coverageStatus, "pass");
  assert.equal(result.coveragePercent, 100);
});

test("should fail when an entity lacks any assertion", () => {
  const result = auditGameplayParityCoverage({
    assertions: [],
    id: "coverage",
    kind: "sceneCoverage",
    requiredSurfaces: {
      entities: ["player"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  });

  assert.equal(result.coverageStatus, "fail");
  assert.equal(result.diagnostics[0]?.code, "TN_RUNTIME_PARITY_COVERAGE_GAP");
});

test("should keep report-only surfaces visible without passing them", () => {
  const result = auditGameplayParityCoverage({
    assertions: [{ kind: "entityVisible", surface: { id: "player", type: "entities" } }],
    coverage: {
      reportOnly: [{ reason: "Native texture readiness does not expose this binding yet.", surface: { id: "tex.surface.ue-grid", type: "textures" } }],
    },
    id: "coverage",
    kind: "sceneCoverage",
    requiredSurfaces: {
      entities: ["player"],
      textures: ["tex.surface.ue-grid"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  });

  assert.equal(result.coverageStatus, "pass");
  assert.equal(result.assertedSurfaces, 1);
  assert.equal(result.reportOnlySurfaces, 1);
  assert.equal(result.coveragePercent, 50);
});

test("should reject unsupported surfaces without reasons", () => {
  const result = auditGameplayParityCoverage({
    assertions: [],
    coverage: {
      unsupported: [{ reason: "", surface: { id: "hazard.trigger", type: "triggers" } }],
    },
    id: "coverage",
    kind: "sceneCoverage",
    requiredSurfaces: {
      triggers: ["hazard.trigger"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  });

  assert.equal(result.coverageStatus, "fail");
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_COVERAGE_REASON_MISSING"), true);
});

test("should report source inventory coverage debt without passing it as proof", () => {
  const result = auditGameplayParityCoverage({
    assertions: [{ kind: "entityVisible", surface: { id: "player", type: "entities" } }],
    coverage: {
      sourceInventory: {
        entities: ["player"],
        materials: ["mat.course.surface"],
      },
    },
    id: "coverage",
    kind: "sceneCoverage",
    requiredSurfaces: {
      entities: ["player"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  });

  assert.equal(result.coverageStatus, "pass");
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.sourceInventoryCoveragePercent, 50);
  assert.deepEqual(result.sourceInventoryDebtSurfaces, ["materials:mat.course.surface"]);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_SOURCE_COVERAGE_DEBT"), true);
});

test("should fail missing enforced required surfaces", () => {
  const result = auditGameplayParityCoverage({
    assertions: [],
    coverage: {
      sourceInventory: {
        entities: ["player"],
      },
    },
    id: "coverage",
    kind: "sceneCoverage",
    requiredSurfaces: {
      entities: ["player"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  });

  assert.equal(result.coverageStatus, "fail");
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_COVERAGE_GAP"), true);
});

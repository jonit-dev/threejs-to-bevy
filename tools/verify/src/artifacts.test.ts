import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { resolveArtifactTargets } from "./artifacts.js";

const root = resolve("/repo");

test("should resolve example artifact paths under examples when owner is example", () => {
  const targets = resolveArtifactTargets({
    gate: "rendering-lights",
    owner: { kind: "example", exampleName: "sample-scene" },
    root,
  });

  assert.equal(targets.relativeReportPath, "examples/sample-scene/artifacts/rendering-lights/verification-report.json");
  assert.equal(targets.reportPath, resolve(root, "examples/sample-scene/artifacts/rendering-lights/verification-report.json"));
});

test("should resolve aggregate artifact paths under verify tools when owner is aggregate", () => {
  const targets = resolveArtifactTargets({
    gate: "release",
    owner: { kind: "aggregate", name: "release" },
    root,
  });

  assert.equal(targets.relativeReportPath, "tools/verify/artifacts/release/verification-report.json");
  assert.equal(targets.reportPath, resolve(root, "tools/verify/artifacts/release/verification-report.json"));
});

test("should include repo-relative canonical paths in metadata", () => {
  const targets = resolveArtifactTargets({
    gate: "sample-gate",
    legacyDirs: [resolve(root, "examples/sample-scene/artifacts/sample-gate")],
    linkedArtifacts: {
      report: resolve(root, "examples/sample-scene/artifacts/sample-gate/report.json"),
    },
    owner: { kind: "example", exampleName: "sample-scene" },
    root,
  });

  assert.equal(targets.metadata.canonicalArtifactDir, "examples/sample-scene/artifacts/sample-gate");
  assert.deepEqual(targets.metadata.legacyArtifactDirs, ["examples/sample-scene/artifacts/sample-gate"]);
  assert.deepEqual(targets.metadata.linkedArtifacts, {
    report: "examples/sample-scene/artifacts/sample-gate/report.json",
  });
  assert.equal(targets.metadata.canonicalArtifactDir.includes(root), false);
});

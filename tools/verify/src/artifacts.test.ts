import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { resolveArtifactTargets } from "./artifacts.js";

const root = resolve("/repo");

test("should resolve example artifact paths under examples when owner is example", () => {
  const targets = resolveArtifactTargets({
    gate: "rendering-lights",
    owner: { kind: "example", exampleName: "rendering-lights" },
    root,
  });

  assert.equal(targets.relativeReportPath, "examples/rendering-lights/artifacts/rendering-lights/verification-report.json");
  assert.equal(targets.reportPath, resolve(root, "examples/rendering-lights/artifacts/rendering-lights/verification-report.json"));
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
    gate: "camera-views",
    legacyDirs: [resolve(root, "examples/v8-camera-views/artifacts/camera-views")],
    linkedArtifacts: {
      report: resolve(root, "examples/v8-camera-views/artifacts/camera-views/report.json"),
    },
    owner: { kind: "example", exampleName: "v8-camera-views" },
    root,
  });

  assert.equal(targets.metadata.canonicalArtifactDir, "examples/v8-camera-views/artifacts/camera-views");
  assert.deepEqual(targets.metadata.legacyArtifactDirs, ["examples/v8-camera-views/artifacts/camera-views"]);
  assert.deepEqual(targets.metadata.linkedArtifacts, {
    report: "examples/v8-camera-views/artifacts/camera-views/report.json",
  });
  assert.equal(targets.metadata.canonicalArtifactDir.includes(root), false);
});

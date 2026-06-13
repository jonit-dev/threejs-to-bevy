import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareConformanceReports, verifyConformance } from "./verify-conformance.mjs";

test("should fail when runtime reports differ", () => {
  const result = compareConformanceReports(
    report("web-three", { material: "mat.cube" }),
    report("bevy", { material: "mat.other" }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_CONFORMANCE_MISMATCH");
  assert.equal(result.diagnostics[0]?.fixture, "basic-scene");
  assert.equal(result.diagnostics[0]?.leftRuntime, "web-three");
  assert.equal(result.diagnostics[0]?.path, "entities.cube.child.material");
  assert.equal(result.diagnostics[0]?.rightRuntime, "bevy");
});

test("should pass matching reports", () => {
  const result = compareConformanceReports(
    report("web-three", { material: "mat.cube" }),
    report("bevy", { material: "mat.cube" }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should pass matching gate commands and save report path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-conformance-gate-"));
  try {
    const result = await verifyConformance({
      repoRoot: root,
      reportPath: join(root, "artifacts/conformance/verification-report.json"),
      run: async () => ({
        durationMs: 1,
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.steps.length, 3);
    assert.equal(result.reportPath.endsWith("artifacts/conformance/verification-report.json"), true);
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));
    assert.equal(report.status, "pass");
    assert.equal(report.steps.length, 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function report(runtime, overrides = {}) {
  return {
    diagnostics: [],
    entities: [
      {
        components: ["Hierarchy", "MeshRenderer", "Transform"],
        id: "cube.child",
        material: overrides.material,
        mesh: "mesh.cube",
        parent: "scene.root",
        transform: {
          position: [1, 0.5, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    ],
    fixture: "basic-scene",
    runtime,
  };
}

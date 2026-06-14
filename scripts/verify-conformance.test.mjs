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
    {
      artifactPaths: {
        leftReport: "artifacts/conformance/basic-scene/web-three.report.json",
        rightReport: "artifacts/conformance/basic-scene/bevy.report.json",
      },
      bundlePath: "packages/ir/fixtures/conformance/basic-scene/game.bundle",
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_CONFORMANCE_MISMATCH");
  assert.equal(result.diagnostics[0]?.fixture, "basic-scene");
  assert.equal(result.diagnostics[0]?.leftRuntime, "web-three");
  assert.equal(result.diagnostics[0]?.path, '$.entities["cube.child"].material');
  assert.equal(result.diagnostics[0]?.rightRuntime, "bevy");
  assert.equal(result.diagnostics[0]?.bundlePath, "packages/ir/fixtures/conformance/basic-scene/game.bundle");
  assert.equal(result.diagnostics[0]?.artifactPaths.leftReport, "artifacts/conformance/basic-scene/web-three.report.json");
});

test("should localize material texture slot mismatches", () => {
  const result = compareConformanceReports(
    report("web-three", { baseColor: "tex.albedo" }),
    report("bevy", { baseColor: "tex.other" }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.path, '$.materials["mat.cube"].textures.baseColor');
  assert.equal(result.diagnostics[0]?.left, "tex.albedo");
  assert.equal(result.diagnostics[0]?.right, "tex.other");
});

test("should localize resource and event observation mismatches", () => {
  const result = compareConformanceReports(
    report("web-three", {
      eventAmount: 2,
      score: 3,
    }),
    report("bevy", {
      eventAmount: 4,
      score: 5,
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.path, '$.resources["Score"].value.value');
  assert.equal(result.diagnostics[0]?.left, 3);
  assert.equal(result.diagnostics[0]?.right, 5);
  assert.equal(result.diagnostics[1]?.path, '$.events["DamageEvent"].values[0].amount');
});

test("should localize audio observation mismatches", () => {
  const result = compareConformanceReports(
    report("web-three", { audioAsset: "hit.sound" }),
    report("bevy", { audioAsset: "other.sound" }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.path, "$.audio.commands[0].asset");
  assert.equal(result.diagnostics[0]?.left, "hit.sound");
  assert.equal(result.diagnostics[0]?.right, "other.sound");
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
    assert.equal(result.steps.length, 11);
    assert.equal(result.reportPath.endsWith("artifacts/conformance/verification-report.json"), true);
    assert.equal(result.artifacts.nativeBasicSceneReportPath.endsWith("artifacts/conformance/basic-scene/bevy.report.json"), true);
    assert.equal(
      result.artifacts.nativeV6AnimationClipsReportPath.endsWith("artifacts/conformance/v6-animation-clips/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6PhysicsEventsReportPath.endsWith("artifacts/conformance/v6-physics-events/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6ResourcesEventsReportPath.endsWith("artifacts/conformance/v6-resources-events/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6RetainedUiReportPath.endsWith("artifacts/conformance/v6-retained-ui/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6AudioPlaybackReportPath.endsWith("artifacts/conformance/v6-audio-playback/bevy.report.json"),
      true,
    );
    assert.equal(result.artifacts.v6AnimationDiffPath.endsWith("artifacts/conformance/v6-animation-clips/effects-diff.json"), true);
    assert.equal(result.artifacts.v6AnimationNativeEffectsPath.endsWith("artifacts/conformance/v6-animation-clips/native-effects.json"), true);
    assert.equal(result.artifacts.v6AnimationWebEffectsPath.endsWith("artifacts/conformance/v6-animation-clips/web-effects.json"), true);
    assert.equal(result.artifacts.v6ResourceEventDiffPath.endsWith("artifacts/conformance/v6-resources-events/effects-diff.json"), true);
    assert.equal(result.artifacts.v6ResourceEventNativeEffectsPath.endsWith("artifacts/conformance/v6-resources-events/native-effects.json"), true);
    assert.equal(result.artifacts.v6ResourceEventWebEffectsPath.endsWith("artifacts/conformance/v6-resources-events/web-effects.json"), true);
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));
    assert.equal(report.status, "pass");
    assert.equal(report.steps.length, 11);
    assert.equal(report.artifacts.nativeBasicSceneReportPath.endsWith("artifacts/conformance/basic-scene/bevy.report.json"), true);
    assert.equal(
      report.artifacts.nativeV6AnimationClipsReportPath.endsWith("artifacts/conformance/v6-animation-clips/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6PhysicsEventsReportPath.endsWith("artifacts/conformance/v6-physics-events/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6ResourcesEventsReportPath.endsWith("artifacts/conformance/v6-resources-events/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6RetainedUiReportPath.endsWith("artifacts/conformance/v6-retained-ui/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6AudioPlaybackReportPath.endsWith("artifacts/conformance/v6-audio-playback/bevy.report.json"),
      true,
    );
    assert.equal(report.artifacts.v6AnimationDiffPath.endsWith("artifacts/conformance/v6-animation-clips/effects-diff.json"), true);
    assert.equal(report.artifacts.v6AnimationNativeEffectsPath.endsWith("artifacts/conformance/v6-animation-clips/native-effects.json"), true);
    assert.equal(report.artifacts.v6AnimationWebEffectsPath.endsWith("artifacts/conformance/v6-animation-clips/web-effects.json"), true);
    assert.equal(report.artifacts.v6ResourceEventDiffPath.endsWith("artifacts/conformance/v6-resources-events/effects-diff.json"), true);
    assert.equal(report.artifacts.v6ResourceEventNativeEffectsPath.endsWith("artifacts/conformance/v6-resources-events/native-effects.json"), true);
    assert.equal(report.artifacts.v6ResourceEventWebEffectsPath.endsWith("artifacts/conformance/v6-resources-events/web-effects.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function report(runtime, overrides = {}) {
  return {
    assets: [
      {
        format: "generated",
        id: "mesh.cube",
        kind: "mesh",
        primitive: "box",
        size: [1, 1, 1],
      },
    ],
    audio: {
      commands: [{ asset: overrides.audioAsset ?? "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot" }],
    },
    diagnostics: [],
    entities: [
      {
        components: ["Hierarchy", "MeshRenderer", "Transform"],
        id: "cube.child",
        material: overrides.material,
        meshRenderer: {
          material: overrides.material,
          mesh: "mesh.cube",
        },
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
    events: [
      {
        id: "DamageEvent",
        values: [
          {
            amount: overrides.eventAmount ?? 2,
          },
        ],
      },
    ],
    materials: [
      {
        color: "#c0ffee",
        id: "mat.cube",
        kind: "standard",
        roughness: 0.5,
        textures: {
          baseColor: overrides.baseColor,
        },
      },
    ],
    resources: [
      {
        id: "Score",
        value: {
          value: overrides.score ?? 3,
        },
      },
    ],
    runtime,
  };
}

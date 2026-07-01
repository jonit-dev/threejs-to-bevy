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
        comparisonReport: "packages/ir/artifacts/conformance/basic-scene/comparison.report.json",
        leftReport: "packages/ir/artifacts/conformance/basic-scene/web-three.report.json",
        rightReport: "packages/ir/artifacts/conformance/basic-scene/bevy.report.json",
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
  assert.equal(result.diagnostics[0]?.expected, "mat.cube");
  assert.equal(result.diagnostics[0]?.actual, "mat.other");
  assert.equal(result.diagnostics[0]?.expectedRuntime, "web-three");
  assert.equal(result.diagnostics[0]?.actualRuntime, "bevy");
  assert.equal(result.diagnostics[0]?.artifactPath, "packages/ir/artifacts/conformance/basic-scene/comparison.report.json");
  assert.equal(result.diagnostics[0]?.artifactPaths.leftReport, "packages/ir/artifacts/conformance/basic-scene/web-three.report.json");
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

test("should localize runtime config mismatches", () => {
  const result = compareConformanceReports(
    report("web-three", { antialias: "msaa4" }),
    report("bevy", { antialias: "msaa8" }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.path, "$.runtimeConfig.renderer.antialias");
  assert.equal(result.diagnostics[0]?.left, "msaa4");
  assert.equal(result.diagnostics[0]?.right, "msaa8");
});

test("should localize active camera mismatches", () => {
  const result = compareConformanceReports(
    report("web-three", { activeCamera: "camera.main" }),
    report("bevy", { activeCamera: "camera.ui" }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.path, "$.activeCamera");
  assert.equal(result.diagnostics[0]?.left, "camera.main");
  assert.equal(result.diagnostics[0]?.right, "camera.ui");
});

test("should fail when required V7 observations are silently missing", () => {
  const left = report("web-three");
  const right = report("bevy");
  left.ui = { focusOrder: ["start"] };
  right.ui = { focusOrder: ["start"] };
  delete right.ui;

  const result = compareConformanceReports(left, right, {
    artifactPaths: {
      comparisonReport: "packages/ir/artifacts/conformance/rich-ui-navigation/comparison.report.json",
      leftReport: "packages/ir/artifacts/conformance/rich-ui-navigation/web.report.json",
      rightReport: "packages/ir/artifacts/conformance/rich-ui-navigation/bevy.report.json",
    },
    bundlePath: "packages/ir/fixtures/conformance/rich-ui-navigation/game.bundle",
    requiredPaths: [{ expected: "ui navigation observation", path: "$.ui" }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_CONFORMANCE_REQUIRED_OBSERVATION_MISSING");
  assert.equal(result.diagnostics[0]?.fixture, "basic-scene");
  assert.equal(result.diagnostics[0]?.path, "$.ui");
  assert.equal(result.diagnostics[0]?.expected, "ui navigation observation");
  assert.equal(result.diagnostics[0]?.actual, "missing");
  assert.equal(result.diagnostics[0]?.expectedRuntime, "catalog");
  assert.equal(result.diagnostics[0]?.actualRuntime, "bevy");
  assert.equal(result.diagnostics[0]?.bundlePath, "packages/ir/fixtures/conformance/rich-ui-navigation/game.bundle");
  assert.equal(result.diagnostics[0]?.artifactPath, "packages/ir/artifacts/conformance/rich-ui-navigation/comparison.report.json");
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
      reportPath: join(root, "packages/ir/artifacts/conformance/verification-report.json"),
      run: async () => ({
        durationMs: 1,
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.steps.length, 28);
    assert.equal(result.reportPath.endsWith("packages/ir/artifacts/conformance/verification-report.json"), true);
    assert.equal(result.artifacts.nativeBasicSceneReportPath.endsWith("packages/ir/artifacts/conformance/basic-scene/bevy.report.json"), true);
    assert.equal(
      result.artifacts.nativePrimitiveMappingReportPath.endsWith("packages/ir/artifacts/conformance/primitive-mapping/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6AnimationClipsReportPath.endsWith("packages/ir/artifacts/conformance/animation-clips/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6PhysicsEventsReportPath.endsWith("packages/ir/artifacts/conformance/physics-events/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6ResourcesEventsReportPath.endsWith("packages/ir/artifacts/conformance/resources-events/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6RetainedUiReportPath.endsWith("packages/ir/artifacts/conformance/retained-ui/bevy.report.json"),
      true,
    );
    assert.equal(
      result.artifacts.nativeV6AudioPlaybackReportPath.endsWith("packages/ir/artifacts/conformance/audio-playback/bevy.report.json"),
      true,
    );
    assert.equal(result.artifacts.v6AnimationDiffPath.endsWith("packages/ir/artifacts/conformance/animation-clips/effects-diff.json"), true);
    assert.equal(result.artifacts.v6AnimationNativeEffectsPath.endsWith("packages/ir/artifacts/conformance/animation-clips/native-effects.json"), true);
    assert.equal(result.artifacts.v6AnimationWebEffectsPath.endsWith("packages/ir/artifacts/conformance/animation-clips/web-effects.json"), true);
    assert.equal(result.artifacts.v6ResourceEventDiffPath.endsWith("packages/ir/artifacts/conformance/resources-events/effects-diff.json"), true);
    assert.equal(result.artifacts.v6ResourceEventNativeEffectsPath.endsWith("packages/ir/artifacts/conformance/resources-events/native-effects.json"), true);
    assert.equal(result.artifacts.v6ResourceEventWebEffectsPath.endsWith("packages/ir/artifacts/conformance/resources-events/web-effects.json"), true);
    assert.equal(result.artifacts.v7PhysicsQueryDiffPath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/effects-diff.json"), true);
    assert.equal(
      result.artifacts.v7PhysicsQueryNativeEffectsPath.endsWith(
        "packages/ir/artifacts/conformance/advanced-physics-character/native-effects.json",
      ),
      true,
    );
    assert.equal(
      result.artifacts.v7PhysicsQueryWebEffectsPath.endsWith(
        "packages/ir/artifacts/conformance/advanced-physics-character/web-effects.json",
      ),
      true,
    );
    assert.equal(result.artifacts.v7CharacterDiffPath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/character-diff.json"), true);
    assert.equal(
      result.artifacts.v7CharacterNativeTracePath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/native-character.json"),
      true,
    );
    assert.equal(
      result.artifacts.v7CharacterWebTracePath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/web-character.json"),
      true,
    );
    assert.equal(result.artifacts.v7AnimationDiffPath.endsWith("packages/ir/artifacts/conformance/animation-graphs-particles/animation-diff.json"), true);
    assert.equal(
      result.artifacts.v7AnimationNativeTracePath.endsWith("packages/ir/artifacts/conformance/animation-graphs-particles/native-animation.json"),
      true,
    );
    assert.equal(
      result.artifacts.v7AnimationWebTracePath.endsWith("packages/ir/artifacts/conformance/animation-graphs-particles/web-animation.json"),
      true,
    );
    assert.equal(result.artifacts.v7UiNavigationDiffPath.endsWith("packages/ir/artifacts/conformance/rich-ui-navigation/ui-navigation-diff.json"), true);
    assert.equal(
      result.artifacts.v7UiNavigationNativeTracePath.endsWith("packages/ir/artifacts/conformance/rich-ui-navigation/native-ui-navigation.json"),
      true,
    );
    assert.equal(
      result.artifacts.v7UiNavigationWebTracePath.endsWith("packages/ir/artifacts/conformance/rich-ui-navigation/web-ui-navigation.json"),
      true,
    );
    assert.equal(result.artifacts.v7AudioLifecycleDiffPath.endsWith("packages/ir/artifacts/conformance/spatial-audio-buses/audio-lifecycle-diff.json"), true);
    assert.equal(
      result.artifacts.v7AudioLifecycleNativeTracePath.endsWith("packages/ir/artifacts/conformance/spatial-audio-buses/native-audio-lifecycle.json"),
      true,
    );
    assert.equal(
      result.artifacts.v7AudioLifecycleWebTracePath.endsWith("packages/ir/artifacts/conformance/spatial-audio-buses/web-audio-lifecycle.json"),
      true,
    );
    assert.equal(result.artifacts.v7EnvironmentContentDiffPath.endsWith("packages/ir/artifacts/conformance/renderer-dense-content/environment-content-diff.json"), true);
    assert.equal(
      result.artifacts.v7EnvironmentContentNativeTracePath.endsWith("packages/ir/artifacts/conformance/renderer-dense-content/native-environment-content.json"),
      true,
    );
    assert.equal(
      result.artifacts.v7EnvironmentContentWebTracePath.endsWith("packages/ir/artifacts/conformance/renderer-dense-content/web-environment-content.json"),
      true,
    );
    assert.equal(result.artifacts.v7ScriptingLifecycleDiffPath.endsWith("packages/ir/artifacts/conformance/scripting-lifecycle/effects-diff.json"), true);
    assert.equal(result.artifacts.v7ScriptingLifecycleNativeEffectsPath.endsWith("packages/ir/artifacts/conformance/scripting-lifecycle/native-effects.json"), true);
    assert.equal(result.artifacts.v7ScriptingLifecycleWebEffectsPath.endsWith("packages/ir/artifacts/conformance/scripting-lifecycle/web-effects.json"), true);
    assert.equal(result.artifacts.v7PackagingPackageReportPath.endsWith("packages/ir/artifacts/conformance/packaging-target-profiles/package.report.json"), true);
    assert.equal(
      result.artifacts.v7PackagingDesktopSmokeReportPath.endsWith("packages/ir/artifacts/conformance/packaging-target-profiles/desktop-smoke.report.json"),
      true,
    );
    assert.equal(result.artifacts.v7PackagingComparisonReportPath.endsWith("packages/ir/artifacts/conformance/packaging-target-profiles/comparison.report.json"), true);
    assert.equal(result.artifacts.v7PerformanceWebReportPath.endsWith("packages/ir/artifacts/conformance/performance-budgets/web.report.json"), true);
    assert.equal(result.artifacts.v7PerformanceNativeReportPath.endsWith("packages/ir/artifacts/conformance/performance-budgets/bevy.report.json"), true);
    assert.equal(result.artifacts.v7PerformanceComparisonReportPath.endsWith("packages/ir/artifacts/conformance/performance-budgets/comparison.report.json"), true);
    assert.equal(result.artifacts.v9AnimationStateDiffPath.endsWith("packages/ir/artifacts/conformance/animation-state/state-diff.json"), true);
    assert.equal(result.artifacts.v9AnimationStateNativeTracePath.endsWith("packages/ir/artifacts/conformance/animation-state/native-state.json"), true);
    assert.equal(result.artifacts.v9AnimationStateWebTracePath.endsWith("packages/ir/artifacts/conformance/animation-state/web-state.json"), true);
    assert.equal(result.artifacts.v9AnimationBlendingReportPath.endsWith("packages/ir/artifacts/conformance/animation-blending/blend-report.json"), true);
    assert.equal(result.artifacts.v9AnimationBlendingNativeTracePath.endsWith("packages/ir/artifacts/conformance/animation-blending/native-blend.json"), true);
    assert.equal(result.artifacts.v9AnimationBlendingWebTracePath.endsWith("packages/ir/artifacts/conformance/animation-blending/web-blend.json"), true);
    assert.equal(result.artifacts.v9PhysicsCharacterDiffPath.endsWith("packages/ir/artifacts/conformance/physics-character/diff-physics-character.json"), true);
    assert.equal(result.artifacts.v9PhysicsCharacterNativeTracePath.endsWith("packages/ir/artifacts/conformance/physics-character/native-physics-character.json"), true);
    assert.equal(result.artifacts.v9PhysicsCharacterReportPath.endsWith("packages/ir/artifacts/conformance/physics-character/verification-report.json"), true);
    assert.equal(result.artifacts.v9PhysicsCharacterWebTracePath.endsWith("packages/ir/artifacts/conformance/physics-character/web-physics-character.json"), true);
    assert.equal(result.artifacts.sceneLifecycleDiffPath.endsWith("packages/ir/artifacts/conformance/scene-lifecycle/scene-lifecycle-diff.json"), true);
    assert.equal(result.artifacts.sceneLifecycleNativeTracePath.endsWith("packages/ir/artifacts/conformance/scene-lifecycle/native-scene-lifecycle.json"), true);
    assert.equal(result.artifacts.sceneLifecycleWebTracePath.endsWith("packages/ir/artifacts/conformance/scene-lifecycle/web-scene-lifecycle.json"), true);
    assert.equal(result.artifacts.v9AssetsGltfReportPath.endsWith("tools/verify/artifacts/assets-gltf-scene-workflow/diff.json"), true);
    assert.equal(result.artifacts.v9RenderingLightsReportPath.endsWith("tools/verify/artifacts/rendering-lights/verification-report.json"), true);
    assert.equal(result.artifacts.nativeV9SupportStressReportPath.endsWith("packages/ir/artifacts/conformance/support-stress/bevy.report.json"), true);
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));
    assert.equal(report.status, "pass");
    assert.equal(report.steps.length, 28);
    assert.equal(report.artifacts.nativeBasicSceneReportPath.endsWith("packages/ir/artifacts/conformance/basic-scene/bevy.report.json"), true);
    assert.equal(
      report.artifacts.nativePrimitiveMappingReportPath.endsWith("packages/ir/artifacts/conformance/primitive-mapping/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6AnimationClipsReportPath.endsWith("packages/ir/artifacts/conformance/animation-clips/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6PhysicsEventsReportPath.endsWith("packages/ir/artifacts/conformance/physics-events/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6ResourcesEventsReportPath.endsWith("packages/ir/artifacts/conformance/resources-events/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6RetainedUiReportPath.endsWith("packages/ir/artifacts/conformance/retained-ui/bevy.report.json"),
      true,
    );
    assert.equal(
      report.artifacts.nativeV6AudioPlaybackReportPath.endsWith("packages/ir/artifacts/conformance/audio-playback/bevy.report.json"),
      true,
    );
    assert.equal(report.artifacts.v6AnimationDiffPath.endsWith("packages/ir/artifacts/conformance/animation-clips/effects-diff.json"), true);
    assert.equal(report.artifacts.v6AnimationNativeEffectsPath.endsWith("packages/ir/artifacts/conformance/animation-clips/native-effects.json"), true);
    assert.equal(report.artifacts.v6AnimationWebEffectsPath.endsWith("packages/ir/artifacts/conformance/animation-clips/web-effects.json"), true);
    assert.equal(report.artifacts.v6ResourceEventDiffPath.endsWith("packages/ir/artifacts/conformance/resources-events/effects-diff.json"), true);
    assert.equal(report.artifacts.v6ResourceEventNativeEffectsPath.endsWith("packages/ir/artifacts/conformance/resources-events/native-effects.json"), true);
    assert.equal(report.artifacts.v6ResourceEventWebEffectsPath.endsWith("packages/ir/artifacts/conformance/resources-events/web-effects.json"), true);
    assert.equal(report.artifacts.v7PhysicsQueryDiffPath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/effects-diff.json"), true);
    assert.equal(
      report.artifacts.v7PhysicsQueryNativeEffectsPath.endsWith(
        "packages/ir/artifacts/conformance/advanced-physics-character/native-effects.json",
      ),
      true,
    );
    assert.equal(
      report.artifacts.v7PhysicsQueryWebEffectsPath.endsWith(
        "packages/ir/artifacts/conformance/advanced-physics-character/web-effects.json",
      ),
      true,
    );
    assert.equal(report.artifacts.v7CharacterDiffPath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/character-diff.json"), true);
    assert.equal(
      report.artifacts.v7CharacterNativeTracePath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/native-character.json"),
      true,
    );
    assert.equal(
      report.artifacts.v7CharacterWebTracePath.endsWith("packages/ir/artifacts/conformance/advanced-physics-character/web-character.json"),
      true,
    );
    assert.equal(report.artifacts.v7AnimationDiffPath.endsWith("packages/ir/artifacts/conformance/animation-graphs-particles/animation-diff.json"), true);
    assert.equal(
      report.artifacts.v7AnimationNativeTracePath.endsWith("packages/ir/artifacts/conformance/animation-graphs-particles/native-animation.json"),
      true,
    );
    assert.equal(
      report.artifacts.v7AnimationWebTracePath.endsWith("packages/ir/artifacts/conformance/animation-graphs-particles/web-animation.json"),
      true,
    );
    assert.equal(report.artifacts.v7UiNavigationDiffPath.endsWith("packages/ir/artifacts/conformance/rich-ui-navigation/ui-navigation-diff.json"), true);
    assert.equal(
      report.artifacts.v7UiNavigationNativeTracePath.endsWith("packages/ir/artifacts/conformance/rich-ui-navigation/native-ui-navigation.json"),
      true,
    );
    assert.equal(
      report.artifacts.v7UiNavigationWebTracePath.endsWith("packages/ir/artifacts/conformance/rich-ui-navigation/web-ui-navigation.json"),
      true,
    );
    assert.equal(report.artifacts.v7AudioLifecycleDiffPath.endsWith("packages/ir/artifacts/conformance/spatial-audio-buses/audio-lifecycle-diff.json"), true);
    assert.equal(
      report.artifacts.v7AudioLifecycleNativeTracePath.endsWith("packages/ir/artifacts/conformance/spatial-audio-buses/native-audio-lifecycle.json"),
      true,
    );
    assert.equal(
      report.artifacts.v7AudioLifecycleWebTracePath.endsWith("packages/ir/artifacts/conformance/spatial-audio-buses/web-audio-lifecycle.json"),
      true,
    );
    assert.equal(report.artifacts.v7EnvironmentContentDiffPath.endsWith("packages/ir/artifacts/conformance/renderer-dense-content/environment-content-diff.json"), true);
    assert.equal(
      report.artifacts.v7EnvironmentContentNativeTracePath.endsWith("packages/ir/artifacts/conformance/renderer-dense-content/native-environment-content.json"),
      true,
    );
    assert.equal(
      report.artifacts.v7EnvironmentContentWebTracePath.endsWith("packages/ir/artifacts/conformance/renderer-dense-content/web-environment-content.json"),
      true,
    );
    assert.equal(report.artifacts.v7ScriptingLifecycleDiffPath.endsWith("packages/ir/artifacts/conformance/scripting-lifecycle/effects-diff.json"), true);
    assert.equal(report.artifacts.v7ScriptingLifecycleNativeEffectsPath.endsWith("packages/ir/artifacts/conformance/scripting-lifecycle/native-effects.json"), true);
    assert.equal(report.artifacts.v7ScriptingLifecycleWebEffectsPath.endsWith("packages/ir/artifacts/conformance/scripting-lifecycle/web-effects.json"), true);
    assert.equal(report.artifacts.v7PackagingPackageReportPath.endsWith("packages/ir/artifacts/conformance/packaging-target-profiles/package.report.json"), true);
    assert.equal(
      report.artifacts.v7PackagingDesktopSmokeReportPath.endsWith("packages/ir/artifacts/conformance/packaging-target-profiles/desktop-smoke.report.json"),
      true,
    );
    assert.equal(report.artifacts.v7PackagingComparisonReportPath.endsWith("packages/ir/artifacts/conformance/packaging-target-profiles/comparison.report.json"), true);
    assert.equal(report.artifacts.v7PerformanceWebReportPath.endsWith("packages/ir/artifacts/conformance/performance-budgets/web.report.json"), true);
    assert.equal(report.artifacts.v7PerformanceNativeReportPath.endsWith("packages/ir/artifacts/conformance/performance-budgets/bevy.report.json"), true);
    assert.equal(report.artifacts.v7PerformanceComparisonReportPath.endsWith("packages/ir/artifacts/conformance/performance-budgets/comparison.report.json"), true);
    assert.equal(report.artifacts.v9AnimationStateDiffPath.endsWith("packages/ir/artifacts/conformance/animation-state/state-diff.json"), true);
    assert.equal(report.artifacts.v9AnimationStateNativeTracePath.endsWith("packages/ir/artifacts/conformance/animation-state/native-state.json"), true);
    assert.equal(report.artifacts.v9AnimationStateWebTracePath.endsWith("packages/ir/artifacts/conformance/animation-state/web-state.json"), true);
    assert.equal(report.artifacts.v9AnimationBlendingReportPath.endsWith("packages/ir/artifacts/conformance/animation-blending/blend-report.json"), true);
    assert.equal(report.artifacts.v9AnimationBlendingNativeTracePath.endsWith("packages/ir/artifacts/conformance/animation-blending/native-blend.json"), true);
    assert.equal(report.artifacts.v9AnimationBlendingWebTracePath.endsWith("packages/ir/artifacts/conformance/animation-blending/web-blend.json"), true);
    assert.equal(report.artifacts.v9PhysicsCharacterReportPath.endsWith("packages/ir/artifacts/conformance/physics-character/verification-report.json"), true);
    assert.equal(report.artifacts.sceneLifecycleDiffPath.endsWith("packages/ir/artifacts/conformance/scene-lifecycle/scene-lifecycle-diff.json"), true);
    assert.equal(report.artifacts.sceneLifecycleNativeTracePath.endsWith("packages/ir/artifacts/conformance/scene-lifecycle/native-scene-lifecycle.json"), true);
    assert.equal(report.artifacts.sceneLifecycleWebTracePath.endsWith("packages/ir/artifacts/conformance/scene-lifecycle/web-scene-lifecycle.json"), true);
    assert.equal(report.artifacts.v9AssetsGltfReportPath.endsWith("tools/verify/artifacts/assets-gltf-scene-workflow/diff.json"), true);
    assert.equal(report.artifacts.v9RenderingLightsReportPath.endsWith("tools/verify/artifacts/rendering-lights/verification-report.json"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should map V9 physics failures to the V9 physics fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-conformance-physics-"));
  try {
    const reportPath = join(root, "packages/ir/artifacts/conformance/verification-report.json");
    const result = await verifyConformance({
      artifactDir: join(root, "packages/ir/artifacts/conformance"),
      repoRoot: root,
      reportPath,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: name === "V9 physics character runtime trace parity" ? 1 : 0,
        stderr: name === "V9 physics character runtime trace parity" ? "physics failed" : "",
        stdout: "",
      }),
    });
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(report.diagnostics[0]?.fixture, "physics-character");
    assert.match(report.diagnostics[0]?.artifactPath ?? "", /physics-character\/verification-report\.json/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose V9 artifact paths for latest PR gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-conformance-artifacts-"));
  try {
    const result = await verifyConformance({
      artifactDir: join(root, "packages/ir/artifacts/conformance"),
      repoRoot: root,
      run: async () => ({ durationMs: 1, exitCode: 0, stderr: "", stdout: "" }),
    });
    assert.match(result.artifacts.v9PhysicsCharacterReportPath, /physics-character\/verification-report\.json/);
    assert.match(result.artifacts.v9AssetsGltfReportPath, /assets-gltf-scene-workflow\/diff\.json/);
    assert.match(result.artifacts.v9RenderingLightsReportPath, /rendering-lights\/verification-report\.json/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function report(runtime, overrides = {}) {
  return {
    activeCamera: overrides.activeCamera ?? "camera.main",
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
    runtimeConfig: {
      renderer: {
        antialias: overrides.antialias ?? "msaa4",
        bloom: { enabled: true, intensity: 0.25, threshold: 0.8 },
      },
    },
  };
}

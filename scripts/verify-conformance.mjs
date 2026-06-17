import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyConformance(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const reportPath = options.reportPath ?? resolve(root, "artifacts/conformance/verification-report.json");
  const artifactDir = options.artifactDir ?? resolve(reportPath, "..");
  const nativeRuntimeCwd = resolve(root, "runtime-bevy");
  const nativeCargoEnv = { CARGO_TARGET_DIR: resolve(artifactDir, "cargo-target") };
  const basicSceneBundlePath = resolve(root, "packages/ir/fixtures/conformance/basic-scene/game.bundle");
  const primitiveMappingBundlePath = resolve(root, "packages/ir/fixtures/conformance/primitive-mapping/game.bundle");
  const v6PhysicsEventsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-physics-events/game.bundle");
  const v6AudioPlaybackBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-audio-playback/game.bundle");
  const v6AnimationClipsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-animation-clips/game.bundle");
  const v6ResourcesEventsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-resources-events/game.bundle");
  const v6RetainedUiBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-retained-ui/game.bundle");
  const v7AdvancedPhysicsCharacterBundlePath = resolve(
    root,
    "packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle",
  );
  const v7AnimationGraphsParticlesBundlePath = resolve(
    root,
    "packages/ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle",
  );
  const v7RichUiNavigationBundlePath = resolve(root, "packages/ir/fixtures/conformance/v7-rich-ui-navigation/game.bundle");
  const v7SpatialAudioBusesBundlePath = resolve(root, "packages/ir/fixtures/conformance/v7-spatial-audio-buses/game.bundle");
  const v7RendererDenseContentBundlePath = resolve(root, "packages/ir/fixtures/conformance/v7-renderer-dense-content/game.bundle");
  const v7ScriptingLifecycleBundlePath = resolve(root, "packages/ir/fixtures/conformance/v7-scripting-lifecycle/game.bundle");
  const v7PackagingTargetProfilesBundlePath = resolve(root, "packages/ir/fixtures/conformance/v7-packaging-target-profiles/game.bundle");
  const v7PerformanceBudgetsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v7-performance-budgets/game.bundle");
  const v9AnimationStateBundlePath = resolve(root, "packages/ir/fixtures/conformance/v9-animation-state/game.bundle");
  const v9AnimationBlendingBundlePath = resolve(root, "packages/ir/fixtures/conformance/v9-animation-blending/game.bundle");
  const v9SupportStressBundlePath = resolve(root, "packages/ir/fixtures/conformance/v9-support-stress/game.bundle");
  const nativeBasicSceneReportPath = options.nativeBasicSceneReportPath ?? resolve(artifactDir, "basic-scene/bevy.report.json");
  const nativePrimitiveMappingReportPath =
    options.nativePrimitiveMappingReportPath ?? resolve(artifactDir, "primitive-mapping/bevy.report.json");
  const nativeV6PhysicsEventsReportPath =
    options.nativeV6PhysicsEventsReportPath ?? resolve(artifactDir, "v6-physics-events/bevy.report.json");
  const nativeV6AnimationClipsReportPath =
    options.nativeV6AnimationClipsReportPath ?? resolve(artifactDir, "v6-animation-clips/bevy.report.json");
  const nativeV6AudioPlaybackReportPath =
    options.nativeV6AudioPlaybackReportPath ?? resolve(artifactDir, "v6-audio-playback/bevy.report.json");
  const nativeV6ResourcesEventsReportPath =
    options.nativeV6ResourcesEventsReportPath ?? resolve(artifactDir, "v6-resources-events/bevy.report.json");
  const nativeV6RetainedUiReportPath =
    options.nativeV6RetainedUiReportPath ?? resolve(artifactDir, "v6-retained-ui/bevy.report.json");
  const v6AnimationDiffPath = options.v6AnimationDiffPath ?? resolve(artifactDir, "v6-animation-clips/effects-diff.json");
  const v6AnimationNativeEffectsPath = options.v6AnimationNativeEffectsPath ?? resolve(artifactDir, "v6-animation-clips/native-effects.json");
  const v6AnimationWebEffectsPath = options.v6AnimationWebEffectsPath ?? resolve(artifactDir, "v6-animation-clips/web-effects.json");
  const v6ResourceEventDiffPath = options.v6ResourceEventDiffPath ?? resolve(artifactDir, "v6-resources-events/effects-diff.json");
  const v6ResourceEventNativeEffectsPath = options.v6ResourceEventNativeEffectsPath ?? resolve(artifactDir, "v6-resources-events/native-effects.json");
  const v6ResourceEventWebEffectsPath = options.v6ResourceEventWebEffectsPath ?? resolve(artifactDir, "v6-resources-events/web-effects.json");
  const v7PhysicsQueryDiffPath = options.v7PhysicsQueryDiffPath ?? resolve(artifactDir, "v7-advanced-physics-character/effects-diff.json");
  const v7PhysicsQueryNativeEffectsPath =
    options.v7PhysicsQueryNativeEffectsPath ?? resolve(artifactDir, "v7-advanced-physics-character/native-effects.json");
  const v7PhysicsQueryWebEffectsPath =
    options.v7PhysicsQueryWebEffectsPath ?? resolve(artifactDir, "v7-advanced-physics-character/web-effects.json");
  const v7CharacterDiffPath = options.v7CharacterDiffPath ?? resolve(artifactDir, "v7-advanced-physics-character/character-diff.json");
  const v7CharacterNativeTracePath =
    options.v7CharacterNativeTracePath ?? resolve(artifactDir, "v7-advanced-physics-character/native-character.json");
  const v7CharacterWebTracePath =
    options.v7CharacterWebTracePath ?? resolve(artifactDir, "v7-advanced-physics-character/web-character.json");
  const v7AnimationDiffPath = options.v7AnimationDiffPath ?? resolve(artifactDir, "v7-animation-graphs-particles/animation-diff.json");
  const v7AnimationNativeTracePath =
    options.v7AnimationNativeTracePath ?? resolve(artifactDir, "v7-animation-graphs-particles/native-animation.json");
  const v7AnimationWebTracePath =
    options.v7AnimationWebTracePath ?? resolve(artifactDir, "v7-animation-graphs-particles/web-animation.json");
  const v7UiNavigationDiffPath = options.v7UiNavigationDiffPath ?? resolve(artifactDir, "v7-rich-ui-navigation/ui-navigation-diff.json");
  const v7UiNavigationNativeTracePath =
    options.v7UiNavigationNativeTracePath ?? resolve(artifactDir, "v7-rich-ui-navigation/native-ui-navigation.json");
  const v7UiNavigationWebTracePath =
    options.v7UiNavigationWebTracePath ?? resolve(artifactDir, "v7-rich-ui-navigation/web-ui-navigation.json");
  const v7AudioLifecycleDiffPath = options.v7AudioLifecycleDiffPath ?? resolve(artifactDir, "v7-spatial-audio-buses/audio-lifecycle-diff.json");
  const v7AudioLifecycleNativeTracePath =
    options.v7AudioLifecycleNativeTracePath ?? resolve(artifactDir, "v7-spatial-audio-buses/native-audio-lifecycle.json");
  const v7AudioLifecycleWebTracePath =
    options.v7AudioLifecycleWebTracePath ?? resolve(artifactDir, "v7-spatial-audio-buses/web-audio-lifecycle.json");
  const v7EnvironmentContentDiffPath = options.v7EnvironmentContentDiffPath ?? resolve(artifactDir, "v7-renderer-dense-content/environment-content-diff.json");
  const v7EnvironmentContentNativeTracePath =
    options.v7EnvironmentContentNativeTracePath ?? resolve(artifactDir, "v7-renderer-dense-content/native-environment-content.json");
  const v7EnvironmentContentWebTracePath =
    options.v7EnvironmentContentWebTracePath ?? resolve(artifactDir, "v7-renderer-dense-content/web-environment-content.json");
  const v7ScriptingLifecycleDiffPath = options.v7ScriptingLifecycleDiffPath ?? resolve(artifactDir, "v7-scripting-lifecycle/effects-diff.json");
  const v7ScriptingLifecycleNativeEffectsPath =
    options.v7ScriptingLifecycleNativeEffectsPath ?? resolve(artifactDir, "v7-scripting-lifecycle/native-effects.json");
  const v7ScriptingLifecycleWebEffectsPath =
    options.v7ScriptingLifecycleWebEffectsPath ?? resolve(artifactDir, "v7-scripting-lifecycle/web-effects.json");
  const v7PackagingPackageReportPath = options.v7PackagingPackageReportPath ?? resolve(artifactDir, "v7-packaging-target-profiles/package.report.json");
  const v7PackagingDesktopSmokeReportPath =
    options.v7PackagingDesktopSmokeReportPath ?? resolve(artifactDir, "v7-packaging-target-profiles/desktop-smoke.report.json");
  const v7PackagingComparisonReportPath =
    options.v7PackagingComparisonReportPath ?? resolve(artifactDir, "v7-packaging-target-profiles/comparison.report.json");
  const v7PerformanceWebReportPath = options.v7PerformanceWebReportPath ?? resolve(artifactDir, "v7-performance-budgets/web.report.json");
  const v7PerformanceNativeReportPath = options.v7PerformanceNativeReportPath ?? resolve(artifactDir, "v7-performance-budgets/bevy.report.json");
  const v7PerformanceComparisonReportPath =
    options.v7PerformanceComparisonReportPath ?? resolve(artifactDir, "v7-performance-budgets/comparison.report.json");
  const v9AnimationStateDiffPath = options.v9AnimationStateDiffPath ?? resolve(artifactDir, "v9-animation-state/state-diff.json");
  const v9AnimationStateNativeTracePath = options.v9AnimationStateNativeTracePath ?? resolve(artifactDir, "v9-animation-state/native-state.json");
  const v9AnimationStateWebTracePath = options.v9AnimationStateWebTracePath ?? resolve(artifactDir, "v9-animation-state/web-state.json");
  const v9AnimationBlendingReportPath = options.v9AnimationBlendingReportPath ?? resolve(artifactDir, "v9-animation-blending/blend-report.json");
  const v9AnimationBlendingNativeTracePath = options.v9AnimationBlendingNativeTracePath ?? resolve(artifactDir, "v9-animation-blending/native-blend.json");
  const v9AnimationBlendingWebTracePath = options.v9AnimationBlendingWebTracePath ?? resolve(artifactDir, "v9-animation-blending/web-blend.json");
  const nativeV9SupportStressReportPath = options.nativeV9SupportStressReportPath ?? resolve(artifactDir, "v9-support-stress/bevy.report.json");
  const artifacts = {
    nativeBasicSceneReportPath,
    nativePrimitiveMappingReportPath,
    nativeV6AnimationClipsReportPath,
    nativeV6AudioPlaybackReportPath,
    nativeV6PhysicsEventsReportPath,
    nativeV6ResourcesEventsReportPath,
    nativeV6RetainedUiReportPath,
    v6AnimationDiffPath,
    v6AnimationNativeEffectsPath,
    v6AnimationWebEffectsPath,
    v6ResourceEventDiffPath,
    v6ResourceEventNativeEffectsPath,
    v6ResourceEventWebEffectsPath,
    v7PhysicsQueryDiffPath,
    v7PhysicsQueryNativeEffectsPath,
    v7PhysicsQueryWebEffectsPath,
    v7CharacterDiffPath,
    v7CharacterNativeTracePath,
    v7CharacterWebTracePath,
    v7AnimationDiffPath,
    v7AnimationNativeTracePath,
    v7AnimationWebTracePath,
    v7UiNavigationDiffPath,
    v7UiNavigationNativeTracePath,
    v7UiNavigationWebTracePath,
    v7AudioLifecycleDiffPath,
    v7AudioLifecycleNativeTracePath,
    v7AudioLifecycleWebTracePath,
    v7EnvironmentContentDiffPath,
    v7EnvironmentContentNativeTracePath,
    v7EnvironmentContentWebTracePath,
    v7ScriptingLifecycleDiffPath,
    v7ScriptingLifecycleNativeEffectsPath,
    v7ScriptingLifecycleWebEffectsPath,
    v7PackagingPackageReportPath,
    v7PackagingDesktopSmokeReportPath,
    v7PackagingComparisonReportPath,
    v7PerformanceWebReportPath,
    v7PerformanceNativeReportPath,
    v7PerformanceComparisonReportPath,
    v9AnimationBlendingNativeTracePath,
    v9AnimationBlendingReportPath,
    v9AnimationBlendingWebTracePath,
    v9AnimationStateDiffPath,
    v9AnimationStateNativeTracePath,
    v9AnimationStateWebTracePath,
    nativeV9SupportStressReportPath,
  };
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const cwd = commandOptions.cwd ?? root;
    const env =
      command === "cargo" && cwd === nativeRuntimeCwd ? { ...nativeCargoEnv, ...commandOptions.env } : commandOptions.env;
    const result = await run({ args, command, cwd, env, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  const commands = [
    ["ir conformance fixtures", "pnpm", ["--filter", "@threenative/ir", "test", "--", "--run", "conformance"]],
    [
      "web runtime conformance",
      "pnpm",
      ["--filter", "@threenative/runtime-web-three", "test", "--", "--run", "conformance"],
      { timeoutMs: 120000 },
    ],
    [
      "bevy runtime conformance",
      "cargo",
      ["test", "-p", "threenative_runtime", "--test", "conformance"],
      { cwd: nativeRuntimeCwd, timeoutMs: 300000 },
    ],
    [
      "bevy native observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        basicSceneBundlePath,
        "basic-scene",
        nativeBasicSceneReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "bevy native primitive mapping observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        primitiveMappingBundlePath,
        "primitive-mapping",
        nativePrimitiveMappingReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "bevy native V6 physics observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        v6PhysicsEventsBundlePath,
        "v6-physics-events",
        nativeV6PhysicsEventsReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "V6 animation fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v6-animation-trace.mjs"),
        v6AnimationClipsBundlePath,
        resolve(artifactDir, "v6-animation-clips"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "bevy native V6 animation observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        v6AnimationClipsBundlePath,
        "v6-animation-clips",
        nativeV6AnimationClipsReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "V6 resource/event fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v6-resource-events-trace.mjs"),
        v6ResourcesEventsBundlePath,
        resolve(artifactDir, "v6-resources-events"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "bevy native V6 resource/event observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        v6ResourcesEventsBundlePath,
        "v6-resources-events",
        nativeV6ResourcesEventsReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "bevy native V6 retained UI observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        v6RetainedUiBundlePath,
        "v6-retained-ui",
        nativeV6RetainedUiReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "bevy native V6 audio observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        v6AudioPlaybackBundlePath,
        "v6-audio-playback",
        nativeV6AudioPlaybackReportPath,
      ],
      { cwd: nativeRuntimeCwd, timeoutMs: 120000 },
    ],
    [
      "V7 physics query fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-physics-query-trace.mjs"),
        v7AdvancedPhysicsCharacterBundlePath,
        resolve(artifactDir, "v7-advanced-physics-character"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 character fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-character-trace.mjs"),
        v7AdvancedPhysicsCharacterBundlePath,
        resolve(artifactDir, "v7-advanced-physics-character"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 animation graph fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-animation-trace.mjs"),
        v7AnimationGraphsParticlesBundlePath,
        resolve(artifactDir, "v7-animation-graphs-particles"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 UI navigation fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-ui-navigation-trace.mjs"),
        v7RichUiNavigationBundlePath,
        resolve(artifactDir, "v7-rich-ui-navigation"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 audio lifecycle fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-audio-lifecycle-trace.mjs"),
        v7SpatialAudioBusesBundlePath,
        resolve(artifactDir, "v7-spatial-audio-buses"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 environment content fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-environment-content-trace.mjs"),
        v7RendererDenseContentBundlePath,
        resolve(artifactDir, "v7-renderer-dense-content"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 scripting lifecycle fixed trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-scripting-lifecycle-trace.mjs"),
        v7ScriptingLifecycleBundlePath,
        resolve(artifactDir, "v7-scripting-lifecycle"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 packaging target profile verification",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-packaging-target-profiles.mjs"),
        v7PackagingTargetProfilesBundlePath,
        resolve(artifactDir, "v7-packaging-target-profiles"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V7 performance budget verification",
      process.execPath,
      [
        resolve(root, "scripts/verify-v7-performance-budgets.mjs"),
        v7PerformanceBudgetsBundlePath,
        resolve(artifactDir, "v7-performance-budgets"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V9 animation state runtime trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v9-animation-state.mjs"),
        v9AnimationStateBundlePath,
        resolve(artifactDir, "v9-animation-state"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "V9 animation blending runtime trace parity",
      process.execPath,
      [
        resolve(root, "scripts/verify-v9-animation-blending.mjs"),
        v9AnimationBlendingBundlePath,
        resolve(artifactDir, "v9-animation-blending"),
      ],
      { timeoutMs: 120000 },
    ],
    [
      "bevy native V9 support stress observation report",
      "cargo",
      [
        "run",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        v9SupportStressBundlePath,
        "v9-support-stress",
        nativeV9SupportStressReportPath,
      ],
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
    ],
  ];

  for (const [name, command, args, commandOptions] of commands) {
    if (!(await step(name, command, args, commandOptions))) {
      await writeGateReport(reportPath, false, steps, artifacts);
      return { artifacts, ok: false, reportPath, steps };
    }
  }

  await writeGateReport(reportPath, true, steps, artifacts);
  return { artifacts, ok: true, reportPath, steps };
}

export function compareConformanceReports(left, right, options = {}) {
  const diagnostics = [];
  const fixture = left.fixture ?? right.fixture ?? "unknown";
  const artifactPaths = options.artifactPaths ?? {};
  const bundlePath = options.bundlePath;
  for (const requiredPath of options.requiredPaths ?? []) {
    const path = typeof requiredPath === "string" ? requiredPath : requiredPath.path;
    const expected = typeof requiredPath === "string" ? "present" : (requiredPath.expected ?? "present");
    if (valueAtPath(left, path) === undefined) {
      diagnostics.push(requiredObservationMissing(fixture, path, left.runtime, expected, { artifactPaths, bundlePath }));
    }
    if (valueAtPath(right, path) === undefined) {
      diagnostics.push(requiredObservationMissing(fixture, path, right.runtime, expected, { artifactPaths, bundlePath }));
    }
  }

  if (left.fixture !== right.fixture) {
    diagnostics.push(mismatch(fixture, "$.fixture", left.runtime, right.runtime, left.fixture, right.fixture, { artifactPaths, bundlePath }));
  }

  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.assets", left.assets, right.assets, { artifactPaths, bundlePath });
  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.materials", left.materials, right.materials, { artifactPaths, bundlePath });
  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.entities", left.entities, right.entities, { artifactPaths, bundlePath });
  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.resources", left.resources, right.resources, { artifactPaths, bundlePath });
  compareCatalog(diagnostics, fixture, left.runtime, right.runtime, "$.events", left.events, right.events, { artifactPaths, bundlePath });
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.activeCamera", left.activeCamera, right.activeCamera, { artifactPaths, bundlePath });
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.audio", left.audio, right.audio, { artifactPaths, bundlePath });
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.runtimeConfig", left.runtimeConfig, right.runtimeConfig, { artifactPaths, bundlePath });
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.ui", left.ui, right.ui, { artifactPaths, bundlePath });
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.diagnostics", left.diagnostics ?? [], right.diagnostics ?? [], { artifactPaths, bundlePath });

  return {
    artifactPaths,
    bundlePath,
    diagnostics,
    ok: diagnostics.length === 0,
  };
}

function compareCatalog(diagnostics, fixture, leftRuntime, rightRuntime, path, leftItems = [], rightItems = [], context) {
  const rightById = new Map((rightItems ?? []).map((item) => [item.id, item]));
  for (const leftItem of leftItems ?? []) {
    const itemPath = `${path}[${JSON.stringify(leftItem.id)}]`;
    const rightItem = rightById.get(leftItem.id);
    if (rightItem === undefined) {
      diagnostics.push(mismatch(fixture, itemPath, leftRuntime, rightRuntime, "present", "missing", context));
      continue;
    }
    compareValue(diagnostics, fixture, leftRuntime, rightRuntime, itemPath, leftItem, rightItem, context);
    rightById.delete(leftItem.id);
  }

  for (const rightItem of rightById.values()) {
    diagnostics.push(mismatch(fixture, `${path}[${JSON.stringify(rightItem.id)}]`, leftRuntime, rightRuntime, "missing", "present", context));
  }
}

function compareValue(diagnostics, fixture, leftRuntime, rightRuntime, path, left, right, context) {
  if (JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))) {
    return;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      diagnostics.push(mismatch(fixture, path, leftRuntime, rightRuntime, left, right, context));
      return;
    }
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      compareValue(diagnostics, fixture, leftRuntime, rightRuntime, `${path}[${index}]`, left[index], right[index], context);
    }
    return;
  }

  if (!isRecord(left) || !isRecord(right)) {
    diagnostics.push(mismatch(fixture, path, leftRuntime, rightRuntime, left, right, context));
    return;
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    compareValue(diagnostics, fixture, leftRuntime, rightRuntime, `${path}.${key}`, left[key], right[key], context);
  }
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function valueAtPath(value, path) {
  if (!path.startsWith("$.")) {
    return undefined;
  }
  return path
    .slice(2)
    .split(".")
    .reduce((current, key) => (isRecord(current) ? current[key] : undefined), value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredObservationMissing(fixture, path, runtime, expected, context = {}) {
  const artifactPaths = context.artifactPaths ?? {};
  return {
    actual: "missing",
    actualRuntime: runtime,
    artifactPath: artifactPaths.comparisonReport ?? artifactPaths[`${runtime}Report`] ?? artifactPaths.rightReport ?? artifactPaths.leftReport,
    artifactPaths,
    bundlePath: context.bundlePath,
    code: "TN_CONFORMANCE_REQUIRED_OBSERVATION_MISSING",
    expected,
    expectedRuntime: "catalog",
    fixture,
    message: `Conformance report for '${fixture}' is missing required observation '${path}'.`,
    path,
    severity: "error",
  };
}

function mismatch(fixture, path, leftRuntime, rightRuntime, left, right, context = {}) {
  const artifactPaths = context.artifactPaths ?? {};
  return {
    actual: right,
    actualRuntime: rightRuntime,
    artifactPath: artifactPaths.comparisonReport ?? artifactPaths.rightReport ?? artifactPaths.leftReport,
    artifactPaths,
    bundlePath: context.bundlePath,
    code: "TN_CONFORMANCE_MISMATCH",
    expected: left,
    expectedRuntime: leftRuntime,
    fixture,
    left,
    leftRuntime,
    message: `Conformance mismatch for '${fixture}' at '${path}'.`,
    path,
    right,
    rightRuntime,
    severity: "error",
  };
}

async function writeGateReport(reportPath, ok, steps, artifacts = {}) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const failedStep = steps.find((step) => step.exitCode !== 0);
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        artifacts,
        code: ok ? "TN_CONFORMANCE_OK" : "TN_CONFORMANCE_FAILED",
        diagnostics:
          failedStep === undefined
            ? []
            : [
                {
                  actual: failedStep.exitCode,
                  actualRuntime: failedStep.name,
                  artifactPath: artifactPathForStep(failedStep.name, artifacts) ?? reportPath,
                  artifactPaths: artifacts,
                  bundlePath: bundlePathForStep(failedStep.name),
                  code: "TN_CONFORMANCE_STEP_FAILED",
                  expected: 0,
                  expectedRuntime: "conformance-gate",
                  fixture: fixtureForStep(failedStep.name),
                  message: `Conformance gate failed at '${failedStep.name}'.`,
                  path: `steps.${steps.indexOf(failedStep)}.exitCode`,
                  severity: "error",
                },
              ],
        status: ok ? "pass" : "fail",
        steps,
      },
      null,
      2,
    )}\n`,
  );
}

function fixtureForStep(stepName) {
  if (stepName.includes("basic")) {
    return "basic-scene";
  }
  if (stepName.includes("primitive mapping")) {
    return "primitive-mapping";
  }
  if (stepName.includes("V6 physics")) {
    return "v6-physics-events";
  }
  if (stepName.includes("V6 animation")) {
    return "v6-animation-clips";
  }
  if (stepName.includes("V6 resource/event")) {
    return "v6-resources-events";
  }
  if (stepName.includes("V6 retained UI")) {
    return "v6-retained-ui";
  }
  if (stepName.includes("V6 audio")) {
    return "v6-audio-playback";
  }
  if (stepName.includes("V7 physics query")) {
    return "v7-advanced-physics-character";
  }
  if (stepName.includes("V7 character")) {
    return "v7-advanced-physics-character";
  }
  if (stepName.includes("V7 animation graph")) {
    return "v7-animation-graphs-particles";
  }
  if (stepName.includes("V7 UI navigation")) {
    return "v7-rich-ui-navigation";
  }
  if (stepName.includes("V7 audio lifecycle")) {
    return "v7-spatial-audio-buses";
  }
  if (stepName.includes("V7 environment content")) {
    return "v7-renderer-dense-content";
  }
  if (stepName.includes("V7 scripting lifecycle")) {
    return "v7-scripting-lifecycle";
  }
  if (stepName.includes("V7 packaging")) {
    return "v7-packaging-target-profiles";
  }
  if (stepName.includes("V7 performance")) {
    return "v7-performance-budgets";
  }
  return "conformance";
}

function artifactPathForStep(stepName, artifacts) {
  if (stepName.includes("basic")) {
    return artifacts.nativeBasicSceneReportPath;
  }
  if (stepName.includes("primitive mapping")) {
    return artifacts.nativePrimitiveMappingReportPath;
  }
  if (stepName.includes("V6 physics")) {
    return artifacts.nativeV6PhysicsEventsReportPath;
  }
  if (stepName.includes("V6 animation fixed trace")) {
    return artifacts.v6AnimationDiffPath;
  }
  if (stepName.includes("V6 animation observation")) {
    return artifacts.nativeV6AnimationClipsReportPath;
  }
  if (stepName.includes("V6 resource/event fixed trace")) {
    return artifacts.v6ResourceEventDiffPath;
  }
  if (stepName.includes("V6 resource/event observation")) {
    return artifacts.nativeV6ResourcesEventsReportPath;
  }
  if (stepName.includes("V6 retained UI")) {
    return artifacts.nativeV6RetainedUiReportPath;
  }
  if (stepName.includes("V6 audio")) {
    return artifacts.nativeV6AudioPlaybackReportPath;
  }
  if (stepName.includes("V7 physics query")) {
    return artifacts.v7PhysicsQueryDiffPath;
  }
  if (stepName.includes("V7 character")) {
    return artifacts.v7CharacterDiffPath;
  }
  if (stepName.includes("V7 animation graph")) {
    return artifacts.v7AnimationDiffPath;
  }
  if (stepName.includes("V7 UI navigation")) {
    return artifacts.v7UiNavigationDiffPath;
  }
  if (stepName.includes("V7 audio lifecycle")) {
    return artifacts.v7AudioLifecycleDiffPath;
  }
  if (stepName.includes("V7 environment content")) {
    return artifacts.v7EnvironmentContentDiffPath;
  }
  if (stepName.includes("V7 scripting lifecycle")) {
    return artifacts.v7ScriptingLifecycleDiffPath;
  }
  if (stepName.includes("V7 packaging")) {
    return artifacts.v7PackagingComparisonReportPath;
  }
  if (stepName.includes("V7 performance")) {
    return artifacts.v7PerformanceComparisonReportPath;
  }
  return undefined;
}

function bundlePathForStep(stepName) {
  if (stepName.includes("basic")) {
    return "packages/ir/fixtures/conformance/basic-scene/game.bundle";
  }
  if (stepName.includes("primitive mapping")) {
    return "packages/ir/fixtures/conformance/primitive-mapping/game.bundle";
  }
  if (stepName.includes("V6 physics")) {
    return "packages/ir/fixtures/conformance/v6-physics-events/game.bundle";
  }
  if (stepName.includes("V6 animation")) {
    return "packages/ir/fixtures/conformance/v6-animation-clips/game.bundle";
  }
  if (stepName.includes("V6 resource/event")) {
    return "packages/ir/fixtures/conformance/v6-resources-events/game.bundle";
  }
  if (stepName.includes("V6 retained UI")) {
    return "packages/ir/fixtures/conformance/v6-retained-ui/game.bundle";
  }
  if (stepName.includes("V6 audio")) {
    return "packages/ir/fixtures/conformance/v6-audio-playback/game.bundle";
  }
  if (stepName.includes("V7 physics query")) {
    return "packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle";
  }
  if (stepName.includes("V7 character")) {
    return "packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle";
  }
  if (stepName.includes("V7 animation graph")) {
    return "packages/ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle";
  }
  if (stepName.includes("V7 UI navigation")) {
    return "packages/ir/fixtures/conformance/v7-rich-ui-navigation/game.bundle";
  }
  if (stepName.includes("V7 audio lifecycle")) {
    return "packages/ir/fixtures/conformance/v7-spatial-audio-buses/game.bundle";
  }
  if (stepName.includes("V7 environment content")) {
    return "packages/ir/fixtures/conformance/v7-renderer-dense-content/game.bundle";
  }
  if (stepName.includes("V7 scripting lifecycle")) {
    return "packages/ir/fixtures/conformance/v7-scripting-lifecycle/game.bundle";
  }
  if (stepName.includes("V7 packaging")) {
    return "packages/ir/fixtures/conformance/v7-packaging-target-profiles/game.bundle";
  }
  if (stepName.includes("V7 performance")) {
    return "packages/ir/fixtures/conformance/v7-performance-budgets/game.bundle";
  }
  return undefined;
}

export function runCommand({ args, command, cwd, env, timeoutMs = 60000 }) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, env: env ? { ...process.env, ...env } : process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        durationMs: Date.now() - startedAt,
        exitCode: code ?? (signal === null ? 1 : 124),
        stderr,
        stdout,
      });
    });
  });
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyConformance();
  const payload = {
    artifacts: result.artifacts,
    code: result.ok ? "TN_CONFORMANCE_OK" : "TN_CONFORMANCE_FAILED",
    reportPath: result.reportPath,
    status: result.ok ? "pass" : "fail",
    steps: result.steps,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`Conformance gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`Conformance gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

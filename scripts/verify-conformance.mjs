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
  const basicSceneBundlePath = resolve(root, "packages/ir/fixtures/conformance/basic-scene/game.bundle");
  const v6PhysicsEventsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-physics-events/game.bundle");
  const v6AudioPlaybackBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-audio-playback/game.bundle");
  const v6AnimationClipsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-animation-clips/game.bundle");
  const v6ResourcesEventsBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-resources-events/game.bundle");
  const v6RetainedUiBundlePath = resolve(root, "packages/ir/fixtures/conformance/v6-retained-ui/game.bundle");
  const v7AdvancedPhysicsCharacterBundlePath = resolve(
    root,
    "packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle",
  );
  const nativeBasicSceneReportPath = options.nativeBasicSceneReportPath ?? resolve(artifactDir, "basic-scene/bevy.report.json");
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
  const artifacts = {
    nativeBasicSceneReportPath,
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
  };
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
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
    ["bevy runtime conformance", "cargo", ["test", "-p", "threenative_runtime", "conformance"], { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 }],
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
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
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
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
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
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
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
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
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
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
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
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 },
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
  compareValue(diagnostics, fixture, left.runtime, right.runtime, "$.audio", left.audio, right.audio, { artifactPaths, bundlePath });
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
  return "conformance";
}

function artifactPathForStep(stepName, artifacts) {
  if (stepName.includes("basic")) {
    return artifacts.nativeBasicSceneReportPath;
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
  return undefined;
}

function bundlePathForStep(stepName) {
  if (stepName.includes("basic")) {
    return "packages/ir/fixtures/conformance/basic-scene/game.bundle";
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
  return undefined;
}

export function runCommand({ args, command, cwd, timeoutMs = 60000 }) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCalibrationFixture } from "./visual-calibration/analyze.mjs";
import { captureCalibrationArtifacts, readCalibrationFrame } from "./visual-calibration/capture.mjs";
import {
  groupFixturesByFactor,
  partitionFixtureModes,
  selectCalibrationFixtures,
  validateCalibrationManifest,
  VISUAL_CALIBRATION_FACTOR_GROUPS,
  VISUAL_CALIBRATION_FIXTURES,
  VISUAL_CALIBRATION_REPORT_ONLY_FACTORS,
  VISUAL_CALIBRATION_VERSION,
} from "./visual-calibration/manifest.mjs";
import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * @param {string[]} argv
 * @returns {{ analyzeOnly: boolean; groups: string[]; includePlanned: boolean; json: boolean; list: boolean; manifestOnly: boolean }}
 */
export function parseVisualCalibrationArgs(argv = process.argv.slice(2)) {
  const groupsArg = argv.find((arg) => arg.startsWith("--group"));
  let groups = [];
  if (groupsArg !== undefined) {
    const [, value = ""] = groupsArg.includes("=") ? groupsArg.split("=") : [groupsArg, argv[argv.indexOf(groupsArg) + 1]];
    groups = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return {
    analyzeOnly: argv.includes("--analyze-only"),
    groups,
    includePlanned: argv.includes("--include-planned"),
    json: argv.includes("--json"),
    list: argv.includes("--list"),
    manifestOnly: argv.includes("--manifest-only"),
  };
}

/**
 * @param {import("./visual-calibration/manifest.mjs").CalibrationFixture[]} fixtures
 * @param {boolean} includePlanned
 */
export function selectRunnableFixtures(fixtures, includePlanned) {
  if (includePlanned) {
    return fixtures;
  }
  return fixtures.filter((fixture) => fixture.implemented === true);
}

/**
 * @param {import("./visual-calibration/manifest.mjs").CalibrationFixture} fixture
 * @param {string} artifactDir
 * @param {(path: string) => Promise<void>} accessFile
 * @returns {Promise<object[]>}
 */
export async function collectMissingArtifactDiagnostics(fixture, artifactDir, accessFile = access) {
  const diagnostics = [];
  for (const artifactName of fixture.requiredArtifacts) {
    const artifactPath = resolve(artifactDir, artifactName);
    try {
      await accessFile(artifactPath);
    } catch {
      diagnostics.push({
        artifactName,
        artifactPath,
        code: "TN_VERIFY_VISUAL_CALIBRATION_ARTIFACT_MISSING",
        factorGroup: fixture.factorGroup,
        fixtureId: fixture.id,
        message: `Required ${artifactName.includes("web") ? "web" : artifactName.includes("bevy") ? "native" : "calibration"} screenshot is missing for fixture '${fixture.id}': ${artifactPath}`,
        runtime: artifactName.includes("web") ? "web" : artifactName.includes("bevy") ? "bevy" : "shared",
        severity: "error",
        suggestion: fixture.failureHints?.[fixture.factorGroup] ?? "Capture web and native screenshots for this fixture.",
      });
    }
  }
  return diagnostics;
}

/**
 * @param {object[]} diagnostics
 * @param {import("./visual-calibration/manifest.mjs").CalibrationFixture[]} fixtures
 * @returns {{ ok: boolean; promotedFailed: boolean; reportOnlyDrift: object[] }}
 */
export function evaluateCalibrationDiagnostics(diagnostics, fixtures) {
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const promotedFailed = diagnostics.some((diagnostic) => {
    if (diagnostic.severity !== "error") {
      return false;
    }
    const fixture = fixtureById.get(diagnostic.fixtureId);
    if (fixture === undefined) {
      return true;
    }
    if (diagnostic.regionFactor && VISUAL_CALIBRATION_REPORT_ONLY_FACTORS.has(diagnostic.regionFactor)) {
      return false;
    }
    return fixture.promoted;
  });

  const reportOnlyDrift = diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === "warning" ||
      (diagnostic.regionFactor && VISUAL_CALIBRATION_REPORT_ONLY_FACTORS.has(diagnostic.regionFactor)),
  );

  return {
    ok: !promotedFailed,
    promotedFailed,
    reportOnlyDrift,
  };
}

/**
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function runCalibrationFixture(options) {
  const root = options.repoRoot;
  const fixture = options.fixture;
  const artifactDir = options.artifactDir;
  const run = options.run ?? runCommand;
  const steps = [];
  const projectPath = resolve(root, fixture.example);
  const bundlePath = resolve(projectPath, "dist", fixture.bundleName);
  const cliPath = resolve(root, "packages/cli/dist/index.js");

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (options.captureArtifacts !== false && !options.analyzeOnly) {
    if (!(await step(`build ${fixture.id}`, process.execPath, [cliPath, "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
      return { diagnostics: stepFailureDiagnostic(fixture, steps), fixtureId: fixture.id, ok: false, steps };
    }
    if (!(await step(`validate ${fixture.id}`, process.execPath, [cliPath, "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
      return { diagnostics: stepFailureDiagnostic(fixture, steps), fixtureId: fixture.id, ok: false, steps };
    }
    if (options.screenshotCapturer) {
      await options.screenshotCapturer({ artifactDir, bundlePath, cameraId: fixture.camera.id, capture: fixture.capture, repoRoot: root });
    } else {
      await captureCalibrationArtifacts({
        artifactDir,
        bundlePath,
        cameraId: fixture.camera.id,
        capture: fixture.capture,
        repoRoot: root,
      });
    }
  }

  const missing = await collectMissingArtifactDiagnostics(fixture, artifactDir, options.accessFile);
  if (missing.length > 0) {
    return { diagnostics: missing, fixtureId: fixture.id, ok: false, steps };
  }

  let analysis;
  if (options.fixtureAnalyzer) {
    analysis = await options.fixtureAnalyzer({ artifactDir, fixture, repoRoot: root });
  } else {
    const webFrame = await readCalibrationFrame(root, resolve(artifactDir, "web.png"));
    const bevyFrame = await readCalibrationFrame(root, resolve(artifactDir, "bevy.png"));
    analysis = await analyzeCalibrationFixture({ bevyFrame, fixture, repoRoot: root, webFrame });
  }
  analysis.diagnostics = withArtifactPaths(analysis.diagnostics, artifactDir);

  const fixtureReportPath = resolve(artifactDir, "fixture-report.json");
  await writeFile(
    fixtureReportPath,
    `${JSON.stringify({
      artifactDir,
      diagnostics: analysis.diagnostics,
      fixtureId: fixture.id,
      metrics: analysis.metrics,
      status: analysis.status,
    }, null, 2)}\n`,
  );

  return {
    artifactDir,
    diagnostics: analysis.diagnostics,
    fixtureId: fixture.id,
    fixtureReportPath,
    metrics: analysis.metrics,
    ok: analysis.status === "pass",
    steps,
  };
}

function withArtifactPaths(diagnostics, artifactDir) {
  const artifactPaths = {
    bevy: join(artifactDir, "bevy.png"),
    contactSheet: join(artifactDir, "contact-sheet.png"),
    diff: join(artifactDir, "diff.png"),
    web: join(artifactDir, "web.png"),
  };
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    artifactPath: diagnostic.artifactPath ?? artifactPaths.contactSheet,
    artifactPaths: diagnostic.artifactPaths ?? artifactPaths,
  }));
}

function stepFailureDiagnostic(fixture, steps) {
  const failed = steps.find((step) => step.exitCode !== 0);
  return [
    {
      code: "TN_VERIFY_VISUAL_CALIBRATION_STEP_FAILED",
      factorGroup: fixture.factorGroup,
      fixtureId: fixture.id,
      message: `Visual calibration failed at '${failed?.name ?? "unknown"}' for fixture '${fixture.id}'.`,
      severity: "error",
      step: failed?.name,
    },
  ];
}

/**
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function verifyV10VisualCalibration(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const artifactRoot = options.artifactDir ?? resolve(root, "artifacts/v10/visual-calibration");
  const reportPath = options.reportPath ?? resolve(artifactRoot, "verification-report.json");
  const manifestReportPath = options.manifestReportPath ?? resolve(artifactRoot, "manifest-report.json");
  const args = options.args ?? parseVisualCalibrationArgs();
  const fixtures = options.fixtures ?? VISUAL_CALIBRATION_FIXTURES;
  const validation = validateCalibrationManifest(fixtures);
  const selectedFixtures = selectCalibrationFixtures(args.groups, fixtures);
  const runnableFixtures = selectRunnableFixtures(selectedFixtures, args.includePlanned);
  const skippedFixtures = selectedFixtures.filter((fixture) => !runnableFixtures.includes(fixture));
  const modes = partitionFixtureModes(runnableFixtures);
  const factorGroups = groupFixturesByFactor(runnableFixtures);
  const diagnostics = [...validation.diagnostics];
  const fixtureResults = [];
  const metrics = {
    fixtureCount: runnableFixtures.length,
    regionCount: runnableFixtures.reduce((count, fixture) => count + fixture.regions.length, 0),
    skippedFixtureCount: skippedFixtures.length,
  };
  const artifacts = {
    artifactDir: artifactRoot,
    manifestReportPath,
    reportPath,
  };
  const steps = [];

  if (!validation.ok) {
    const report = await writeCalibrationReport({
      artifacts,
      calibrationVersion: VISUAL_CALIBRATION_VERSION,
      diagnostics,
      factorGroups,
      fixtureResults,
      metrics,
      ok: false,
      promoted: modes.promoted,
      reportOnly: modes.reportOnly,
      reportPath,
      skippedFixtures,
      status: "fail",
      steps,
    });
    await writeManifestReport({
      diagnostics,
      fixtures: selectedFixtures,
      manifestReportPath,
      ok: false,
    });
    return report;
  }

  if (args.list) {
    return {
      calibrationVersion: VISUAL_CALIBRATION_VERSION,
      factorGroups: VISUAL_CALIBRATION_FACTOR_GROUPS,
      fixtures: selectedFixtures.map((fixture) => ({
        factorGroup: fixture.factorGroup,
        id: fixture.id,
        implemented: fixture.implemented === true,
        promoted: fixture.promoted,
        regionCount: fixture.regions.length,
      })),
      ok: true,
      status: "pass",
    };
  }

  if (!args.manifestOnly) {
    const run = options.run ?? runCommand;
    if (!options.skipBuildCli) {
      const buildCli = await run({
        args: ["--filter", "@threenative/cli", "build"],
        command: "pnpm",
        cwd: root,
        name: "build cli",
        timeoutMs: 120000,
      });
      steps.push({ ...summarize(buildCli), name: "build cli" });
      if (buildCli.exitCode !== 0) {
        diagnostics.push({
          code: "TN_VERIFY_VISUAL_CALIBRATION_STEP_FAILED",
          message: "Visual calibration failed while building CLI.",
          severity: "error",
          step: "build cli",
        });
      } else {
        const runtimeEntry = resolve(root, "packages/runtime-web-three/dist/index.js");
        let runtimeReady = false;
        try {
          await access(runtimeEntry);
          runtimeReady = true;
        } catch {
          runtimeReady = false;
        }
        if (!runtimeReady) {
          const buildRuntime = await run({
            args: ["--filter", "@threenative/runtime-web-three", "build"],
            command: "pnpm",
            cwd: root,
            name: "build web runtime",
            timeoutMs: 120000,
          });
          steps.push({ ...summarize(buildRuntime), name: "build web runtime" });
          if (buildRuntime.exitCode !== 0) {
            diagnostics.push({
              code: "TN_VERIFY_VISUAL_CALIBRATION_STEP_FAILED",
              message: "Visual calibration failed while building web runtime.",
              severity: "error",
              step: "build web runtime",
            });
          }
        }
      }
    }

    if (diagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
      for (const fixture of runnableFixtures) {
        const fixtureArtifactDir = resolve(artifactRoot, fixture.factorGroup, fixture.id);
        await mkdir(fixtureArtifactDir, { recursive: true });
        const result = await runCalibrationFixture({
          accessFile: options.accessFile,
          analyzeOnly: args.analyzeOnly,
          artifactDir: fixtureArtifactDir,
          captureArtifacts: options.captureArtifacts,
          fixture,
          fixtureAnalyzer: options.fixtureAnalyzer,
          repoRoot: root,
          run: options.run,
          screenshotCapturer: options.screenshotCapturer,
        });
        fixtureResults.push(result);
        diagnostics.push(...result.diagnostics);
        steps.push(...(result.steps ?? []));
      }
    }
  } else {
    for (const fixture of runnableFixtures) {
      const fixtureArtifactDir = resolve(artifactRoot, fixture.factorGroup, fixture.id);
      await mkdir(fixtureArtifactDir, { recursive: true });
      fixtureDiagnosticsPush(diagnostics, await collectMissingArtifactDiagnostics(fixture, fixtureArtifactDir, options.accessFile));
    }
  }

  for (const fixture of skippedFixtures) {
    diagnostics.push({
      code: "TN_VERIFY_VISUAL_CALIBRATION_FIXTURE_PLANNED",
      factorGroup: fixture.factorGroup,
      fixtureId: fixture.id,
      message: `Fixture '${fixture.id}' is planned but not implemented yet; rerun with --include-planned after the fixture lands.`,
      severity: "warning",
    });
  }

  const evaluation = evaluateCalibrationDiagnostics(diagnostics, runnableFixtures);
  const ok = validation.ok && (args.manifestOnly || evaluation.ok);
  const status = ok ? "pass" : "fail";

  await writeManifestReport({
    diagnostics: validation.diagnostics,
    fixtures: selectedFixtures,
    manifestReportPath,
    ok: validation.ok,
  });

  return writeCalibrationReport({
    artifacts,
    calibrationVersion: VISUAL_CALIBRATION_VERSION,
    diagnostics,
    factorGroups,
    fixtureResults,
    metrics,
    ok,
    promoted: modes.promoted,
    reportOnly: modes.reportOnly,
    reportOnlyDrift: evaluation.reportOnlyDrift,
    reportPath,
    skippedFixtures: skippedFixtures.map((fixture) => fixture.id),
    status,
    steps,
  });
}

function fixtureDiagnosticsPush(target, entries) {
  for (const entry of entries) {
    target.push(entry);
  }
}

async function writeManifestReport({ diagnostics, fixtures, manifestReportPath, ok }) {
  await mkdir(resolve(manifestReportPath, ".."), { recursive: true });
  const report = {
    calibrationVersion: VISUAL_CALIBRATION_VERSION,
    code: ok ? "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_OK" : "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_FAILED",
    diagnostics,
    fixtureCount: fixtures.length,
    fixtures: fixtures.map((fixture) => ({
      factorGroup: fixture.factorGroup,
      id: fixture.id,
      implemented: fixture.implemented === true,
      promoted: fixture.promoted,
      regionCount: fixture.regions.length,
      thresholds: fixture.thresholds,
    })),
    generatedBy: "scripts/verify-v10-visual-calibration.mjs",
    ok,
    status: ok ? "pass" : "fail",
  };
  await writeFile(manifestReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function writeCalibrationReport({
  artifacts,
  calibrationVersion,
  diagnostics,
  factorGroups,
  fixtureResults = [],
  metrics,
  ok,
  promoted,
  reportOnly,
  reportOnlyDrift = [],
  reportPath,
  skippedFixtures = [],
  status,
  steps = [],
}) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const report = {
    artifacts,
    calibrationVersion,
    code: ok ? "TN_VERIFY_VISUAL_CALIBRATION_OK" : "TN_VERIFY_VISUAL_CALIBRATION_FAILED",
    diagnostics,
    factorGroups,
    fixtureResults,
    generatedBy: "scripts/verify-v10-visual-calibration.mjs",
    metrics,
    ok,
    promoted,
    reportOnly,
    reportOnlyDrift,
    skippedFixtures,
    status,
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}

async function main() {
  const args = parseVisualCalibrationArgs();
  const result = await verifyV10VisualCalibration({ args });

  if (args.list) {
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      for (const fixture of result.fixtures) {
        process.stdout.write(`${fixture.id}\t${fixture.factorGroup}\timplemented=${fixture.implemented}\tpromoted=${fixture.promoted}\tregions=${fixture.regionCount}\n`);
      }
      process.stdout.write(`V10 visual calibration fixtures: ${result.fixtures.length}\n`);
    }
    process.exitCode = 0;
    return;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: result.ok, reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V10 visual calibration gate passed. Report: ${result.reportPath}\n`);
  } else {
    const first = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    process.stderr.write(
      `V10 visual calibration gate failed${first ? ` (${first.code}${first.fixtureId ? ` fixture=${first.fixtureId}` : ""})` : ""}. Report: ${result.reportPath}\n`,
    );
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

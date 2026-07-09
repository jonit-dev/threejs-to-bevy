import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import {
  createSystemEffectLog,
  loadBundle,
  loadSystemModule,
  runSchedule,
  serializeSystemEffectLog,
  stableSystemEffectLog,
  startWebPreview,
  type IWebInputState,
  type IWebPreviewServer,
  type ISystemEffectLog,
} from "@threenative/runtime-web-three";

import { verifyWebPreview, type IPlaywrightVerifyOptions } from "./playwright.js";
import type { IVerificationReport } from "./report.js";
import { compareV4EffectLogs, normalizeV4EffectLog, type IV4EffectLog, type IV4LogComparison } from "./v4LogCompare.js";

const execFileAsync = promisify(execFile);

export interface IV4ScriptingReport {
  artifacts: {
    diffPath?: string;
    effectLogPath?: string;
    nativeEffectsPath?: string;
    reportPath: string;
    webEffectsPath?: string;
    webReportPath: string;
  };
  diagnostics: IVerificationReport["diagnostics"];
  effectComparison?: IV4LogComparison;
  status: IVerificationReport["status"];
  visual: IVerificationReport["checks"];
}

export interface IV4ScriptingVerifyOptions {
  artifactDir: string;
  expectedMotion?: boolean;
  frames?: number;
  nativeEffectLogRunner?: (options: { bundlePath: string; outputPath: string; webEffectsPath: string }) => Promise<void>;
  previewVerifier?: (options: IPlaywrightVerifyOptions) => Promise<IVerificationReport>;
  projectPath: string;
}

export async function verifyV4Scripting(options: IV4ScriptingVerifyOptions): Promise<IV4ScriptingReport> {
  const artifactDir = resolve(options.artifactDir);
  await mkdir(artifactDir, { recursive: true });
  let server: IWebPreviewServer | undefined;
  try {
    const config = await loadProjectConfig(options.projectPath);
    const build = await buildProject(options.projectPath);
    const bundlePath = resolve(options.projectPath, config.outDir);
    const validation = await validateBundle(build.bundlePath);
    if (!validation.ok) {
      throw new Error(validation.diagnostics[0]?.message ?? "V4 scripting bundle validation failed.");
    }
    const webEffectsPath = resolve(artifactDir, "web-effects.json");
    const nativeEffectsPath = resolve(artifactDir, "native-effects.json");
    const diffPath = resolve(artifactDir, "effects-diff.json");
    const webEffects = await runWebFixedTrace(bundlePath, webEffectsPath);
    await runNativeFixedTrace({
      bundlePath,
      outputPath: nativeEffectsPath,
      runner: options.nativeEffectLogRunner,
      webEffectsPath,
    });
    const nativeEffects = normalizeV4EffectLog(JSON.parse(await readFile(nativeEffectsPath, "utf8")) as IV4EffectLog);
    const effectComparison = compareV4EffectLogs(webEffects.log, nativeEffects);
    await writeFile(
      diffPath,
      `${JSON.stringify(
        {
          comparison: effectComparison,
          inputTrace: fixedTraceMetadata(),
          nativeEffectsPath,
          webEffectsPath,
        },
        null,
        2,
      )}\n`,
    );

    server = await startWebPreview({ bundlePath });
    const verifier = options.previewVerifier ?? verifyWebPreview;
    const webReport = await verifier({
      artifactDir,
      expectedMotion: options.expectedMotion ?? true,
      frames: options.frames ?? 3,
      previewUrl: server.url,
    });
    const webVisualReportPath = resolve(artifactDir, "web-visual-report.json");
    await writeFile(webVisualReportPath, `${JSON.stringify(webReport, null, 2)}\n`);
    const report: IV4ScriptingReport = {
      artifacts: {
        diffPath,
        effectLogPath: webReport.artifacts.effectLogPath,
        nativeEffectsPath,
        reportPath: resolve(artifactDir, "v4-scripting-report.json"),
        webEffectsPath,
        webReportPath: webVisualReportPath,
      },
      diagnostics: [...webEffects.diagnostics, ...effectComparison.diagnostics, ...webReport.diagnostics],
      effectComparison,
      status: webEffects.diagnostics.length > 0 || effectComparison.status === "fail" || webReport.status === "fail" ? "fail" : "pass",
      visual: webReport.checks,
    };
    await writeFile(report.artifacts.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await server?.close();
  }
}

async function runWebFixedTrace(
  bundlePath: string,
  outputPath: string,
): Promise<{ diagnostics: IVerificationReport["diagnostics"]; log: IV4EffectLog }> {
  const bundle = await loadBundle(bundlePath);
  if (bundle.systems === undefined) {
    const emptyLog = createSystemEffectLog();
    await writeFile(outputPath, serializeSystemEffectLog(emptyLog));
    return { diagnostics: [], log: emptyLog };
  }
  const module = await loadSystemModule(bundlePath, bundle.manifest);
  const effectLog = createSystemEffectLog();
  const diagnostics: IVerificationReport["diagnostics"] = [];
  for (const schedule of ["fixedUpdate", "update", "postUpdate"] as const) {
    const result = await runSchedule({
      componentSchemas: bundle.componentSchemas,
      delta: 1 / 60,
      effectLog,
      elapsed: 1,
      fixedDelta: 1 / 60,
      frame: 1,
      input: fixedInputState(),
      module,
      schedule,
      systems: bundle.systems,
      tick: 1,
      world: bundle.world,
    });
    diagnostics.push(
      ...result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        likelyArea: "runtime-web" as const,
        message: diagnostic.message,
        severity: diagnostic.severity,
      })),
    );
  }
  const stableLog = stableSystemEffectLog(effectLog) as IV4EffectLog;
  await writeFile(outputPath, serializeSystemEffectLog(effectLog));
  return { diagnostics, log: stableLog };
}

async function runNativeFixedTrace(options: {
  bundlePath: string;
  outputPath: string;
  runner?: (options: { bundlePath: string; outputPath: string; webEffectsPath: string }) => Promise<void>;
  webEffectsPath: string;
}): Promise<void> {
  if (options.runner !== undefined) {
    await options.runner({ bundlePath: options.bundlePath, outputPath: options.outputPath, webEffectsPath: options.webEffectsPath });
    return;
  }
  await execFileAsync("cargo", [
    "run",
    "--quiet",
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_systems_log",
    "--",
    resolve(options.bundlePath),
    resolve(options.outputPath),
  ], { cwd: resolve("runtime-bevy") });
}

function fixedInputState(): IWebInputState {
  return {
    action(name) {
      return name === "MoveForward" || name === "Jump";
    },
    axis(name) {
      return name === "MoveX" ? 1 : 0;
    },
    beginFrame() {},
    enqueueUiAction() {},
    handleGamepadAxis() {},
    handleGamepadButton() {},
    handleKeyDown() {},
    handleKeyUp() {},
    handlePointerDown() {},
    handlePointerMove() {},
    handlePointerUp() {},
    handleTouchAxis() {},
    handleTouchControl() {},
    pressed() {
      return false;
    },
    released() {
      return false;
    },
  };
}

function fixedTraceMetadata(): Record<string, unknown> {
  return {
    input: {
      actions: { Jump: true, MoveForward: true },
      axes: { MoveX: 1, MoveY: 0 },
    },
    time: { delta: 1 / 60, dt: 1 / 60, elapsed: 1, fixedDelta: 1 / 60, fixedDt: 1 / 60, paused: false },
  };
}

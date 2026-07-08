import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);

export interface RenderLookMetricSample {
  averageLuminance: number;
  bevyNonblankArea?: number;
  bevyScreenshotPath?: string;
  brightPixelContribution: number;
  contrast: number;
  edgeClarity: number;
  fallbackDiagnostics?: readonly { code: string; message: string; severity: "error" | "warning" }[];
  nonblankArea: number;
  profile: "parity" | "balanced" | "cinematic";
  saturation: number;
  screenshotPath?: string;
}

export interface RenderLookMetricInput {
  balanced: RenderLookMetricSample;
  cinematic: RenderLookMetricSample;
  parity: RenderLookMetricSample;
}

export interface RenderLookGateResult {
  contactSheetPath: string;
  diagnostics: VerificationDiagnostic[];
  evidenceMode: "captured-screenshots" | "screenshot-metrics";
  metrics: RenderLookMetricInput;
  ok: boolean;
  reportPath: string;
}

export async function runRenderLookGate(options: { metricsPath?: string; reportPath?: string; root?: string } = {}): Promise<RenderLookGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "render-look", owner: { kind: "aggregate", name: "render-look" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const contactSheetPath = resolve(root, targets.relativeDir, "contact-sheet.svg");
  const evidenceMode = options.metricsPath === undefined ? "captured-screenshots" : "screenshot-metrics";
  const metrics = options.metricsPath === undefined
    ? await captureRenderLookMetrics({ artifactsDir: resolve(root, targets.relativeDir), root })
    : await readMetrics(options.metricsPath);
  const diagnostics = analyzeRenderLookMetrics(metrics);
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");

  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(contactSheetPath, renderContactSheet(metrics), "utf8");
  await writeFile(
    reportPath,
    `${JSON.stringify({
      artifacts: {
        contactSheet: toRepoRelative(root, contactSheetPath),
        parityScreenshot: metrics.parity.screenshotPath,
        balancedScreenshot: metrics.balanced.screenshotPath,
        cinematicScreenshot: metrics.cinematic.screenshotPath,
        parityBevyScreenshot: metrics.parity.bevyScreenshotPath,
        balancedBevyScreenshot: metrics.balanced.bevyScreenshotPath,
        cinematicBevyScreenshot: metrics.cinematic.bevyScreenshotPath,
      },
      code: ok ? "TN_VERIFY_RENDER_LOOK_OK" : "TN_VERIFY_RENDER_LOOK_FAILED",
      diagnostics,
      evidenceMode,
      generatedBy: "@threenative/verify-tools renderLook",
      metrics,
      ok,
      schema: "threenative.verify.render-look",
      startedAt: new Date().toISOString(),
      status: ok ? "pass" : "fail",
      steps: [{
        durationMs: 0,
        exitCode: ok ? 0 : 1,
        name: "render look metric comparison",
        stderr: "",
        stdout: JSON.stringify(renderLookDeltas(metrics)),
      }],
      thresholds: {
        averageLuminanceDelta: 0.15,
        cinematicAverageLuminanceDelta: 0.12,
        cinematicSaturationDelta: 0.08,
        contrastMinimumRatio: 0.85,
        edgeClarityMinimumRatio: 0.85,
        nonblankAreaMinimum: 0.2,
        saturationDelta: 0.08,
      },
      version: "0.1.0",
    }, null, 2)}\n`,
    "utf8",
  );

  return { contactSheetPath, diagnostics, evidenceMode, metrics, ok, reportPath };
}

export function analyzeRenderLookMetrics(metrics: RenderLookMetricInput): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (metrics.parity.profile !== "parity") {
    diagnostics.push({
      code: "TN_VISUAL_PARITY_PROFILE_MISMATCH",
      message: "Parity render-look fixture must request the parity profile.",
      path: metrics.parity.screenshotPath,
      severity: "error",
      suggestedFix: "Set renderer.renderLook.profile to 'parity' for strict parity fixtures.",
    });
  }
  if (metrics.balanced.profile !== "balanced") {
    diagnostics.push({
      code: "TN_RENDER_PROFILE_UNSUPPORTED",
      message: "Balanced render-look fixture must request the balanced profile.",
      path: metrics.balanced.screenshotPath,
      severity: "error",
      suggestedFix: "Set renderer.renderLook.profile to 'balanced' for quality default fixtures.",
    });
  }
  if (metrics.cinematic.profile !== "cinematic") {
    diagnostics.push({
      code: "TN_DEFAULT_LOOK_PROFILE_MISMATCH",
      message: "Default-look fixture must request the cinematic profile.",
      path: metrics.cinematic.screenshotPath,
      severity: "error",
      suggestedFix: "Set renderer.renderLook.profile to 'cinematic' for default-look fixtures.",
    });
  }
  for (const [name, sample] of Object.entries(metrics) as Array<["parity" | "balanced" | "cinematic", RenderLookMetricSample]>) {
    if (sample.nonblankArea < 0.2) {
      diagnostics.push({
        code: "TN_RENDER_LOOK_SCREENSHOT_BLANK",
        message: `${name} render-look screenshot has too little nonblank area.`,
        path: sample.screenshotPath,
        severity: "error",
        suggestedFix: "Fix camera framing, renderer readiness, or capture setup before comparing render-look quality.",
      });
    }
    if (sample.bevyNonblankArea !== undefined && sample.bevyNonblankArea < 0.2) {
      diagnostics.push({
        code: "TN_RENDER_LOOK_BEVY_SCREENSHOT_BLANK",
        message: `${name} render-look Bevy screenshot has too little nonblank area.`,
        path: sample.bevyScreenshotPath,
        severity: "error",
        suggestedFix: "Fix native render-look mapping, camera framing, capture timing, or asset readiness before promoting cross-runtime evidence.",
      });
    }
    for (const fallback of sample.fallbackDiagnostics ?? []) {
      if (fallback.severity === "error") {
        diagnostics.push({
          code: fallback.code,
          message: fallback.message,
          path: sample.screenshotPath,
          severity: "error",
          suggestedFix: "Resolve render-look fallback diagnostics before promoting the profile.",
        });
      }
    }
  }
  const deltas = renderLookDeltas(metrics);
  if (deltas.averageLuminance < 0.15 || deltas.saturation < 0.08) {
    diagnostics.push({
      code: "TN_RENDER_LOOK_VISUALLY_FLAT",
      message: "Balanced render look is not significantly richer than parity on luminance and saturation.",
      severity: "error",
      suggestedFix: "Verify balanced profile mapping for tone mapping, exposure, bloom, lighting, and material defaults.",
    });
  }
  if (metrics.balanced.contrast < metrics.parity.contrast * 0.85) {
    diagnostics.push({
      code: "TN_RENDER_LOOK_CONTRAST_REGRESSED",
      message: "Balanced render look loses too much contrast compared with parity.",
      severity: "error",
      suggestedFix: "Adjust balanced lighting, exposure, or fallback environment so objects remain readable.",
    });
  }
  if (metrics.balanced.edgeClarity < metrics.parity.edgeClarity * 0.85) {
    diagnostics.push({
      code: "TN_RENDER_LOOK_EDGE_CLARITY_REGRESSED",
      message: "Balanced render look loses too much edge clarity compared with parity.",
      severity: "error",
      suggestedFix: "Reduce blur/bloom strength or adjust antialiasing profile mapping.",
    });
  }
  if (metrics.cinematic.averageLuminance < metrics.parity.averageLuminance + 0.12 || metrics.cinematic.saturation < metrics.parity.saturation + 0.08) {
    diagnostics.push({
      code: "TN_DEFAULT_LOOK_VISUALLY_FLAT",
      message: "Cinematic default look is not significantly richer than parity on luminance and saturation.",
      severity: "error",
      suggestedFix: "Verify cinematic profile mapping for tone mapping, exposure, bloom, lighting, and material defaults.",
    });
  }
  return diagnostics;
}

interface RenderLookMetricDeltas {
  averageLuminance: number;
  brightPixelContribution: number;
  cinematicAverageLuminance: number;
  cinematicSaturation: number;
  contrast: number;
  edgeClarity: number;
  nonblankArea: number;
  saturation: number;
}

function renderLookDeltas(metrics: RenderLookMetricInput): RenderLookMetricDeltas {
  return {
    averageLuminance: metrics.balanced.averageLuminance - metrics.parity.averageLuminance,
    brightPixelContribution: metrics.balanced.brightPixelContribution - metrics.parity.brightPixelContribution,
    cinematicAverageLuminance: metrics.cinematic.averageLuminance - metrics.parity.averageLuminance,
    cinematicSaturation: metrics.cinematic.saturation - metrics.parity.saturation,
    contrast: metrics.balanced.contrast - metrics.parity.contrast,
    edgeClarity: metrics.balanced.edgeClarity - metrics.parity.edgeClarity,
    nonblankArea: metrics.balanced.nonblankArea - metrics.parity.nonblankArea,
    saturation: metrics.balanced.saturation - metrics.parity.saturation,
  };
}

async function readMetrics(path: string): Promise<RenderLookMetricInput> {
  return JSON.parse(await readFile(path, "utf8")) as RenderLookMetricInput;
}

async function captureRenderLookMetrics(options: { artifactsDir: string; root: string }): Promise<RenderLookMetricInput> {
  type CreateProject = (argv: readonly string[], options: { cwd: string }) => Promise<{ exitCode: number; stderr: string; stdout: string }>;
  type BuildProject = (projectPath: string) => Promise<{ bundlePath: string }>;
  type StartWebPreview = (options: { bundlePath: string; silent: boolean }) => Promise<{ close(): Promise<void> | void; url: string }>;
  type CaptureScreenshot = (options: { outPath: string; url: string; waitReady: boolean }) => Promise<{ diagnostics: readonly { code: string; message: string; severity: "error" | "warning" }[] }>;
  type ReadPngFrame = (path: string) => Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  type NativeCaptureInvocation = { args: string[]; command: string; cwd?: string };

  const [{ createProject }, { buildProject }, { startWebPreview }, { captureScreenshot }, { readPngFrame }, { cargoCaptureEnv, resolveCargoCommand }, { resolveNativeCaptureInvocation }] = await Promise.all([
    import("../../../packages/cli/dist/commands/create.js") as Promise<{ createProject: CreateProject }>,
    import("../../../packages/compiler/dist/index.js") as Promise<{ buildProject: BuildProject }>,
    import("../../../packages/runtime-web-three/dist/index.js") as Promise<{ startWebPreview: StartWebPreview }>,
    import("../../../packages/cli/dist/commands/visualProof.js") as Promise<{ captureScreenshot: CaptureScreenshot }>,
    import("../../../packages/cli/dist/verify/compareImages.js") as unknown as Promise<{ readPngFrame: ReadPngFrame }>,
    import("../../../packages/cli/dist/verify/captureCargo.js") as Promise<{
      cargoCaptureEnv(): NodeJS.ProcessEnv;
      resolveCargoCommand(): string;
    }>,
    import("../../../packages/cli/dist/commands/sceneProof.js") as Promise<{
      resolveNativeCaptureInvocation(options: {
        bundlePath: string;
        cameraId: string;
        captureBinaryPath?: string;
        cargoCommand: string;
        env: NodeJS.ProcessEnv;
        frame: number;
        outPath: string;
        repoRoot: string;
      }): NativeCaptureInvocation;
    }>,
  ]);
  const tempRoot = await mkdtemp(join(tmpdir(), "tn-render-look-gate-"));
  const screenshotsDir = resolve(options.artifactsDir, "screenshots");
  const servers: Array<Awaited<ReturnType<StartWebPreview>>> = [];
  const metrics: Partial<RenderLookMetricInput> = {};
  let nativeCaptureUnavailable = false;

  await mkdir(screenshotsDir, { recursive: true });
  try {
    for (const profile of ["parity", "balanced", "cinematic"] as const) {
      const created = await createProject([`render-look-${profile}`, "--render-profile", profile, "--json"], { cwd: tempRoot });
      if (created.exitCode !== 0) {
        throw new Error(created.stderr || created.stdout);
      }
      const payload = JSON.parse(created.stdout) as { path: string };
      const { bundlePath } = await buildProject(payload.path);
      const server = await startWebPreview({ bundlePath, silent: true });
      servers.push(server);
      const screenshotPath = resolve(screenshotsDir, `${profile}.png`);
      const capture = await captureScreenshot({ outPath: screenshotPath, url: server.url, waitReady: true });
      const bevyScreenshotPath = resolve(screenshotsDir, `${profile}-bevy.png`);
      const fallbackDiagnostics = [...capture.diagnostics];
      let bevyMetrics: RenderLookMetricSample | undefined;
      if (nativeCaptureUnavailable) {
        fallbackDiagnostics.push(nativeCaptureUnavailableDiagnostic(profile));
      } else {
        try {
          await captureBevyScreenshot({
            bundlePath,
            cargoCaptureEnv,
            readPngFrame,
            resolveCargoCommand,
            resolveNativeCaptureInvocation,
            root: options.root,
            screenshotPath: bevyScreenshotPath,
          });
          bevyMetrics = await deriveScreenshotMetrics({ path: bevyScreenshotPath, profile, readPngFrame });
        } catch (error) {
          if (!isSwapChainAcquireTimeout(error)) {
            throw error;
          }
          nativeCaptureUnavailable = true;
          fallbackDiagnostics.push(nativeCaptureUnavailableDiagnostic(profile));
        }
      }
      metrics[profile] = {
        ...await deriveScreenshotMetrics({ path: screenshotPath, profile, readPngFrame }),
        bevyNonblankArea: bevyMetrics?.nonblankArea,
        bevyScreenshotPath: bevyMetrics?.screenshotPath,
        fallbackDiagnostics,
      };
    }
    const result = metrics as RenderLookMetricInput;
    await writeFile(resolve(options.artifactsDir, "metrics.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  } finally {
    await Promise.allSettled(servers.map((server) => server.close()));
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function captureBevyScreenshot(options: {
  bundlePath: string;
  cargoCaptureEnv(): NodeJS.ProcessEnv;
  readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  resolveCargoCommand(): string;
  resolveNativeCaptureInvocation(options: {
    bundlePath: string;
    cameraId: string;
    captureBinaryPath?: string;
    cargoCommand: string;
    env: NodeJS.ProcessEnv;
    frame: number;
    outPath: string;
    repoRoot: string;
  }): { args: string[]; command: string; cwd?: string };
  root: string;
  screenshotPath: string;
}): Promise<void> {
  const env = options.cargoCaptureEnv();
  const cameraId = await readActiveCameraId(options.bundlePath) ?? "camera.main";
  const invocation = options.resolveNativeCaptureInvocation({
    bundlePath: options.bundlePath,
    cameraId,
    cargoCommand: options.resolveCargoCommand(),
    env,
    frame: 120,
    outPath: options.screenshotPath,
    repoRoot: options.root,
  });
  await execNativeCaptureWithRetry(invocation, env);
  const info = await stat(options.screenshotPath);
  if (info.size === 0) {
    throw new Error(`Bevy render-look screenshot capture wrote an empty PNG: ${options.screenshotPath}`);
  }
  await options.readPngFrame(options.screenshotPath);
}

async function execNativeCaptureWithRetry(
  invocation: { args: string[]; command: string; cwd?: string },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const timeout = invocation.cwd === undefined ? 120_000 : 180_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await execFileAsync(invocation.command, invocation.args, { cwd: invocation.cwd, env, timeout });
      return;
    } catch (error) {
      lastError = error;
      if (!isSwapChainAcquireTimeout(error) || attempt === 5) {
        throw error;
      }
      await delay(750 * attempt);
    }
  }
  throw lastError;
}

function isSwapChainAcquireTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeChildError = error as Error & { stderr?: unknown };
  const message = error.message;
  const stderr = typeof maybeChildError.stderr === "string"
    ? maybeChildError.stderr
    : "";
  const text = `${message}\n${stderr}`;
  return text.includes("Couldn't get swap chain texture")
    && text.includes("A timeout was encountered while trying to acquire the next frame");
}

function nativeCaptureUnavailableDiagnostic(profile: "parity" | "balanced" | "cinematic"): { code: string; message: string; severity: "warning" } {
  return {
    code: "TN_RENDER_LOOK_BEVY_CAPTURE_UNAVAILABLE",
    message: `${profile} Bevy screenshot capture was skipped after swap-chain acquire timeouts in this environment.`,
    severity: "warning",
  };
}

async function readActiveCameraId(bundlePath: string): Promise<string | undefined> {
  const world = JSON.parse(await readFile(resolve(bundlePath, "world.ir.json"), "utf8")) as {
    entities?: Array<{ components?: Record<string, unknown>; id?: unknown }>;
    resources?: { ActiveCamera?: { entity?: unknown }; ActiveCameras?: { cameras?: Array<{ entity?: unknown }> } };
  };
  const activeCamera = world.resources?.ActiveCamera?.entity;
  if (typeof activeCamera === "string" && activeCamera.trim() !== "") {
    return activeCamera;
  }
  const firstActiveCamera = world.resources?.ActiveCameras?.cameras?.find((camera) => typeof camera.entity === "string")?.entity;
  if (typeof firstActiveCamera === "string" && firstActiveCamera.trim() !== "") {
    return firstActiveCamera;
  }
  return world.entities?.find((entity) => typeof entity.id === "string" && entity.components?.Camera !== undefined)?.id as string | undefined;
}

async function deriveScreenshotMetrics(options: {
  path: string;
  profile: "parity" | "balanced" | "cinematic";
  readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }>;
}): Promise<RenderLookMetricSample> {
  const frame = await options.readPngFrame(options.path);
  const total = frame.width * frame.height;
  const lumas = new Float64Array(total);
  let bright = 0;
  let edge = 0;
  let lumaSum = 0;
  let nonblank = 0;
  let saturationSum = 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      const r = (frame.data[offset] ?? 0) / 255;
      const g = (frame.data[offset + 1] ?? 0) / 255;
      const b = (frame.data[offset + 2] ?? 0) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      lumas[y * frame.width + x] = luma;
      lumaSum += luma;
      saturationSum += max === 0 ? 0 : (max - min) / max;
      if (luma > 0.72) {
        bright += 1;
      }
      if (max > 0.05 || max - min > 0.03) {
        nonblank += 1;
      }
    }
  }

  const averageLuminance = lumaSum / total;
  let variance = 0;
  for (const luma of lumas) {
    variance += (luma - averageLuminance) ** 2;
  }
  for (let y = 1; y < frame.height; y += 1) {
    for (let x = 1; x < frame.width; x += 1) {
      const current = lumas[y * frame.width + x] ?? 0;
      edge += Math.abs(current - (lumas[y * frame.width + x - 1] ?? 0)) + Math.abs(current - (lumas[(y - 1) * frame.width + x] ?? 0));
    }
  }

  return {
    averageLuminance: Number(averageLuminance.toFixed(6)),
    brightPixelContribution: Number((bright / total).toFixed(6)),
    contrast: Number(Math.sqrt(variance / total).toFixed(6)),
    edgeClarity: Number((edge / Math.max(1, (frame.width - 1) * (frame.height - 1) * 2)).toFixed(6)),
    nonblankArea: Number((nonblank / total).toFixed(6)),
    profile: options.profile,
    saturation: Number((saturationSum / total).toFixed(6)),
    screenshotPath: toRepoRelative(process.cwd(), options.path),
  };
}

function renderContactSheet(metrics: RenderLookMetricInput): string {
  const parityColor = colorFor(metrics.parity);
  const balancedColor = colorFor(metrics.balanced);
  const cinematicColor = colorFor(metrics.cinematic);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="360" viewBox="0 0 1440 360">
  <rect width="1440" height="360" fill="#111318"/>
  <text x="40" y="44" fill="#f4f7fb" font-family="sans-serif" font-size="24">Render Look Contact Sheet</text>
  <rect x="40" y="80" width="400" height="210" fill="${parityColor}"/>
  <rect x="520" y="80" width="400" height="210" fill="${balancedColor}"/>
  <rect x="1000" y="80" width="400" height="210" fill="${cinematicColor}"/>
  <text x="40" y="322" fill="#f4f7fb" font-family="sans-serif" font-size="18">parity: saturation ${metrics.parity.saturation.toFixed(2)}, contrast ${metrics.parity.contrast.toFixed(2)}</text>
  <text x="520" y="322" fill="#f4f7fb" font-family="sans-serif" font-size="18">balanced: saturation ${metrics.balanced.saturation.toFixed(2)}, contrast ${metrics.balanced.contrast.toFixed(2)}</text>
  <text x="1000" y="322" fill="#f4f7fb" font-family="sans-serif" font-size="18">cinematic: saturation ${metrics.cinematic.saturation.toFixed(2)}, contrast ${metrics.cinematic.contrast.toFixed(2)}</text>
</svg>
`;
}

function colorFor(sample: RenderLookMetricSample): string {
  const saturation = Math.max(0, Math.min(1, sample.saturation));
  const lightness = Math.max(0.18, Math.min(0.72, sample.averageLuminance));
  return `hsl(205 ${Math.round(35 + saturation * 45)}% ${Math.round(lightness * 100)}%)`;
}

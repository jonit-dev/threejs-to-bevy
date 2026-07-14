import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import type { VerificationDiagnostic } from "./runner.js";

export interface PixelFrame {
  data: Uint8Array;
  height: number;
  width: number;
}

export interface PixelRegion {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface NativeOverlayFrameSet {
  chooser: PixelFrame;
  hoverAfter: PixelFrame;
  hoverBefore: PixelFrame;
  hud: PixelFrame;
  settingsClosed: PixelFrame;
  settingsOpen: PixelFrame;
}

export interface NativeOverlayCefGateResult {
  diagnostics: VerificationDiagnostic[];
  measurements: Record<string, unknown>;
  ok: boolean;
  reportPath: string;
}

const EXPECTED_HASHES = {
  chooser: "da91cb348bb8eb5d1ad2f877544cb3d969fbd2c38a8220243d7418360c7a9612",
  hoverAfter: "f45a35c2b5b214193616d9e098b8282141850b3db82889c6ef223813509b1786",
  hoverBefore: "15a37e9bddae718c7f6d55ad728d75f538e85f858b4f6444fe6e4cbb931a55f3",
  hud: "7be617e0bb95cdd6b716d26ba2d125cb82d422851094a79bee72699a5cbf19c0",
  settingsClosed: "2ee25ea7b048768da2d8753a60ea4f2a26ddd2a52232e33062f22678a9a6cff6",
  settingsOpen: "084c0e7c8f565aa47056d4419b9a1fb690357ae52dc2059689c28fb7319005eb",
} as const;

const FRAME_PATHS = {
  chooser: "frames/chooser-cef-clean.png",
  hoverAfter: "frames/chooser-hover-black.png",
  hoverBefore: "frames/chooser-hover-before.png",
  hud: "frames/hud-cef-native-bridge-clean.png",
  settingsClosed: "frames/settings-closed-after-10-cef-raw.png",
  settingsOpen: "frames/settings-open-after-10-cef-raw.png",
} as const;

export function evaluateNativeOverlayFrames(
  frames: NativeOverlayFrameSet,
  regions: { hover: PixelRegion; modal: PixelRegion } = {
    hover: { x: 640, y: 290, width: 280, height: 150 },
    modal: { x: 400, y: 100, width: 480, height: 520 },
  },
): { diagnostics: VerificationDiagnostic[]; measurements: Record<string, number> } {
  const diagnostics: VerificationDiagnostic[] = [];
  for (const [name, frame] of Object.entries(frames)) {
    if (frame.width !== 1280 || frame.height !== 720 || frame.data.length !== 1280 * 720 * 4) {
      diagnostics.push({
        code: "TN_VERIFY_NATIVE_OVERLAY_CEF_FRAME_INVALID",
        message: `${name} must be a complete 1280x720 RGBA frame.`,
        severity: "error",
      });
      continue;
    }
    const visibleRatio = visiblePixelRatio(frame);
    if (visibleRatio < 0.01) {
      diagnostics.push({
        code: "TN_VERIFY_NATIVE_OVERLAY_CEF_BLANK_FRAME",
        message: `${name} is blank or fully transparent (${visibleRatio.toFixed(4)} visible ratio).`,
        severity: "error",
      });
    }
  }
  const hoverDifferenceRatio = differingPixelRatio(frames.hoverBefore, frames.hoverAfter, regions.hover);
  const modalDifferenceRatio = differingPixelRatio(frames.settingsOpen, frames.settingsClosed, regions.modal);
  const stateDifferenceRatio = differingPixelRatio(frames.chooser, frames.hud, {
    x: 0, y: 0, width: 1280, height: 720,
  });
  if (hoverDifferenceRatio < 0.05) {
    diagnostics.push({
      code: "TN_VERIFY_NATIVE_OVERLAY_CEF_HOVER_PIXELS_MISSING",
      message: `Black-side hover changed only ${(hoverDifferenceRatio * 100).toFixed(2)}% of its declared region.`,
      severity: "error",
    });
  }
  if (modalDifferenceRatio < 0.05) {
    diagnostics.push({
      code: "TN_VERIFY_NATIVE_OVERLAY_CEF_STALE_MODAL",
      message: `Settings close changed only ${(modalDifferenceRatio * 100).toFixed(2)}% of the modal region.`,
      severity: "error",
    });
  }
  if (stateDifferenceRatio < 0.05) {
    diagnostics.push({
      code: "TN_VERIFY_NATIVE_OVERLAY_CEF_STALE_CHOOSER",
      message: `Chooser-to-HUD transition changed only ${(stateDifferenceRatio * 100).toFixed(2)}% of the frame.`,
      severity: "error",
    });
  }
  return {
    diagnostics,
    measurements: { hoverDifferenceRatio, modalDifferenceRatio, stateDifferenceRatio },
  };
}

export async function runNativeOverlayCefGate(options: {
  evidenceRoot?: string;
  reportPath?: string;
  root?: string;
} = {}): Promise<NativeOverlayCefGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const evidenceRoot = resolve(root, options.evidenceRoot ?? "tools/verify/artifacts/native-overlay-cef");
  const reportPath = resolve(root, options.reportPath ?? "tools/verify/artifacts/native-overlay-cef/verification-report.json");
  const diagnostics: VerificationDiagnostic[] = [];
  const frames = {} as NativeOverlayFrameSet;
  const hashes: Record<string, string> = {};
  for (const [name, relativePath] of Object.entries(FRAME_PATHS)) {
    const bytes = await readFile(resolve(evidenceRoot, relativePath));
    const hash = createHash("sha256").update(bytes).digest("hex");
    hashes[name] = hash;
    if (hash !== EXPECTED_HASHES[name as keyof typeof EXPECTED_HASHES]) {
      diagnostics.push({
        code: "TN_VERIFY_NATIVE_OVERLAY_CEF_EVIDENCE_DRIFT",
        message: `${relativePath} does not match the reviewed compositor evidence hash.`,
        severity: "error",
      });
    }
    const png = PNG.sync.read(bytes);
    frames[name as keyof NativeOverlayFrameSet] = {
      data: png.data,
      height: png.height,
      width: png.width,
    };
  }
  const evaluated = evaluateNativeOverlayFrames(frames);
  diagnostics.push(...evaluated.diagnostics);
  const spike = JSON.parse(await readFile(resolve(evidenceRoot, "spike-report.json"), "utf8")) as {
    budgets?: Record<string, { status?: unknown }>;
    scenario?: { noResizeWorkaround?: unknown; noSecondaryWindow?: unknown; realInput?: unknown };
    status?: unknown;
  };
  const packageEvidence = JSON.parse(await readFile(resolve(evidenceRoot, "package-report.json"), "utf8")) as {
    backend?: unknown;
    launch?: Record<string, unknown>;
    package?: Record<string, unknown>;
    schema?: unknown;
  };
  for (const budget of ["transparency", "modalRemoval", "input", "bridge", "frameCost", "paintQueue", "installedSize", "startup"] as const) {
    if (!String(spike.budgets?.[budget]?.status ?? "").startsWith("pass")) {
      diagnostics.push({
        code: "TN_VERIFY_NATIVE_OVERLAY_CEF_BUDGET_FAILED",
        message: `Spike budget '${budget}' is not recorded as passed.`,
        severity: "error",
      });
    }
  }
  if (spike.status !== "passed"
    || !String(spike.scenario?.realInput ?? "").includes("choosing Black")
    || !String(spike.scenario?.noSecondaryWindow ?? "").startsWith("pass")
    || !String(spike.scenario?.noResizeWorkaround ?? "").startsWith("pass")) {
    diagnostics.push({
      code: "TN_VERIFY_NATIVE_OVERLAY_CEF_SCENARIO_INCOMPLETE",
      message: "CEF evidence must prove real Black-side input, one native window, and modal removal without resize.",
      severity: "error",
    });
  }
  if (packageEvidence.schema !== "threenative.verify.native-overlay-cef-package"
    || packageEvidence.backend !== "cef-osr"
    || packageEvidence.package?.format !== "appimage"
    || packageEvidence.package?.directMountedExecution !== true
    || typeof packageEvidence.package?.physicalBytes !== "number"
    || packageEvidence.package.physicalBytes > 250_000_000
    || packageEvidence.launch?.exitCode !== 0
    || packageEvidence.launch?.chooseBlackDelivered !== true
    || packageEvidence.launch?.snapshotDelivered !== true
    || packageEvidence.launch?.modalTransitions !== 10
    || packageEvidence.launch?.windowCount !== 1
    || packageEvidence.launch?.remainingCefProcesses !== 0) {
    diagnostics.push({
      code: "TN_VERIFY_NATIVE_OVERLAY_CEF_PACKAGE_INCOMPLETE",
      message: "The descriptor-owned mounted AppImage must stay below 250 MB and pass Black-side, bridge, modal, one-window, and shutdown checks.",
      severity: "error",
    });
  }
  const ok = diagnostics.length === 0;
  const measurements = {
    ...evaluated.measurements,
    hashes,
    package: packageEvidence.package,
    packageLaunch: packageEvidence.launch,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: {
      ...Object.fromEntries(Object.entries(FRAME_PATHS).map(([name, path]) => [name, `tools/verify/artifacts/native-overlay-cef/${path}`])),
      package: "tools/verify/artifacts/native-overlay-cef/package-report.json",
      spike: "tools/verify/artifacts/native-overlay-cef/spike-report.json",
    },
    code: ok ? "TN_VERIFY_NATIVE_OVERLAY_CEF_OK" : "TN_VERIFY_NATIVE_OVERLAY_CEF_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools nativeOverlayCefGate",
    measurements,
    ok,
    schema: "threenative.verify.native-overlay-cef",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  }, null, 2)}\n`);
  return { diagnostics, measurements, ok, reportPath };
}

function visiblePixelRatio(frame: PixelFrame): number {
  let visible = 0;
  for (let offset = 0; offset < frame.data.length; offset += 4) {
    if ((frame.data[offset + 3] ?? 0) > 0
      && ((frame.data[offset] ?? 0) + (frame.data[offset + 1] ?? 0) + (frame.data[offset + 2] ?? 0)) > 6) visible += 1;
  }
  return visible / (frame.width * frame.height);
}

function differingPixelRatio(left: PixelFrame, right: PixelFrame, region: PixelRegion): number {
  if (left.width !== right.width || left.height !== right.height) return 0;
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(left.width, Math.ceil(region.x + region.width));
  const y1 = Math.min(left.height, Math.ceil(region.y + region.height));
  let different = 0;
  let sampled = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * left.width + x) * 4;
      sampled += 1;
      if (left.data[offset] !== right.data[offset]
        || left.data[offset + 1] !== right.data[offset + 1]
        || left.data[offset + 2] !== right.data[offset + 2]
        || left.data[offset + 3] !== right.data[offset + 3]) different += 1;
    }
  }
  return sampled === 0 ? 0 : different / sampled;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runNativeOverlayCefGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

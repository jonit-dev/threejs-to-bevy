import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { captureCalibrationArtifacts } from "./visual-calibration/capture.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const fixture = resolve(root, "packages/ir/fixtures/conformance/advanced-ui/game.bundle");

export function compareUiNativeReports(web, native) {
  const mismatches = [];
  for (const key of ["attachments", "effects", "textEdit"]) {
    if (JSON.stringify(web[key]) !== JSON.stringify(native[key])) {
      mismatches.push({ key, native: native[key], web: web[key] });
    }
  }
  const image = native.images?.images?.find((entry) => entry.node === "quest.frame");
  if (image?.atlas === undefined || image?.nineSlice === undefined) {
    mismatches.push({ key: "images", message: "Native quest frame must preserve atlas and nine-slice rendering metadata." });
  }
  const rootEffect = native.visualEffects?.effects?.find((entry) => entry.node === "advanced.ui");
  if (rootEffect?.gradient === undefined || rootEffect?.shadow === undefined) {
    mismatches.push({ key: "visualEffects", message: "Native root UI must preserve bounded gradient and shadow strategy evidence." });
  }
  return mismatches;
}

export async function verifyFeatureParityUiNative(options = {}) {
  const repoRoot = options.root ?? root;
  const targets = resolveArtifactTargets({ gate: "feature-parity-ui-native", owner: { kind: "aggregate", name: "feature-parity-ui-native" }, root: repoRoot });
  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? targets.reportPath;
  await mkdir(artifactDir, { recursive: true });
  const runtime = await import(resolve(repoRoot, "packages/runtime-web-three/dist/index.js"));
  const bundle = await runtime.loadBundle(fixture);
  const operations = [{ kind: "move", offset: -1 }, { kind: "insert", text: "r" }, { kind: "backspace" }];
  const web = {
    accessibility: {
      focusNarration: "metadata-proved",
      metadataBridge: "dom-aria",
      platformScreenReader: "browser-platform-proof-required",
      target: "web",
    },
    attachments: runtime.traceUiAttachments(bundle.ui, [{ id: "enemy.1", position: [8, 0, 12] }], { id: "camera.main", position: [0, 0, 0], viewport: { height: 720, width: 1280 } }),
    effects: runtime.traceUiEffects(bundle.ui, ["selected", "focus"]),
    textEdit: runtime.traceWebUiTextEdit("Nova", operations),
  };
  const webReportPath = resolve(artifactDir, "web-report.json");
  const nativeReportPath = resolve(artifactDir, "native-report.json");
  await writeFile(webReportPath, `${JSON.stringify(web, null, 2)}\n`);
  await execFileAsync("cargo", ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_ui_native_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(repoRoot, "runtime-bevy"),
    timeout: 180_000,
  });
  const native = JSON.parse(await readFile(nativeReportPath, "utf8"));
  const capture = await captureCalibrationArtifacts({ artifactDir, bundlePath: fixture, cameraId: "camera.main", capture: { height: 720, width: 1280 }, repoRoot });
  const mismatches = compareUiNativeReports(web, native);
  const ok = mismatches.length === 0;
  const report = {
    artifacts: {
      bevyScreenshot: capture.bevyScreenshotPath,
      contactSheet: capture.contactSheetPath,
      diff: capture.diffPath,
      nativeReport: nativeReportPath,
      report: reportPath,
      webReport: webReportPath,
      webScreenshot: capture.webScreenshotPath,
    },
    capabilityScope: {
      ime: "platform-diagnostic",
      nativeScreenReader: "accesskit-metadata; manual platform proof required",
      textEditing: "bounded deterministic value/caret trace",
      virtualKeyboard: "platform-diagnostic",
      worldUi: "retained projection only; 3D and render-to-texture remain unsupported",
    },
    code: ok ? "TN_VERIFY_UI_NATIVE_OK" : "TN_VERIFY_UI_NATIVE_FAILED",
    diagnostics: mismatches.map((mismatch) => ({ code: "TN_VERIFY_UI_NATIVE_TRACE_MISMATCH", message: `UI native evidence mismatch: ${mismatch.key}.`, severity: "error" })),
    generatedBy: "scripts/verify-feature-parity-ui-native.mjs",
    mismatches,
    ok,
    schema: "threenative.verify.feature-parity-ui-native",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1]?.endsWith("verify-feature-parity-ui-native.mjs")) {
  const report = await verifyFeatureParityUiNative();
  process.stdout.write(`${JSON.stringify({ ok: report.ok, reportPath: report.artifacts.report }, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

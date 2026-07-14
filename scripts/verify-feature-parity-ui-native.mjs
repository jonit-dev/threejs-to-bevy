import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { captureBevyScreenshot, captureWebScreenshot, writeCalibrationDiffArtifacts } from "./visual-calibration/capture.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const fixtureRelative = "packages/ir/fixtures/conformance/advanced-ui/game.bundle";
const viewports = { desktop: { height: 720, width: 1280 }, mobile: { height: 844, width: 390 } };

export async function verifyFeatureParityUiNative(options = {}) {
  const repoRoot = options.root ?? root;
  const fixture = resolve(repoRoot, fixtureRelative);
  const targets = resolveArtifactTargets({ gate: "feature-parity-ui-native", owner: { kind: "aggregate", name: "feature-parity-ui-native" }, root: repoRoot });
  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? targets.reportPath;
  const runId = options.runId ?? `${new Date().toISOString()}-${randomUUID()}`;
  await rm(artifactDir, { force: true, recursive: true });
  await mkdir(artifactDir, { recursive: true });

  const [{ UI_PARITY_ROWS, promotedUiCapabilitiesForFixture, requiredUiParityArtifacts, uiParityRowsForArtifact }, runtime] = await Promise.all([
    import(resolve(repoRoot, "tools/verify/dist/uiParityRegistry.js")),
    import(resolve(repoRoot, "packages/runtime-web-three/dist/index.js")),
  ]);
  await execFileAsync(process.execPath, [resolve(repoRoot, "scripts/verify-input-ui-polish.mjs")], { cwd: repoRoot, timeout: 180_000 });
  const linkedInput = JSON.parse(await readFile(resolve(repoRoot, "tools/verify/artifacts/input-ui-polish/verification-report.json"), "utf8"));
  const expectedLinkedCapabilities = promotedUiCapabilitiesForFixture("input-ui-polish");
  if (!linkedInput.ok || JSON.stringify(linkedInput.promotedCapabilities) !== JSON.stringify(expectedLinkedCapabilities)) throw new Error("linked input/UI polish evidence is stale or does not match the UI parity registry");

  const bundle = await runtime.loadBundle(fixture);
  const observedNodeKinds = [...collectNodeKinds(bundle.ui.root)].sort();
  const webBehavior = { ...runtime.reportWebUiParityBehavior(bundle.ui, bundle.world), runId };
  const rendered = runtime.renderUi(bundle.ui, bundle.world, { target: "desktop" });
  rendered.focus("player.name");
  rendered.setDisabled("selected.item", true);
  rendered.setValue("audio.volume", 0.6);
  rendered.setValue("player.name", "Nora");
  const webSnapshot = runtime.createUiAccessibilitySnapshot(rendered);
  const webAccessibility = { ...webSnapshot, diagnostics: [], nodes: [...webSnapshot.nodes].sort((left, right) => left.id.localeCompare(right.id)), runId };
  const behaviorDir = resolve(artifactDir, "behavior");
  const accessibilityDir = resolve(artifactDir, "accessibility");
  await mkdir(behaviorDir, { recursive: true });
  await mkdir(accessibilityDir, { recursive: true });
  await writeJson(resolve(behaviorDir, "web.json"), webBehavior);
  await writeJson(resolve(accessibilityDir, "web.json"), webAccessibility);

  const legacyTracePath = resolve(artifactDir, "native-trace.json");
  await execFileAsync("cargo", [
    "run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_ui_native_trace", "--",
    fixture, legacyTracePath,
    "--behavior", resolve(behaviorDir, "native.json"),
    "--accessibility", resolve(accessibilityDir, "native.json"),
    "--run-id", runId,
  ], { cwd: resolve(repoRoot, "runtime-bevy"), timeout: 240_000 });
  const nativeBehavior = JSON.parse(await readFile(resolve(behaviorDir, "native.json"), "utf8"));

  const viewportReport = { ok: true, runId, schema: "threenative.ui-parity-viewports", version: "0.1.0", viewports: {} };
  const renderedKinds = [...new Set(UI_PARITY_ROWS.filter((row) => row.claim === "promoted" && row.requiredTier === "rendered").flatMap((row) => row.nodeKinds ?? []))].sort();
  const missingRenderedKinds = renderedKinds.filter((kind) => !observedNodeKinds.includes(kind));
  if (missingRenderedKinds.length > 0) throw new Error(`advanced UI fixture does not observe promoted rendered node kinds: ${missingRenderedKinds.join(", ")}`);
  for (const [name, viewport] of Object.entries(viewports)) {
    const viewportDir = resolve(artifactDir, "viewports", name);
    await mkdir(viewportDir, { recursive: true });
    const webPath = resolve(viewportDir, "web.png");
    const nativePath = resolve(viewportDir, "native.png");
    await captureWebScreenshot({ bundlePath: fixture, cameraId: "camera.main", outputPath: webPath, repoRoot, viewport });
    await captureBevyScreenshot({ bundlePath: fixture, cameraId: "camera.main", outputPath: nativePath, repoRoot, viewport });
    const { contactSheetPath, diffPath } = await writeCalibrationDiffArtifacts({ artifactDir: viewportDir, bevyScreenshotPath: nativePath, webScreenshotPath: webPath });
    const comparison = comparePngs(await readFile(webPath), await readFile(nativePath));
    const webRegion = webBehavior.regions.find((entry) => entry.target === name);
    const nativeRegion = nativeBehavior.regions?.find((entry) => entry.target === name);
    if (webRegion === undefined || nativeRegion === undefined) throw new Error(`adapter region observation missing for ${name}`);
    viewportReport.viewports[name] = {
      ...viewport,
      captures: {
        native: { path: repoPath(repoRoot, nativePath), sha256: await fileHash(nativePath) },
        web: { path: repoPath(repoRoot, webPath), sha256: await fileHash(webPath) },
      },
      contactSheet: { path: repoPath(repoRoot, contactSheetPath), sha256: await fileHash(contactSheetPath) },
      comparison: { ...comparison, diffPath: repoPath(repoRoot, diffPath), sha256: await fileHash(diffPath) },
      nodeKinds: renderedKinds,
      regions: { native: nativeRegion, web: webRegion },
    };
  }
  await writeJson(resolve(artifactDir, "viewport-report.json"), viewportReport);

  const diagnosticSources = {
    TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY: "runtime-bevy/crates/threenative_runtime/src/ui.rs",
    TN_BEVY_UI_HORIZONTAL_SCROLL_PARTIAL: "runtime-bevy/crates/threenative_runtime/src/ui.rs",
    TN_BEVY_UI_NESTED_SCROLL_PARTIAL: "runtime-bevy/crates/threenative_runtime/src/ui.rs",
    TN_CATALOG_UI_IME_TARGET_UNSUPPORTED: "packages/ir/src/bevyCatalogResiduals.ts",
    TN_INPUT_UI_VIRTUAL_KEYBOARD_DIAGNOSTIC_ONLY: "packages/runtime-web-three/src/inputUiPolish.ts",
    TN_IR_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED: "packages/ir/src/uiValidation.ts",
  };
  const diagnosticCodes = [...new Set(UI_PARITY_ROWS.flatMap((row) => row.diagnosticCodes ?? []))].sort();
  for (const code of diagnosticCodes) {
    const source = diagnosticSources[code];
    if (source === undefined || !(await readFile(resolve(repoRoot, source), "utf8")).includes(code)) throw new Error(`retained UI diagnostic ${code} is missing from its owning source`);
  }
  await writeJson(resolve(artifactDir, "platform-diagnostics.json"), {
    entries: diagnosticCodes.map((code) => ({ code, source: diagnosticSources[code] })),
    runId,
    schema: "threenative.ui-parity-diagnostics",
    version: "0.1.0",
  });

  const artifactPaths = requiredUiParityArtifacts();
  const entries = await Promise.all(artifactPaths.map(async (path) => {
    const bytes = await readFile(resolve(repoRoot, path));
    return { byteSize: bytes.length, coveredRows: uiParityRowsForArtifact(path), path, runId, sha256: hash(bytes) };
  }));
  const report = {
    artifacts: artifactPaths,
    capabilityScope: { dpi: "unsupported-diagnostic", ime: "platform-diagnostic", nativeStyles: "trace-only", screenReader: "accessibility-metadata-only", virtualKeyboard: "platform-diagnostic", worldUi: "projection-trace-only" },
    diagnostics: [],
    evidenceManifest: { entries, runId },
    generatedBy: "scripts/verify-feature-parity-ui-native.mjs",
    ok: true,
    registry: { rows: UI_PARITY_ROWS.map((row) => ({ claim: row.claim, id: row.id, requiredTier: row.requiredTier })) },
    runId,
    schema: "threenative.verify.feature-parity-ui-native",
    status: "pass",
    version: "0.2.0",
  };
  await writeJson(reportPath, report);
  const { runUiNativeGate } = await import(resolve(repoRoot, "tools/verify/dist/uiNative.js"));
  const result = await runUiNativeGate({ reportPath, root: repoRoot });
  if (!result.ok) {
    await writeJson(reportPath, { ...report, diagnostics: result.diagnostics, ok: false, status: "fail" });
    return { ...report, diagnostics: result.diagnostics, ok: false, status: "fail" };
  }
  return report;
}

function repoPath(repoRoot, path) { return relative(repoRoot, path).split("\\").join("/"); }
export function collectNodeKinds(node, kinds = new Set()) { kinds.add(node.kind); for (const child of node.children ?? []) collectNodeKinds(child, kinds); return kinds; }
export function comparePngs(leftBytes, rightBytes) {
  const left = PNG.sync.read(leftBytes);
  const right = PNG.sync.read(rightBytes);
  if (left.width !== right.width || left.height !== right.height) throw new Error("paired UI captures have different dimensions");
  let absolute = 0;
  let differing = 0;
  const pixels = left.width * left.height;
  for (let index = 0; index < left.data.length; index += 4) {
    const delta = Math.abs(left.data[index] - right.data[index]) + Math.abs(left.data[index + 1] - right.data[index + 1]) + Math.abs(left.data[index + 2] - right.data[index + 2]);
    absolute += delta;
    if (delta > 0) differing += 1;
  }
  return { differingPixelRatio: round(differing / pixels), meanAbsoluteError: round(absolute / (pixels * 3 * 255)) };
}
function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function fileHash(path) { return hash(await readFile(path)); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

if (process.argv[1]?.endsWith("verify-feature-parity-ui-native.mjs")) {
  const report = await verifyFeatureParityUiNative();
  process.stdout.write(`${JSON.stringify({ ok: report.ok, reportPath: "tools/verify/artifacts/feature-parity-ui-native/verification-report.json" }, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

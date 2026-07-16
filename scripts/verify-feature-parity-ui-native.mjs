import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  const linkedInputTargets = resolveArtifactTargets({ gate: "input-ui-polish", owner: { kind: "aggregate", name: "input-ui-polish" }, root: repoRoot });
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
  const linkedInput = JSON.parse(await readFile(linkedInputTargets.reportPath, "utf8"));
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

  const captureFixtures = resolve(artifactDir, "_capture-fixtures");
  const selectedFixture = resolve(captureFixtures, "selected.bundle");
  const visualFixture = resolve(captureFixtures, "visual.bundle");
  const noShadowFixture = resolve(captureFixtures, "no-shadow.bundle");
  const noGradientFixture = resolve(captureFixtures, "no-gradient.bundle");
  await createFixtureVariant(fixture, selectedFixture, {
    world(world) { world.resources.Selection.itemSelected = true; },
  });
  const removeEffects = (ui) => visitUiNodes(ui.root, (node) => { node.effects = []; });
  await createFixtureVariant(fixture, visualFixture, { ui: removeEffects });
  await createFixtureVariant(fixture, noShadowFixture, { ui(ui) { removeEffects(ui); delete ui.root.style.shadow; } });
  await createFixtureVariant(fixture, noGradientFixture, { ui(ui) { removeEffects(ui); delete ui.root.style.gradient; } });

  const desktop = viewports.desktop;
  const statePaths = {};
  for (const state of ["idle", "hover", "selected"]) {
    const stateDir = resolve(artifactDir, "states", state);
    await mkdir(stateDir, { recursive: true });
    const webPath = resolve(stateDir, "web.png");
    const nativePath = resolve(stateDir, "native.png");
    if (state === "idle") {
      await Promise.all([
        copyFile(resolve(artifactDir, "viewports/desktop/web.png"), webPath),
        copyFile(resolve(artifactDir, "viewports/desktop/native.png"), nativePath),
      ]);
    } else {
      const stateFixture = state === "selected" ? selectedFixture : fixture;
      const uiState = state === "hover" ? { nodeId: "selected.item", state: "hover" } : undefined;
      await captureWebScreenshot({ bundlePath: stateFixture, cameraId: "camera.main", outputPath: webPath, repoRoot, viewport: desktop, uiState });
      await captureBevyScreenshot({ bundlePath: stateFixture, cameraId: "camera.main", outputPath: nativePath, repoRoot, viewport: desktop, uiState });
    }
    const artifacts = await writeCalibrationDiffArtifacts({ artifactDir: stateDir, bevyScreenshotPath: nativePath, webScreenshotPath: webPath });
    statePaths[state] = { nativePath, webPath, ...artifacts };
  }
  await writeStateContactSheet(statePaths, resolve(artifactDir, "states/contact-sheet.png"));

  const featurePaths = {};
  for (const feature of ["shadow", "gradient"]) {
    const featureDir = resolve(artifactDir, "features", feature);
    await mkdir(featureDir, { recursive: true });
    const webPath = resolve(featureDir, "web.png");
    const nativePath = resolve(featureDir, "native.png");
    if (feature === "shadow") {
      await captureWebScreenshot({ bundlePath: visualFixture, cameraId: "camera.main", outputPath: webPath, repoRoot, viewport: desktop });
      await captureBevyScreenshot({ bundlePath: visualFixture, cameraId: "camera.main", outputPath: nativePath, repoRoot, viewport: desktop });
    } else {
      await Promise.all([
        copyFile(resolve(artifactDir, "features/shadow/web.png"), webPath),
        copyFile(resolve(artifactDir, "features/shadow/native.png"), nativePath),
      ]);
    }
    const withoutFixture = feature === "shadow" ? noShadowFixture : noGradientFixture;
    const withoutWebPath = resolve(featureDir, "without-web.png");
    const withoutNativePath = resolve(featureDir, "without-native.png");
    await captureWebScreenshot({ bundlePath: withoutFixture, cameraId: "camera.main", outputPath: withoutWebPath, repoRoot, viewport: desktop });
    await captureBevyScreenshot({ bundlePath: withoutFixture, cameraId: "camera.main", outputPath: withoutNativePath, repoRoot, viewport: desktop });
    featurePaths[feature] = { nativePath, webPath, withoutNativePath, withoutWebPath };
  }

  const observations = {
    authored: { gradient: bundle.ui.root.style.gradient, shadow: bundle.ui.root.style.shadow },
    features: {},
    runId,
    schema: "threenative.ui-visual-observations",
    states: {},
    version: "0.1.0",
  };
  for (const state of ["hover", "selected"]) {
    observations.states[state] = {};
    for (const adapter of ["web", "native"]) {
      const change = analyzePngChange(
        await readFile(statePaths.idle[`${adapter}Path`]),
        await readFile(statePaths[state][`${adapter}Path`]),
      );
      if (change.changedPixels < 20) throw new Error(`${adapter} ${state} capture did not produce visible effect pixels`);
      observations.states[state][adapter] = change;
    }
  }
  for (const feature of ["shadow", "gradient"]) {
    observations.features[feature] = {};
    for (const adapter of ["web", "native"]) {
      const change = analyzePngChange(
        await readFile(featurePaths[feature][`without${adapter === "web" ? "Web" : "Native"}Path`]),
        await readFile(featurePaths[feature][`${adapter}Path`]),
      );
      if (change.changedPixels < 20 || change.bounds === null) throw new Error(`${adapter} ${feature} capture did not produce visible placed pixels`);
      observations.features[feature][adapter] = change;
    }
  }
  await writeJson(resolve(artifactDir, "visual-observations.json"), observations);
  await rm(captureFixtures, { force: true, recursive: true });

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
    capabilityScope: { dpi: "unsupported-diagnostic", ime: "platform-diagnostic", nativeStyles: "bounded-rendered", screenReader: "accessibility-metadata-only", virtualKeyboard: "platform-diagnostic", worldUi: "projection-trace-only" },
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
export function analyzePngChange(baselineBytes, variantBytes) {
  const baseline = PNG.sync.read(baselineBytes);
  const variant = PNG.sync.read(variantBytes);
  if (baseline.width !== variant.width || baseline.height !== variant.height) throw new Error("causal UI captures have different dimensions");
  let bottom = -1;
  let changedPixels = 0;
  let left = baseline.width;
  let right = -1;
  let top = baseline.height;
  const baselineTotals = [0, 0, 0];
  const variantTotals = [0, 0, 0];
  for (let index = 0; index < baseline.data.length; index += 4) {
    if (baseline.data[index] === variant.data[index]
      && baseline.data[index + 1] === variant.data[index + 1]
      && baseline.data[index + 2] === variant.data[index + 2]) continue;
    const pixel = index / 4;
    const x = pixel % baseline.width;
    const y = Math.floor(pixel / baseline.width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    changedPixels += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      baselineTotals[channel] += baseline.data[index + channel];
      variantTotals[channel] += variant.data[index + channel];
    }
  }
  const mean = (totals) => totals.map((value) => changedPixels === 0 ? 0 : Math.round(value / changedPixels));
  return {
    bounds: changedPixels === 0 ? null : { bottom, left, right, top },
    changedPixels,
    differingPixelRatio: round(changedPixels / (baseline.width * baseline.height)),
    meanBaselineRgb: mean(baselineTotals),
    meanVariantRgb: mean(variantTotals),
  };
}
function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function fileHash(path) { return hash(await readFile(path)); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
async function createFixtureVariant(source, target, mutations) {
  await cp(source, target, { recursive: true });
  if (mutations.ui !== undefined) {
    const path = resolve(target, "ui.ir.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    mutations.ui(value);
    await writeJson(path, value);
  }
  if (mutations.world !== undefined) {
    const path = resolve(target, "world.ir.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    mutations.world(value);
    await writeJson(path, value);
  }
}
function visitUiNodes(node, visit) {
  visit(node);
  for (const child of node.children ?? []) visitUiNodes(child, visit);
}
async function writeStateContactSheet(states, outputPath) {
  const first = PNG.sync.read(await readFile(states.idle.webPath));
  const sheet = new PNG({ height: first.height * 3, width: first.width * 2 });
  for (const [row, state] of ["idle", "hover", "selected"].entries()) {
    const web = PNG.sync.read(await readFile(states[state].webPath));
    const native = PNG.sync.read(await readFile(states[state].nativePath));
    PNG.bitblt(web, sheet, 0, 0, web.width, web.height, 0, row * first.height);
    PNG.bitblt(native, sheet, 0, 0, native.width, native.height, first.width, row * first.height);
  }
  await writeFile(outputPath, PNG.sync.write(sheet));
}

if (process.argv[1]?.endsWith("verify-feature-parity-ui-native.mjs")) {
  const report = await verifyFeatureParityUiNative();
  process.stdout.write(`${JSON.stringify({ ok: report.ok, reportPath: "tools/verify/artifacts/feature-parity-ui-native/verification-report.json" }, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}
